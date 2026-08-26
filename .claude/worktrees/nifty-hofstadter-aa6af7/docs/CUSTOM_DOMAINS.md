# Custom domains and SSL

Two separate problems that are easy to confuse:

- **`acme.mystore.com`** — a subdomain of your platform. You control the DNS, so
  one wildcard record and one wildcard certificate cover every store forever.
  Nothing to do per tenant.
- **`shop.acme.com`** — a domain the *tenant* owns. You cannot know it in
  advance, cannot create its DNS records, and need a certificate per hostname.

This document is about the second one.

---

## How it works

```
Tenant adds shop.acme.com in their admin
        │
        ▼
API stores it PENDING with a random verification token
        │
        ▼
Tenant creates two DNS records at their own registrar
        │   TXT   _store-verify.shop.acme.com  = <token>     (proves ownership)
        │   CNAME shop.acme.com                → ingress.mystore.com
        ▼
Tenant clicks Verify → API resolves the TXT record
        │
        ▼
Domain becomes ACTIVE. The tenant resolver starts answering for it.
        │
        ▼
First HTTPS request arrives. Caddy has no certificate, so it asks
GET /api/v1/tls/check?domain=shop.acme.com  →  200 = go ahead
        │
        ▼
Caddy obtains a certificate from Let's Encrypt and serves the store.
```

Everything after the tenant's DNS change is automatic. There is no step where
you generate or install a certificate by hand.

---

## Why the TXT record exists

Without proof of ownership, anyone could type `shop.acme.com` into their own
store's settings. They could not steal traffic — DNS still points wherever the
real owner says — but the row would be claimed, and the real owner would be told
the domain was already taken.

The TXT record proves control of the domain. Only then does the hostname become
resolvable, which is why `verify` is a separate step from `add`.

---

## Why `/tls/check` exists

Caddy's on-demand TLS will request a certificate for **any** hostname that
arrives, unless told otherwise. Left open, that is two problems:

1. Anyone could point DNS at your server and make it request certificates on
   their behalf, burning your Let's Encrypt rate limit (50 certificates per
   registered domain per week — easy to exhaust deliberately).
2. Your server would serve, and log, hostnames it knows nothing about.

The `ask` endpoint answers "is this a real, active store?" and Caddy refuses
anything else. It is unauthenticated because the proxy has no credentials, and
it leaks only whether a hostname is a live store — already public information.

The endpoint returns 200 for: platform admin hosts, the apex domain, any
subdomain resolving to an active tenant, and any `ACTIVE` custom domain whose
tenant is `ACTIVE`. Everything else gets 404.

---

## What to tell a tenant

Give them exactly this, with their own values substituted:

> **To use your own domain:**
>
> 1. Add these two records at your DNS provider:
>
>    | Type | Name | Value |
>    |---|---|---|
>    | TXT | `_store-verify.shop.acme.com` | `<token from your admin>` |
>    | CNAME | `shop.acme.com` | `ingress.mystore.com` |
>
> 2. Wait a few minutes, then click **Verify** in your store settings.
> 3. Your store will be live on HTTPS within a minute of verifying.
>
> **Using a bare domain** like `acme.com` rather than `shop.acme.com`? A bare
> domain cannot hold a CNAME. Use an A record pointing to `203.0.113.10`
> instead. Some providers offer "CNAME flattening" or "ALIAS" records, which
> also work.

The admin shows the correct record type automatically — the API returns `A` for
an apex domain and `CNAME` otherwise.

---

## Set the ingress target

Two environment variables control what tenants are told to point at:

```bash
PLATFORM_INGRESS_TARGET=ingress.mystore.com   # for CNAME records
PLATFORM_INGRESS_IP=203.0.113.10              # for apex A records
```

Create the `ingress` record yourself so the CNAME has something to resolve to:

| Type | Name | Value |
|---|---|---|
| A | `ingress` | `203.0.113.10` |

**Use the CNAME, not the bare IP, wherever possible.** If you ever change
servers, you update one A record and every tenant's CNAME follows. Tenants who
pointed an A record at the old IP would each need to change it themselves.

---

## Verifying by hand

If a tenant says verification is not working, check what DNS actually returns:

```bash
# Is the TXT record there and does it match?
dig +short TXT _store-verify.shop.acme.com

# Does the hostname point at us?
dig +short shop.acme.com
```

Common causes, in the order you will hit them:

| Symptom | Cause |
|---|---|
| `dig TXT` returns nothing | Not propagated yet, or created at the wrong name |
| TXT returns a different value | Domain removed and re-added — the token changed. Show them the current one. |
| TXT is right, verify still fails | Some providers append the zone: check for `_store-verify.shop.acme.com.acme.com` |
| Verified but HTTPS fails | The CNAME is missing or still pointing elsewhere |
| `ERR_CERT_COMMON_NAME_INVALID` | Caddy has not issued yet; check its logs |

The `verify` response tells you which half is wrong: `verified` reports the TXT
record, `pointsHere` reports whether DNS resolves to your ingress IP. A domain
verifies on the TXT record alone, because DNS propagates at its own pace and
refusing to verify until the CNAME caught up would strand the tenant.

---

## Watching certificates

```bash
# What Caddy has issued
docker compose -f docker-compose.prod.yml exec caddy \
  ls /data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/

# Certificate errors
docker compose -f docker-compose.prod.yml logs caddy | grep -i "obtain\|error"

# What the ask endpoint says about a hostname
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://admin.mystore.com/api/v1/tls/check?domain=shop.acme.com"
```

`/data` is a Docker volume — back it up. Restoring it avoids re-issuing every
certificate at once and hitting the rate limit.

---

## Rate limits worth knowing

Let's Encrypt allows **50 certificates per registered domain per week** and
**5 duplicate certificates per week**. On-demand TLS with the ask endpoint keeps
you well clear of this in normal use, but:

- Onboarding more than 50 custom domains in one week will hit it. Stagger them.
- The wildcard `*.mystore.com` counts as one certificate, however many tenants
  are behind it — this is why platform subdomains cost nothing.
- Testing repeatedly against the production ACME endpoint burns quota. Use
  Let's Encrypt's staging directory while testing by adding to the Caddyfile's
  global block:

  ```
  acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
  ```

  Staging certificates are untrusted by browsers, which is the point — you are
  testing issuance, not browsing. Remove it before launch.

---

## When a tenant leaves

Removing the domain in the admin drops the row and clears the resolver cache, so
the hostname stops being served immediately. Caddy's certificate stays on disk
until it expires, which is harmless — it has nothing to serve.

The platform subdomain cannot be removed. It is the fallback address, and a
store whose only hostname was deleted would be unreachable.
