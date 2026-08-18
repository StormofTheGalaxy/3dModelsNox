-- AlterEnum
ALTER TYPE "AuthTokenType" ADD VALUE 'telegram_link';

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "telegram" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "telegramSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkedAt" TIMESTAMP(3),
ADD COLUMN     "telegramNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "telegramUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramChatId_key" ON "users"("telegramChatId");

