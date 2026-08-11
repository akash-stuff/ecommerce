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
| `SMTP_*` | for email | Host, port, user, password, from |
| `RAZORPAY_KEY_ID` / `KEY_SECRET` | for payments | |
| `RAZORPAY_WEBHOOK_SECRET` | for payments | Webhook signatures are verified with this |
| `S3_BUCKET` / `S3_REGION` / `AWS_*` | for uploads | |

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
