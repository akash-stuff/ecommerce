-- The number the storefront's WhatsApp button opens a chat with.
--
-- Hand-written, like every migration after 20260814120000: `prisma migrate dev`
-- cannot see the raw-SQL trigram indexes that migration creates and emits a
-- DROP INDEX for all five of them.
--
-- Nullable with no default, and no backfill from `phone`. A shop's contact
-- number is often a landline or a switchboard, and copying it here would put a
-- WhatsApp button on every storefront pointing at a number that cannot receive
-- messages. The button stays hidden until a shopkeeper opts in by filling this.

ALTER TABLE "stores" ADD COLUMN "whatsappNumber" TEXT;
