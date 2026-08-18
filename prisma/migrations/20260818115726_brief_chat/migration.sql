-- CreateEnum
CREATE TYPE "BriefChatRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "brief_chat_messages" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "role" "BriefChatRole" NOT NULL,
    "text" TEXT NOT NULL,
    "suggestions" JSONB,
    "appliedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brief_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brief_chat_messages_briefId_createdAt_idx" ON "brief_chat_messages"("briefId", "createdAt");

-- AddForeignKey
ALTER TABLE "brief_chat_messages" ADD CONSTRAINT "brief_chat_messages_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

