-- AlterEnum
ALTER TYPE "SubscriptionSource" ADD VALUE 'GOOGLE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "googlePurchaseToken" TEXT;
ALTER TABLE "User" ADD COLUMN "googleObfuscatedAccountId" TEXT;
ALTER TABLE "User" ADD COLUMN "googleProductId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googlePurchaseToken_key" ON "User"("googlePurchaseToken");
CREATE UNIQUE INDEX "User_googleObfuscatedAccountId_key" ON "User"("googleObfuscatedAccountId");

-- CreateTable
CREATE TABLE "GoogleProcessedPurchase" (
    "id" TEXT NOT NULL,
    "purchaseToken" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "notificationType" TEXT,
    "expiryTime" TIMESTAMP(3),
    "acknowledgementState" TEXT,
    "environment" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleProcessedPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleProcessedPurchase_purchaseToken_key" ON "GoogleProcessedPurchase"("purchaseToken");
CREATE INDEX "GoogleProcessedPurchase_userId_idx" ON "GoogleProcessedPurchase"("userId");

-- AddForeignKey
ALTER TABLE "GoogleProcessedPurchase" ADD CONSTRAINT "GoogleProcessedPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
