# Architecture

## Shape

```
                    ┌──────────────────────────────┐
  *.platform.com ──▶│  ecommerce-frontend (static) │
  custom domains    │  one bundle, every tenant    │
                    └──────────────┬───────────────┘
                                   │ REST /api/v1
                    ┌──────────────▼───────────────┐
                    │  ecommerce-backend (NestJS)  │
                    │  middleware → guards →       │
                    │  controller → service        │
                    └───────┬──────────────┬───────┘
                            │              │
                     ┌──────▼─────┐  ┌─────▼──────┐
                     │ PostgreSQL │  │   Redis    │
                     └────────────┘  └────────────┘
```

The frontend is a static bundle. It has no server, no business logic, and no
knowledge of which tenant it is serving — it asks the API, which decides from
the hostname.

## Request lifecycle

```
1  RequestContextMiddleware   opens AsyncLocalStorage, assigns requestId,
                              resolves tenant from hostname (Redis-cached)
2  ThrottlerGuard             rate limits
3  JwtAuthGuard               verifies token, checks tid vs resolved tenant,
                              writes actor into context
4  PermissionsGuard           checks required permissions; for @PlatformOnly
                              routes, lifts the tenant filter (SUPER_ADMIN only)
5  ValidationPipe             whitelist + forbidNonWhitelisted, so unknown keys
                              such as tenantId are rejected outright
6  Controller                 thin — parses, delegates, returns
7  Service                    all business logic; queries via PrismaService.db
8  Prisma extension           injects tenantId into every query
9  ResponseInterceptor        wraps as { success: true, data }
10 AllExceptionsFilter        wraps failures as { success: false, message, code }
```

## Layering rules

- **Controllers** never contain business logic and never touch Prisma directly.
- **Services** own all logic and are the only place that queries.
- **Money** is `Decimal` in the database and a decimal *string* over the wire.
  Float would round customer totals. The backend recomputes every total; a
  price sent from a client is discarded.
- **Financial writes run in transactions.** Order creation, payment capture,
  inventory deduction, refunds and coupon usage each need to be all-or-nothing.

## API conventions

Base URL `/api/v1`. Every response is enveloped:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "total": 40 } }
{ "success": false, "message": "Product not found", "code": "PRODUCT_NOT_FOUND" }
```

Codes are stable strings the frontend switches on; `message` is human-facing
and may be reworded. Every list endpoint is paginated with a hard cap of 100.

## Designed-for extension points

Interfaces exist so a second implementation doesn't require rewriting callers:

- **Payments** — `PaymentProvider` interface, Razorpay first, Stripe and a mock
  provider intended to slot in beside it. Verification happens on the backend
  against the provider; a frontend success callback never marks an order paid.
  Webhooks are idempotent via the `WebhookEvent` unique constraint.
- **Shipping** — `ShippingProvider` interface, manual rates first, aggregators
  later.
- **Notifications** — channel interface with email first; SMS and WhatsApp
  implement the same contract.
- **Search** — Postgres `ILIKE` and trigram indexes now, behind a service
  boundary so Elasticsearch can replace the implementation.

## Templates vs themes

A **Template** is a platform asset: a layout recipe (which sections, in what
order) plus default theme tokens. A **Theme** is a tenant's overrides on top.

There is one React storefront. Templates are configuration, not forks — eight
templates do not mean eight applications. `ThemeProvider` fetches the store
config, writes CSS custom properties, and the same components render as a
fashion store or a grocery store depending on what came back.
