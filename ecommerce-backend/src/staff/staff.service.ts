import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SystemRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { resolvePermissions } from '../common/rbac/permissions';
import { CreateStaffDto, StaffQueryDto, UpdateStaffDto } from './dto/staff.dto';

/**
 * Staff accounts for one store.
 *
 * A person is a platform `User`; their access to a store is a `TenantUser` row.
 * The two are separate so one person can staff several stores with one password,
 * which is why removing someone here deletes the membership and never the User.
 *
 * `TenantUser` is in PLATFORM_MANAGED_TENANT_MODELS, so the Prisma extension
 * does **not** filter it by tenant. Every query below therefore names
 * `tenantId` explicitly — a missing filter here would list, or hand control of,
 * another store's staff.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: StaffQueryDto): Promise<PaginatedResult<unknown>> {
    const tenantId = RequestContextStore.requireTenantId();

    const where: Prisma.TenantUserWhereInput = {
      tenantId,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            user: {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' as const } },
                { firstName: { contains: query.search, mode: 'insensitive' as const } },
                { lastName: { contains: query.search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.runUnscoped((db) =>
      Promise.all([
        db.tenantUser.findMany({
          where,
          select: {
            id: true,
            role: true,
            isActive: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                lastLoginAt: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
          skip: query.skip,
          take: query.limit,
        }),
        db.tenantUser.count({ where }),
      ]),
    );

    const currentUserId = RequestContextStore.get()?.userId ?? null;

    return paginate(
      rows.map((r) => ({
        id: r.id,
        role: r.role,
        isActive: r.isActive,
        createdAt: r.createdAt,
        email: r.user.email,
        firstName: r.user.firstName,
        lastName: r.user.lastName,
        phone: r.user.phone,
        lastLoginAt: r.user.lastLoginAt,
        /** So the UI can grey out the actions that would lock someone out. */
        isSelf: r.user.id === currentUserId,
        /** The permissions this role actually grants, for the detail panel. */
        permissions: resolvePermissions(r.role, []),
      })),
      total,
      query,
    );
  }

  /**
   * Adds someone to this store.
   *
   * If a User already exists for the address they are given a membership rather
   * than a second account — one person, one password, however many stores.
   * A temporary password is only generated for a genuinely new account; issuing
   * one for an existing user would reset the password they use elsewhere.
   */
  async create(dto: CreateStaffDto) {
    const tenantId = RequestContextStore.requireTenantId();

    const existingUser = await this.prisma.runUnscoped((db) =>
      db.user.findUnique({ where: { email: dto.email }, select: { id: true } }),
    );

    if (existingUser) {
      const already = await this.prisma.runUnscoped((db) =>
        db.tenantUser.findFirst({
          where: { tenantId, userId: existingUser.id },
          select: { id: true },
        }),
      );
      if (already) {
        throw new BadRequestException({
          message: 'That person already has access to this store.',
          code: 'STAFF_ALREADY_MEMBER',
        });
      }
    }

    // Only generated for a new account. Kept out of the audit log and out of
    // every response except the one that creates the account.
    const temporaryPassword = existingUser ? null : generatePassword();

    const membership = await this.prisma.runUnscoped(async (db) => {
      const user =
        existingUser ??
        (await db.user.create({
          data: {
            email: dto.email,
            passwordHash: await hashPassword(temporaryPassword as string),
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone ?? null,
            systemRole: dto.role,
          },
          select: { id: true },
        }));

      return db.tenantUser.create({
        data: { tenantId, userId: user.id, role: dto.role },
        select: { id: true, role: true, isActive: true, createdAt: true },
      });
    });

    void this.audit.record({
      action: 'staff.added',
      entityType: 'TenantUser',
      entityId: membership.id,
      // The password is deliberately absent: an audit row is long-lived and a
      // credential in one is a credential that outlives its usefulness.
      changes: { email: dto.email, role: dto.role, newAccount: !existingUser },
    });

    const store = await this.prisma.db.store.findFirst({
      select: { name: true, email: true },
    });

    /**
     * Emailed but not awaited into a failure: the account exists by now, and
     * telling the admin the invite failed when the staff member can be given
     * the password another way would be worse than saying nothing. A failed
     * send is a visible FAILED row in notifications.
     */
    try {
      await this.notifications.staffInvited(dto.email, tenantId, {
        storeName: store?.name ?? 'The store',
        storeEmail: store?.email ?? dto.email,
        firstName: dto.firstName,
        role: dto.role === SystemRole.TENANT_ADMIN ? 'Administrator' : 'Staff',
        signInUrl: this.signInUrl(),
      });
    } catch (error) {
      this.logger.warn(`Staff invite could not be sent: ${(error as Error).message}`);
    }

    return {
      id: membership.id,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: membership.role,
      isActive: membership.isActive,
      createdAt: membership.createdAt,
      /**
       * Returned exactly once, and never stored in readable form.
       *
       * Shown to the admin so they can pass it on if the email does not arrive,
       * which is a real situation on a store that has not configured SMTP.
       * Null when the person already had an account — their existing password
       * still works and must not be reset by being added to another store.
       */
      temporaryPassword,
    };
  }

  async update(id: string, dto: UpdateStaffDto) {
    const tenantId = RequestContextStore.requireTenantId();
    const membership = await this.mustFind(id, tenantId);

    this.refuseSelfLockout(membership.userId, dto);

    const updated = await this.prisma.runUnscoped((db) =>
      db.tenantUser.update({
        where: { id },
        data: {
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        select: { id: true, role: true, isActive: true },
      }),
    );

    void this.audit.record({
      action: 'staff.updated',
      entityType: 'TenantUser',
      entityId: id,
      changes: { fields: Object.keys(dto), role: updated.role, isActive: updated.isActive },
    });

    return updated;
  }

  /**
   * A new temporary password for someone who cannot get in.
   *
   * This resets the person's platform password, which is shared across every
   * store they staff — so it is a deliberate, audited action rather than a
   * side effect of editing their role.
   */
  async resetPassword(id: string) {
    const tenantId = RequestContextStore.requireTenantId();
    const membership = await this.mustFind(id, tenantId);

    const temporaryPassword = generatePassword();
    const passwordHash = await hashPassword(temporaryPassword);

    await this.prisma.runUnscoped((db) =>
      db.user.update({ where: { id: membership.userId }, data: { passwordHash } }),
    );

    void this.audit.record({
      action: 'staff.passwordReset',
      entityType: 'TenantUser',
      entityId: id,
      changes: { email: membership.user.email },
    });

    return { temporaryPassword };
  }

  /** Removes access to this store. The person and their other stores remain. */
  async remove(id: string) {
    const tenantId = RequestContextStore.requireTenantId();
    const membership = await this.mustFind(id, tenantId);

    this.refuseSelfLockout(membership.userId, { isActive: false });

    await this.prisma.runUnscoped((db) => db.tenantUser.delete({ where: { id } }));

    void this.audit.record({
      action: 'staff.removed',
      entityType: 'TenantUser',
      entityId: id,
      changes: { email: membership.user.email, role: membership.role },
    });
  }

  // ---------------------------------------------------------------------------

  /** Where staff sign in. The admin console, not the storefront. */
  private signInUrl(): string {
    const host = RequestContextStore.get()?.hostname;
    return host ? `https://${host}/login` : '/login';
  }

  private async mustFind(id: string, tenantId: string) {
    const membership = await this.prisma.runUnscoped((db) =>
      db.tenantUser.findFirst({
        // tenantId in the filter, not just the id: without it any admin could
        // address another store's membership row by guessing its id.
        where: { id, tenantId },
        select: {
          id: true,
          userId: true,
          role: true,
          user: { select: { email: true } },
        },
      }),
    );

    if (!membership) {
      throw new NotFoundException({
        message: 'That staff member does not exist.',
        code: 'STAFF_NOT_FOUND',
      });
    }

    /**
     * The owner is provisioned with the store and is the only role that can
     * connect the bank account. An administrator editing or deleting them would
     * be a privilege escalation with extra steps.
     */
    if (membership.role === SystemRole.TENANT_OWNER) {
      throw new ForbiddenException({
        message: 'The store owner cannot be changed from here.',
        code: 'STAFF_OWNER_IMMUTABLE',
      });
    }

    return membership;
  }

  /** Nobody gets to suspend, demote or delete their own way out of the console. */
  private refuseSelfLockout(userId: string, dto: UpdateStaffDto) {
    const self = RequestContextStore.get()?.userId;
    if (self && self === userId && (dto.isActive === false || dto.role !== undefined)) {
      throw new BadRequestException({
        message: 'You cannot change your own access. Ask another administrator.',
        code: 'STAFF_SELF_CHANGE',
      });
    }
  }
}

/** The same argon2id parameters AuthService uses, so hashes stay comparable. */
function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * A temporary password that is awkward to mistype and impossible to guess.
 *
 * `randomBytes` rather than `Math.random`, because this is a credential. The
 * alphabet omits the characters that are read wrong out loud or off a screen —
 * O/0, I/l/1 — since the likeliest way this reaches its owner is somebody
 * reading it to them.
 */
function generatePassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
