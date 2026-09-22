-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('MANUAL', 'APPLE', 'STRIPE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "subscriptionSource" "SubscriptionSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "User" ADD COLUMN "appleOriginalTransactionId" TEXT;
ALTER TABLE "User" ADD COLUMN "appleAppAccountToken" TEXT;
ALTER TABLE "User" ADD COLUMN "appleProductId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_appleOriginalTransactionId_key" ON "User"("appleOriginalTransactionId");
CREATE UNIQUE INDEX "User_appleAppAccountToken_key" ON "User"("appleAppAccountToken");

-- CreateTable
CREATE TABLE "AppleProcessedTransaction" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "notificationType" TEXT,
    "expiresDate" TIMESTAMP(3),
    "revocationDate" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleProcessedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppleProcessedTransaction_transactionId_key" ON "AppleProcessedTransaction"("transactionId");
CREATE INDEX "AppleProcessedTransaction_originalTransactionId_idx" ON "AppleProcessedTransaction"("originalTransactionId");
CREATE INDEX "AppleProcessedTransaction_userId_idx" ON "AppleProcessedTransaction"("userId");

-- AddForeignKey
ALTER TABLE "AppleProcessedTransaction" ADD CONSTRAINT "AppleProcessedTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
