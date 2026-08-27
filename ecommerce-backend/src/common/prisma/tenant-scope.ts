import { Prisma } from '@prisma/client';
import { RequestContextStore } from '../context/request-context';

/**
 * Models that carry a tenantId column. Anything listed here is automatically
 * filtered and stamped. Anything NOT listed here is a platform-level table and
 * is left alone.
 *
 * Adding a tenant-owned model to the schema without adding it here is the one
 * mistake that would open a leak, so `tenant-isolation.spec.ts` reads the
 * Prisma DMMF and fails the build if a model has a `tenantId` field and is
 * listed in neither this set nor PLATFORM_MANAGED_TENANT_MODELS below.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'Store',
  'Theme',
  'Domain',
  'Category',
  'Brand',
  'Product',
  'ProductImage',
  'ProductVariant',
  'InventoryTransaction',
  'Customer',
  'Address',
  'WishlistItem',
  'Cart',
  'CartItem',
  'Order',
  'OrderItem',
  'Payment',
  'Coupon',
  'CouponUsage',
  'ShippingZone',
  'ShippingMethod',
  'Shipment',
  'Review',
  'Page',
  'Banner',
  'PaymentGateway',
  'EmailOtp',
  'NewsletterSubscriber',
]);

/**
 * Models that have a `tenantId` column but are deliberately NOT auto-scoped.
 *
 * Each one is an exception with a reason, because "it has a tenantId so it
 * must be scoped" is the right default and anything else should have to argue
 * for itself. These are all written by platform-level code that already knows
 * which tenant it means, and several are written before a tenant is known at
 * all.
 */
export const PLATFORM_MANAGED_TENANT_MODELS = new Map<string, string>([
  ['TenantUser', 'Membership grants. Written during provisioning and staff management, both platform-scoped operations.'],
  ['Subscription', 'Billing is platform-owned; a tenant must not be able to read or write its own subscription row directly.'],
  ['RefreshToken', 'Auth runs before a tenant context is established, and revocation sweeps deliberately cross tenants.'],
  ['AuditLog', 'tenantId is nullable and audit writes must never be filtered by the scope of the actor being audited.'],
  ['Notification', 'tenantId is nullable; platform-level notices have none.'],
  ['WebhookEvent', 'Arrives from a payment provider before the tenant has been identified.'],
]);

const READ_MANY = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy']);
const READ_UNIQUE = new Set(['findUnique', 'findUniqueOrThrow']);
const WRITE_MANY = new Set(['updateMany', 'deleteMany']);
const WRITE_UNIQUE = new Set(['update', 'delete', 'upsert']);
const CREATE = new Set(['create', 'createMany']);

/**
 * Prisma client extension enforcing tenant isolation at the query layer.
 *
 * Why here and not only in services: services are written by many hands over
 * time and one forgotten `where` clause is a cross-tenant data leak. Putting
 * the rule in the client means a service *cannot* forget — the filter is
 * applied even to queries that never mention tenancy.
 *
 * `findUnique` deserves special mention. Prisma only accepts unique fields in
 * its `where`, so we cannot simply add `tenantId` to it. Instead those calls
 * are rewritten to `findFirst`, which accepts arbitrary filters. Same for
 * update/delete by id, which become updateMany/deleteMany with a tenant guard
 * and then assert that exactly one row was touched.
 */
/**
 * `this` is not the Prisma client inside a query extension, so the two branches
 * that need to re-dispatch (findUnique -> findFirst, and the ownership check
 * before update/delete) are handed the extended client explicitly. The client
 * does not exist until after $extends returns, hence the getter.
 */
export function createTenantScopeExtension(getClient: () => Record<string, any>) {
  return Prisma.defineExtension({
  name: 'tenantScope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_SCOPED_MODELS.has(model)) {
          return query(args);
        }

        const tenantId = RequestContextStore.getTenantId();

        // Null means an explicitly unscoped context (super admin / migration /
        // background job). Those paths are guarded elsewhere.
        if (tenantId === null) {
          return query(args);
        }

        const a = args as Record<string, any>;

        if (READ_MANY.has(operation) || WRITE_MANY.has(operation)) {
          a.where = { ...(a.where ?? {}), tenantId };
          return query(a);
        }

        if (READ_UNIQUE.has(operation)) {
          // Rewrite to findFirst so we can add a non-unique tenant filter.
          const rewritten = {
            ...a,
            where: { ...(a.where ?? {}), tenantId },
          };
          const delegate = getClient()[lowerFirst(model)];
          const result = await delegate.findFirst(rewritten);
          if (result === null && operation === 'findUniqueOrThrow') {
            throw new Prisma.PrismaClientKnownRequestError(
              `No ${model} found`,
              { code: 'P2025', clientVersion: 'tenant-scope' },
            );
          }
          return result;
        }

        if (CREATE.has(operation)) {
          if (operation === 'createMany') {
            const data = Array.isArray(a.data) ? a.data : [a.data];
            a.data = data.map((row: Record<string, any>) => ({ ...row, tenantId }));
          } else {
            a.data = { ...(a.data ?? {}), tenantId };
          }
          return query(a);
        }

        if (WRITE_UNIQUE.has(operation)) {
          const delegate = getClient()[lowerFirst(model)];

          // Confirm the row belongs to this tenant before mutating it.
          const owned = await delegate.findFirst({
            where: { ...(a.where ?? {}), tenantId },
            select: { id: true },
          });

          if (!owned) {
            throw new Prisma.PrismaClientKnownRequestError(
              `No ${model} found for the current tenant`,
              { code: 'P2025', clientVersion: 'tenant-scope' },
            );
          }

          if (operation === 'upsert') {
            a.create = { ...(a.create ?? {}), tenantId };
          }
          a.where = { ...(a.where ?? {}), id: owned.id };
          return query(a);
        }

        return query(a);
      },
    },
  },
  });
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
