-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'CASH', 'MANUAL', 'OTHER');

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'TRIALING';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "bannedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "bannedReason" VARCHAR(280);

-- AlterTable
ALTER TABLE "plan_subscriptions" ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "plan_subscriptions" ADD COLUMN "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "plan_subscriptions" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "plan_subscriptions" ADD COLUMN "canceledAt" TIMESTAMP(3);
ALTER TABLE "plan_subscriptions" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "plan_subscriptions" ADD COLUMN "notes" VARCHAR(500);
ALTER TABLE "plan_subscriptions" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID,
    "subscriptionId" UUID,
    "amountCents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "method" "PaymentMethod" NOT NULL DEFAULT 'MANUAL',
    "provider" VARCHAR(32),
    "providerRef" VARCHAR(128),
    "description" VARCHAR(280),
    "notes" VARCHAR(500),
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" TIMESTAMP(3),
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_bannedAt_idx" ON "users"("bannedAt");

-- CreateIndex
CREATE INDEX "users_role_deletedAt_idx" ON "users"("role", "deletedAt");

-- CreateIndex
CREATE INDEX "plan_subscriptions_userId_status_idx" ON "plan_subscriptions"("userId", "status");

-- CreateIndex
CREATE INDEX "plan_subscriptions_status_currentPeriodEnd_idx" ON "plan_subscriptions"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "payments_paidAt_status_idx" ON "payments"("paidAt", "status");

-- CreateIndex
CREATE INDEX "payments_userId_paidAt_idx" ON "payments"("userId", "paidAt");

-- CreateIndex
CREATE INDEX "payments_planId_status_idx" ON "payments"("planId", "status");

-- CreateIndex
CREATE INDEX "payments_status_method_idx" ON "payments"("status", "method");

-- DropIndex
DROP INDEX "plan_subscriptions_userId_idx";

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "plan_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
