-- Keep one meal per (dailyLogId, mealNumber) before enforcing uniqueness.
-- Prefer logged/actual rows over planned-only template shells.
WITH item_counts AS (
  SELECT "mealId",
    COUNT(*)::int AS item_count,
    COUNT(*) FILTER (WHERE type = 'ACTUAL')::int AS actual_count
  FROM "MealItem"
  GROUP BY "mealId"
),
ranked AS (
  SELECT m.id,
    ROW_NUMBER() OVER (
      PARTITION BY m."dailyLogId", m."mealNumber"
      ORDER BY
        COALESCE(ic.actual_count, 0) DESC,
        CASE WHEN m.status <> 'PLANNED' THEN 1 ELSE 0 END DESC,
        COALESCE(ic.item_count, 0) DESC,
        m."updatedAt" DESC,
        m.id ASC
    ) AS rn
  FROM "Meal" m
  LEFT JOIN item_counts ic ON ic."mealId" = m.id
)
DELETE FROM "Meal" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN "mealsInitializedAt" TIMESTAMP(3);

UPDATE "DailyLog" dl
SET "mealsInitializedAt" = COALESCE(dl."updatedAt", NOW())
WHERE EXISTS (SELECT 1 FROM "Meal" m WHERE m."dailyLogId" = dl.id);

-- CreateIndex
CREATE UNIQUE INDEX "Meal_dailyLogId_mealNumber_key" ON "Meal"("dailyLogId", "mealNumber");
