import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, SystemRole, TenantStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { resolvePermissions } from '../common/rbac/permissions';
import { NotificationsService } from '../notifications/notifications.service';
import type { AccessTokenPayload } from '../common/guards/jwt-auth.guard';
import { LoginDto, RegisterDto } from './dto/auth.dto';

export type CurrentActor =
  | {
      kind: 'customer';
      id: string;
      email: string;
      firstName: string;
      lastName: string | null;
      phone: string | null;
      orderCount: number;
      createdAt: Date;
      role: SystemRole;
    }
  | {
      kind: 'staff';
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: SystemRole;
      permissions: string[];
    };

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Staff / admin authentication (platform User + TenantUser membership)
  // ---------------------------------------------------------------------------

  async login(dto: LoginDto): Promise<TokenPair & { user: unknown }> {
    // User lookup is platform-level: the tenant is decided by membership below.
    const user = await this.prisma.runUnscoped((db) =>
      db.user.findUnique({
        where: { email: dto.email.toLowerCase() },
        include: {
          memberships: {
            where: { isActive: true },
            include: { tenant: { select: { id: true, status: true, slug: true } } },
          },
        },
      }),
    );

    // Always run a verify, even on a missing user, so response time does not
    // reveal whether the address exists.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const valid = await argon2.verify(hash, dto.password).catch(() => false);

    if (!user || !valid || !user.isActive) {
      throw new UnauthorizedException({
        message: 'That email and password combination is not recognised.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const ctx = RequestContextStore.get();
    let tenantId: string | null = null;
    let role: SystemRole = user.systemRole;
    let overrides: string[] = [];

    if (user.systemRole !== SystemRole.SUPER_ADMIN) {
      // Bind to the tenant the request arrived on, else the sole membership.
      const membership = ctx?.tenantId
        ? user.memberships.find((m) => m.tenantId === ctx.tenantId)
        : user.memberships[0];

      if (!membership) {
        throw new ForbiddenException({
          message: 'This account has no access to this store.',
          code: 'NO_TENANT_ACCESS',
        });
      }
      if (membership.tenant.status !== TenantStatus.ACTIVE) {
        throw new ForbiddenException({
          message: 'This store is currently unavailable. Contact platform support.',
          code: 'TENANT_INACTIVE',
        });
      }
      tenantId = membership.tenantId;
      role = membership.role;
      overrides = membership.permissions;
    }

    const permissions = resolvePermissions(role, overrides);

    await this.prisma.runUnscoped((db) =>
      db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    );

    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      role,
      tid: tenantId,
      permissions,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role,
        tenantId,
        permissions,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Storefront customer authentication (tenant-scoped Customer)
  // ---------------------------------------------------------------------------

  async registerCustomer(dto: RegisterDto): Promise<TokenPair> {
    const tenantId = RequestContextStore.requireTenantId();

    const existing = await this.prisma.db.customer.findFirst({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        message: 'An account with this email already exists at this store.',
        code: 'EMAIL_TAKEN',
      });
    }

    const customer = await this.prisma.db.customer.create({
      // tenantId is injected by the tenant-scope extension at runtime.
      data: {
        email: dto.email.toLowerCase(),
        passwordHash: await this.hash(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      } as unknown as Prisma.CustomerCreateInput,
    });

    const tokens = await this.issueTokens({
      sub: customer.id,
      cid: customer.id,
      email: customer.email,
      role: SystemRole.CUSTOMER,
      tid: tenantId,
      permissions: [],
    });

    // Never allowed to fail the registration it is congratulating.
    const store = await this.prisma.db.store.findFirst({
      select: { name: true, email: true },
    });
    await this.notifications
      .customerRegistered(customer.email, tenantId, {
        storeName: store?.name ?? 'The store',
        storeEmail: store?.email ?? customer.email,
        customerName: customer.firstName,
      })
      .catch(() => undefined);

    return tokens;
  }

  async loginCustomer(dto: LoginDto): Promise<TokenPair> {
    const tenantId = RequestContextStore.requireTenantId();

    // Scoped client: a customer of tenant A is invisible here when serving B.
    const customer = await this.prisma.db.customer.findFirst({
      where: { email: dto.email.toLowerCase() },
    });

    const hash = customer?.passwordHash ?? DUMMY_HASH;
    const valid = await argon2.verify(hash, dto.password).catch(() => false);

    if (!customer || !valid || !customer.isActive) {
      throw new UnauthorizedException({
        message: 'That email and password combination is not recognised.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    return this.issueTokens({
      sub: customer.id,
      cid: customer.id,
      email: customer.email,
      role: SystemRole.CUSTOMER,
      tid: tenantId,
      permissions: [],
    });
  }

  // ---------------------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------------------

  /**
   * Refresh tokens are rotated: presenting one revokes it and mints a
   * replacement. Presenting an already-revoked token revokes the whole family,
   * which is the standard response to a suspected token theft.
   */
  async refresh(rawToken: string): Promise<TokenPair> {
    const tokenHash = sha256(rawToken);

    const record = await this.prisma.runUnscoped((db) =>
      db.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: { include: { memberships: { where: { isActive: true } } } },
          customer: { select: { id: true, email: true, isActive: true } },
        },
      }),
    );

    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException({
        message: 'Your session has expired. Sign in again.',
        code: 'REFRESH_INVALID',
      });
    }

    if (record.revokedAt) {
      // Reuse of a revoked token means the family may be compromised, so every
      // live session for that same actor is revoked — whichever kind it is.
      await this.prisma.runUnscoped((db) =>
        db.refreshToken.updateMany({
          where: {
            revokedAt: null,
            ...(record.customerId
              ? { customerId: record.customerId }
              : { userId: record.userId }),
          },
          data: { revokedAt: new Date() },
        }),
      );
      throw new UnauthorizedException({
        message: 'Your session has expired. Sign in again.',
        code: 'REFRESH_REUSED',
      });
    }

    await this.prisma.runUnscoped((db) =>
      db.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      }),
    );

    // A storefront customer carries no memberships or permissions.
    if (record.customerId) {
      if (!record.customer?.isActive) {
        throw new UnauthorizedException({
          message: 'Your account is no longer active.',
          code: 'ACCOUNT_INACTIVE',
        });
      }

      return this.issueTokens({
        sub: record.customerId,
        cid: record.customerId,
        email: record.customer.email,
        role: SystemRole.CUSTOMER,
        tid: record.tenantId,
        permissions: [],
      });
    }

    if (!record.user) {
      throw new UnauthorizedException({
        message: 'Your session has expired. Sign in again.',
        code: 'REFRESH_INVALID',
      });
    }

    const membership = record.user.memberships.find((m) => m.tenantId === record.tenantId);
    const role = record.user.systemRole === SystemRole.SUPER_ADMIN
      ? SystemRole.SUPER_ADMIN
      : (membership?.role ?? SystemRole.STAFF);

    return this.issueTokens({
      sub: record.user.id,
      email: record.user.email,
      role,
      tid: record.tenantId,
      permissions: resolvePermissions(role, membership?.permissions ?? []),
    });
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.runUnscoped((db) =>
      db.refreshToken.updateMany({
        where: { tokenHash: sha256(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  private async issueTokens(payload: AccessTokenPayload): Promise<TokenPair> {
    const expiresIn = this.config.get<number>('jwt.accessTtlSeconds', 900);

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.config.get<number>('jwt.refreshTtlDays', 30);
    const ctx = RequestContextStore.get();

    await this.prisma.runUnscoped((db) =>
      db.refreshToken.create({
        data: {
          // `cid` marks a storefront customer. Their id belongs in customerId:
          // putting it in userId fails the foreign key to the users table.
          userId: payload.cid ? null : payload.sub,
          customerId: payload.cid ?? null,
          tenantId: payload.tid,
          tokenHash: sha256(refreshToken),
          expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
          userAgent: ctx?.userAgent,
          ipAddress: ctx?.ipAddress,
        },
      }),
    );

    return { accessToken, refreshToken, expiresIn };
  }

  /**
   * The signed-in actor, whoever they are.
   *
   * The browser must not decode the JWT to learn who it is holding: the token is
   * opaque to the client by design, and a profile can change after it was
   * minted. One endpoint serves both a customer and staff, deciding from the
   * request context rather than from anything the caller sends.
   */
  async me(): Promise<CurrentActor> {
    const ctx = RequestContextStore.get();

    if (ctx?.customerId) {
      const customer = await this.prisma.db.customer.findFirst({
        where: { id: ctx.customerId },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          phone: true, orderCount: true, createdAt: true,
        },
      });

      if (!customer) {
        throw new UnauthorizedException({
          message: 'Your account is no longer available.',
          code: 'ACCOUNT_NOT_FOUND',
        });
      }

      return { kind: 'customer', ...customer, role: SystemRole.CUSTOMER };
    }

    if (ctx?.userId) {
      const user = await this.prisma.runUnscoped((db) =>
        db.user.findUnique({
          where: { id: ctx.userId! },
          select: { id: true, email: true, firstName: true, lastName: true },
        }),
      );

      if (!user) {
        throw new UnauthorizedException({
          message: 'Your account is no longer available.',
          code: 'ACCOUNT_NOT_FOUND',
        });
      }

      return {
        kind: 'staff',
        ...user,
        role: ctx.role ?? SystemRole.STAFF,
        permissions: ctx.permissions,
      };
    }

    throw new UnauthorizedException({
      message: 'Sign in to continue.',
      code: 'UNAUTHENTICATED',
    });
  }

  private hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Fixed argon2id hash of a random string, used to equalise timing. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$1Zm5jdGlvbmFsZHVtbXloYXNodmFsdWU';
