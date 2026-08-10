-- CreateEnum
CREATE TYPE "HabitType" AS ENUM ('BUILD', 'BREAK');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('DAILY', 'SPECIFIC_DAYS', 'TIMES_PER_WEEK', 'INTERVAL');

-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('DONE', 'PARTIAL', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('WEB', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "EmailTokenType" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "avatarUrl" VARCHAR(500),
    "passwordHash" VARCHAR(72),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Dhaka',
    "weekStartsOn" SMALLINT NOT NULL DEFAULT 6,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "providerAccountId" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "deviceId" VARCHAR(64),
    "userAgent" VARCHAR(255),
    "ipAddress" VARCHAR(45),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "type" "EmailTokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "icon" VARCHAR(32) NOT NULL DEFAULT 'check',
    "color" VARCHAR(7) NOT NULL DEFAULT '#2B4CE0',
    "type" "HabitType" NOT NULL DEFAULT 'BUILD',
    "scheduleType" "ScheduleType" NOT NULL DEFAULT 'DAILY',
    "scheduleDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "targetPerWeek" SMALLINT,
    "intervalDays" SMALLINT,
    "targetValue" DOUBLE PRECISION,
    "unit" VARCHAR(24),
    "startDate" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_logs" (
    "id" UUID NOT NULL,
    "habitId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "status" "LogStatus" NOT NULL DEFAULT 'DONE',
    "value" DOUBLE PRECISION,
    "note" VARCHAR(280),
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "habitId" UUID NOT NULL,
    "timeLocal" VARCHAR(5) NOT NULL,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "pushToken" VARCHAR(512) NOT NULL,
    "deviceName" VARCHAR(60),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key" ON "oauth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_revokedAt_idx" ON "refresh_tokens"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_tokenHash_key" ON "email_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_tokens_userId_type_idx" ON "email_tokens"("userId", "type");

-- CreateIndex
CREATE INDEX "email_tokens_expiresAt_idx" ON "email_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "habits_userId_archivedAt_sortOrder_idx" ON "habits"("userId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "habit_logs_userId_localDate_idx" ON "habit_logs"("userId", "localDate");

-- CreateIndex
CREATE INDEX "habit_logs_habitId_localDate_idx" ON "habit_logs"("habitId", "localDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "habit_logs_habitId_localDate_key" ON "habit_logs"("habitId", "localDate");

-- CreateIndex
CREATE INDEX "reminders_enabled_timeLocal_idx" ON "reminders"("enabled", "timeLocal");

-- CreateIndex
CREATE INDEX "reminders_habitId_idx" ON "reminders"("habitId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_pushToken_key" ON "devices"("pushToken");

-- CreateIndex
CREATE INDEX "devices_userId_idx" ON "devices"("userId");

-- CreateIndex
CREATE INDEX "devices_lastSeenAt_idx" ON "devices"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
