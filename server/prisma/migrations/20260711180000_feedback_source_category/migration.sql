-- AlterTable
ALTER TABLE "FeedbackReport" ADD COLUMN     "category" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'in_app';

