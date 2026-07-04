-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN "exercisesInitializedAt" TIMESTAMP(3),
ADD COLUMN "exercisesManuallyEdited" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ExerciseRoutine" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseRoutineDay" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseRoutineDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseRoutine_programId_key" ON "ExerciseRoutine"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseRoutineDay_routineId_weekday_key" ON "ExerciseRoutineDay"("routineId", "weekday");

-- AddForeignKey
ALTER TABLE "ExerciseRoutine" ADD CONSTRAINT "ExerciseRoutine_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRoutine" ADD CONSTRAINT "ExerciseRoutine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRoutineDay" ADD CONSTRAINT "ExerciseRoutineDay_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "ExerciseRoutine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRoutineDay" ADD CONSTRAINT "ExerciseRoutineDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExerciseTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: existing days with exercises should not be overwritten by routine forward-apply
UPDATE "DailyLog" dl
SET "exercisesInitializedAt" = COALESCE(dl."updatedAt", NOW())
WHERE EXISTS (
  SELECT 1 FROM "ScheduledExercise" se
  WHERE se."userId" = dl."userId" AND se."scheduledDate" = dl."date"
);

UPDATE "DailyLog" dl
SET "exercisesManuallyEdited" = true
WHERE EXISTS (
  SELECT 1 FROM "ScheduledExercise" se
  WHERE se."userId" = dl."userId" AND se."scheduledDate" = dl."date"
    AND se."status" <> 'PLANNED'
);
