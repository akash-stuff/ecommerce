-- Least-privilege database roles.
--
-- Run this ONCE, as a superuser, against the production database — it is not a
-- Prisma migration on purpose. Migrations run on every deploy as the migration
-- user; a CREATE ROLE there would either fail for lack of privilege or quietly
-- re-run against a role that already exists.
--
--   psql "$DATABASE_URL" -f deploy/postgres-roles.sql
--
-- Then point the two jobs at different roles:
--
--   migrate service  ->  ecommerce_migrate   (owns the schema, runs DDL)
--   backend service  ->  ecommerce_app       (DML only, no DDL)
--
-- Why it matters: the API currently connects as the schema owner, which means a
-- SQL injection or a bug in a raw query could DROP a table, not merely read one.
-- It is also the prerequisite for row-level security — see the note at the end.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecommerce_migrate') THEN
    CREATE ROLE ecommerce_migrate LOGIN PASSWORD 'CHANGE_ME_MIGRATE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecommerce_app') THEN
    CREATE ROLE ecommerce_app LOGIN PASSWORD 'CHANGE_ME_APP';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- The migration role owns the schema
-- ---------------------------------------------------------------------------

GRANT ALL ON SCHEMA public TO ecommerce_migrate;
ALTER SCHEMA public OWNER TO ecommerce_migrate;

-- ---------------------------------------------------------------------------
-- The application role reads and writes rows, and nothing else
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO ecommerce_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO ecommerce_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ecommerce_app;

-- Tables created by future migrations get the same grants automatically;
-- without this every migration that adds a table breaks the app until someone
-- remembers to grant on it.
ALTER DEFAULT PRIVILEGES FOR ROLE ecommerce_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ecommerce_app;

ALTER DEFAULT PRIVILEGES FOR ROLE ecommerce_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ecommerce_app;

-- Explicitly denied: the app must never create or drop schema objects.
REVOKE CREATE ON SCHEMA public FROM ecommerce_app;

-- ---------------------------------------------------------------------------
-- Row-level security: NOT enabled, and why
-- ---------------------------------------------------------------------------
--
-- With the roles above in place, RLS becomes possible — `ecommerce_app` is no
-- longer the table owner, so policies would actually bind to it. It is still
-- not enabled here, for one reason that has to be solved first:
--
-- A policy needs the current tenant in the session, e.g.
--
--   CREATE POLICY tenant_isolation ON products
--     USING (tenant_id = current_setting('app.current_tenant')::uuid);
--
-- which means every checkout must run `SET LOCAL app.current_tenant = '...'`
-- on the same connection as its queries. Prisma pools connections and hands
-- them out per query, so a session variable set for one request can be read by
-- the next unless every transaction sets it — a subtle failure whose symptom is
-- one tenant seeing another's data. That is the exact bug RLS is supposed to
-- prevent.
--
-- Turning it on is worth doing, but as its own piece of work with a transaction
-- wrapper that sets the variable, and tests that prove the pool cannot leak it.
-- Enabling it without that would look like defence in depth and provide none.
--
-- See docs/MULTI_TENANCY.md and docs/DATABASE.md.
