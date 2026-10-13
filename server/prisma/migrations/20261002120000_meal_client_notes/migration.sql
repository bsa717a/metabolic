-- Additive only: new table, no changes to existing meal rows.
-- The unique index on (userId, date, mealNumber) is the range-query index
-- (leftmost prefix: userId + date). The foreign key is added on an empty table,
-- so the lock on "User" is brief.

-- CreateTable
CREATE TABLE "MealNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mealNumber" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealNote_userId_date_mealNumber_key" ON "MealNote"("userId", "date", "mealNumber");

-- AddForeignKey
ALTER TABLE "MealNote" ADD CONSTRAINT "MealNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
