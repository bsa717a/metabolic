-- AlterTable
ALTER TABLE "CoachSession" ADD COLUMN "linkedSnapshotId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CoachSession_linkedSnapshotId_key" ON "CoachSession"("linkedSnapshotId");

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_linkedSnapshotId_fkey" FOREIGN KEY ("linkedSnapshotId") REFERENCES "ProgramMetricSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
