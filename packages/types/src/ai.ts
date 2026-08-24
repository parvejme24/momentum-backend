import { z } from 'zod';
import type { habitTypeSchema } from './habit.js';
import type { scheduleTypeSchema } from './habit.js';

export const aiPromptFeatureSchema = z.enum([
  'chat',
  'generate_habit',
  'create_habit',
  'suggestions',
  'habit_message',
]);
export type AiPromptFeature = z.infer<typeof aiPromptFeatureSchema>;

export const aiPromptStatusSchema = z.enum(['draft', 'published', 'archived']);
export type AiPromptStatus = z.infer<typeof aiPromptStatusSchema>;

export const aiPromptSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be URL-safe lowercase (e.g. chat, create-habit)');

export const aiSuggestionsSchema = z.object({
  focus: z.enum(['habits', 'streaks', 'schedule', 'general']).default('general'),
  prompt: z.string().trim().max(280).optional(),
});

export const aiHabitIdeasSchema = z.object({
  goal: z.string().trim().min(1).max(280).optional(),
  interests: z.string().trim().max(280).optional(),
  count: z.number().int().min(1).max(5).default(3),
});

export const aiHabitMessageSchema = z.object({
  habitId: z.string().uuid(),
  context: z.enum(['check_in', 'streak', 'missed', 'celebration', 'general']).default('general'),
});

export const aiChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  habitId: z.string().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(20)
    .optional(),
});

export const aiCreateHabitSchema = z
  .object({
    message: z.string().trim().min(1).max(500).optional(),
    goal: z.string().trim().max(280).optional(),
  })
  .refine((value) => Boolean(value.message?.trim() || value.goal?.trim()), {
    message: 'message or goal is required',
  });

export const createAiPromptSchema = z.object({
  slug: aiPromptSlugSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional(),
  feature: aiPromptFeatureSchema,
  body: z.string().trim().min(20).max(8000),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export const updateAiPromptSchema = z
  .object({
    slug: aiPromptSlugSchema.optional(),
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(280).nullable().optional(),
    feature: aiPromptFeatureSchema.optional(),
    body: z.string().trim().min(20).max(8000).optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field is required',
  });

export const listAdminAiPromptsQuerySchema = z.object({
  feature: aiPromptFeatureSchema.optional(),
  status: z.enum(['draft', 'published', 'archived', 'all']).default('all'),
});

export const aiPromptIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type AiSuggestionsInput = z.infer<typeof aiSuggestionsSchema>;
export type AiHabitIdeasInput = z.infer<typeof aiHabitIdeasSchema>;
export type AiHabitMessageInput = z.infer<typeof aiHabitMessageSchema>;
export type AiChatInput = z.infer<typeof aiChatSchema>;
export type AiCreateHabitInput = z.infer<typeof aiCreateHabitSchema>;
export type CreateAiPromptInput = z.infer<typeof createAiPromptSchema>;
export type UpdateAiPromptInput = z.infer<typeof updateAiPromptSchema>;
export type ListAdminAiPromptsQuery = z.infer<typeof listAdminAiPromptsQuerySchema>;

export type AiSuggestion = {
  title: string;
  body: string;
  category: 'habit' | 'schedule' | 'motivation' | 'recovery';
};

export type AiSuggestionsResponse = {
  suggestions: AiSuggestion[];
  planSlug: string;
  source: 'gemini' | 'fallback';
  promptSlug: string;
};

export type AiHabitIdea = {
  title: string;
  description: string;
  type: z.infer<typeof habitTypeSchema>;
  scheduleType: z.infer<typeof scheduleTypeSchema>;
  scheduleLabel: string;
  reason: string;
  icon: string;
};

export type AiHabitIdeasResponse = {
  ideas: AiHabitIdea[];
  planSlug: string;
  source: 'gemini' | 'fallback';
  promptSlug: string;
};

export type AiHabitMessageResponse = {
  habitId: string;
  habitTitle: string;
  message: string;
  planSlug: string;
  source: 'gemini' | 'fallback';
  promptSlug: string;
};

export type AiChatResponse = {
  reply: string;
  planSlug: string;
  source: 'gemini' | 'fallback';
  promptSlug: string;
};

export type AiCreatedHabitDraft = {
  title: string;
  description: string;
  type: z.infer<typeof habitTypeSchema>;
  scheduleType: z.infer<typeof scheduleTypeSchema>;
  scheduleDays: number[];
  targetPerWeek: number | null;
  intervalDays: number | null;
  icon: string;
  color: string;
  startDate: string;
};

export type AiCreateHabitResponse = {
  habit: AiCreatedHabitDraft;
  reason: string;
  planSlug: string;
  source: 'gemini' | 'fallback';
  promptSlug: string;
};

export type AiStatusResponse = {
  enabled: boolean;
  planSlug: string;
  tier: 'free' | 'pro';
  geminiConfigured: boolean;
};

export type AiFeatureCard = {
  feature: AiPromptFeature;
  slug: string;
  name: string;
  description: string;
};

export type AiFeaturesResponse = {
  features: AiFeatureCard[];
};

export type AdminAiPrompt = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  feature: AiPromptFeature;
  body: string;
  status: AiPromptStatus;
  sortOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const geminiHabitIdeasJsonSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        description: z.string().min(1).max(500),
        type: z.enum(['BUILD', 'BREAK']),
        scheduleType: z.enum(['DAILY', 'SPECIFIC_DAYS', 'TIMES_PER_WEEK', 'INTERVAL']),
        scheduleLabel: z.string().min(1).max(80),
        reason: z.string().min(1).max(280),
        icon: z.string().min(1).max(32),
      }),
    )
    .min(1)
    .max(5),
});

export const geminiHabitMessageJsonSchema = z.object({
  message: z.string().min(1).max(280),
});

export const geminiSuggestionsJsonSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        body: z.string().min(1).max(500),
        category: z.enum(['habit', 'schedule', 'motivation', 'recovery']),
      }),
    )
    .min(1)
    .max(4),
});

export const geminiChatJsonSchema = z.object({
  reply: z.string().min(1).max(1200),
});

export const geminiCreateHabitJsonSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  type: z.enum(['BUILD', 'BREAK']),
  scheduleType: z.enum(['DAILY', 'SPECIFIC_DAYS', 'TIMES_PER_WEEK', 'INTERVAL']),
  scheduleDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  targetPerWeek: z.number().int().min(1).max(7).nullable().optional(),
  intervalDays: z.number().int().min(1).max(30).nullable().optional(),
  icon: z.string().min(1).max(32),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  reason: z.string().min(1).max(280),
});
