-- Additive, prod-safe: existing users keep the vertical list layout.
CREATE TYPE "MealPlanLayout" AS ENUM ('VERTICAL', 'HORIZONTAL');

ALTER TABLE "User" ADD COLUMN "mealPlanLayout" "MealPlanLayout" NOT NULL DEFAULT 'VERTICAL';
