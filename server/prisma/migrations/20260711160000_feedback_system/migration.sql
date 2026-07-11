-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'CONFUSING', 'IDEA');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWING', 'PLANNED', 'RESOLVED', 'CLOSED', 'DUPLICATE', 'CANNOT_REPRODUCE');

-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('BLOCKING', 'HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "FeedbackReport" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "severity" "FeedbackSeverity",
    "goal" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "userId" TEXT,
    "reporterEmail" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "screenLabel" TEXT,
    "appVersion" TEXT,
    "diagnostics" JSONB,
    "diagnosticsPurgedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "resolutionNote" TEXT,
    "externalRef" TEXT,
    "duplicateOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackNote" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEvent" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackReport_seq_key" ON "FeedbackReport"("seq");

-- CreateIndex
CREATE INDEX "FeedbackReport_status_createdAt_idx" ON "FeedbackReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackReport_type_blocking_idx" ON "FeedbackReport"("type", "blocking");

-- CreateIndex
CREATE INDEX "FeedbackNote_reportId_idx" ON "FeedbackNote"("reportId");

-- CreateIndex
CREATE INDEX "FeedbackEvent_reportId_idx" ON "FeedbackEvent"("reportId");

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "FeedbackReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackNote" ADD CONSTRAINT "FeedbackNote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FeedbackReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackNote" ADD CONSTRAINT "FeedbackNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FeedbackReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

