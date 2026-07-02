-- Standing picks become per meal slot. Existing rows predate the column (local test data
-- only at this point) and cannot be attributed to a slot, so they are cleared.
DELETE FROM "UserMealCardPicks";
DROP INDEX "UserMealCardPicks_userId_cardSetId_key";
ALTER TABLE "UserMealCardPicks" ADD COLUMN "mealNumber" INTEGER NOT NULL;
CREATE UNIQUE INDEX "UserMealCardPicks_userId_cardSetId_mealNumber_key" ON "UserMealCardPicks"("userId", "cardSetId", "mealNumber");
