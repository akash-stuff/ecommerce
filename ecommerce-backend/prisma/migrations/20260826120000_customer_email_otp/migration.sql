-- Emailed one-time codes for customer registration.
--
-- Hand-written rather than generated. `prisma migrate dev` cannot see the
-- trigram indexes from 20260814120000 (they are raw SQL, not expressible in
-- schema.prisma), reads them as drift, and emits DROP INDEX for all five —
-- silently turning every admin search back into a sequential scan. Writing the
-- table by hand keeps this migration to the one change it is for.

-- CreateTable
CREATE TABLE "email_otps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "pending" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

-- One live challenge per address per purpose per store, so a resend replaces
-- the previous code instead of leaving several valid at once.
-- CreateIndex
CREATE UNIQUE INDEX "email_otps_tenantId_email_purpose_key" ON "email_otps"("tenantId", "email", "purpose");

-- For sweeping expired rows.
-- CreateIndex
CREATE INDEX "email_otps_expiresAt_idx" ON "email_otps"("expiresAt");

-- AddForeignKey
ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
