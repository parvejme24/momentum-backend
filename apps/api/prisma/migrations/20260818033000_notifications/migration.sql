-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'WELCOME',
  'EMAIL_VERIFIED',
  'HABIT_CREATED',
  'HABIT_COMPLETED',
  'HABIT_STREAK',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'PAYMENT_REFUNDED',
  'SUBSCRIPTION_STARTED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_CANCELED',
  'SUBSCRIPTION_PAST_DUE',
  'USER_BANNED',
  'USER_UNBANNED',
  'PLAN_PUBLISHED',
  'ADMIN_NEW_USER',
  'ADMIN_NEW_PAYMENT',
  'ADMIN_SUBSCRIPTION_CANCELED',
  'ADMIN_USER_BANNED'
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(280) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_audience_createdAt_idx" ON "notifications"("userId", "audience", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_audience_readAt_idx" ON "notifications"("userId", "audience", "readAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
