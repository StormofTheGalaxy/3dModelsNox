-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'template';

-- AlterTable
ALTER TABLE "brief_templates" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "usesCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "brief_templates_isPublic_hiddenAt_usesCount_idx" ON "brief_templates"("isPublic", "hiddenAt", "usesCount");

