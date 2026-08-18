-- CreateEnum
CREATE TYPE "AuctionWinnerDecision" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'auction_bid_placed';
ALTER TYPE "NotificationType" ADD VALUE 'auction_outbid';
ALTER TYPE "NotificationType" ADD VALUE 'auction_ending_soon';
ALTER TYPE "NotificationType" ADD VALUE 'auction_closed';
ALTER TYPE "NotificationType" ADD VALUE 'auction_won';
ALTER TYPE "NotificationType" ADD VALUE 'auction_winner_declined';

-- AlterTable
ALTER TABLE "auctions" ADD COLUMN     "endingSoonNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "revealedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "winnerDeadlineAt" TIMESTAMP(3),
ADD COLUMN     "winnerDecision" "AuctionWinnerDecision" NOT NULL DEFAULT 'pending',
ADD COLUMN     "winnerRespondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "bids" ADD COLUMN     "comment" TEXT;

-- AlterTable
ALTER TABLE "designer_profiles" ADD COLUMN     "auctionsDeclined" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "auctionsWon" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "auctions_winnerBidId_key" ON "auctions"("winnerBidId");

-- CreateIndex
CREATE INDEX "auctions_closedAt_endsAt_idx" ON "auctions"("closedAt", "endsAt");

-- CreateIndex
CREATE INDEX "auctions_winnerDecision_winnerDeadlineAt_idx" ON "auctions"("winnerDecision", "winnerDeadlineAt");

-- CreateIndex
CREATE INDEX "bids_orderId_designerId_createdAt_idx" ON "bids"("orderId", "designerId", "createdAt");

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_winnerBidId_fkey" FOREIGN KEY ("winnerBidId") REFERENCES "bids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

