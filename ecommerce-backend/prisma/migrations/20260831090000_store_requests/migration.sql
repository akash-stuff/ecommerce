-- Registration: somebody asking for a store, before there is one.
--
-- Hand-written rather than generated, because the database was not reachable
-- when the model landed. It is the exact DDL `prisma migrate dev` produces for
-- the `StoreRequest` model; `prisma migrate status` will confirm that.

-- CreateEnum
CREATE TYPE "StoreRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISCARDED');

-- CreateTable
CREATE TABLE "store_requests" (
    "id" TEXT NOT NULL,
    "status" "StoreRequestStatus" NOT NULL DEFAULT 'PENDING',
    "businessName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "businessCategory" TEXT,
    "message" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_requests_status_createdAt_idx" ON "store_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "store_requests_email_idx" ON "store_requests"("email");

-- AddForeignKey
ALTER TABLE "store_requests" ADD CONSTRAINT "store_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
