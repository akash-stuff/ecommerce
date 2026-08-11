import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { RequestContextStore } from '../context/request-context';
import { IS_PUBLIC_KEY } from '../decorators';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  /** Tenant the token was issued for. Null for super admin platform tokens. */
  tid: string | null;
  /** Set instead of `sub` for storefront customer tokens. */
  cid?: string;
  permissions: string[];
}

/**
 * Verifies the access token and writes the actor into the request context.
 *
 * The token's `tid` is checked against the tenant already resolved from the
 * hostname. A token minted for tenant A presented to tenant B's storefront is
 * rejected — this is what stops a valid session from being replayed sideways.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(req);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException({
        message: 'Sign in to continue.',
        code: 'UNAUTHENTICATED',
      });
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException({
        message: 'Your session has expired. Sign in again.',
        code: 'TOKEN_INVALID',
      });
    }

    const ctx = RequestContextStore.get();
    if (!ctx) throw new UnauthorizedException();

    // Cross-tenant replay check.
    if (payload.tid && ctx.tenantId && payload.tid !== ctx.tenantId) {
      throw new UnauthorizedException({
        message: 'This session does not belong to this store.',
        code: 'TENANT_MISMATCH',
      });
    }

    RequestContextStore.patch({
      userId: payload.cid ? null : payload.sub,
      customerId: payload.cid ?? null,
      role: payload.role as any,
      permissions: payload.permissions ?? [],
      // Admin traffic arrives on a hostname with no tenant; the token supplies
      // it. This is safe because the token is signed.
      tenantId: ctx.tenantId ?? payload.tid,
    });

    return true;
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  // Storefront customers use an httpOnly cookie instead of a header.
  const cookie = (req as any).cookies?.access_token;
  return typeof cookie === 'string' ? cookie : null;
}
