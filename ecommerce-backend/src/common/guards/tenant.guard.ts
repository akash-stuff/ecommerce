import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContextStore } from '../context/request-context';
import { PLATFORM_ONLY_KEY, TENANT_OPTIONAL_KEY } from '../decorators';

/**
 * Last line of defence: a tenant-scoped route may not execute without a
 * resolved tenant. Without this, a misconfigured hostname would silently fall
 * through to an unscoped query.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (platformOnly) return true;

    const tenantOptional = this.reflector.getAllAndOverride<boolean>(TENANT_OPTIONAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (tenantOptional) return true;

    const ctx = RequestContextStore.get();
    if (!ctx?.tenantId) {
      throw new NotFoundException({
        message: 'No store is configured for this address.',
        code: 'TENANT_NOT_RESOLVED',
      });
    }
    return true;
  }
}
