-- Branding for the shopper sign-in page.
--
-- Both optional. The sign-in form centres itself when there is no artwork, so a
-- store that never opens this setting gets a clean page rather than an empty
-- panel where a picture was supposed to be.
--
-- `loginMessage` is stored and rendered as plain text. A store owner typing a
-- greeting must not be able to put markup on a page every shopper sees.
--
-- Hand-written like the previous three: `prisma migrate dev` cannot see the
-- trigram indexes from 20260814120000 and emits DROP INDEX for all five.

ALTER TABLE "themes" ADD COLUMN "loginImageUrl" TEXT;
ALTER TABLE "themes" ADD COLUMN "loginMessage" TEXT;
