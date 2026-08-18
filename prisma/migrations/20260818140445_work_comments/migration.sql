-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'comment';

-- AlterTable
ALTER TABLE "portfolio_works" ADD COLUMN     "commentsCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "work_comments" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "text" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "hiddenById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_comments_workId_createdAt_idx" ON "work_comments"("workId", "createdAt");

-- CreateIndex
CREATE INDEX "work_comments_parentId_createdAt_idx" ON "work_comments"("parentId", "createdAt");

-- AddForeignKey
ALTER TABLE "work_comments" ADD CONSTRAINT "work_comments_workId_fkey" FOREIGN KEY ("workId") REFERENCES "portfolio_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_comments" ADD CONSTRAINT "work_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_comments" ADD CONSTRAINT "work_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "work_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

