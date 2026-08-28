-- The platform's default brand colours: green primary, amber-orange secondary.
--
-- Hand-written, like every migration after 20260814120000: `prisma migrate dev`
-- cannot see the raw-SQL trigram indexes that migration creates and emits a
-- DROP INDEX for all five of them.
--
-- Defaults only. Existing themes keep whatever their store chose — a store that
-- has picked its own colours must not have them changed by a platform upgrade,
-- which is the whole point of white-labelling. Stores still on the old neutral
-- defaults are moved over separately and deliberately, not here.

ALTER TABLE "themes" ALTER COLUMN "primaryColor"   SET DEFAULT '#166534';
ALTER TABLE "themes" ALTER COLUMN "secondaryColor" SET DEFAULT '#F5A524';
ALTER TABLE "themes" ALTER COLUMN "accentColor"    SET DEFAULT '#166534';
