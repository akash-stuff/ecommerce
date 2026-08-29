import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SystemRole, TenantStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { templateLook } from '../theme/template-look';
import { TenantResolverService } from './tenant-resolver.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { bareAddress } from '../notifications/mail-address';
import {
  paginate,
  PaginationQueryDto,
  PaginatedResult,
  safeOrderBy,
} from '../common/dto/pagination.dto';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

/**
 * Platform-level service. Everything here runs unscoped by design, so each
 * method is reachable only from @PlatformOnly() routes.
 */
const TENANT_SORT_FIELDS = ['createdAt', 'businessName', 'slug', 'status'] as const;

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly resolver: TenantResolverService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private readonly logger = new Logger(TenantsService.name);

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<unknown>> {
    return this.prisma.runUnscoped(async (db) => {
      const where = query.search
        ? {
            OR: [
              { businessName: { contains: query.search, mode: 'insensitive' as const } },
              { slug: { contains: query.search, mode: 'insensitive' as const } },
              { contactEmail: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {};

      const [items, total] = await Promise.all([
        db.tenant.findMany({
          where,
          include: {
            store: { select: { id: true, name: true, isPublished: true } },
            subscription: { include: { plan: { select: { name: true } } } },
            _count: { select: { products: true, orders: true } },
          },
          orderBy: safeOrderBy(query.sortBy, TENANT_SORT_FIELDS, 'createdAt', query.sortOrder),
          skip: query.skip,
          take: query.limit,
        }),
        db.tenant.count({ where }),
      ]);
      return paginate(items, total, query);
    });
  }

  /**
   * Creates the tenant, its store, its default theme, its platform subdomain
   * and the owner account in one transaction. A half-provisioned tenant is
   * worse than none, so this is all-or-nothing.
   */
  async create(dto: CreateTenantDto) {
    const platformDomain = this.config.get<string>('platform.domain', 'platform.com');

    const created = await this.provision(dto, platformDomain);

    /**
     * Recorded after the transaction commits, not inside it.
     *
     * The audit service writes on its own connection, so an entry created inside
     * this transaction referenced a tenant row that was not yet visible to it —
     * a foreign key violation that silently swallowed every `tenant.created`
     * entry, since audit failures are logged rather than thrown.
     */
    await this.audit.record({
      action: 'tenant.created',
      entityType: 'Tenant',
      entityId: created.id,
      tenantId: created.id,
      // The owner's password is in the DTO. `changes` is redacted anyway, but
      // only the fields worth keeping are passed in the first place.
      changes: {
        slug: created.slug,
        businessName: created.businessName,
        storeName: created.store.name,
      },
    });

    /**
     * The setup email, after the transaction and after the audit entry.
     *
     * Not awaited, and unable to fail the request: the store, its theme, its
     * domain and its owner are all committed by now. A store whose owner was
     * not told is recoverable; reporting a failure for work that succeeded, and
     * leaving the caller to guess whether the store exists, is not.
     */
    void this.sendSetupEmail(created, platformDomain);

    return created;
  }

  /**
   * Tells a new owner that their store exists and where to sign in.
   *
   * Sent to the business address the store was created with, because that is
   * the person who has to run it. Swallows its own errors — `create` has
   * already returned by the time this settles.
   */
  private async sendSetupEmail(
    created: {
      id: string;
      businessName: string;
      store: { slug: string };
      owner: { email: string; firstName: string };
    },
    platformDomain: string,
  ): Promise<void> {
    try {
      /**
       * The admin hostname comes from configuration rather than being guessed.
       *
       * `PLATFORM_ADMIN_HOSTS` is precisely the list of hostnames that must not
       * resolve to a tenant, which is what an admin console is. `localhost` is
       * in that list for local development and is not an address to send
       * anyone, so it is passed over.
       */
      const adminHosts = this.config.get<string[]>('platform.adminHosts') ?? [];
      const adminHost =
        adminHosts.find((h) => h.startsWith('admin.')) ??
        adminHosts.find((h) => h !== 'localhost') ??
        `admin.${platformDomain}`;

      // A `.localhost` platform is a development one and is served over http on
      // the Vite port; anything else is expected to terminate TLS on 443.
      const local = platformDomain === 'localhost' || platformDomain.endsWith('.localhost');
      const origin = (host: string) => (local ? `http://${host}:5173` : `https://${host}`);

      await this.notifications.storeSetup(created.owner.email, created.id, {
        storeName: created.businessName,
        ownerName: created.owner.firstName,
        adminUrl: `${origin(adminHost)}/login`,
        storefrontUrl: origin(`${created.store.slug}.${platformDomain}`),
        platformName: platformDomain,
        // The bare address, not the whole From header. `SMTP_FROM` may be
        // `Display Name <addr@example.com>`, and "write to Display Name
        // <addr@example.com>" is not something you can put in a sentence.
        supportEmail: bareAddress(this.config.get<string>('smtp.from'))
          ?? `support@${platformDomain}`,
      });
    } catch (error) {
      this.logger.error(
        `Store "${created.businessName}" was created but its setup email failed: ` +
          (error as Error).message,
      );
    }
  }

  private async provision(dto: CreateTenantDto, platformDomain: string) {
    return this.prisma.runUnscoped(async (db) => {
      const clash = await db.tenant.findUnique({ where: { slug: dto.slug } });
      if (clash) {
        throw new ConflictException({
          message: 'That store address is already taken.',
          code: 'SLUG_TAKEN',
        });
      }

      return db.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            businessName: dto.businessName,
            slug: dto.slug,
            contactEmail: dto.email,
            contactPhone: dto.phone,
            businessCategory: dto.businessCategory,
            country: dto.country ?? 'IN',
            currency: dto.currency ?? 'INR',
            timezone: dto.timezone ?? 'Asia/Kolkata',
            status: TenantStatus.ACTIVE,
          },
        });

        const template = dto.templateId
          ? await tx.template.findUnique({ where: { id: dto.templateId } })
          : await tx.template.findFirst({ where: { slug: 'general-store' } });

        const store = await tx.store.create({
          data: {
            tenantId: tenant.id,
            templateId: template?.id,
            name: dto.storeName,
            slug: dto.slug,
            description: dto.description,
            email: dto.email,
            phone: dto.phone,
            country: dto.country ?? 'IN',
            currency: dto.currency ?? 'INR',
            timezone: dto.timezone ?? 'Asia/Kolkata',
          },
        });

        /**
         * Read through `templateLook` rather than spread raw.
         *
         * Two reasons. `defaultTheme` is a Json column, so spreading it hands
         * Prisma whatever keys the row happens to hold — including `tenantId`
         * or `storeId`, which would quietly overwrite the two values that make
         * this row belong to this store. And the layout lives in a *second*
         * column that this never read, so a store created from the Grocery
         * template arrived with an empty `homepageLayout` and fell back to the
         * generic hero-and-featured page — which is most of what distinguishes
         * one template from another.
         */
        const look = templateLook(template?.defaultTheme, template?.layoutConfig);
        await tx.theme.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            // `homepageLayout` is absent from `look` when the template names
            // no renderable section, which leaves the column at its `[]`
            // default and the storefront's own fallback in charge.
            ...look,
          },
        });

        await tx.domain.create({
          data: {
            tenantId: tenant.id,
            hostname: `${dto.slug}.${platformDomain}`,
            isPlatform: true,
            isPrimary: true,
            status: 'ACTIVE',
            verifiedAt: new Date(),
          },
        });

        // The owner may already exist on the platform (an agency running
        // several stores), in which case only a membership is added.
        let owner = await tx.user.findUnique({ where: { email: dto.ownerEmail.toLowerCase() } });
        if (!owner) {
          owner = await tx.user.create({
            data: {
              email: dto.ownerEmail.toLowerCase(),
              passwordHash: await argon2.hash(dto.ownerPassword, { type: argon2.argon2id }),
              firstName: dto.ownerFirstName,
              lastName: dto.ownerLastName ?? '',
              systemRole: SystemRole.TENANT_OWNER,
            },
          });
        }

        await tx.tenantUser.create({
          data: { tenantId: tenant.id, userId: owner.id, role: SystemRole.TENANT_OWNER },
        });

        if (dto.planId) {
          await tx.subscription.create({
            data: {
              tenantId: tenant.id,
              planId: dto.planId,
              currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000),
            },
          });
        }

        return {
          ...tenant,
          store,
          // Carried out so `create` can email the owner without a second query.
          owner: { email: owner.email, firstName: owner.firstName },
        };
      });
    });
  }

  async update(id: string, dto: UpdateTenantDto) {
    return this.prisma.runUnscoped(async (db) => {
      const before = await this.assertExists(db, id);
      const updated = await db.tenant.update({ where: { id }, data: dto });

      await this.audit.record({
        action: 'tenant.updated',
        entityType: 'Tenant',
        entityId: id,
        tenantId: id,
        changes: { before: { businessName: before.businessName }, after: dto },
      });

      return updated;
    });
  }

  /**
   * Deletes a store and everything under it, permanently.
   *
   * The rows go because every tenant-owned table cascades from `Tenant`
   * (`onDelete: Cascade` throughout the schema) — orders, customers, products,
   * payments, the lot. That is the point of the operation and also why it is
   * guarded rather than offered next to Suspend: suspension is reversible and
   * this is not.
   *
   * Two protections, deliberately different in kind:
   *
   * 1. The caller must type the slug back. A destructive action reached by one
   *    click on a list row is a destructive action taken by accident.
   * 2. A store that has taken money cannot be deleted at all. Order and payment
   *    records are what a merchant answers a chargeback or a tax question with;
   *    the platform does not get to destroy them because someone tidied up.
   *    Such a store is cancelled instead, which stops it trading and keeps the
   *    history.
   */
  async remove(id: string, confirmSlug: string) {
    return this.prisma.runUnscoped(async (db) => {
      const tenant = await this.assertExists(db, id);

      if (confirmSlug !== tenant.slug) {
        throw new BadRequestException({
          message: `Type "${tenant.slug}" to confirm you mean to delete this store.`,
          code: 'TENANT_DELETE_UNCONFIRMED',
        });
      }

      const orders = await db.order.count({ where: { tenantId: id } });
      if (orders > 0) {
        throw new ConflictException({
          message:
            `${tenant.businessName} has ${orders} order${orders === 1 ? '' : 's'}. ` +
            'A store that has taken money keeps its records — cancel it instead, ' +
            'which stops it trading and leaves the history intact.',
          code: 'TENANT_HAS_ORDERS',
        });
      }

      const domains = await db.domain.findMany({
        where: { tenantId: id },
        select: { hostname: true },
      });

      /**
       * Recorded *before* the delete, not after.
       *
       * `AuditLog.tenantId` is nullable and the row must survive the tenant it
       * describes, so the entry is written while the tenant still exists — and
       * then detached, because a cascade would take the evidence with it.
       */
      await this.audit.record({
        action: 'tenant.deleted',
        entityType: 'Tenant',
        entityId: id,
        // No tenantId: the row it would point at is about to stop existing.
        changes: {
          slug: tenant.slug,
          businessName: tenant.businessName,
          status: tenant.status,
          hostnames: domains.map((d) => d.hostname),
        },
      });

      await db.tenant.delete({ where: { id } });

      // The hostname cache still maps these to a tenant that is gone; clearing
      // it is what makes the storefront stop resolving immediately.
      await this.resolver.invalidate(domains.map((d) => d.hostname));

      this.logger.warn(
        `Deleted store ${tenant.slug} (${tenant.businessName}) and all of its data.`,
      );

      return { deleted: true, slug: tenant.slug };
    });
  }

  /**
   * Suspension takes effect immediately: the hostname cache is cleared so the
   * next storefront request resolves to nothing.
   */
  async suspend(id: string, reason: string) {
    return this.prisma.runUnscoped(async (db) => {
      const tenant = await this.assertExists(db, id);
      const updated = await db.tenant.update({
        where: { id },
        data: {
          status: TenantStatus.SUSPENDED,
          suspendedAt: new Date(),
          suspensionReason: reason,
        },
        include: { domains: true },
      });
      await this.resolver.invalidate(updated.domains.map((d) => d.hostname));
      await db.refreshToken.updateMany({
        where: { tenantId: tenant.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Taking a store offline and signing out its staff is the most
      // consequential thing the platform can do, so it is always recorded.
      await this.audit.record({
        action: 'tenant.suspended',
        entityType: 'Tenant',
        entityId: id,
        tenantId: id,
        changes: { from: tenant.status, to: TenantStatus.SUSPENDED, reason },
      });

      return updated;
    });
  }

  async activate(id: string) {
    return this.prisma.runUnscoped(async (db) => {
      const tenant = await this.assertExists(db, id);
      const updated = await db.tenant.update({
        where: { id },
        data: { status: TenantStatus.ACTIVE, suspendedAt: null, suspensionReason: null },
        include: { domains: true },
      });
      await this.resolver.invalidate(updated.domains.map((d) => d.hostname));

      await this.audit.record({
        action: 'tenant.activated',
        entityType: 'Tenant',
        entityId: id,
        tenantId: id,
        changes: { from: tenant.status, to: TenantStatus.ACTIVE },
      });

      return updated;
    });
  }

  private async assertExists(db: any, id: string) {
    const tenant = await db.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({ message: 'Tenant not found.', code: 'TENANT_NOT_FOUND' });
    }
    return tenant;
  }
}

/**
 * The address out of an RFC 5322 mailbox.
 *
 * `Name <a@b.com>` becomes `a@b.com`; a bare address is returned unchanged.
 * Null when there is nothing that looks like an address at all, so the caller
 * can fall back rather than print a display name where an address belongs.
 */
