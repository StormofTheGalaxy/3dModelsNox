-- CreateEnum
CREATE TYPE "AchievementAudience" AS ENUM ('designer', 'customer', 'any');

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "audience" "AchievementAudience" NOT NULL DEFAULT 'any',
    "metric" TEXT NOT NULL,
    "bronze" INTEGER NOT NULL,
    "silver" INTEGER NOT NULL,
    "gold" INTEGER NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Award',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "titleRu" TEXT,
    "titleEn" TEXT,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "achievements_key_key" ON "achievements"("key");

-- CreateIndex
CREATE INDEX "achievements_isEnabled_sortOrder_idx" ON "achievements"("isEnabled", "sortOrder");

