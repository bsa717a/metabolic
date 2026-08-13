-- AlterTable
ALTER TABLE "MealCard" ADD COLUMN "visibleWhenOptionId" TEXT;
ALTER TABLE "MealCard" ADD COLUMN "hiddenForOptionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "MealCard_visibleWhenOptionId_idx" ON "MealCard"("visibleWhenOptionId");

-- AddForeignKey
ALTER TABLE "MealCard" ADD CONSTRAINT "MealCard_visibleWhenOptionId_fkey" FOREIGN KEY ("visibleWhenOptionId") REFERENCES "MealCardOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
