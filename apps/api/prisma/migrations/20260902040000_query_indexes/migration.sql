-- Admin user list default sort
CREATE INDEX "users_lastActiveAt_idx" ON "users"("lastActiveAt");

-- Admin user list createdAt sort
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- Overview / user log range: filter by user + habit set + date window
CREATE INDEX "habit_logs_userId_habitId_localDate_idx" ON "habit_logs"("userId", "habitId", "localDate");

-- Latest live subscription lookup (left-prefix still covers userId + status)
DROP INDEX IF EXISTS "plan_subscriptions_userId_idx";
DROP INDEX IF EXISTS "plan_subscriptions_userId_status_idx";
CREATE INDEX "plan_subscriptions_userId_status_createdAt_idx" ON "plan_subscriptions"("userId", "status", "createdAt");
