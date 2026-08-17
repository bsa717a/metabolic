-- Distinguish gym-only catalog exercises so home-friendly lists can hide them.
ALTER TABLE "Exercise" ADD COLUMN "requiresGym" BOOLEAN NOT NULL DEFAULT false;
