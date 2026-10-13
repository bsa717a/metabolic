-- AlterTable
ALTER TABLE "User" ADD COLUMN "aiConsentAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "aiConsentDecidedAt" TIMESTAMP(3);
