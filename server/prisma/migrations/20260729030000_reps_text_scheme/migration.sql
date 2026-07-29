-- AlterTable: prescription reps become text schemes (e.g. "10", "15/12/10")
ALTER TABLE "ScheduledExercise" ALTER COLUMN "reps" TYPE TEXT USING (
  CASE WHEN "reps" IS NULL THEN NULL ELSE "reps"::text END
);

ALTER TABLE "ExerciseTemplateItem" ALTER COLUMN "reps" TYPE TEXT USING (
  CASE WHEN "reps" IS NULL THEN NULL ELSE "reps"::text END
);

ALTER TABLE "ExerciseRoutineDayItem" ALTER COLUMN "reps" TYPE TEXT USING (
  CASE WHEN "reps" IS NULL THEN NULL ELSE "reps"::text END
);
