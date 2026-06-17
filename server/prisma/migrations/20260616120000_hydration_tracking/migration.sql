-- CreateEnum
CREATE TYPE "HydrationSource" AS ENUM ('MANUAL', 'AI', 'SMS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "waterGoalOz" INTEGER NOT NULL DEFAULT 64;

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN "waterTargetOz" INTEGER NOT NULL DEFAULT 64;
ALTER TABLE "DailyLog" ADD COLUMN "waterActualOz" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DailyLog" ADD COLUMN "waterGoalMet" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HydrationEntry" (
    "id" TEXT NOT NULL,
    "dailyLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountOz" INTEGER NOT NULL,
    "source" "HydrationSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HydrationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HydrationEntry_dailyLogId_idx" ON "HydrationEntry"("dailyLogId");

-- CreateIndex
CREATE INDEX "HydrationEntry_userId_createdAt_idx" ON "HydrationEntry"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "HydrationEntry" ADD CONSTRAINT "HydrationEntry_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HydrationEntry" ADD CONSTRAINT "HydrationEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
