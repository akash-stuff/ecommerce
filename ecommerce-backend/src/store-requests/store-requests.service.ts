import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StoreRequestStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../notifications/mailer.service';
import { hashPassword } from '../common/crypto/password';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { TenantsService } from '../tenants/tenants.service';
import {
  applicationReceived,
  applicationRejected,
  APPLICATION_INBOX,
  newApplication,
} from './store-request-template';
import {
  ApproveStoreRequestDto,
  CreateStoreRequestDto,
  RejectStoreRequestDto,
  StoreRequestQueryDto,
} from './dto/store-request.dto';

/**
 * What the console and the applicant are allowed to see. `passwordHash` is
 * absent by construction rather than deleted afterwards.
 */
const PUBLIC_FIELDS = {
  id: true,
  status: true,
  businessName: true,
  slug: true,
  businessCategory: true,
  message: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  reviewedAt: true,
  reviewNote: true,
  tenantId: true,
  createdAt: true,
  reviewedBy: { select: { email: true, firstName: true, lastName: true } },
} satisfies Prisma.StoreRequestSelect;

/**
 * Registrations, and the queue they are reviewed from.
 *
 * A registration is not a sign-up. Provisioning a tenant mints a hostname, a
 * theme, a domain and an owner account, and puts a shop on the public internet
 * under the platform's certificate — so it stays the platform owner's decision
 * and this service is the queue that decision is made from.
 *
 * Everything here runs unscoped: an applicant has no tenant, and the reviewer
 * is platform staff acting outside every tenant.
 */
@Injectable()
export class StoreRequestsService {
  private readonly logger = new Logger(StoreRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly tenants: TenantsService,
  ) {}

  // --- Public ---------------------------------------------------------------

  async register(dto: CreateStoreRequestDto) {
    /**
     * Accepted, and dropped — the same answer a person gets.
     *
     * An error here is the feedback a bot needs to get past the check next
     * time. Same rule as the contact form.
     */
    if (dto.honeypot?.trim()) {
      this.logger.warn(`Registration honeypot filled by ${dto.email} — discarded.`);
      return { received: true as const };
    }

    await this.assertSlugFree(dto.slug);

    /**
     * One open application per address.
     *
     * Without this, a refresh on a slow connection files the same shop twice
     * and the reviewer has to work out which of two identical rows to approve —
     * and approving both is a duplicate store. A *decided* application does not
     * block a new one: being turned down once is not a ban.
     */
    const openAlready = await this.prisma.runUnscoped((db) =>
      db.storeRequest.findFirst({
        where: { email: dto.email, status: StoreRequestStatus.PENDING },
        select: { id: true },
      }),
    );
    if (openAlready) {
      throw new ConflictException({
        message: 'You already have an application with us. We will be in touch about that one.',
        code: 'APPLICATION_ALREADY_OPEN',
      });
    }

    const created = await this.prisma.runUnscoped(async (db) =>
      db.storeRequest.create({
        data: {
          businessName: dto.businessName,
          slug: dto.slug,
          businessCategory: dto.businessCategory ?? null,
          message: dto.message ?? null,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone ?? null,
          // Hashed before it is stored, and never read back out.
          passwordHash: await hashPassword(dto.password),
        },
        select: { id: true, businessName: true, slug: true, email: true, firstName: true },
      }),
    );

    void this.audit.record({
      action: 'storeRequest.received',
      entityType: 'StoreRequest',
      entityId: created.id,
      changes: { businessName: created.businessName, slug: created.slug, email: created.email },
    });

    // Neither mail can fail the request: the application is committed, and an
    // applicant who was not acknowledged is recoverable where a lost one is not.
    void this.send(applicationReceived(created), created.email, 'acknowledgement');
    void this.send(newApplication({ ...created, ...dto }), APPLICATION_INBOX, 'notification');

    return { received: true as const };
  }

  // --- Platform -------------------------------------------------------------

  async findAll(query: StoreRequestQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.StoreRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { businessName: { contains: query.search, mode: 'insensitive' as const } },
              { slug: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.runUnscoped((db) =>
      Promise.all([
        db.storeRequest.findMany({
          where,
          select: PUBLIC_FIELDS,
          // Oldest pending first: a queue people are waiting in.
          orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          skip: query.skip,
          take: query.limit,
        }),
        db.storeRequest.count({ where }),
      ]),
    );

    return paginate(items, total, query);
  }

  /**
   * Yes: provision the store the applicant asked for.
   *
   * The slug is checked again here, not just at registration. Days pass between
   * the two, and in that time the console can create a store on the same
   * address — so the check at the door is a courtesy and this one is the rule.
   *
   * The tenant is created before the row is marked approved. If provisioning
   * throws, the application stays PENDING and can be tried again; the other
   * order would leave an approved application with no store behind it.
   */
  async approve(id: string, dto: ApproveStoreRequestDto) {
    const request = await this.mustFindPending(id);
    /**
     * Excluding this application from its own check.
     *
     * It is still PENDING at this point and it holds the slug it is asking
     * for, so without the exception `assertSlugFree` finds it, calls that a
     * clash, and refuses to approve any application at all — the check would
     * only ever pass for a store nobody had applied for.
     */
    await this.assertSlugFree(request.slug, request.id);

    const tenant = await this.tenants.createFromApplication({
      businessName: request.businessName,
      storeName: request.businessName,
      slug: request.slug,
      email: request.email,
      phone: request.phone ?? undefined,
      businessCategory: request.businessCategory ?? undefined,
      planId: dto.planId || undefined,
      templateId: dto.templateId || undefined,
      ownerEmail: request.email,
      ownerFirstName: request.firstName,
      ownerLastName: request.lastName,
      // The password they chose when they registered, still hashed.
      ownerPasswordHash: request.passwordHash,
    });

    const updated = await this.prisma.runUnscoped((db) =>
      db.storeRequest.update({
        where: { id },
        data: {
          status: StoreRequestStatus.APPROVED,
          reviewedAt: new Date(),
          reviewedById: RequestContextStore.get()?.userId ?? null,
          tenantId: tenant.id,
        },
        select: PUBLIC_FIELDS,
      }),
    );

    void this.audit.record({
      action: 'storeRequest.approved',
      entityType: 'StoreRequest',
      entityId: id,
      tenantId: tenant.id,
      changes: { slug: request.slug, email: request.email },
    });

    /**
     * No separate "you are approved" email: `createFromApplication` already
     * sent the store-setup one, which says the same thing and carries the link
     * they need. Two emails a minute apart read as a system talking to itself.
     */
    return updated;
  }

  /** No, with a reason the applicant is sent as written. */
  async reject(id: string, dto: RejectStoreRequestDto) {
    const request = await this.mustFindPending(id);

    const updated = await this.prisma.runUnscoped((db) =>
      db.storeRequest.update({
        where: { id },
        data: {
          status: StoreRequestStatus.REJECTED,
          reviewedAt: new Date(),
          reviewedById: RequestContextStore.get()?.userId ?? null,
          reviewNote: dto.reason,
        },
        select: PUBLIC_FIELDS,
      }),
    );

    void this.audit.record({
      action: 'storeRequest.rejected',
      entityType: 'StoreRequest',
      entityId: id,
      changes: { slug: request.slug, email: request.email, reason: dto.reason },
    });

    void this.send(
      applicationRejected({ ...request, reason: dto.reason }),
      request.email,
      'rejection',
    );

    return updated;
  }

  /**
   * Neither yes nor no — a duplicate, or something a bot filed.
   *
   * Kept rather than deleted, so the queue can be emptied without destroying
   * the record of what arrived. Nothing is emailed: there is nobody to tell.
   */
  async discard(id: string) {
    await this.mustFindPending(id);

    const updated = await this.prisma.runUnscoped((db) =>
      db.storeRequest.update({
        where: { id },
        data: {
          status: StoreRequestStatus.DISCARDED,
          reviewedAt: new Date(),
          reviewedById: RequestContextStore.get()?.userId ?? null,
        },
        select: PUBLIC_FIELDS,
      }),
    );

    void this.audit.record({
      action: 'storeRequest.discarded',
      entityType: 'StoreRequest',
      entityId: id,
    });

    return updated;
  }

  // --- Shared ---------------------------------------------------------------

  /**
   * Refuses an address already taken by a store, or spoken for by another open
   * application. The second half matters: two people cannot both be told their
   * preferred address is available and then only one of them get it.
   */
  private async assertSlugFree(slug: string, exceptRequestId?: string) {
    const [tenant, otherApplication] = await this.prisma.runUnscoped((db) =>
      Promise.all([
        db.tenant.findUnique({ where: { slug }, select: { id: true } }),
        db.storeRequest.findFirst({
          where: {
            slug,
            status: StoreRequestStatus.PENDING,
            ...(exceptRequestId ? { id: { not: exceptRequestId } } : {}),
          },
          select: { id: true },
        }),
      ]),
    );

    if (tenant || otherApplication) {
      throw new ConflictException({
        message: 'That store address is already taken.',
        code: 'SLUG_TAKEN',
      });
    }
  }

  private async mustFindPending(id: string) {
    const request = await this.prisma.runUnscoped((db) =>
      db.storeRequest.findUnique({ where: { id } }),
    );

    if (!request) {
      throw new NotFoundException({
        message: 'That application does not exist.',
        code: 'STORE_REQUEST_NOT_FOUND',
      });
    }

    /**
     * Decided once, and only once.
     *
     * Without this, a second click on Approve provisions a second store on a
     * slug the first one already took — which fails, confusingly, on a unique
     * constraint rather than on the thing that is actually wrong.
     */
    if (request.status !== StoreRequestStatus.PENDING) {
      throw new BadRequestException({
        message: `That application has already been ${request.status.toLowerCase()}.`,
        code: 'STORE_REQUEST_ALREADY_DECIDED',
      });
    }

    return request;
  }

  /** Sends, logs what happened, and never throws at the caller. */
  private async send(
    mail: { subject: string; html: string; text: string },
    to: string,
    what: string,
  ): Promise<void> {
    try {
      const result = await this.mailer.send({ ...mail, to, fromName: 'Everystore' });
      if (!result.sent) {
        this.logger.warn(`Application ${what} to ${to} was not sent: ${result.reason}`);
      }
    } catch (error) {
      this.logger.warn(`Application ${what} to ${to} failed: ${(error as Error).message}`);
    }
  }
}
