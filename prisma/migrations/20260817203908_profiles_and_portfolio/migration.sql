-- CreateEnum
CREATE TYPE "Specialization" AS ENUM ('character', 'environment', 'props', 'weapons', 'vehicles', 'animation', 'rigging', 'texturing', 'other');

-- CreateEnum
CREATE TYPE "ArtStyle" AS ENUM ('realism', 'stylized', 'lowpoly', 'pixel', 'anime', 'scifi', 'fantasy', 'other');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('character', 'environment', 'prop', 'weapon', 'vehicle', 'building', 'animation', 'texture', 'other');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('open', 'busy', 'closed');

-- CreateEnum
CREATE TYPE "DesignerLevel" AS ENUM ('novice', 'verified', 'pro', 'top');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('indie', 'studio', 'server_project', 'other');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "WorkVisibility" AS ENUM ('public', 'link_only');

-- CreateEnum
CREATE TYPE "WorkSource" AS ENUM ('uploaded', 'from_deal');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('user', 'work', 'order', 'brief', 'message', 'review');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('spam', 'abuse', 'fraud', 'nsfw', 'plagiarism', 'rules_evasion');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'confirmed', 'rejected');

-- CreateTable
CREATE TABLE "designer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "country" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specializations" "Specialization"[] DEFAULT ARRAY[]::"Specialization"[],
    "styles" "ArtStyle"[] DEFAULT ARRAY[]::"ArtStyle"[],
    "software" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "engines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hourlyRate" INTEGER,
    "minBudget" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "availability" "Availability" NOT NULL DEFAULT 'open',
    "bio" TEXT,
    "level" "DesignerLevel" NOT NULL DEFAULT 'novice',
    "verifiedAt" TIMESTAMP(3),
    "ordersCompleted" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "onTimePct" INTEGER,
    "repeatClientsPct" INTEGER,
    "disputesLost" INTEGER NOT NULL DEFAULT 0,
    "responsesToday" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "type" "CustomerType" NOT NULL DEFAULT 'indie',
    "projectLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bio" TEXT,
    "ordersCreated" INTEGER NOT NULL DEFAULT 0,
    "dealsCompleted" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "responsivenessScore" INTEGER,
    "disputesLost" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_works" (
    "id" TEXT NOT NULL,
    "designerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assetType" "AssetType",
    "styles" "ArtStyle"[] DEFAULT ARRAY[]::"ArtStyle"[],
    "software" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "engines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "polycount" INTEGER,
    "textureInfo" TEXT,
    "formats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timeSpentHours" INTEGER,
    "source" "WorkSource" NOT NULL DEFAULT 'uploaded',
    "dealId" TEXT,
    "badgeOnPlatform" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "WorkVisibility" NOT NULL DEFAULT 'public',
    "shareToken" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenAt" TIMESTAMP(3),
    "hiddenById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_media" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'processing',
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "durationSeconds" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_likes" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "text" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "designer_profiles_userId_key" ON "designer_profiles"("userId");

-- CreateIndex
CREATE INDEX "designer_profiles_availability_level_idx" ON "designer_profiles"("availability", "level");

-- CreateIndex
CREATE INDEX "designer_profiles_completedAt_idx" ON "designer_profiles"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_userId_key" ON "customer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_works_shareToken_key" ON "portfolio_works"("shareToken");

-- CreateIndex
CREATE INDEX "portfolio_works_designerId_publishedAt_idx" ON "portfolio_works"("designerId", "publishedAt");

-- CreateIndex
CREATE INDEX "portfolio_works_visibility_isHidden_publishedAt_idx" ON "portfolio_works"("visibility", "isHidden", "publishedAt");

-- CreateIndex
CREATE INDEX "portfolio_works_visibility_isHidden_likesCount_idx" ON "portfolio_works"("visibility", "isHidden", "likesCount");

-- CreateIndex
CREATE INDEX "work_media_workId_order_idx" ON "work_media"("workId", "order");

-- CreateIndex
CREATE INDEX "work_likes_userId_idx" ON "work_likes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "work_likes_workId_userId_key" ON "work_likes"("workId", "userId");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporterId_targetType_targetId_key" ON "reports"("reporterId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "designer_profiles" ADD CONSTRAINT "designer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_works" ADD CONSTRAINT "portfolio_works_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_media" ADD CONSTRAINT "work_media_workId_fkey" FOREIGN KEY ("workId") REFERENCES "portfolio_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_likes" ADD CONSTRAINT "work_likes_workId_fkey" FOREIGN KEY ("workId") REFERENCES "portfolio_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_likes" ADD CONSTRAINT "work_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
