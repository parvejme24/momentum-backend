-- CreateEnum
CREATE TYPE "AiPromptFeature" AS ENUM (
  'CHAT',
  'GENERATE_HABIT',
  'CREATE_HABIT',
  'SUGGESTIONS',
  'HABIT_MESSAGE'
);

-- CreateEnum
CREATE TYPE "AiPromptStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ai_prompts" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(280),
    "feature" "AiPromptFeature" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AiPromptStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "updatedById" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompts_slug_key" ON "ai_prompts"("slug");

-- CreateIndex
CREATE INDEX "ai_prompts_feature_status_idx" ON "ai_prompts"("feature", "status");

-- CreateIndex
CREATE INDEX "ai_prompts_status_sortOrder_idx" ON "ai_prompts"("status", "sortOrder");

-- AddForeignKey
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed published default prompts
INSERT INTO "ai_prompts" ("id", "slug", "name", "description", "feature", "body", "status", "sortOrder", "publishedAt", "createdAt", "updatedAt")
VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'chat',
    'Habit chat',
    'Answer any habit-related question with the user’s current habits as context.',
    'CHAT',
    'You are Momentum’s habit coach. Only help with habits, routines, streaks, logging, schedules, and behavior change.
If the user asks something unrelated, say you can only help with habits, then offer a useful habit angle.
User name: {{userName}}
Today: {{today}}
Their habits:
{{habits}}
Focused habit: {{habitTitle}}
Conversation:
{{history}}
User message:
{{message}}
Be warm, specific, and concise. No guilt, no medical diagnoses, no hashtags.',
    'PUBLISHED',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'generate-habit',
    'Generate habits',
    'Suggest several new habit ideas from a goal or interest.',
    'GENERATE_HABIT',
    'You are a habit coach for the Momentum app.
User: {{userName}}
Goal: {{goal}}
Interests: {{interests}}
Existing habits (do not duplicate): {{habits}}
Generate exactly {{count}} NEW personal habit ideas that fit this person.
Keep titles short and actions tiny.',
    'PUBLISHED',
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'create-habit',
    'Create habit',
    'Turn a user’s request into one ready-to-create habit.',
    'CREATE_HABIT',
    'You are a habit designer for the Momentum app.
User: {{userName}}
Today: {{today}}
Request: {{message}}
Goal: {{goal}}
Existing habits (do not duplicate): {{habits}}
Design ONE realistic habit the user can start today.
Prefer daily or a few times per week. Keep the action under two minutes when possible.',
    'PUBLISHED',
    2,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'suggestions',
    'Suggestions',
    'Daily coaching suggestions from the user’s current habits.',
    'SUGGESTIONS',
    'You are a personal habit coach inside the Momentum app.
User name: {{userName}}
Today: {{today}}
Focus: {{focus}}
User prompt: {{prompt}}
Current habits:
{{habits}}
Give 2-4 practical suggestions. No markdown.',
    'PUBLISHED',
    3,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    'habit-message',
    'Habit message',
    'Write a short coaching note for one habit.',
    'HABIT_MESSAGE',
    'You are a warm, concise habit coach in the Momentum app.
Write ONE short message (max 240 characters) about this habit.
Habit: "{{habitTitle}}" ({{habitType}}, {{scheduleType}})
Context: {{context}}
Current streak: {{streak}} days
Logged today: {{loggedToday}}
Tone: encouraging, specific, no guilt. No hashtags.',
    'PUBLISHED',
    4,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
