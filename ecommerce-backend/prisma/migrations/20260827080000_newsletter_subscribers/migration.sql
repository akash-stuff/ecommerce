-- Newsletter signups from the storefront panel.
--
-- Hand-written, like every migration after 20260814120000: `prisma migrate dev`
-- cannot see the raw-SQL trigram indexes that migration creates and emits a
-- DROP INDEX for all five of them.

CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'storefront',
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- What makes a repeat signup an upsert instead of a duplicate row.
CREATE UNIQUE INDEX "newsletter_subscribers_tenantId_email_key"
    ON "newsletter_subscribers"("tenantId", "email");

-- The admin list is ordered by newest first within one store.
CREATE INDEX "newsletter_subscribers_tenantId_createdAt_idx"
    ON "newsletter_subscribers"("tenantId", "createdAt");

ALTER TABLE "newsletter_subscribers"
    ADD CONSTRAINT "newsletter_subscribers_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
