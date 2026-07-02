-- CreateTable
CREATE TABLE "UserMealCardPicks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardSetId" TEXT NOT NULL,
    "picks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMealCardPicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMealCardPicks_userId_cardSetId_key" ON "UserMealCardPicks"("userId", "cardSetId");

-- AddForeignKey
ALTER TABLE "UserMealCardPicks" ADD CONSTRAINT "UserMealCardPicks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMealCardPicks" ADD CONSTRAINT "UserMealCardPicks_cardSetId_fkey" FOREIGN KEY ("cardSetId") REFERENCES "MealCardSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

