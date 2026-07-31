-- AlterTable
ALTER TABLE "MealCardOption" ADD COLUMN "visibleWhenOptionId" TEXT;

-- CreateIndex
CREATE INDEX "MealCardOption_visibleWhenOptionId_idx" ON "MealCardOption"("visibleWhenOptionId");

-- AddForeignKey
ALTER TABLE "MealCardOption" ADD CONSTRAINT "MealCardOption_visibleWhenOptionId_fkey" FOREIGN KEY ("visibleWhenOptionId") REFERENCES "MealCardOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
