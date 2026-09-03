-- Convert exercise duration from whole minutes to seconds (value * 60), then rename columns.
-- CoachCheckIn.durationMinutes is appointment length and is left unchanged.

-- Exercise.defaultDurationMinutes → defaultDurationSeconds
UPDATE "Exercise" SET "defaultDurationMinutes" = "defaultDurationMinutes" * 60 WHERE "defaultDurationMinutes" IS NOT NULL;
ALTER TABLE "Exercise" RENAME COLUMN "defaultDurationMinutes" TO "defaultDurationSeconds";

-- ScheduledExercise.durationMinutes → durationSeconds
UPDATE "ScheduledExercise" SET "durationMinutes" = "durationMinutes" * 60 WHERE "durationMinutes" IS NOT NULL;
ALTER TABLE "ScheduledExercise" RENAME COLUMN "durationMinutes" TO "durationSeconds";

-- ExerciseLog.actualDurationMinutes → actualDurationSeconds
UPDATE "ExerciseLog" SET "actualDurationMinutes" = "actualDurationMinutes" * 60 WHERE "actualDurationMinutes" IS NOT NULL;
ALTER TABLE "ExerciseLog" RENAME COLUMN "actualDurationMinutes" TO "actualDurationSeconds";

-- ExerciseTemplateItem.durationMinutes → durationSeconds
UPDATE "ExerciseTemplateItem" SET "durationMinutes" = "durationMinutes" * 60 WHERE "durationMinutes" IS NOT NULL;
ALTER TABLE "ExerciseTemplateItem" RENAME COLUMN "durationMinutes" TO "durationSeconds";

-- ExerciseRoutineDayItem.durationMinutes → durationSeconds
UPDATE "ExerciseRoutineDayItem" SET "durationMinutes" = "durationMinutes" * 60 WHERE "durationMinutes" IS NOT NULL;
ALTER TABLE "ExerciseRoutineDayItem" RENAME COLUMN "durationMinutes" TO "durationSeconds";

-- AiExerciseLookup.defaultDurationMinutes → defaultDurationSeconds
UPDATE "AiExerciseLookup" SET "defaultDurationMinutes" = "defaultDurationMinutes" * 60 WHERE "defaultDurationMinutes" IS NOT NULL;
ALTER TABLE "AiExerciseLookup" RENAME COLUMN "defaultDurationMinutes" TO "defaultDurationSeconds";
