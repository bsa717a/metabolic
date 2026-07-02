-- CreateEnum
CREATE TYPE "TargetSource" AS ENUM ('FORMULA', 'OVERRIDE_BAND', 'COACH', 'TEMPLATE');

-- AlterTable
ALTER TABLE "PlanPeriod" ADD COLUMN     "calorieTarget" DECIMAL(10,2),
ADD COLUMN     "carbTarget" DECIMAL(10,2),
ADD COLUMN     "fatTarget" DECIMAL(10,2),
ADD COLUMN     "proteinTarget" DECIMAL(10,2),
ADD COLUMN     "targetSource" "TargetSource";

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "pinnedCalorieTarget" DECIMAL(10,2),
ADD COLUMN     "pinnedCarbTarget" DECIMAL(10,2),
ADD COLUMN     "pinnedFatTarget" DECIMAL(10,2),
ADD COLUMN     "pinnedProteinTarget" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "TargetOverrideBand" (
    "id" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "heightMinInches" INTEGER NOT NULL,
    "heightMaxInches" INTEGER NOT NULL,
    "weightMinLbs" DECIMAL(10,2) NOT NULL,
    "weightMaxLbs" DECIMAL(10,2) NOT NULL,
    "activityLevelMin" INTEGER NOT NULL,
    "activityLevelMax" INTEGER NOT NULL,
    "calorieTarget" DECIMAL(10,2) NOT NULL,
    "proteinTarget" DECIMAL(10,2) NOT NULL,
    "carbTarget" DECIMAL(10,2) NOT NULL,
    "fatTarget" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetOverrideBand_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TargetOverrideBand" ADD CONSTRAINT "TargetOverrideBand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

