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
| 5 | Super admin | **Built** | Platform console: cross-tenant overview, store provisioning and suspension, plan management, template management and audit log |
| 6 | Tenant admin | **Built** | Every nav item resolves: dashboard, products, categories, inventory, orders, customers, coupons, shipping, notifications, reviews, pages, appearance, banners, analytics and settings. Settings also carries the store's invoicing identity — registered name, GSTIN, PAN and billing address — with a panel showing what an invoice prints today, fallbacks applied |
| 7 | Store creation | **Built** | Transactional: tenant + store + theme + domain + owner |
| 8 | White-label customization | **Built** | Runtime CSS variables, per-tenant fonts, favicon, meta, and an admin editor with sanitised custom CSS, orderable homepage sections, uploadable logo and favicon, and a template picker. The announcement strip carries its own colours, font and size, previewed as it is edited; social links are edited per network and render in the footer as that network's mark rather than its name |
| 9 | Template system | **Built** | 14 templates differing in palette, type *and* which homepage sections appear and in what order, driven by `Theme.homepageLayout`. Super admins can add, edit and retire templates — with a generated preview of the layout, an uploadable thumbnail, and the same font and section allowlists the tenant editor enforces. A store owner can also switch their own store to another template from Appearance; values are copied, so no live storefront changes when a template is edited. All three adoption paths (provisioning, seed, switching) read a template row through `templateLook`, which re-checks it against the allowlists on the way out |
| 10 | Customer storefront | **Built** | Home (configurable sections), shop/search/category browse, product detail with its full description and the store's shared note, wishlist, cart, checkout, confirmation, sign-in, account with per-order invoice download, and tenant-authored CMS pages that carry a header image and a captioned gallery as well as text |
| 11 | Product management | **Built** | Backend CRUD + variants + images; admin create/edit form with drag-free image reordering and real file upload |
| 12 | Category management | **Built** | Nested tree with cycle, depth, cross-tenant-parent and in-use guards |
| 13 | Inventory | **Built** | Append-only ledger, signed adjustments, sale/restock paths. Oversell-safe via conditional UPDATE, not a lock |
| 14 | Cart | **Built** | Guest (token) + customer carts, merge on sign-in, totals recomputed on every read and never stored |
| 15 | Checkout | **Built** | One transaction: reprice, revalidate coupon, deduct stock, snapshot line items, empty cart. Totals computed server-side from DB prices only |
| 16 | Order management | **Built** | 8 statuses with an explicit transition table; cancelling restocks and releases the coupon. Every order renders a PDF invoice on demand — the same document for the shopper and the admin console — with GST split into CGST/SGST or IGST by place of supply |
| 17 | Payment architecture | **Built** | Provider interface + COD + Razorpay, configured **per store**: each tenant connects its own merchant account from Admin → Payments, so settlements reach that store's bank rather than the platform's. Secrets are AES-256-GCM encrypted at rest, bound to the tenant and field, and never returned by the API. Both methods are opt-in, so a store can decline cash or take cash only. Webhooks resolve the tenant from the payment the payload names, then verify against *that* store's secret; replay-safe as before. Razorpay order creation needs live keys |
| 18 | Shipping | **Built** | Zones and methods with most-specific-wins matching, rate quoting, admin UI, and shipment records that keep the order status and the parcel in step |
| 19 | Coupons | **Built** | Every restriction enforced, per-line allocation for scoped coupons, redemption claimed atomically |
| 20 | Customer management | **Built** | Self-service registration, sign-in, order history and cancellation; admin list, detail with addresses and spend, and deactivation |
| 21 | Reviews | **Built** | Verified-purchase decided from order history, moderation queue, rating recomputed on approval, storefront histogram |
| 22 | Search | **Built** | Postgres ILIKE over name/SKU/tags backed by pg_trgm GIN indexes, plus facet counts (category, brand, price bounds, availability) and URL-driven filters |
| 23 | Notifications | **Built** | Email, SMS and WhatsApp. Queued before sending, outcome recorded, admin log and channel-aware retry. Text messages supplement the email and are sent only where a number exists and a channel is configured |
| 24 | Email templates | **Built** | Order confirmation, status change and welcome; HTML + plain text, all values escaped |
| 25 | Analytics | **Built** | Revenue, orders, customers, best sellers and a daily series in the store timezone; period-over-period comparison |
| 26 | SEO | Partial | Dynamic title/meta/OG, per-tenant sitemap.xml and robots.txt, JSON-LD product/breadcrumb schema. **Client-side rendering still limits social previews — see below** |
| 27 | Custom domains | **Built** | Add, TXT-based ownership verification, primary selection, and an on-demand-TLS authority endpoint so certificates are issued only for real stores |
| 28 | Security | Mostly built | See breakdown below |
| 29 | API design | **Built** | `/api/v1`, consistent envelope, Swagger |
| 30 | Database | **Built** | All 35 entities, indexes, FKs, scoped uniques. Every model now has a service behind it |
| 31 | Frontend routing | **Built** | Three route trees — storefront, tenant admin, platform console — with guards and lazy loading |
| 32 | Backend structure | **Built** | Modular; 27 feature modules, all implemented and registered |
| 33 | Error handling | **Built** | Centralised filter, stable codes |
| 34 | Logging | **Built** | Structured, with request/user/tenant ids, no secrets |
| 35 | Docker | **Built** | Dev compose plus a production stack: Caddy TLS termination, one-shot migration job, no database ports published |
| 36 | Environment variables | **Built** | Validated at boot, documented |
| 37 | Seed data | **Built** | Two visibly different tenants, each with delivery zones, two shipping methods, a demo coupon and an announcement banner |
| 38 | Testing | **Built** | **Tenant isolation suite** (104 cases, run against a real Postgres), 117 backend unit tests, 32 frontend including component tests, and a dependency-free load harness (`npm run test:load`). CI runs all of it against a real database |
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
| Upload validation | Built — the file's magic bytes decide its type, not the declared `Content-Type` or filename, so a `.png` that is really HTML is refused rather than served from the store's own origin. SVG is excluded on purpose |
| Upload keys | Built — generated as `tenants/<id>/<purpose>/<month>/<uuid>.<ext>`, never derived from the uploaded filename, so traversal and cross-tenant collision are both structurally impossible. Platform assets (template thumbnails) go to `platform/<purpose>/…` through a separate `@PlatformOnly` route, because the tenant prefix cannot be built where there is no tenant |
| Invoice access | Built — the shopper's route is scoped by customer id as well as by tenant, because order numbers are sequential and guessable; the admin route needs `orders.read`. The PDF embeds no remote image, so rendering one cannot be turned into a server-side request at a URL held in the database |
| Banner link sanitisation | Built — `linkUrl` becomes an `href`, so `javascript:`, `data:` and protocol-relative URLs are dropped on write, the same rule the theme's social links follow |

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
5. ~~**Templates, banners, uploads and text-message channels**~~ — done; every
   schema entity now has a service and a screen behind it
6. **Decide the SEO approach** before building out storefront pages
7. **Postgres RLS** as the fourth isolation layer
8. Phase 6 platform features

### What is deliberately not built

Each of these is a decision rather than an omission, and the reasoning is in
this file or in [SECURITY.md](./SECURITY.md):

| Gap | Why it is still open |
|---|---|
| SSR for the storefront | A stack decision with three viable answers, none free — see below. Picking one silently would be the wrong call to make on the project's behalf |
| Postgres RLS | A no-op while the API connects as the schema owner, and the session-variable approach can leak across a pooled connection if done carelessly |
| `IN_APP` notification channel | The enum value exists; nothing renders an in-app inbox, so no sender pretends to fill one |
| SVG uploads | XML that can carry script, served from the storefront's own origin. Supporting it needs a sanitiser, which is more work than treating the format as a picture |
| Image resizing / thumbnails | Uploads are stored as received. A large photo is served at full size, which costs bandwidth on a product grid |
| Razorpay order creation against live keys | Signature verification is tested; the create-order call has never run against a real account |
| Penetration test | Not attempted |
