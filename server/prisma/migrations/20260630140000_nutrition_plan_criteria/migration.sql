-- AlterTable
ALTER TABLE "NutritionPlanTemplate" ADD COLUMN "gender" TEXT;
ALTER TABLE "NutritionPlanTemplate" ADD COLUMN "heightMinInches" INTEGER;
ALTER TABLE "NutritionPlanTemplate" ADD COLUMN "heightMaxInches" INTEGER;
ALTER TABLE "NutritionPlanTemplate" ADD COLUMN "weightMinLbs" DECIMAL(10,2);
ALTER TABLE "NutritionPlanTemplate" ADD COLUMN "weightMaxLbs" DECIMAL(10,2);
ALTER TABLE "NutritionPlanTemplate" ADD COLUMN "activityLevelMin" INTEGER;
ALTER TABLE "NutritionPlanTemplate" ADD COLUMN "activityLevelMax" INTEGER;
