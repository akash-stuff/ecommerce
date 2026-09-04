-- The homepage delivery-and-payment strip, authored by the shopkeeper.
--
-- Defaults to an empty array rather than being backfilled from the shipping
-- tables on purpose: empty means "not written", and the storefront reads that
-- as permission to derive the strip from shipping methods instead. Backfilling
-- would freeze today's shipping settings into a copy that then stops tracking
-- them, and every store would silently acquire authored text nobody authored.
ALTER TABLE "themes" ADD COLUMN "promises" JSONB NOT NULL DEFAULT '[]';
