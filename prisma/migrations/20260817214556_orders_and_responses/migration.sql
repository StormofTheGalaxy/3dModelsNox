-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'published', 'in_progress', 'completed', 'cancelled', 'archived');

-- CreateEnum
CREATE TYPE "OrderWorkMode" AS ENUM ('fixed', 'auction');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('new', 'viewed', 'shortlist', 'rejected', 'accepted');

-- CreateEnum
CREATE TYPE "ResponseRejectReason" AS ENUM ('price_too_high', 'timeline_too_long', 'portfolio_mismatch', 'chose_another', 'order_cancelled', 'other');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('order_new_match', 'order_response_received', 'order_customer_inactive', 'order_expiring', 'response_status_changed', 'response_accepted', 'brief_shared', 'system');

-- CreateEnum
CREATE TYPE "AuctionMode" AS ENUM ('open_reverse', 'sealed');

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "workMode" "OrderWorkMode" NOT NULL DEFAULT 'fixed',
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "assetType" "AssetType",
    "styles" "ArtStyle"[] DEFAULT ARRAY[]::"ArtStyle"[],
    "engine" TEXT,
    "platform" TEXT,
    "budgetMode" TEXT NOT NULL DEFAULT 'open',
    "budgetAmount" INTEGER,
    "budgetCurrency" TEXT NOT NULL DEFAULT 'USD',
    "deadline" TIMESTAMP(3),
    "previewUrl" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "responsesCount" INTEGER NOT NULL DEFAULT 0,
    "invitedDesignerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_responses" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "designerId" TEXT NOT NULL,
    "coverText" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "days" INTEGER NOT NULL,
    "attachedWorkIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isInvited" BOOLEAN NOT NULL DEFAULT false,
    "status" "ResponseStatus" NOT NULL DEFAULT 'new',
    "rejectReason" "ResponseRejectReason",
    "viewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_filters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auctions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "mode" "AuctionMode" NOT NULL DEFAULT 'open_reverse',
    "startPrice" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "endsAt" TIMESTAMP(3),
    "winnerBidId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "designerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "days" INTEGER,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_status_publishedAt_idx" ON "orders"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "orders_customerId_status_idx" ON "orders"("customerId", "status");

-- CreateIndex
CREATE INDEX "orders_status_expiresAt_idx" ON "orders"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "order_responses_designerId_createdAt_idx" ON "order_responses"("designerId", "createdAt");

-- CreateIndex
CREATE INDEX "order_responses_orderId_status_idx" ON "order_responses"("orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "order_responses_orderId_designerId_key" ON "order_responses"("orderId", "designerId");

-- CreateIndex
CREATE INDEX "saved_filters_userId_idx" ON "saved_filters"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_type_key" ON "notification_preferences"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "auctions_orderId_key" ON "auctions"("orderId");

-- CreateIndex
CREATE INDEX "bids_orderId_amount_idx" ON "bids"("orderId", "amount");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "briefs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_responses" ADD CONSTRAINT "order_responses_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_responses" ADD CONSTRAINT "order_responses_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
