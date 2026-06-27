-- Split SMS reminder opt-in into pre-meal and evening recap toggles.
ALTER TABLE "User"
ADD COLUMN "smsMealRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "smsEveningRecapEnabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "User"
SET
  "smsMealRemindersEnabled" = "smsRemindersEnabled",
  "smsEveningRecapEnabled" = "smsRemindersEnabled";
