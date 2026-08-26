-- Page background and header logo size, per store.
--
-- `background` stores a *name* from theme/backgrounds.ts, never CSS: the
-- storefront decides what each preset renders as and draws it from the store's
-- own brand colours, so two stores picking "aurora" look like themselves rather
-- than like each other. Storing CSS here would put arbitrary declarations on
-- every page, which is the thing css-sanitiser exists to prevent for the one
-- field that does allow it.
--
-- `logoSize` exists because one fixed header height cannot suit both a square
-- mark and a long wordmark — one of them always looks wrong.
--
-- Hand-written, like the previous two: `prisma migrate dev` cannot see the
-- trigram indexes from 20260814120000 and emits DROP INDEX for all five.

ALTER TABLE "themes" ADD COLUMN "logoSize" TEXT NOT NULL DEFAULT 'md';
ALTER TABLE "themes" ADD COLUMN "background" TEXT NOT NULL DEFAULT 'plain';
ALTER TABLE "themes" ADD COLUMN "backgroundImageUrl" TEXT;
ALTER TABLE "themes" ADD COLUMN "backgroundFit" TEXT NOT NULL DEFAULT 'cover';
