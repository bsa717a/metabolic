-- Weekday add/remove edits live on the user's routine, not the shared exercise plan.

CREATE TABLE "ExerciseRoutineDayExclusion" (
    "id" TEXT NOT NULL,
    "routineDayId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseRoutineDayExclusion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExerciseRoutineDayExtra" (
    "id" TEXT NOT NULL,
    "routineDayId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sets" INTEGER,
    "reps" TEXT,
    "speed" TEXT,
    "durationSeconds" INTEGER,
    "distance" DECIMAL(10,2),
    "weight" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseRoutineDayExtra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExerciseRoutineDayExclusion_routineDayId_templateItemId_key" ON "ExerciseRoutineDayExclusion"("routineDayId", "templateItemId");
CREATE INDEX "ExerciseRoutineDayExclusion_templateItemId_idx" ON "ExerciseRoutineDayExclusion"("templateItemId");
CREATE INDEX "ExerciseRoutineDayExtra_routineDayId_idx" ON "ExerciseRoutineDayExtra"("routineDayId");
CREATE INDEX "ExerciseRoutineDayExtra_exerciseId_idx" ON "ExerciseRoutineDayExtra"("exerciseId");

ALTER TABLE "ExerciseRoutineDayExclusion" ADD CONSTRAINT "ExerciseRoutineDayExclusion_routineDayId_fkey" FOREIGN KEY ("routineDayId") REFERENCES "ExerciseRoutineDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseRoutineDayExclusion" ADD CONSTRAINT "ExerciseRoutineDayExclusion_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "ExerciseTemplateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseRoutineDayExtra" ADD CONSTRAINT "ExerciseRoutineDayExtra_routineDayId_fkey" FOREIGN KEY ("routineDayId") REFERENCES "ExerciseRoutineDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseRoutineDayExtra" ADD CONSTRAINT "ExerciseRoutineDayExtra_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
