-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'review_received';
ALTER TYPE "NotificationType" ADD VALUE 'review_published';
ALTER TYPE "NotificationType" ADD VALUE 'review_replied';
ALTER TYPE "NotificationType" ADD VALUE 'achievement_granted';
ALTER TYPE "NotificationType" ADD VALUE 'level_changed';
ALTER TYPE "NotificationType" ADD VALUE 'verification_decided';
ALTER TYPE "NotificationType" ADD VALUE 'strike_issued';
