-- CreateEnum
CREATE TYPE "ProgramMode" AS ENUM ('COACHED', 'SELF_DIRECTED');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "mode" "ProgramMode" NOT NULL DEFAULT 'COACHED';

-- CreateTable
CREATE TABLE "PlanPeriod" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "weekNumber" INTEGER,
    "nutritionTemplateId" TEXT,
    "exerciseTemplateId" TEXT,
    "coachSessionId" TEXT,
    "sourceSnapshotId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPeriod_coachSessionId_key" ON "PlanPeriod"("coachSessionId");

-- CreateIndex
CREATE INDEX "PlanPeriod_programId_effectiveDate_idx" ON "PlanPeriod"("programId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPeriod_programId_effectiveDate_key" ON "PlanPeriod"("programId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "PlanPeriod" ADD CONSTRAINT "PlanPeriod_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPeriod" ADD CONSTRAINT "PlanPeriod_nutritionTemplateId_fkey" FOREIGN KEY ("nutritionTemplateId") REFERENCES "NutritionPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPeriod" ADD CONSTRAINT "PlanPeriod_exerciseTemplateId_fkey" FOREIGN KEY ("exerciseTemplateId") REFERENCES "ExerciseTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPeriod" ADD CONSTRAINT "PlanPeriod_coachSessionId_fkey" FOREIGN KEY ("coachSessionId") REFERENCES "CoachSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPeriod" ADD CONSTRAINT "PlanPeriod_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "ProgramMetricSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPeriod" ADD CONSTRAINT "PlanPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

