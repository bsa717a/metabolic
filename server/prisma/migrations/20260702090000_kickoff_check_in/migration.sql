-- CreateEnum
CREATE TYPE "VirtualCoachCheckInKind" AS ENUM ('WEEKLY', 'KICKOFF');

-- AlterTable
ALTER TABLE "VirtualCoachCheckIn" ADD COLUMN "kind" "VirtualCoachCheckInKind" NOT NULL DEFAULT 'WEEKLY';

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN "motivation" TEXT;
