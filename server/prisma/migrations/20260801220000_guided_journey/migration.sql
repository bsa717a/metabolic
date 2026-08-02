-- AlterEnum
ALTER TYPE "SmsNudgeKind" ADD VALUE 'GUIDED_DISCOVERY_PROMPT';

-- CreateEnum
CREATE TYPE "GuidedJourneyEnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GuidedDiscoveryProgressStatus" AS ENUM ('INTRODUCED', 'EXPERIENCING', 'REFLECTION_UNLOCKED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "GuidedJourneyEventType" AS ENUM (
  'INVITATION_VIEWED',
  'JOURNEY_STARTED',
  'DISCOVERY_INTRODUCED',
  'EXPERIENCE_STARTED',
  'REMINDER_INTERACTED',
  'REFLECTION_UNLOCKED',
  'REFLECTION_SUBMITTED',
  'SKILL_EARNED',
  'DISCOVERY_ABANDONED',
  'JOURNEY_PAUSED',
  'JOURNEY_RESUMED'
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "guidedJourneyRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "GuidedJourneyEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GuidedJourneyEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "currentChapterId" TEXT,
    "currentDiscoveryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidedJourneyEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuidedDiscoveryProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discoveryId" TEXT NOT NULL,
    "status" "GuidedDiscoveryProgressStatus" NOT NULL DEFAULT 'INTRODUCED',
    "introducedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "experienceStartedAt" TIMESTAMP(3),
    "reflectionUnlockedAt" TIMESTAMP(3),
    "reflectedAt" TIMESTAMP(3),
    "reflectionText" TEXT,
    "coachResponse" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidedDiscoveryProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGuidedJourneySkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceDiscoveryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGuidedJourneySkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuidedWisdomStone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "discoveryId" TEXT NOT NULL,
    "reflectionText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuidedWisdomStone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuidedJourneyEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GuidedJourneyEventType" NOT NULL,
    "chapterId" TEXT,
    "discoveryId" TEXT,
    "skillId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuidedJourneyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuidedJourneyEnrollment_userId_key" ON "GuidedJourneyEnrollment"("userId");

-- CreateIndex
CREATE INDEX "GuidedDiscoveryProgress_userId_status_idx" ON "GuidedDiscoveryProgress"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GuidedDiscoveryProgress_userId_discoveryId_key" ON "GuidedDiscoveryProgress"("userId", "discoveryId");

-- CreateIndex
CREATE INDEX "UserGuidedJourneySkill_userId_idx" ON "UserGuidedJourneySkill"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGuidedJourneySkill_userId_skillId_key" ON "UserGuidedJourneySkill"("userId", "skillId");

-- CreateIndex
CREATE INDEX "GuidedWisdomStone_userId_chapterId_idx" ON "GuidedWisdomStone"("userId", "chapterId");

-- CreateIndex
CREATE INDEX "GuidedJourneyEvent_userId_type_createdAt_idx" ON "GuidedJourneyEvent"("userId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "GuidedJourneyEnrollment" ADD CONSTRAINT "GuidedJourneyEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidedDiscoveryProgress" ADD CONSTRAINT "GuidedDiscoveryProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGuidedJourneySkill" ADD CONSTRAINT "UserGuidedJourneySkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidedWisdomStone" ADD CONSTRAINT "GuidedWisdomStone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidedJourneyEvent" ADD CONSTRAINT "GuidedJourneyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
