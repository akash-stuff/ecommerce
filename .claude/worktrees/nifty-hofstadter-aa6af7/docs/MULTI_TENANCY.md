# Multi-Tenancy

## Model

Shared database, shared schema, discriminator column. Every tenant-owned table
carries `tenantId`, with a composite index leading on it.

This was chosen over schema-per-tenant and database-per-tenant because the
platform is expected to hold many small stores: a thousand Postgres schemas
makes migrations and connection pooling painful, and the isolation benefit is
recoverable in software. The trade-off is that isolation becomes a correctness
problem rather than a physical one — which is why it is enforced three times
over.

## The three layers

### 1. Tenant resolution — hostname is the source of truth

`RequestContextMiddleware` runs before every controller and asks
`TenantResolverService` to map the hostname to a tenant:

```
northwind.platform.com   → platform subdomain → slug lookup
shop.northwind.com       → custom domain      → Domain table, status must be ACTIVE
admin.platform.com       → no tenant          → the JWT decides
```

The result lands in an `AsyncLocalStorage` context that every downstream
service shares without passing it through arguments.

**A `tenantId` in a request body, query string or header is never read.**
`ValidationPipe` runs with `forbidNonWhitelisted: true`, so a payload
containing `tenantId` is rejected with a 400 rather than silently stripped.

Resolutions are cached in Redis for 5 minutes and invalidated when a domain is
verified or a tenant is suspended.

### 2. Query layer — the Prisma client extension

`src/common/prisma/tenant-scope.ts` intercepts every query on a registered
model:

| Operation | What happens |
|---|---|
| `findMany`, `findFirst`, `count`, `aggregate`, `groupBy` | `where.tenantId` injected |
| `findUnique` | rewritten to `findFirst` with a tenant filter (Prisma won't accept non-unique fields in a `findUnique` where) |
| `create`, `createMany` | `tenantId` stamped onto the data |
| `updateMany`, `deleteMany` | `where.tenantId` injected |
| `update`, `delete`, `upsert` | ownership verified first, then the id is pinned |

The point of putting this here rather than only in services: services get
written by many people over several years, and one forgotten `where` clause is
a cross-tenant leak. A service physically *cannot* forget, because it never
writes the filter in the first place.

Cross-tenant access surfaces as a 404, not a 403 — a 403 would confirm that the
record exists.

### 3. Constraints — uniqueness is scoped

```prisma
@@unique([tenantId, slug])   // two stores may both sell /shared-widget
@@unique([tenantId, sku])    // two stores may both use SKU-001
@@unique([tenantId, email])  // one shopper email = two unrelated accounts
```

## The escape hatch

Some work legitimately runs outside tenant scope: super admin queries, webhook
handlers that must find the tenant before they know it, cron jobs.

```ts
await prisma.runUnscoped(db => db.tenant.findMany());        // platform-wide
await prisma.runAsTenant(tenantId, db => db.order.count());  // explicit tenant
```

`runUnscoped` is deliberately awkward to call so each use is easy to review.
The only route-level way to reach it is `@PlatformOnly()`, which
`PermissionsGuard` honours only for `SUPER_ADMIN`.

## Token binding

An access token carries the tenant it was minted for (`tid`). `JwtAuthGuard`
compares it to the hostname-resolved tenant and rejects a mismatch with
`TENANT_MISMATCH`. Without this, a valid staff session for tenant A could be
replayed against tenant B's storefront.

## Adding a tenant-scoped model

1. Add `tenantId String` plus the tenant relation to `schema.prisma`
2. Add `@@index([tenantId, ...])` and scope any `@@unique` to include `tenantId`
3. Add the model name to `TENANT_SCOPED_MODELS`

Miss step 3 and `test/tenant-isolation.spec.ts` fails the build: it reads
Prisma's own DMMF, finds every model with a `tenantId` column, and asserts each
one is accounted for. The check cannot drift out of date because it derives
from the schema itself.

### The deliberate exceptions

Six models carry `tenantId` but are *not* auto-scoped. Each is listed in
`PLATFORM_MANAGED_TENANT_MODELS` with a written reason, and the test asserts
that the reason exists — an exception has to be argued for, not just added.

| Model | Why it is not auto-scoped |
|---|---|
| `TenantUser` | Membership grants, written during platform-scoped provisioning |
| `Subscription` | Billing is platform-owned; a tenant must not write its own plan |
| `RefreshToken` | Auth runs before a tenant context exists; revocation sweeps cross tenants |
| `AuditLog` | Nullable tenant; audit writes must not be filtered by the actor's own scope |
| `Notification` | Nullable tenant; platform-level notices have none |
| `WebhookEvent` | Arrives from a payment provider before the tenant is known |

Every one of these is written only by platform-level code that already knows
which tenant it means. If a future feature needs tenant-facing reads of any of
them, it should go through a service that filters explicitly — not by moving
the model into the scoped set, which would break the platform paths.

## Known gaps

- **No row-level security.** Isolation is application-enforced. A raw
  `$queryRaw` bypasses the extension entirely, and so would direct `psql`
  access. Postgres RLS as a fourth layer is the recommended next step; the
  schema is already shaped for it since every table carries `tenantId`.
- **`$transaction` callbacks inherit the context** and are therefore scoped, but
  raw SQL inside one is not.
- **No per-tenant connection pooling or rate limits.** One noisy tenant can
  affect others.
