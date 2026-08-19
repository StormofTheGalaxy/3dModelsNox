-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "boostedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "orders_status_boostedUntil_idx" ON "orders"("status", "boostedUntil");
