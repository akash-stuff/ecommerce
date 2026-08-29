-- Four related additions, all of them nullable or defaulted so an existing
-- store renders exactly as it did before anyone opens the new forms.
--
-- Hand-written, like every migration since 20260814120000: `prisma migrate dev`
-- cannot see the trigram indexes from that migration and emits DROP INDEX for
-- all five when it generates one itself.

-- 1. Announcement-bar styling, per banner rather than per store: a Diwali strip
--    and a delivery notice are two different announcements and rarely want the
--    same colour. NULL means "brand colour, white text, body font" — what every
--    strip looked like before.
ALTER TABLE "banners" ADD COLUMN "backgroundColor" TEXT;
ALTER TABLE "banners" ADD COLUMN "textColor" TEXT;
ALTER TABLE "banners" ADD COLUMN "fontFamily" TEXT;
ALTER TABLE "banners" ADD COLUMN "fontSize" TEXT;

-- 2. A CMS page was text and nothing else. `backgroundImageUrl` sits behind the
--    heading; `images` is a gallery under the content, as [{ url, caption? }].
ALTER TABLE "pages" ADD COLUMN "backgroundImageUrl" TEXT;
ALTER TABLE "pages" ADD COLUMN "images" JSONB NOT NULL DEFAULT '[]';

-- 3. Invoicing details. Every field falls back to the store's own trading
--    details when blank, so an invoice is downloadable before this form is ever
--    opened. `invoicePrefix` is defaulted rather than nullable because an
--    invoice number is always built from it.
ALTER TABLE "stores" ADD COLUMN "invoiceBusinessName" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoiceGstin" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoicePan" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoiceAddressLine1" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoiceAddressLine2" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoiceCity" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoiceState" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoicePostalCode" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoiceEmail" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoicePhone" TEXT;
ALTER TABLE "stores" ADD COLUMN "invoicePrefix" TEXT NOT NULL DEFAULT 'INV-';
ALTER TABLE "stores" ADD COLUMN "invoiceNotes" TEXT;

-- 4. One description the shopkeeper writes once and every product page shows
--    below the product's own. Plain text, rendered as words.
ALTER TABLE "stores" ADD COLUMN "productDescription" TEXT;
