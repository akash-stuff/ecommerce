# Build Status

The specification describes roughly nine to twelve months of work for a small
team. This repository is **Phase 1 plus the structural groundwork for phases
2–6**: the parts that are expensive to change later and that everything else
depends on being right.

Development rule 20 says to document what isn't finished rather than pretend it
works. This file is that document.

Legend: **Built** runnable and tested · **Scaffolded** interface and schema
exist, logic pending · **Designed** schema and docs only · **Not started**

---

## Section-by-section

| # | Requirement | State | Notes |
|---|---|---|---|
| 1 | Project structure | Built | Two independent apps, no shared code |
| 2 | Technology choices | Built | Full stack as specified |
| 3 | Multi-tenant architecture | **Built** | Three enforcement layers, see MULTI_TENANCY.md |
| 4 | User roles & RBAC | **Built** | 5 roles, granular permissions, per-membership overrides |
| 5 | Super admin | **Built** | Platform console: cross-tenant overview, store provisioning and suspension, plan management, audit log. Template management pending |
| 6 | Tenant admin | **Built** | Every nav item resolves: dashboard, products, categories, inventory, orders, customers, coupons, shipping, notifications, reviews, appearance, analytics and settings |
| 7 | Store creation | **Built** | Transactional: tenant + store + theme + domain + owner |
| 8 | White-label customization | **Built** | Runtime CSS variables, per-tenant fonts, favicon, meta, and an admin editor with sanitised custom CSS |
| 9 | Template system | **Built** | 8 templates with distinct tokens; all five homepage sections implemented and driven by `Theme.homepageLayout`, so the editor's toggles change the live page |
| 10 | Customer storefront | **Built** | Home (configurable sections), shop/search/category browse, product detail with reviews, wishlist, cart, checkout, confirmation, sign-in, account and tenant-authored CMS pages |
| 11 | Product management | **Built** | Backend CRUD + variants + images; admin create/edit form built. Image upload needs object storage |
| 12 | Category management | **Built** | Nested tree with cycle, depth, cross-tenant-parent and in-use guards |
| 13 | Inventory | **Built** | Append-only ledger, signed adjustments, sale/restock paths. Oversell-safe via conditional UPDATE, not a lock |
| 14 | Cart | **Built** | Guest (token) + customer carts, merge on sign-in, totals recomputed on every read and never stored |
| 15 | Checkout | **Built** | One transaction: reprice, revalidate coupon, deduct stock, snapshot line items, empty cart. Totals computed server-side from DB prices only |
| 16 | Order management | **Built** | 8 statuses with an explicit transition table; cancelling restocks and releases the coupon |
| 17 | Payment architecture | **Built** | Provider interface + COD (working) + Razorpay (signature verification tested; order creation needs live keys). Webhooks verified and replay-safe |
| 18 | Shipping | **Built** | Zones and methods with most-specific-wins matching, rate quoting, admin UI, and shipment records that keep the order status and the parcel in step |
| 19 | Coupons | **Built** | Every restriction enforced, per-line allocation for scoped coupons, redemption claimed atomically |
| 20 | Customer management | **Built** | Self-service registration, sign-in, order history and cancellation; admin list, detail with addresses and spend, and deactivation |
| 21 | Reviews | **Built** | Verified-purchase decided from order history, moderation queue, rating recomputed on approval, storefront histogram |
| 22 | Search | **Built** | Postgres ILIKE over name/SKU/tags backed by pg_trgm GIN indexes, plus facet counts (category, brand, price bounds, availability) and URL-driven filters |
| 23 | Notifications | **Built** (email) | Queued before sending, outcome recorded, admin log + retry. SMS/WhatsApp channels unimplemented |
| 24 | Email templates | **Built** | Order confirmation, status change and welcome; HTML + plain text, all values escaped |
| 25 | Analytics | **Built** | Revenue, orders, customers, best sellers and a daily series in the store timezone; period-over-period comparison |
| 26 | SEO | Partial | Dynamic title/meta/OG, per-tenant sitemap.xml and robots.txt, JSON-LD product/breadcrumb schema. **Client-side rendering still limits social previews — see below** |
| 27 | Custom domains | **Built** | Add, TXT-based ownership verification, primary selection, and an on-demand-TLS authority endpoint so certificates are issued only for real stores |
| 28 | Security | Mostly built | See breakdown below |
| 29 | API design | **Built** | `/api/v1`, consistent envelope, Swagger |
| 30 | Database | **Built** | All 35 entities, indexes, FKs, scoped uniques |
| 31 | Frontend routing | **Built** | Three route trees — storefront, tenant admin, platform console — with guards and lazy loading |
| 32 | Backend structure | **Built** | Modular; 21 of ~22 modules implemented |
| 33 | Error handling | **Built** | Centralised filter, stable codes |
| 34 | Logging | **Built** | Structured, with request/user/tenant ids, no secrets |
| 35 | Docker | **Built** | Dev compose plus a production stack: Caddy TLS termination, one-shot migration job, no database ports published |
| 36 | Environment variables | **Built** | Validated at boot, documented |
| 37 | Seed data | **Built** | Two visibly different tenants, each with delivery zones, two shipping methods and a demo coupon |
| 38 | Testing | **Built** | **Tenant isolation suite** (87 cases), 91 backend unit tests, 32 frontend including component tests, and a dependency-free load harness (`npm run test:load`). CI runs all of it against a real database |
| 39 | Documentation | **Built** | 10 documents: README, ARCHITECTURE, MULTI_TENANCY, DATABASE, SECURITY, ENVIRONMENT, STATUS, DEPLOYMENT, CUSTOM_DOMAINS, RAZORPAY. API.md is generated by Swagger |
| 40 | Development rules | Followed | See below |
| 41 | Development order | Phase 1 done | Phases 2–6 outstanding |
| 42 | End-to-end workflow | **Built** | A shopper can browse, add to cart, apply a coupon, pick delivery, pay COD and get a confirmation — in the browser. Admin sees the order and fulfils it |

---

## Security (section 28) in detail

| Control | State |
|---|---|
| JWT authentication | Built |
| Refresh token rotation with reuse detection | Built |
| Password hashing (argon2id) | Built |
| RBAC | Built |
| Rate limiting | Built, global + tighter on auth routes |
| CORS with wildcard subdomain support | Built |
| Helmet security headers | Built |
| Input validation | Built, rejects unknown keys |
| SQL injection protection | Built via Prisma parameterisation; list `sortBy` is allowlisted so a column name cannot be injected into `orderBy` |
| Audit logging | Built — records tenant, plan, theme, order-status and stock actions with the actor, IP and request id; values redacted |
| XSS protection | Built — React escapes by default; `Theme.customCss` and `Page.content` are both sanitised on write *and* on read against allowlists, with 36 tests covering breakout, obfuscation and event-handler vectors |
| CSRF | Not needed for the bearer-token flow; **required** if the planned httpOnly cookie path for customers is used |
| Secrets never exposed to frontend | Built |
| Unpublished data not exposed | Built — the public product list serves ACTIVE only; drafts require `products.read` |

**Not yet done and worth flagging:** no Postgres row-level security and no
penetration test. Secret rotation and the database role split are documented in
[SECURITY.md](./SECURITY.md), with `deploy/postgres-roles.sql` ready to run —
RLS stays off deliberately, because it would be a no-op while the API connects
as the schema owner, and the session-variable approach can leak across a
connection pool if done carelessly. The reasoning is written down rather than
half-applied.

**CI** runs typecheck, unit tests, the tenant-isolation suite against a real
Postgres, a build and `npm audit` for both apps on every push and pull request.

**Dependency advisories (checked 2026-08-14).** `npm audit --omit=dev` reports
5 high findings. Nodemailer was upgraded to 9.x and email delivery re-verified,
because it backs a live feature and the advisory concerned mail reaching an
unintended domain. The remaining four (`@nestjs/platform-express`, `multer`,
`js-yaml`, `lodash`) are all transitive under NestJS and their only fix is a
semver-major jump to Nest v11 — a framework migration, not a patch. Recorded
here rather than forced through.

**Concurrency note (section 13).** Stock is protected by a conditional
`UPDATE ... WHERE stock >= n` inside a transaction, evaluated under a row lock,
rather than by the Redis lock helper. Two checkouts racing for the last unit
cannot both win: the loser matches zero rows and is refused. This keeps the
guarantee independent of Redis, which is a cache and is allowed to be down.

## The SEO problem (section 26)

Section 26 asks for SEO-friendly product pages. The specified frontend stack —
React + Vite, client-rendered — cannot fully deliver that. Meta tags injected
after page load are seen by Googlebot but not reliably by other crawlers or
social scrapers, so Open Graph previews on Twitter, WhatsApp and LinkedIn will
frequently be blank.

Three ways out, none free:

1. **Next.js for the storefront** — proper SSR, best SEO. Deviates from the
   specified stack and splits the frontend into two apps.
2. **Vite SSR / `vite-plugin-ssr`** — keeps the stack, adds a Node server, so
   the frontend is no longer a static bundle.
3. **Prerender middleware** — serve crawlers a rendered snapshot. Cheapest,
   least robust.

This needs a decision before the storefront is fleshed out; retrofitting SSR
after twenty pages exist is significantly more expensive. Flagging it now
rather than shipping meta tags that look correct and silently underperform.

## Adherence to the development rules

Rules 4, 5, 6 (no hard-coded tenants, products or payment credentials): the
seed script is the only place demo data appears, and it refuses to run in
production. Rule 9 and 10 (never trust frontend prices or tenant ids): enforced
structurally — prices are recomputed server-side and `tenantId` is rejected by
the validation pipe. Rule 18 and 19 (no fake APIs, no mock data in production
code): unimplemented features render honest empty states rather than
placeholder numbers, which is why the admin dashboard says analytics aren't
connected instead of showing invented revenue.

## Suggested next order

1. ~~**Categories + inventory services**~~ — done
2. ~~**Cart → checkout → orders**~~ — done; server-side pricing, one transaction
3. ~~**Payment provider + webhooks**~~ — architecture and COD done; Razorpay
   needs live keys to exercise order creation
4. ~~**Storefront cart and checkout pages**~~ — done; a purchase completes in
   the browser
5. **Decide the SEO approach** before building out storefront pages
6. **Postgres RLS** as the fourth isolation layer
7. Analytics, notifications, reviews, then the phase 6 platform features
