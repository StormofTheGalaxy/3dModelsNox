-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('draft', 'active', 'frozen', 'archived');

-- CreateEnum
CREATE TYPE "BriefAccess" AS ENUM ('private', 'link', 'selected', 'public');

-- CreateEnum
CREATE TYPE "BriefOwnerRole" AS ENUM ('customer', 'designer');

-- CreateEnum
CREATE TYPE "BriefChangeStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "PdfExportStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateTable
CREATE TABLE "briefs" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerRole" "BriefOwnerRole" NOT NULL DEFAULT 'customer',
    "title" TEXT NOT NULL,
    "status" "BriefStatus" NOT NULL DEFAULT 'draft',
    "access" "BriefAccess" NOT NULL DEFAULT 'private',
    "shareToken" TEXT,
    "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceLocale" "Locale" NOT NULL DEFAULT 'ru',
    "sections" JSONB NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "pdfStatus" "PdfExportStatus",
    "pdfUrl" TEXT,
    "pdfStorageKey" TEXT,
    "pdfVersion" INTEGER,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brief_versions" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "authorId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brief_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brief_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "ownerId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brief_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brief_change_requests" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "dealId" TEXT,
    "authorId" TEXT,
    "description" TEXT NOT NULL,
    "proposed" JSONB,
    "status" "BriefChangeStatus" NOT NULL DEFAULT 'pending',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brief_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "pool" TEXT NOT NULL DEFAULT 'general_pool',
    "period" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "briefs_shareToken_key" ON "briefs"("shareToken");

-- CreateIndex
CREATE INDEX "briefs_ownerId_updatedAt_idx" ON "briefs"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "briefs_status_access_idx" ON "briefs"("status", "access");

-- CreateIndex
CREATE INDEX "brief_versions_briefId_createdAt_idx" ON "brief_versions"("briefId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "brief_versions_briefId_version_key" ON "brief_versions"("briefId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "brief_templates_key_key" ON "brief_templates"("key");

-- CreateIndex
CREATE INDEX "brief_templates_ownerId_idx" ON "brief_templates"("ownerId");

-- CreateIndex
CREATE INDEX "brief_templates_isSystem_order_idx" ON "brief_templates"("isSystem", "order");

-- CreateIndex
CREATE INDEX "brief_change_requests_briefId_status_idx" ON "brief_change_requests"("briefId", "status");

-- CreateIndex
CREATE INDEX "ai_credit_ledger_userId_period_pool_idx" ON "ai_credit_ledger"("userId", "period", "pool");

-- CreateIndex
CREATE INDEX "ai_credit_ledger_createdAt_idx" ON "ai_credit_ledger"("createdAt");

-- AddForeignKey
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_versions" ADD CONSTRAINT "brief_versions_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_versions" ADD CONSTRAINT "brief_versions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_templates" ADD CONSTRAINT "brief_templates_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_change_requests" ADD CONSTRAINT "brief_change_requests_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_change_requests" ADD CONSTRAINT "brief_change_requests_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_credit_ledger" ADD CONSTRAINT "ai_credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
