# Environment Variables

Secrets live only in the backend. Anything in a `VITE_` variable is compiled
into the JavaScript bundle and is public — never put a key there.

## Backend

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `development` \| `test` \| `production` |
| `PORT` | no | Default `4000` |
| `PLATFORM_DOMAIN` | yes | Apex for tenant subdomains, e.g. `platform.com` |
| `PLATFORM_ADMIN_HOSTS` | no | Comma-separated hostnames that must *not* resolve to a tenant |
| `DATABASE_URL` | yes | Postgres connection string |
| `REDIS_URL` | yes | Used for tenant resolution cache and stock locks |
| `JWT_SECRET` | yes | Min 32 chars. `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | yes | Min 32 chars, different from the above |
| `JWT_ACCESS_TTL` | no | Access token seconds, default `900` |
| `JWT_REFRESH_TTL_DAYS` | no | Default `30` |
| `CORS_ORIGINS` | no | Comma-separated exact origins |
| `CORS_ALLOW_TENANT_SUBDOMAINS` | no | Default `true`; allows `*.PLATFORM_DOMAIN` |
| `CREDENTIALS_ENCRYPTION_KEY` | yes | 32 bytes, base64 or hex. `openssl rand -base64 32`. Encrypts the payment credentials tenants enter — see below |
| `SMTP_SERVICE` | no | `gmail` fills in host and port. An explicit `SMTP_HOST` always wins |
| `SMTP_HOST` / `SMTP_PORT` | for email | Blank host means email is logged, not sent |
| `SMTP_USER` / `SMTP_PASSWORD` | for email | For Gmail: the full address, and a 16-character **App Password** — not the account password |
| `SMTP_FROM` | no | Defaults to `SMTP_USER`. Gmail rewrites an unverified From, so a different value is silently ignored |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | for SMS/WhatsApp | Leave blank and only email is sent |
| `TWILIO_SMS_FROM` | for SMS | E.164 sender. SMS is unconfigured without it, even with credentials |
| `TWILIO_WHATSAPP_FROM` | for WhatsApp | Preferred over SMS when both are set |
| `SMS_DEFAULT_COUNTRY_CODE` | no | e.g. `+91`, applied to stored numbers lacking one |
| `S3_BUCKET` / `S3_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | for object storage | All four, or S3 is treated as unconfigured |
| `AWS_SESSION_TOKEN` | no | Only for temporary credentials from an assumed role |
| `S3_ENDPOINT` | no | Set for MinIO / R2 / Spaces; blank means AWS |
| `STORAGE_PUBLIC_BASE_URL` | recommended | Where stored files are fetched from. Defaults to `http://localhost:PORT`. **Leave blank with S3** unless a CDN sits in front — see below |
| `STORAGE_LOCAL_DIR` | no | Default `./uploads`, used only when S3 is unconfigured |
| `MAX_UPLOAD_BYTES` | no | Default `5242880` (5MB) |

## Storage: which provider is used

There is no driver switch. `S3_BUCKET`, `S3_REGION` and the two AWS keys being
present is what selects S3; anything less falls back to the local disk. One
condition, so there is no way to configure a driver that then reports itself
unusable.

Local storage is a real implementation, not a stub — same validation, same
keys, same URLs — which is what makes the switch a configuration change. It is
still wrong for more than one replica: files land on one container's filesystem,
so a second replica cannot serve them and an ephemeral container loses them on
restart. Configure S3 in production.

### The one storage mistake with no error

`STORAGE_PUBLIC_BASE_URL` is what a stored URL is built from. Left at its
`.env.example` value — this API's own address — while S3 is configured, every
upload *succeeds* and every URL it returns 404s, with the wrong address written
into the database permanently. Re-uploading later does not repair rows already
saved.

Leave it blank with S3 and the bucket URL is used directly; set it to your CDN
hostname if one is in front. The API logs an ERROR at boot if S3 is configured
and this still points at localhost, and a WARN if S3 is *partially* configured
so uploads are quietly going to local disk instead.

## Payments: nothing to configure here

There are no platform-wide gateway keys. Each store connects its own account
from Admin → Payments, because on a white-label platform the settlement has to
reach the store's bank rather than the operator's. Both Razorpay and cash on
delivery are opt-in per store, so a shop can take cash only, cards only, or
both.

What the platform provides is `CREDENTIALS_ENCRYPTION_KEY`, which those stored
secrets are sealed with. Read the rotation note in
[`SECURITY.md`](SECURITY.md#credentials_encryption_key) before changing it:
rotating it makes every store's gateway credentials unreadable and every store
has to reconnect.

## Email via Gmail

```
SMTP_SERVICE=gmail
SMTP_USER=shop@yourdomain.com
SMTP_PASSWORD=<16-character App Password>
```

The App Password needs 2-Step Verification enabled on the account, then
<https://myaccount.google.com/apppasswords>. The account password will not work
— Google blocks it for SMTP.

Leave `SMTP_FROM` blank so it matches `SMTP_USER`: Gmail rewrites a From address
the account is not authorised to send as, so a different value is silently
replaced rather than rejected. The API warns at boot if the two disagree.

Gmail's free tier allows roughly 500 messages a day and Workspace 2,000. Above
that, use a transactional provider — the mailer is plain SMTP, so it is a
credential change, not a code change.

Boot fails with a readable message if a required variable is missing or a
secret is too short — checked by `src/config/env.validation.ts`. That is
deliberate: a missing payment secret should stop deployment, not surface at
checkout.

## Frontend

| Variable | Notes |
|---|---|
| `VITE_API_URL` | May contain `{host}`, replaced at runtime with the browser's hostname. e.g. `http://{host}:4000/api/v1` |
| `VITE_STORE_DOMAIN` | Apex domain, used only for link building |

There is no `VITE_TENANT_ID`, by design. One bundle serves every store and the
tenant comes from the hostname the browser used.

That last point is why `{host}` exists. The backend reads the tenant from the
`Host` header and refuses to take it from anywhere else, so a storefront request
must *arrive on the tenant's own hostname*. A fixed origin like
`http://localhost:4000/api/v1` sends every request to a platform admin host,
where no tenant resolves and the storefront gets a 404.

Pick the form that matches the deployment:

| Value | Use |
|---|---|
| `http://{host}:4000/api/v1` | Local development |
| `https://{host}/api/v1` | Tenant domains proxy `/api` to the backend |
| `/api/v1` | Frontend and API on the same origin |
| `https://api.platform.com/api/v1` | Admin console only — its tenant comes from the JWT, not the hostname |

## Rotating secrets

Rotating `JWT_SECRET` invalidates all access tokens; clients recover silently
via refresh. Rotating `JWT_REFRESH_SECRET` signs everyone out. Never commit
`.env` — only `.env.example`.
