-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('STARTER', 'SELF_GUIDED', 'PLUS', 'COACH_LED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('FREE', 'ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'COACH_MANAGED');

-- CreateEnum
CREATE TYPE "CoachRelationshipStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'RELEASED', 'ARCHIVED');

-- AlterTable User: plan and subscription fields
ALTER TABLE "User" ADD COLUMN "plan" "PlanTier" NOT NULL DEFAULT 'STARTER';
ALTER TABLE "User" ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'FREE';
ALTER TABLE "User" ADD COLUMN "subscriptionStartedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "subscriptionCurrentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "User" ADD COLUMN "gracePeriodEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "nextPlanAfterCoach" "PlanTier";

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

-- AlterTable CoachAssignment: lifecycle fields
ALTER TABLE "CoachAssignment" ADD COLUMN "status" "CoachRelationshipStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "CoachAssignment" ADD COLUMN "accessStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CoachAssignment" ADD COLUMN "accessEndsAt" TIMESTAMP(3);

-- Backfill existing coach assignments as ACTIVE
UPDATE "CoachAssignment" SET "status" = 'ACTIVE', "accessStartedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP);

-- Drop old unique constraint on userId (allows relationship history)
DROP INDEX IF EXISTS "CoachAssignment_userId_key";

-- Partial unique index: only one ACTIVE assignment per user
CREATE UNIQUE INDEX "CoachAssignment_userId_active_key"
  ON "CoachAssignment"("userId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "CoachAssignment_userId_idx" ON "CoachAssignment"("userId");
CREATE INDEX "CoachAssignment_coachId_status_idx" ON "CoachAssignment"("coachId", "status");
