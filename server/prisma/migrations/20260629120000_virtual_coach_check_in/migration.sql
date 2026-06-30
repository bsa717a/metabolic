-- CreateEnum
CREATE TYPE "VirtualCoachCheckInStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "virtualCoachCheckInDay" INTEGER;

-- CreateTable
CREATE TABLE "VirtualCoachCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" "VirtualCoachCheckInStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "transcript" JSONB NOT NULL,
    "feelingNote" TEXT,
    "win" TEXT,
    "pattern" TEXT,
    "focus" TEXT,
    "supportAction" TEXT,
    "nextCheckInDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VirtualCoachCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VirtualCoachCheckIn_userId_weekStart_idx" ON "VirtualCoachCheckIn"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "VirtualCoachCheckIn" ADD CONSTRAINT "VirtualCoachCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
