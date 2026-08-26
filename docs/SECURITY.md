# Security

What is enforced, how, and what is deliberately not done yet. The per-control
table lives in [STATUS.md](./STATUS.md#security-section-28-in-detail); this
document covers the operational side.

---

## The isolation model

Tenant isolation is enforced in three places, and the order matters:

1. **Hostname → tenant**, resolved server-side in middleware. There is no
   `X-Tenant-Id` header and no tenant field in any request body. A client cannot
   name the tenant it wants.
2. **Prisma client extension** injects `tenantId` into the `where` of every read
   and onto every create for the 25 tenant-scoped models. No service method
   mentions `tenantId`; a service that filters by hand is a smell, because the
   next person will copy the pattern without the filter.
3. **Guards** — authentication, then tenant resolution, then permissions.

The suite that proves this is `test/tenant-isolation.e2e-spec.ts`: two tenants
seeded with deliberately colliding data (same product slug, same SKU, same
customer email) and every access path probed from the wrong side.

**Three models sit outside the automatic scoping** — `AuditLog`,
`Notification`, `RefreshToken` — because their `tenantId` is nullable for
platform-level rows. Every query against them filters by tenant explicitly, and
the e2e suite asserts one store cannot read another's.

---

## Secret rotation

Nothing in this repository rotates secrets automatically. This is the procedure.

### JWT signing secrets

`JWT_SECRET` and `JWT_REFRESH_SECRET`.

Rotating the access secret **invalidates every access token immediately**.
Because access tokens are short-lived (15 minutes by default) and the frontend
refreshes automatically, a rotation is close to invisible — the next refresh
mints a token signed with the new key.

Rotating the **refresh** secret is different: refresh tokens are opaque random
strings stored hashed in the database, not JWTs, so `JWT_REFRESH_SECRET` does
not actually sign them. Rotating it is harmless. To invalidate sessions, revoke
the rows instead:

```sql
-- Sign everyone out, everywhere
UPDATE refresh_tokens SET "revokedAt" = now() WHERE "revokedAt" IS NULL;

-- Or one tenant's staff only
UPDATE refresh_tokens SET "revokedAt" = now()
WHERE "tenantId" = '<tenant-id>' AND "revokedAt" IS NULL;
```

Suspending a tenant already does the second one automatically.

**Procedure:** generate with `openssl rand -base64 48`, update
`.env.production`, restart the API. Do it on a schedule you can actually keep —
quarterly is more useful than an annual plan nobody follows.

### Database passwords

1. `ALTER ROLE ecommerce_app WITH PASSWORD '<new>';`
2. Update `DATABASE_URL` in `.env.production`.
3. Restart the API. Postgres keeps existing connections alive, so there is no
   dropped-request window if you restart rather than kill.

### Tenant gateway credentials

These are not ours. Each store enters its own Razorpay keys in Admin →
Payments, and they are stored as AES-256-GCM envelopes in
`payment_gateways.secrets` — never in the environment, never in an audit log
(only *which* fields changed is recorded), and never returned by the API. The
admin is told which secrets are set, not what they are.

Each envelope is bound with additional authenticated data to the tenant,
provider and field it was stored under. One key encrypts every tenant's
secrets, so without that binding a ciphertext copied into another store's row
would decrypt cleanly and point that store's payments at the wrong merchant
account.

Rotating a store's own keys is that store's business: it re-enters them, and
**creates the new webhook secret before removing the old one** — an unsigned
webhook is rejected, and Razorpay retries, but a gap means captured payments
arrive at an API that will not accept them.

### CREDENTIALS_ENCRYPTION_KEY

The key those envelopes are sealed with. 32 bytes, base64 or hex, validated at
boot — the process refuses to start without a usable one.

**Rotating it makes every stored gateway secret unreadable.** There is no
re-encryption pass. A secret that will not open is treated as absent, so the
affected store's gateway reports itself unconfigured, stops being offered at
checkout, and the owner has to re-enter the keys. Plan the rotation as an
announced event, not a config edit. It belongs in a secret manager: it is the
one value that, together with a database dump, yields live merchant
credentials for every tenant on the platform.

### SMTP credentials

Rotate at the provider, update `SMTP_PASSWORD`, restart. For Gmail this means
revoking the App Password and issuing a new one; the account password is never
used. Failed sends are
recorded rather than lost: the admin **Notifications** screen has a retry that
replays the exact message once credentials work again.

### What must never be rotated casually

`PLATFORM_DOMAIN`. Every tenant subdomain, every issued TLS certificate and
every stored `Domain.hostname` derives from it. Changing it is a migration, not
a config edit.

---

## Database roles

The API connects as the schema owner, which means a bug in a raw query could
drop a table rather than merely read one. [`deploy/postgres-roles.sql`](../deploy/postgres-roles.sql)
creates a DDL-owning migration role and a DML-only application role, and is run
once by an operator.

It is not a Prisma migration on purpose: migrations run on every deploy, and a
`CREATE ROLE` there would either fail for lack of privilege or re-run against a
role that already exists.

---

## Row-level security: not enabled, deliberately

Postgres RLS is the obvious next layer, and it is not switched on. Two honest
reasons:

1. **It would currently be a no-op.** The app connects as the table owner, and
   an owner bypasses policies unless `FORCE ROW LEVEL SECURITY` is set. Enabling
   it today would add a line to a security document and change nothing.
2. **The session-variable problem is real.** A policy reads the tenant from
   something like `current_setting('app.current_tenant')`. Prisma pools
   connections and hands them out per query, so a variable set for one request
   can be visible to the next unless every transaction sets it. The failure mode
   is one tenant reading another's rows — precisely what RLS is meant to prevent.

Doing it properly means the role split above, plus a transaction wrapper that
sets the variable, plus tests proving the pool cannot leak it. That is a piece
of work, not a flag. Until then the Prisma extension is the enforcement layer
and the e2e suite is the proof.

---

## Dependency advisories

CI runs `npm audit --omit=dev` on both apps for every push and pull request.

- **Frontend** is gated at `high` and passes.
- **Backend** is gated at `critical`, deliberately and temporarily. There are 5
  open high advisories, all transitive under NestJS
  (`@nestjs/platform-express`, `multer`, `js-yaml`, `lodash`), whose only fix is
  a semver-major jump to Nest v11 — a framework migration, not a patch. Gating
  at `high` would make the pipeline red on its first run, and a permanently red
  gate is one somebody switches off. **Raise it to `high` as part of that
  migration.**

Nodemailer was upgraded to 9.x out of band because it backs a live feature and
its advisory concerned mail reaching an unintended domain. Delivery was
re-verified against a real SMTP server afterwards.

---

## Untrusted input that gets rendered

Two fields are written by tenant staff and rendered on their own storefront, so
anything executable in them runs against their customers on their own origin.
Both are sanitised against an **allowlist** on write *and* again on read, so a
row written by an older build or a direct database edit still cannot reach a
browser:

| Field | Sanitiser | Tests |
|---|---|---|
| `Theme.customCss` | `src/theme/css-sanitiser.ts` | 16 |
| `Page.content` | `src/pages/html-sanitiser.ts` | 20 |

Both refuse rather than silently strip, and report what was removed so the
author is told their input changed. Covered vectors include `</style>` and
`</script>` breakouts, CSS hex-escape obfuscation (`\6a avascript:`), HTML
entity obfuscation (`java&#09;script:`), event handlers, `@import`, and
`data:text/html`.

---

## What is still missing

- **No penetration test.** Nothing here substitutes for one.
- **No RLS**, for the reasons above.
- **CSRF** is not needed for the current bearer-token flow, but becomes
  **required** if the planned httpOnly cookie path for customers is adopted.
- **Image uploads** are served from the API's own origin when S3 is
  unconfigured. The stored content-type is decided by the file's magic bytes
  rather than its declared type, and SVG is refused outright, so an upload
  cannot become script on that origin — but a separate asset origin is still
  the stronger arrangement and is not yet in place.
