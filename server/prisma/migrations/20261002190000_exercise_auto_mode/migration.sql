-- Additive only. New tables for Exercise page Manual / Automatic mode.
-- Does not alter existing users, plans, templates, or scheduled exercises.
-- A missing UserExerciseAutoSetting row means Manual.

CREATE TYPE "ExercisePageMode" AS ENUM ('MANUAL', 'AUTOMATIC');
CREATE TYPE "ExerciseAutoLocation" AS ENUM ('HOME', 'GYM');
CREATE TYPE "ExerciseAutoLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'HARD');
CREATE TYPE "ExerciseAutoCheckIn" AS ENUM ('NONE', 'BLOCK_COMPLETE', 'MISSED_WEEK');

CREATE TABLE "UserExerciseAutoSetting" (
    "userId" TEXT NOT NULL,
    "mode" "ExercisePageMode" NOT NULL DEFAULT 'MANUAL',
    "location" "ExerciseAutoLocation" NOT NULL DEFAULT 'GYM',
    "level" "ExerciseAutoLevel" NOT NULL DEFAULT 'BEGINNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserExerciseAutoSetting_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "UserExerciseAutoProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "location" "ExerciseAutoLocation" NOT NULL,
    "level" "ExerciseAutoLevel" NOT NULL,
    "blockIndex" INTEGER NOT NULL DEFAULT 0,
    "weekIndex" INTEGER NOT NULL DEFAULT 0,
    "dayIndex" INTEGER NOT NULL DEFAULT 0,
    "weekStartedOn" DATE,
    "dayCompletedOn" DATE,
    "pendingCheckIn" "ExerciseAutoCheckIn" NOT NULL DEFAULT 'NONE',
    "appliedOn" DATE,
    "appliedTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserExerciseAutoProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExerciseAutoTrackBlock" (
    "id" TEXT NOT NULL,
    "location" "ExerciseAutoLocation" NOT NULL,
    "level" "ExerciseAutoLevel" NOT NULL,
    "blockIndex" INTEGER NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseAutoTrackBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserExerciseAutoProgress_userId_location_level_key" ON "UserExerciseAutoProgress"("userId", "location", "level");
CREATE UNIQUE INDEX "ExerciseAutoTrackBlock_location_level_blockIndex_key" ON "ExerciseAutoTrackBlock"("location", "level", "blockIndex");
CREATE INDEX "ExerciseAutoTrackBlock_planId_idx" ON "ExerciseAutoTrackBlock"("planId");

ALTER TABLE "UserExerciseAutoSetting" ADD CONSTRAINT "UserExerciseAutoSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserExerciseAutoProgress" ADD CONSTRAINT "UserExerciseAutoProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseAutoTrackBlock" ADD CONSTRAINT "ExerciseAutoTrackBlock_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExercisePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
