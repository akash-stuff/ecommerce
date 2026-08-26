-- A banner's image becomes optional.
--
-- `banners` was designed around the homepage hero, where the image *is* the
-- banner, so `imageUrl` was NOT NULL. The announcement strip is the same
-- record with a different placement, and there the message is the content —
-- "Free delivery over ₹999" needs no artwork.
--
-- Dropping NOT NULL rather than adding a second table: placement, scheduling,
-- ordering and the tenant-scoped link sanitisation are identical, and two
-- tables would mean maintaining both.
--
-- Widening a column is backward compatible: every existing row already has a
-- value, and nothing reads the column expecting non-null except the hero
-- renderer, which now checks.

ALTER TABLE "banners" ALTER COLUMN "imageUrl" DROP NOT NULL;
