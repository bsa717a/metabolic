-- CreateTable
CREATE TABLE "CoachSession" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL,
    "linkedCheckInId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachSession_coachId_userId_occurredAt_idx" ON "CoachSession"("coachId", "userId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "CoachSession_userId_occurredAt_idx" ON "CoachSession"("userId", "occurredAt" DESC);

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_linkedCheckInId_fkey" FOREIGN KEY ("linkedCheckInId") REFERENCES "CoachCheckIn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
