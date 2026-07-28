-- CreateTable
CREATE TABLE "ExercisePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'GLOBAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExercisePlan_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ExerciseTemplate" ADD COLUMN "planId" TEXT;
ALTER TABLE "ExerciseTemplate" ADD COLUMN "dayIndex" INTEGER;

-- AlterTable
ALTER TABLE "ExerciseRoutine" ADD COLUMN "exercisePlanId" TEXT;

-- CreateIndex
CREATE INDEX "ExerciseTemplate_planId_dayIndex_idx" ON "ExerciseTemplate"("planId", "dayIndex");

-- AddForeignKey
ALTER TABLE "ExercisePlan" ADD CONSTRAINT "ExercisePlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseTemplate" ADD CONSTRAINT "ExerciseTemplate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExercisePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRoutine" ADD CONSTRAINT "ExerciseRoutine_exercisePlanId_fkey" FOREIGN KEY ("exercisePlanId") REFERENCES "ExercisePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
