-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "currentBillAmount" DOUBLE PRECISION,
ADD COLUMN     "currentBillDueDate" TIMESTAMP(3),
ADD COLUMN     "currentBillMinimum" DOUBLE PRECISION;
