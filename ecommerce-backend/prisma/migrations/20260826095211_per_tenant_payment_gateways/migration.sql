-- Per-tenant payment gateway credentials.
--
-- On a white-label platform the merchant account belongs to the store, so its
-- gateway credentials cannot live in the platform environment — settlements
-- would all reach one bank account. `secrets` holds AES-256-GCM envelopes, never
-- plaintext; the key lives in the application environment, so a dump of this
-- table on its own yields nothing usable.

-- CreateTable
CREATE TABLE "payment_gateways" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publicKey" TEXT,
    "secrets" JSONB NOT NULL DEFAULT '{}',
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateways_pkey" PRIMARY KEY ("id")
);

-- One connection per provider per store.
-- CreateIndex
CREATE UNIQUE INDEX "payment_gateways_tenantId_provider_key" ON "payment_gateways"("tenantId", "provider");

-- AddForeignKey
ALTER TABLE "payment_gateways" ADD CONSTRAINT "payment_gateways_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The trigram indexes from 20260814120000_product_search_trgm, restated.
--
-- `prisma migrate dev` generated DROP INDEX statements for all five of these.
-- They are created by raw SQL and cannot be expressed in schema.prisma, so
-- Prisma sees them as drift and "corrects" it — which would turn every admin
-- product, category and customer search back into a sequential scan, with
-- nothing failing to make that visible.
--
-- `IF NOT EXISTS` so this is a no-op on a database that still has them, and a
-- repair on one where an earlier run of this migration dropped them.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "products_name_trgm_idx"
  ON "products" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_sku_trgm_idx"
  ON "products" USING gin ("sku" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "categories_name_trgm_idx"
  ON "categories" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_email_trgm_idx"
  ON "customers" USING gin ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_tags_idx"
  ON "products" USING gin ("tags");
