# White-Label Multi-Tenant E-Commerce Platform

Two independently deployable applications:

```
ecommerce-backend/    NestJS + PostgreSQL + Prisma + Redis   REST API on /api/v1
ecommerce-frontend/   React + TypeScript + Vite + Tailwind   storefront + admin
```

The frontend holds no business logic and talks to the backend only over REST.

> **Read [`docs/STATUS.md`](docs/STATUS.md) first.** This is a working Phase 1
> foundation, not the finished product. That file maps all 42 requirement
> sections to what is built, what is scaffolded, and what is not started.

---

## What works today

- Multi-tenant data model covering all 34 core entities, with tenant isolation
  enforced at the query layer
- Hostname-based tenant resolution (platform subdomains and custom domains)
- JWT auth with rotating refresh tokens, for both staff and storefront customers
- Granular RBAC across five roles
- Tenant provisioning: tenant + store + theme + domain + owner in one transaction
- Product CRUD as the reference tenant-scoped module
- Runtime white-label theming — one bundle, per-tenant branding
- Tenant isolation test suite

## Getting started

```bash
git clone <repo> && cd platform

cp ecommerce-backend/.env.example ecommerce-backend/.env
cp ecommerce-frontend/.env.example ecommerce-frontend/.env

# Generate real secrets — the app refuses to boot with short ones
openssl rand -base64 48   # -> JWT_SECRET
openssl rand -base64 48   # -> JWT_REFRESH_SECRET
```

### With Docker

```bash
docker compose up --build
docker compose exec backend npx prisma db seed
```

### Without Docker

```bash
# Terminal 1
cd ecommerce-backend
npm install
npx prisma migrate dev --name init
npm run seed
npm run start:dev          # http://localhost:4000/api/docs

# Terminal 2
cd ecommerce-frontend
npm install
npm run dev                # http://localhost:5173
```

### Local subdomains

Tenant resolution reads the hostname, so `localhost` alone won't reach a store.
`*.localhost` resolves automatically on most systems; otherwise add to
`/etc/hosts`:

```
127.0.0.1  platform.localhost northwind.platform.localhost voltway.platform.localhost admin.platform.localhost
```

Then open:

| URL | What you get |
|---|---|
| `http://northwind.platform.localhost:5173` | Fashion store, black brand, Playfair display face |
| `http://voltway.platform.localhost:5173` | Electronics store, blue brand, Inter throughout |
| `http://admin.platform.localhost:5173/login` | Admin console |

Same bundle, same database, same API. Only the hostname differs.

## Demo credentials (development only)

| Role | Email | Password |
|---|---|---|
| Super admin | `admin@platform.localhost` | `SuperAdmin123!` |
| Northwind owner | `owner@northwind.localhost` | `OwnerPass123!` |
| Voltway owner | `owner@voltway.localhost` | `OwnerPass123!` |
| Customer (exists separately in each store) | `shopper@example.com` | `Shopper123!` |

The seed script refuses to run when `NODE_ENV=production`.

## Tests

```bash
cd ecommerce-backend
npm test              # unit + the tenant-scope registry guard
npm run test:e2e      # tenant isolation suite (needs a live database)
```

The isolation suite provisions two tenants with deliberately colliding data —
same product slug, same SKU, same customer email — then attacks each access
path from the wrong side. It is the suite to run before any release.

## Documentation

| File | Contents |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | Requirement-by-requirement build status |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design and request lifecycle |
| [`docs/MULTI_TENANCY.md`](docs/MULTI_TENANCY.md) | How isolation is enforced, and how to extend it |
| [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) | Every environment variable |

API reference is generated: `http://localhost:4000/api/docs`.
