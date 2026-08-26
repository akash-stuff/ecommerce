import { AsyncLocalStorage } from 'node:async_hooks';
import { SystemRole } from '@prisma/client';

/**
 * Everything the request needs to know about *who* is asking and *for which
 * tenant*. Populated once by middleware/guards and read everywhere else.
 *
 * `tenantId` here is authoritative. It is derived from the hostname or the
 * verified JWT — never from a request body, query string, or client header.
 */
export interface RequestContext {
  requestId: string;
  /** Resolved tenant. Null for platform-level routes (super admin, health). */
  tenantId: string | null;
  userId: string | null;
  customerId: string | null;
  role: SystemRole | null;
  permissions: string[];
  /**
   * True when a SUPER_ADMIN is deliberately operating outside tenant scope.
   * The Prisma extension will not inject a tenant filter while this is set,
   * so it must only ever be turned on by platform-guarded routes.
   */
  bypassTenantScope: boolean;
  hostname: string;
  ipAddress?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(context: RequestContext, callback: () => T): T {
    return storage.run(context, callback);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  /**
   * Tenant id for the current request, or null when running unscoped.
   * Throws if called outside a request — that would mean a query is about to
   * run with no isolation, which we would rather crash than leak.
   */
  getTenantId(): string | null {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error(
        'RequestContext is not available. A tenant-scoped query was attempted ' +
          'outside of a request lifecycle. Use PrismaService.runUnscoped() for ' +
          'background jobs, passing the tenant explicitly.',
      );
    }
    return ctx.bypassTenantScope ? null : ctx.tenantId;
  },

  /** Same as getTenantId but refuses to return null. */
  requireTenantId(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error('No tenant resolved for this request.');
    }
    return tenantId;
  },

  patch(patch: Partial<RequestContext>): void {
    const ctx = storage.getStore();
    if (ctx) Object.assign(ctx, patch);
  },
};
