-- AlterTable Account: cache the most recent CLOSED bill from Pluggy
ALTER TABLE "Account" ADD COLUMN     "lastClosedBillAmount" DOUBLE PRECISION,
ADD COLUMN     "lastClosedBillDueDate" TIMESTAMP(3),
ADD COLUMN     "lastClosedBillPaidAmount" DOUBLE PRECISION;

-- AlterTable Transaction: persist the billId from creditCardMetadata
ALTER TABLE "Transaction" ADD COLUMN     "pluggyBillId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_pluggyBillId_idx" ON "Transaction"("pluggyBillId");
