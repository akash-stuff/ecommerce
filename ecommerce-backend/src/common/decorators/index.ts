import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { RequestContextStore } from '../context/request-context';
import type { Permission } from '../rbac/permissions';

export const IS_PUBLIC_KEY = 'isPublic';
/** Route needs no authentication. Storefront reads, login, webhooks. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PLATFORM_ONLY_KEY = 'platformOnly';
/**
 * Marks a route as operating outside tenant scope. Only SUPER_ADMIN passes,
 * and the tenant filter on Prisma is lifted for the duration of the request.
 */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);

export const TENANT_OPTIONAL_KEY = 'tenantOptional';
/**
 * Route may run without a resolved tenant: health checks and staff sign-in,
 * which are served on tenant-less admin hostnames. Distinct from @PlatformOnly,
 * which additionally demands SUPER_ADMIN and lifts the Prisma tenant filter.
 *
 * Use sparingly — every route without this must resolve a tenant.
 */
export const TenantOptional = () => SetMetadata(TENANT_OPTIONAL_KEY, true);

/** The authenticated actor, straight from the async context. */
export const CurrentUser = createParamDecorator((_: unknown, __: ExecutionContext) => {
  const ctx = RequestContextStore.get();
  return ctx
    ? { userId: ctx.userId, role: ctx.role, permissions: ctx.permissions }
    : null;
});

/** Server-resolved tenant id. There is no client-supplied equivalent. */
export const TenantId = createParamDecorator((_: unknown, __: ExecutionContext) =>
  RequestContextStore.get()?.tenantId ?? null,
);
