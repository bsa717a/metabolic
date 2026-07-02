-- CreateEnum
CREATE TYPE "MealCardRole" AS ENUM ('STYLE', 'PROTEIN', 'FAT', 'CARB', 'VEGETABLE', 'FRUIT', 'FREE');

-- CreateEnum
CREATE TYPE "MealSlotType" AS ENUM ('BREAKFAST', 'SNACK', 'LUNCH', 'DINNER');

-- AlterTable
ALTER TABLE "Food" ADD COLUMN     "flavorTags" TEXT[],
ADD COLUMN     "isFreeFood" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "MealCardRole",
ADD COLUMN     "textureTags" TEXT[];

-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "cardSelections" JSONB;

-- AlterTable
ALTER TABLE "NutritionTemplateMeal" ADD COLUMN     "calorieTarget" DECIMAL(10,2),
ADD COLUMN     "mealCardSetId" TEXT;

-- CreateTable
CREATE TABLE "MealCardSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slotType" "MealSlotType" NOT NULL DEFAULT 'DINNER',
    "visibility" "Visibility" NOT NULL DEFAULT 'GLOBAL',
    "createdById" TEXT,
    "referenceCalories" DECIMAL(10,2) NOT NULL,
    "referenceProtein" DECIMAL(10,2),
    "referenceCarbs" DECIMAL(10,2),
    "referenceFat" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealCardSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealCard" (
    "id" TEXT NOT NULL,
    "cardSetId" TEXT NOT NULL,
    "role" "MealCardRole" NOT NULL,
    "name" TEXT NOT NULL,
    "pickRule" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealCardOption" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cuisine" TEXT,
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealCardOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealCardOptionFood" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "baseServings" DECIMAL(10,2) NOT NULL,
    "scalable" BOOLEAN NOT NULL DEFAULT true,
    "discrete" BOOLEAN NOT NULL DEFAULT false,
    "unitStep" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "minServings" DECIMAL(10,2),
    "maxServings" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealCardOptionFood_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealCard_cardSetId_sortOrder_key" ON "MealCard"("cardSetId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MealCardOption_cardId_sortOrder_key" ON "MealCardOption"("cardId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MealCardOptionFood_optionId_foodId_key" ON "MealCardOptionFood"("optionId", "foodId");

-- AddForeignKey
ALTER TABLE "NutritionTemplateMeal" ADD CONSTRAINT "NutritionTemplateMeal_mealCardSetId_fkey" FOREIGN KEY ("mealCardSetId") REFERENCES "MealCardSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCardSet" ADD CONSTRAINT "MealCardSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCard" ADD CONSTRAINT "MealCard_cardSetId_fkey" FOREIGN KEY ("cardSetId") REFERENCES "MealCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCardOption" ADD CONSTRAINT "MealCardOption_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "MealCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCardOptionFood" ADD CONSTRAINT "MealCardOptionFood_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "MealCardOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealCardOptionFood" ADD CONSTRAINT "MealCardOptionFood_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

