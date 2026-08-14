# Database

35 models, 14 enums, one Postgres database. This document explains the shape and
the three conventions that matter; the schema itself is the reference and lives
at `ecommerce-backend/prisma/schema.prisma`.

---

## The three kinds of table

Which kind a table is decides how every query against it must be written.

### Tenant-scoped (25 tables)

`Store`, `Theme`, `Domain`, `Category`, `Brand`, `Product`, `ProductImage`,
`ProductVariant`, `InventoryTransaction`, `Customer`, `Address`, `WishlistItem`,
`Cart`, `CartItem`, `Order`, `OrderItem`, `Payment`, `Coupon`, `CouponUsage`,
`ShippingZone`, `ShippingMethod`, `Shipment`, `Review`, `Page`, `Banner`.

Every one has a non-null `tenantId`. **No service method mentions it.** The
Prisma client extension in `src/common/prisma/tenant-scope.ts` injects it into
the `where` of every read and onto every create, using the tenant resolved from
the request hostname. A service that filters by `tenantId` by hand is a code
smell, not a safety belt — it means someone did not trust the extension, and the
next person will copy the pattern without the filter.

### Platform-level (7 tables)

`Tenant`, `User`, `Plan`, `Template`, `WebhookEvent`, plus the two below.
No `tenantId` at all, or one that is optional. Reached only through
`prisma.runUnscoped(...)`, which is deliberately verbose so it stands out in a
diff.

### Platform-managed, tenant-tagged (3 tables)

`AuditLog`, `Notification`, `RefreshToken`. These carry a **nullable**
`tenantId`: a platform-level notice or a super admin's session belongs to no
store. Because the column is nullable the extension cannot scope them safely, so
**every query filters by tenant explicitly**. `AuditService.list` and
`NotificationsService.findAll` both do this by hand, and `tenant-isolation.e2e-spec.ts`
asserts one store cannot read another's rows — exactly because the automatic
guard does not apply here.

---

## Entity groups

**Tenancy and access** — `Tenant` → `TenantUser` → `User`, with `RefreshToken`
for sessions. `TenantUser` is the join that carries a role and per-membership
permission overrides, so one person can own two stores with different rights.
A `RefreshToken` belongs to *either* a `User` or a `Customer`; both columns are
nullable and exactly one is set.

**Billing** — `Plan` → `Subscription` → `Tenant`. Plans are a shared catalogue;
retiring one is refused while any subscription points at it.

**Storefront identity** — `Store` (one per tenant, `tenantId` is unique),
`Theme` (one per store), `Template` (a shared catalogue of starting points), and
`Domain` (many per tenant: one platform subdomain plus any custom hostnames).

**Catalogue** — `Category` (self-referencing tree), `Brand`, `Product`,
`ProductImage`, `ProductVariant`. Stock lives on `Product` and `ProductVariant`
for read speed; `InventoryTransaction` is the append-only ledger explaining how
it got there.

**Customers** — `Customer` (tenant-scoped, so one email at two stores is two
unrelated accounts), `Address`, `WishlistItem`, `Review`.

**Buying** — `Cart` → `CartItem`, then `Order` → `OrderItem` → `Payment`.
`Coupon` and `CouponUsage` record discounts; `ShippingZone` → `ShippingMethod` →
`Shipment` handle delivery.

**Content and operations** — `Page`, `Banner`, `Notification`, `AuditLog`,
`WebhookEvent`.

---

## Uniqueness is scoped, not global

The single most common mistake on a multi-tenant schema is a global unique
index. Two stores must be able to sell a product with the same SKU.

```prisma
@@unique([tenantId, slug])   // Product, Category
@@unique([tenantId, sku])    // Product, ProductVariant
@@unique([tenantId, code])   // Coupon
@@unique([tenantId, email])  // Customer
```

The exceptions are deliberate and worth knowing:

| Column | Scope | Why |
|---|---|---|
| `Domain.hostname` | **global** | A hostname resolves to exactly one tenant; two claims must collide |
| `Tenant.slug` | **global** | It becomes a subdomain |
| `User.email` | **global** | One person, one login, possibly several stores |
| `Store.slug` | **global** | Legacy of store-per-slug addressing |
| `Plan.name` / `Plan.slug` | **global** | A shared catalogue |

`Customer.email` being tenant-scoped while `User.email` is global is the pair
most likely to trip someone up: staff are platform citizens, shoppers are not.

---

## Indexing

Every tenant-scoped table leads its indexes with `tenantId`, because every query
against it filters on that first:

```prisma
@@index([tenantId, status, placedAt])   // Order — the admin order list
@@index([tenantId, productId, status])  // Review — the storefront histogram
@@index([tenantId, parentId])           // Category — tree walks
```

A composite index is only useful left-to-right, so `@@index([status])` on a
tenant-scoped table would be dead weight — the planner cannot use it once
`tenantId` is in the predicate.

**No trigram index exists yet.** Product search uses `ILIKE` via Prisma's
`contains`, which does not use a b-tree index and will slow down on a large
catalogue. Adding `pg_trgm` plus a GIN index is the intended next step; see
STATUS.md section 22.

---

## Money

Every monetary column is `Decimal` — `@db.Decimal(12, 2)` for unit prices,
`@db.Decimal(14, 2)` for order totals. Never a float.

`0.1 + 0.2` is `0.30000000000000004`, and a store that computes totals in floats
eventually charges a customer a paisa more than the line items add up to. The
application matches: `src/common/money.ts` wraps `Prisma.Decimal` and the
pricing engine never converts to a JS number.

---

## Columns that are deliberately not trusted

Some denormalised columns exist in the schema but nothing writes them, and the
services derive the value instead:

| Column | Derived from |
|---|---|
| `Customer.totalSpent` | `SUM(orders.grandTotal)` excluding cancelled/refunded |
| `Customer.lastOrderAt` | `MAX(orders.placedAt)` |
| `Customer.orderCount` | `_count` of orders |

This is not an oversight to fix by adding writes. A cached total is only as
current as whatever last updated it, and the customer list showed "1 order, last
ordered never" precisely because these columns were read rather than computed.
Deriving them costs one grouped query per page and cannot disagree with the
order list beside it.

`Product.ratingAverage` and `Product.ratingCount` are the opposite case: they
*are* written, inside the same transaction that approves or rejects a review, so
they cannot drift from the reviews they summarise.

---

## Deletion

Mostly cascade from `Tenant`, so removing a tenant removes its data.

Three deliberate exceptions:

- **`Product` is soft-deleted** (`deletedAt`), because `OrderItem` references it
  and an invoice must not change retroactively. Order lines also snapshot the
  name, SKU and unit price for the same reason.
- **`AuditLog.tenantId` is `SetNull`**, so deleting a store does not erase the
  record of who deleted it.
- **`Coupon` is deactivated, never deleted**, because past orders reference it.

---

## Migrations

```bash
npm run prisma:migrate      # create and apply in development
npm run prisma:deploy       # apply in production (what the migrate job runs)
npm run seed                # idempotent; safe to re-run
```

The production compose file runs `prisma migrate deploy` as a one-shot job that
the API waits on, so migrations never race across replicas. See DEPLOYMENT.md.

**Row-level security is not enabled.** The application connects as a single
Postgres role and enforces isolation in the Prisma extension. Turning RLS on
without also splitting database roles would be a no-op — the owning role bypasses
policies unless `FORCE ROW LEVEL SECURITY` is set — so it is documented as an
open item rather than half-applied. See MULTI_TENANCY.md.
