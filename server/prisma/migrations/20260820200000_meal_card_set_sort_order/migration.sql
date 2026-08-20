-- Admin-authored display order for meal card sets (up/down on the library table).
ALTER TABLE "MealCardSet" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Preserve the previous implicit pick (createdAt ASC) used when a slot has
-- multiple sets and no explicit mealCardSetId.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) - 1 AS rn
  FROM "MealCardSet"
)
UPDATE "MealCardSet" AS sets
SET "sortOrder" = ranked.rn
FROM ranked
WHERE sets.id = ranked.id;
