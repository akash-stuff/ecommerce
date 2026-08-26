-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "customerId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "refresh_tokens_customerId_revokedAt_idx" ON "refresh_tokens"("customerId", "revokedAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
