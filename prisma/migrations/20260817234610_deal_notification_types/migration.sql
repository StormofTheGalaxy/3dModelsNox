-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'deal_started';
ALTER TYPE "NotificationType" ADD VALUE 'deal_plan_changed';
ALTER TYPE "NotificationType" ADD VALUE 'deal_milestone_submitted';
ALTER TYPE "NotificationType" ADD VALUE 'deal_revision_requested';
ALTER TYPE "NotificationType" ADD VALUE 'deal_milestone_accepted';
ALTER TYPE "NotificationType" ADD VALUE 'deal_payment_claimed';
ALTER TYPE "NotificationType" ADD VALUE 'deal_payment_confirmed';
ALTER TYPE "NotificationType" ADD VALUE 'deal_payment_stuck';
ALTER TYPE "NotificationType" ADD VALUE 'deal_deadline_soon';
ALTER TYPE "NotificationType" ADD VALUE 'deal_message';
ALTER TYPE "NotificationType" ADD VALUE 'deal_completed';
ALTER TYPE "NotificationType" ADD VALUE 'deal_brief_change';
ALTER TYPE "NotificationType" ADD VALUE 'dispute_opened';
ALTER TYPE "NotificationType" ADD VALUE 'dispute_resolved';
