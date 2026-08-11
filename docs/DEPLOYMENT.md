# Deployment

Step-by-step, in the order things must happen. Each step says what "working"
looks like, so you can stop and fix rather than discover it three steps later.

Assumes one Linux server with Docker. That is enough for the first few hundred
stores; see [Scaling past one server](#scaling-past-one-server) at the end.

---

## What you need before starting

| Thing | Why | Where |
|---|---|---|
| A domain, e.g. `mystore.com` | Tenant subdomains live at `*.mystore.com` | Any registrar |
| DNS hosted somewhere with an API | Wildcard certificates need a DNS-01 challenge | Cloudflare (free) is easiest |
| A server, 4 GB RAM minimum | Runs everything | Hetzner, DigitalOcean, EC2 |
| SMTP credentials | Order confirmations | Resend, Postmark, SES |
| Razorpay account | Taking payments | See [RAZORPAY.md](./RAZORPAY.md) |

Throughout, replace `mystore.com` with your own domain and `203.0.113.10` with
your server's public IP.

---

## 1. Prepare the server

```bash
ssh root@203.0.113.10
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

Confirm it works — this must print a version, not an error:

```bash
docker compose version
```

Open only the two ports that should be open:

```bash
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

> Postgres and Redis are deliberately **not** in that list. They publish no
> ports in `docker-compose.prod.yml` and are reachable only from inside the
> Docker network. If you ever find yourself opening 5432, stop and ask why.

---

## 2. Point DNS at the server

At your DNS provider, create these records:

| Type | Name | Value | Purpose |
|---|---|---|---|
| A | `@` | `203.0.113.10` | The marketing/apex address |
| A | `*` | `203.0.113.10` | Every tenant subdomain at once |
| A | `admin` | `203.0.113.10` | The admin console |

The wildcard is what makes `acme.mystore.com` work without touching DNS each
time a store signs up.

**Check it before continuing.** This must return your server's IP:

```bash
dig +short anything.mystore.com
```

If it returns nothing, wait — DNS can take up to an hour — and try again. Every
later step depends on this being right.

---

## 3. Get a DNS API token

Wildcard certificates cannot be issued over HTTP; the certificate authority
insists on a DNS record instead. Caddy creates that record for you, which means
it needs API access to your DNS.

**Cloudflare:** My Profile → API Tokens → Create Token → *Edit zone DNS* →
restrict it to `mystore.com`. Copy the token.

Other providers work too; you will need the matching Caddy DNS plugin name for
`DNS_PROVIDER` (`cloudflare`, `route53`, `digitalocean`, …).

---

## 4. Get the code onto the server

```bash
git clone <your-repo-url> /opt/ecommerce
cd /opt/ecommerce
```

---

## 5. Write the production environment file

Generate three secrets. Do not reuse them, do not use the development ones, and
do not commit this file:

```bash
openssl rand -base64 48
```

Run that three times. Then create `/opt/ecommerce/.env.production`:

```bash
# --- Identity -----------------------------------------------------------
PLATFORM_DOMAIN=mystore.com
PLATFORM_ADMIN_HOSTS=admin.mystore.com,mystore.com
PLATFORM_INGRESS_TARGET=ingress.mystore.com
PLATFORM_INGRESS_IP=203.0.113.10

# --- Database -----------------------------------------------------------
POSTGRES_USER=ecommerce
POSTGRES_PASSWORD=<a long random password>
POSTGRES_DB=ecommerce
DATABASE_URL=postgresql://ecommerce:<same password>@postgres:5432/ecommerce?schema=public
REDIS_URL=redis://redis:6379

# --- Secrets (the three you just generated) -----------------------------
JWT_ACCESS_SECRET=<first>
JWT_REFRESH_SECRET=<second>

# --- TLS ----------------------------------------------------------------
ACME_EMAIL=you@mystore.com
DNS_PROVIDER=cloudflare
DNS_API_TOKEN=<the token from step 3>

# --- Email --------------------------------------------------------------
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=<your SMTP password>
SMTP_FROM="My Store <no-reply@mystore.com>"

# --- Payments (see RAZORPAY.md; safe to leave blank at first) -----------
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Lock it down:

```bash
chmod 600 .env.production
```

> **`PLATFORM_ADMIN_HOSTS` matters.** Hostnames listed there resolve to *no*
> tenant, and the signed-in user's token decides which store they are managing.
> Get it wrong and the admin console will try to resolve itself as a storefront
> and serve a 404.

---

## 6. Add the DNS plugin to Caddy

The base Caddy image cannot talk to your DNS provider. Build one that can:

```bash
cat > deploy/Dockerfile.caddy <<'EOF'
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
EOF
```

Point the compose file at it:

```bash
sed -i 's|image: caddy:2-alpine|build:\n      context: .\n      dockerfile: deploy/Dockerfile.caddy|' docker-compose.prod.yml
```

Swap `caddy-dns/cloudflare` for your provider's plugin if you are not using
Cloudflare.

---

## 7. Start it

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The `migrate` service runs first and creates the database schema; the API waits
for it to finish. First boot takes a few minutes because it builds images and
requests certificates.

Watch it come up:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

**What working looks like:**

```bash
# The API is alive
curl https://admin.mystore.com/api/v1/health
# {"success":true,"data":{"status":"ok",...}}

# TLS is real, not self-signed
curl -sI https://admin.mystore.com | head -1
# HTTP/2 200
```

If certificates fail, it is almost always the DNS token. Check with:

```bash
docker compose -f docker-compose.prod.yml logs caddy | grep -i "error\|challenge"
```

---

## 8. Create the first data

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma db seed
```

This creates the plans, the eight templates, a super admin and two demo stores.

**Change the super admin password immediately** — the seeded one is published in
this repository. Sign in at `https://admin.mystore.com` with
`admin@platform.localhost` / `SuperAdmin123!` and change it.

> For a real launch, delete the two demo tenants (Northwind and Voltway) from
> the platform admin once you have confirmed everything works.

---

## 9. Confirm a store actually works

Create a tenant through the platform admin, then check the storefront answers
on its own subdomain:

```bash
curl https://acme.mystore.com/api/v1/store
```

You should get that store's name, colours and fonts. A 404 with
`TENANT_NOT_RESOLVED` means the wildcard DNS record is missing or the tenant is
not `ACTIVE`.

Then open `https://acme.mystore.com` in a browser and place a test order.

---

## Backups

The database is the only thing that cannot be rebuilt. Caddy's certificates can
be reissued, but backing them up avoids hitting rate limits on a restore.

```bash
cat > /opt/ecommerce/backup.sh <<'EOF'
#!/bin/bash
set -euo pipefail
cd /opt/ecommerce
STAMP=$(date +%F-%H%M)
mkdir -p /var/backups/ecommerce

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U ecommerce ecommerce | gzip > /var/backups/ecommerce/db-$STAMP.sql.gz

# Keep 14 days
find /var/backups/ecommerce -name 'db-*.sql.gz' -mtime +14 -delete
EOF

chmod +x /opt/ecommerce/backup.sh
```

Run it nightly:

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/ecommerce/backup.sh") | crontab -
```

**Test the restore before you need it.** A backup you have never restored is a
hope, not a backup:

```bash
gunzip -c /var/backups/ecommerce/db-<stamp>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U ecommerce -d ecommerce_restore_test
```

Copy the dumps off the server too — a backup on the machine that dies is no
backup at all.

---

## Deploying a change

```bash
cd /opt/ecommerce
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations run automatically before the new API starts. There is a brief gap
while containers restart; for zero-downtime you would run two API replicas
behind Caddy and restart them one at a time.

**Roll back** by checking out the previous commit and running the same command.
Note that a rolled-back deploy does *not* undo a database migration — if a
release includes a destructive migration, restore from backup instead.

---

## Routine checks

```bash
# Is anything unhealthy?
docker compose -f docker-compose.prod.yml ps

# Errors in the last hour
docker compose -f docker-compose.prod.yml logs --since 1h backend | grep -i error

# Disk — Postgres and logs are what fill a server
df -h
```

Set up uptime monitoring against `https://admin.mystore.com/api/v1/health` with
any external service. It returns 200 only when the database and Redis are both
reachable.

---

## Scaling past one server

In rough order of when each starts to hurt:

1. **Managed Postgres** — moving the database off the box gets you automated
   backups, point-in-time recovery and failover. Do this first.
2. **Object storage** for product images. Images are currently URLs typed into
   the admin; wiring up S3 replaces that.
3. **Multiple API replicas** — the API is stateless, so `deploy: replicas: 3`
   and Caddy load-balances. Sessions live in Postgres and Redis, not in memory.
4. **Postgres read replicas** and a CDN in front of Caddy.

The one thing that does not scale by adding servers is a slow query on a large
tenant's catalogue. Check `docs/DATABASE.md` for the indexes that exist before
assuming you need more hardware.
