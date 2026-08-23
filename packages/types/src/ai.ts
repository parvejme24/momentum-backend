import { z } from 'zod';
import type { habitTypeSchema } from './habit.js';
import type { scheduleTypeSchema } from './habit.js';

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

export type AiSuggestionsInput = z.infer<typeof aiSuggestionsSchema>;
export type AiHabitIdeasInput = z.infer<typeof aiHabitIdeasSchema>;
export type AiHabitMessageInput = z.infer<typeof aiHabitMessageSchema>;

export type AiSuggestion = {
  title: string;
  body: string;
  category: 'habit' | 'schedule' | 'motivation' | 'recovery';
};

export type AiSuggestionsResponse = {
  suggestions: AiSuggestion[];
  planSlug: string;
  source: 'gemini' | 'fallback';
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
};

export type AiHabitMessageResponse = {
  habitId: string;
  habitTitle: string;
  message: string;
  planSlug: string;
  source: 'gemini' | 'fallback';
};

export type AiStatusResponse = {
  enabled: boolean;
  planSlug: string;
  tier: 'free' | 'pro';
  geminiConfigured: boolean;
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
