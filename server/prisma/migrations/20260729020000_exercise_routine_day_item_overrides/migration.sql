-- CreateTable
CREATE TABLE "ExerciseRoutineDayItem" (
    "id" TEXT NOT NULL,
    "routineDayId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "sets" INTEGER,
    "reps" INTEGER,
    "durationMinutes" INTEGER,
    "distance" DECIMAL(10,2),
    "weight" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseRoutineDayItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseRoutineDayItem_templateItemId_idx" ON "ExerciseRoutineDayItem"("templateItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseRoutineDayItem_routineDayId_templateItemId_key" ON "ExerciseRoutineDayItem"("routineDayId", "templateItemId");

-- AddForeignKey
ALTER TABLE "ExerciseRoutineDayItem" ADD CONSTRAINT "ExerciseRoutineDayItem_routineDayId_fkey" FOREIGN KEY ("routineDayId") REFERENCES "ExerciseRoutineDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseRoutineDayItem" ADD CONSTRAINT "ExerciseRoutineDayItem_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "ExerciseTemplateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
