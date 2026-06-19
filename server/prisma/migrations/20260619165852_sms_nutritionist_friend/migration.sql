-- CreateEnum
CREATE TYPE "SmsNudgeKind" AS ENUM ('MEAL_REMINDER', 'EVENING_RECAP');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "smsOptedOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "SmsNudgeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SmsNudgeKind" NOT NULL,
    "date" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsNudgeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsNudgeLog_userId_date_idx" ON "SmsNudgeLog"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SmsNudgeLog_userId_kind_date_refId_key" ON "SmsNudgeLog"("userId", "kind", "date", "refId");

-- AddForeignKey
ALTER TABLE "SmsNudgeLog" ADD CONSTRAINT "SmsNudgeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
