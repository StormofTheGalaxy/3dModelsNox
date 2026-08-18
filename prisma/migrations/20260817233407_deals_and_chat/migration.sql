-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('plan_agreement', 'active', 'paused', 'in_dispute', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('pending', 'in_work', 'submitted', 'revision', 'accepted', 'paid_claimed', 'paid_confirmed');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'crypto', 'paypal', 'sbp', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'confirmed', 'stuck');

-- CreateEnum
CREATE TYPE "PaymentAdminCheck" AS ENUM ('none', 'random_ok', 'flagged', 'verified');

-- CreateEnum
CREATE TYPE "DealMessageKind" AS ENUM ('user', 'system');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "DisputeVerdict" AS ENUM ('designer_right', 'customer_right', 'mutual');

-- DropIndex
DROP INDEX "orders_search_text_trgm_idx";

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "briefVersionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "designerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "revisionRoundsIncluded" INTEGER NOT NULL DEFAULT 2,
    "status" "DealStatus" NOT NULL DEFAULT 'plan_agreement',
    "planConfirmedByCustomerAt" TIMESTAMP(3),
    "planConfirmedByDesignerAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "portfolioAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "dueDate" TIMESTAMP(3),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'pending',
    "revisionRoundsUsed" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "wasLate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_files" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "isSource" BOOLEAN NOT NULL DEFAULT true,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "previewUrl" TEXT,
    "watermarkedUrl" TEXT,
    "watermarkPending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_confirmations" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" "PaymentMethod" NOT NULL DEFAULT 'other',
    "txHash" TEXT,
    "note" TEXT,
    "customerClaimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "designerConfirmedAt" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "adminCheck" "PaymentAdminCheck" NOT NULL DEFAULT 'none',
    "remindedAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_files" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_messages" (
    "id" TEXT NOT NULL,
    "dealId" TEXT,
    "responseId" TEXT,
    "kind" "DealMessageKind" NOT NULL DEFAULT 'user',
    "authorId" TEXT,
    "text" TEXT NOT NULL,
    "systemKey" TEXT,
    "systemPayload" JSONB,
    "quotedMessageId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "translatedText" JSONB,
    "readByCustomerAt" TIMESTAMP(3),
    "readByDesignerAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "previewUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "verdict" "DisputeVerdict",
    "arbiterId" TEXT,
    "aiSummary" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deals_orderId_key" ON "deals"("orderId");

-- CreateIndex
CREATE INDEX "deals_customerId_status_idx" ON "deals"("customerId", "status");

-- CreateIndex
CREATE INDEX "deals_designerId_status_idx" ON "deals"("designerId", "status");

-- CreateIndex
CREATE INDEX "milestones_dealId_status_idx" ON "milestones"("dealId", "status");

-- CreateIndex
CREATE INDEX "milestones_status_dueDate_idx" ON "milestones"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_dealId_position_key" ON "milestones"("dealId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_milestoneId_version_key" ON "deliveries"("milestoneId", "version");

-- CreateIndex
CREATE INDEX "delivery_files_deliveryId_idx" ON "delivery_files"("deliveryId");

-- CreateIndex
CREATE INDEX "payment_confirmations_milestoneId_idx" ON "payment_confirmations"("milestoneId");

-- CreateIndex
CREATE INDEX "payment_confirmations_status_customerClaimedAt_idx" ON "payment_confirmations"("status", "customerClaimedAt");

-- CreateIndex
CREATE INDEX "payment_files_paymentId_idx" ON "payment_files"("paymentId");

-- CreateIndex
CREATE INDEX "deal_messages_dealId_createdAt_idx" ON "deal_messages"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "deal_messages_responseId_createdAt_idx" ON "deal_messages"("responseId", "createdAt");

-- CreateIndex
CREATE INDEX "message_attachments_messageId_idx" ON "message_attachments"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_dealId_key" ON "disputes"("dealId");

-- CreateIndex
CREATE INDEX "disputes_status_createdAt_idx" ON "disputes"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_briefVersionId_fkey" FOREIGN KEY ("briefVersionId") REFERENCES "brief_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_files" ADD CONSTRAINT "delivery_files_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_confirmations" ADD CONSTRAINT "payment_confirmations_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_confirmations" ADD CONSTRAINT "payment_confirmations_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_files" ADD CONSTRAINT "payment_files_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment_confirmations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_messages" ADD CONSTRAINT "deal_messages_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_messages" ADD CONSTRAINT "deal_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "deal_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_arbiterId_fkey" FOREIGN KEY ("arbiterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
