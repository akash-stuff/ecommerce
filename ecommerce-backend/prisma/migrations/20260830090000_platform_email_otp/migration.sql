-- A password reset for staff belongs to no single store.
--
-- Staff and platform administrators sign in on tenant-less admin hostnames, and
-- a `User` can staff several stores with one password — so the challenge behind
-- "I forgot my password" is about a person, not a shop. A super admin has no
-- tenant at all, which is why a sentinel row would not have worked either.
--
-- Customer challenges are unaffected and keep their tenant: a customer account
-- genuinely is per store.
ALTER TABLE "email_otps" ALTER COLUMN "tenantId" DROP NOT NULL;

-- The existing unique index is (tenantId, email, purpose), and Postgres treats
-- NULLs as distinct — so it stops enforcing anything once tenantId is null, and
-- one address could hold several live platform challenges at once. That would
-- make the attempt cap meaningless, because a resend would no longer invalidate
-- the previous code.
--
-- A partial index restores the guarantee for exactly those rows.
CREATE UNIQUE INDEX "email_otps_platform_email_purpose_key"
  ON "email_otps" ("email", "purpose")
  WHERE "tenantId" IS NULL;
