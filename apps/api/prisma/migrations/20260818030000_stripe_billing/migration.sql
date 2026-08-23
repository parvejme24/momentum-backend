-- AlterTable
ALTER TABLE "users" ADD COLUMN "stripeCustomerId" VARCHAR(64);

-- AlterTable
ALTER TABLE "plan_subscriptions" ADD COLUMN "stripeSubscriptionId" VARCHAR(64);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "receiptUrl" VARCHAR(500);
ALTER TABLE "payments" ALTER COLUMN "providerRef" SET DATA TYPE VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_subscriptions_stripeSubscriptionId_key" ON "plan_subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_providerRef_key" ON "payments"("provider", "providerRef");
