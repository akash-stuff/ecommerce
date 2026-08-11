import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SystemRole, TenantStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { TenantResolverService } from './tenant-resolver.service';
import { paginate, PaginationQueryDto, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

/**
 * Platform-level service. Everything here runs unscoped by design, so each
 * method is reachable only from @PlatformOnly() routes.
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly resolver: TenantResolverService,
  ) {}

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
          orderBy: { [query.sortBy]: query.sortOrder },
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

        const defaults = (template?.defaultTheme ?? {}) as Record<string, unknown>;
        await tx.theme.create({
          data: { tenantId: tenant.id, storeId: store.id, ...defaults },
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

        return { ...tenant, store };
      });
    });
  }

  async update(id: string, dto: UpdateTenantDto) {
    return this.prisma.runUnscoped(async (db) => {
      await this.assertExists(db, id);
      return db.tenant.update({ where: { id }, data: dto });
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
      return updated;
    });
  }

  async activate(id: string) {
    return this.prisma.runUnscoped(async (db) => {
      await this.assertExists(db, id);
      const updated = await db.tenant.update({
        where: { id },
        data: { status: TenantStatus.ACTIVE, suspendedAt: null, suspensionReason: null },
        include: { domains: true },
      });
      await this.resolver.invalidate(updated.domains.map((d) => d.hostname));
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
