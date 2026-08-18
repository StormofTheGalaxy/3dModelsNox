-- CreateEnum
CREATE TYPE "TranslatableEntity" AS ENUM ('order', 'brief', 'work', 'response', 'review');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "translateContent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "translateIncoming" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "translateOutgoing" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "content_translations" (
    "id" TEXT NOT NULL,
    "entity" "TranslatableEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "targetLocale" "Locale" NOT NULL,
    "text" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_summaries" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_translations_entity_entityId_idx" ON "content_translations"("entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "content_translations_entity_entityId_field_targetLocale_key" ON "content_translations"("entity", "entityId", "field", "targetLocale");

-- CreateIndex
CREATE UNIQUE INDEX "chat_summaries_dealId_key" ON "chat_summaries"("dealId");

-- AddForeignKey
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
