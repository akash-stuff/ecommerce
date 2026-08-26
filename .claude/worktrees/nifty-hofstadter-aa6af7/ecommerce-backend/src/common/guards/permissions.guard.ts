import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SystemRole } from '@prisma/client';
import { RequestContextStore } from '../context/request-context';
import { PERMISSIONS_KEY, PLATFORM_ONLY_KEY } from '../decorators';

/**
 * Checks required permissions, and handles the super-admin scope switch.
 *
 * A route marked @PlatformOnly() lifts the Prisma tenant filter, so the guard
 * is the only place that may set `bypassTenantScope`, and only for SUPER_ADMIN.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length && !platformOnly) return true;

    const ctx = RequestContextStore.get();
    if (!ctx?.role) {
      throw new ForbiddenException({
        message: 'You do not have access to this.',
        code: 'FORBIDDEN',
      });
    }

    if (platformOnly) {
      if (ctx.role !== SystemRole.SUPER_ADMIN) {
        throw new ForbiddenException({
          message: 'You do not have access to this.',
          code: 'FORBIDDEN',
        });
      }
      RequestContextStore.patch({ bypassTenantScope: true });
    }

    if (required?.length) {
      const granted = new Set(ctx.permissions);
      const missing = required.filter((p) => !granted.has(p));
      if (missing.length) {
        throw new ForbiddenException({
          message: 'You do not have permission to do that.',
          code: 'INSUFFICIENT_PERMISSIONS',
        });
      }
    }

    return true;
  }
}
