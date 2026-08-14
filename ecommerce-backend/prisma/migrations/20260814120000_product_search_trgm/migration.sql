-- Trigram indexes for product search.
--
-- The catalogue is searched with ILIKE '%term%' (see ProductsService.findAll).
-- A leading wildcard makes a b-tree index useless, so every search was a
-- sequential scan — fine for the seed data, linear for a real catalogue.
--
-- pg_trgm indexes the three-character sequences of a string, which lets GIN
-- serve a substring match. It also enables similarity ranking later without
-- another migration.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Product name and SKU are the two fields the search predicate touches.
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx"
  ON "products" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_sku_trgm_idx"
  ON "products" USING gin ("sku" gin_trgm_ops);

-- Category and customer search use the same pattern in their admin lists.
CREATE INDEX IF NOT EXISTS "categories_name_trgm_idx"
  ON "categories" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "customers_email_trgm_idx"
  ON "customers" USING gin ("email" gin_trgm_ops);

-- `tags` is a text[] searched with `has`, which GIN indexes natively — no
-- trigram operator class involved.
CREATE INDEX IF NOT EXISTS "products_tags_idx"
  ON "products" USING gin ("tags");
