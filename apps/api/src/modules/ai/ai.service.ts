import type {
  AiHabitIdeasInput,
  AiHabitIdeasResponse,
  AiHabitMessageInput,
  AiHabitMessageResponse,
  AiSuggestionsInput,
  AiSuggestionsResponse,
  AiStatusResponse,
} from '@momentum/types';
import {
  geminiHabitIdeasJsonSchema,
  geminiHabitMessageJsonSchema,
  geminiSuggestionsJsonSchema,
} from '@momentum/types';
import {
  addDays,
  localDate,
  streakFor,
  todayIn,
  type HabitSchedule,
  type LocalDate,
  type LogStatus,
} from '@momentum/core';
import type { Habit, HabitLog } from '../../generated/prisma/client.js';
import { assertHasAi, resolveUserEntitlements } from '../../lib/entitlements.js';
import { AppError } from '../../lib/errors.js';
import { generateGeminiJson, isGeminiConfigured } from '../../lib/gemini.js';
import { prisma } from '../../lib/prisma.js';
import { fromPrismaDate, toPrismaDate } from '../../utils/date-guard.js';

const STREAK_LOOKBACK_DAYS = 120;

type UserPrefs = {
  timezone: string;
  weekStartsOn: number;
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function toSchedule(habit: Habit): HabitSchedule {
  return {
    scheduleType: habit.scheduleType,
    scheduleDays: habit.scheduleDays,
    targetPerWeek: habit.targetPerWeek,
    intervalDays: habit.intervalDays,
    startDate: localDate(habit.startDate),
  };
}

function logsToMap(logs: HabitLog[]): Map<LocalDate, LogStatus> {
  const map = new Map<LocalDate, LogStatus>();
  for (const log of logs) {
    map.set(fromPrismaDate(log.localDate), log.status);
  }
  return map;
}

async function getUserPrefs(userId: string): Promise<UserPrefs> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { timezone: true, weekStartsOn: true },
  });
  if (!user) throw AppError.unauthorized('User not found');
  return user;
}

export async function getAiStatus(userId: string): Promise<AiStatusResponse> {
  const entitlements = await resolveUserEntitlements(userId);
  return {
    enabled: entitlements.aiEnabled,
    planSlug: entitlements.planSlug,
    tier: entitlements.tier,
    geminiConfigured: isGeminiConfigured(),
  };
}

export async function getSuggestions(
  userId: string,
  input: AiSuggestionsInput,
): Promise<AiSuggestionsResponse> {
  const entitlements = await assertHasAi(userId);

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { timezone: true, name: true },
  });

  const habits = await prisma.habit.findMany({
    where: { userId, archivedAt: null },
    orderBy: { sortOrder: 'asc' },
    take: 12,
    select: { id: true, title: true, scheduleType: true, type: true },
  });

  const today = todayIn(user?.timezone ?? 'Asia/Dhaka');
  const habitSummary =
    habits.length === 0
      ? 'No habits yet.'
      : habits.map((habit) => `- ${habit.title} (${habit.type}, ${habit.scheduleType})`).join('\n');

  const geminiPrompt = `You are a personal habit coach inside the Momentum app.
User name: ${user?.name ?? 'there'}
Today (user timezone): ${today}
Focus: ${input.focus}
User prompt: ${input.prompt?.trim() ?? 'none'}
Current habits:
${habitSummary}

Return JSON only:
{
  "suggestions": [
    { "title": "short headline", "body": "1-2 sentences", "category": "habit|schedule|motivation|recovery" }
  ]
}
Provide 2-4 practical suggestions. No markdown.`;

  const gemini = await generateGeminiJson(geminiPrompt, geminiSuggestionsJsonSchema);
  if (gemini) {
    return {
      suggestions: gemini.suggestions,
      planSlug: entitlements.planSlug,
      source: 'gemini',
    };
  }

  return {
    suggestions: fallbackSuggestions(habits, input, today),
    planSlug: entitlements.planSlug,
    source: 'fallback',
  };
}

function fallbackSuggestions(
  habits: Array<{ title: string; scheduleType: string; type: string }>,
  input: AiSuggestionsInput,
  today: string,
): AiSuggestionsResponse['suggestions'] {
  const suggestions: AiSuggestionsResponse['suggestions'] = [];

  if (habits.length === 0) {
    suggestions.push({
      title: 'Start with one small habit',
      body: 'Pick something you can finish in under two minutes today — a glass of water, a short walk, or five pages of reading.',
      category: 'habit',
    });
  } else if (input.focus === 'streaks') {
    suggestions.push({
      title: 'Protect your streak window',
      body: `Log "${habits[0]!.title}" before the day ends in your timezone (${today}). Consistency beats intensity.`,
      category: 'motivation',
    });
  } else if (input.focus === 'schedule') {
    const crowded = habits.filter((habit) => habit.scheduleType === 'DAILY').length;
    suggestions.push({
      title: crowded > 4 ? 'Stack habits by time block' : 'Anchor one keystone habit',
      body:
        crowded > 4
          ? 'Group daily habits into morning, afternoon, and evening blocks so Today view feels lighter.'
          : 'Choose one daily habit that makes the others easier — log it first each day.',
      category: 'schedule',
    });
  } else {
    const habit = pick(habits);
    suggestions.push({
      title: `Double down on ${habit.title}`,
      body: `Your ${habit.type === 'BREAK' ? 'break' : 'build'} habit "${habit.title}" is a good candidate for a 7-day focus sprint.`,
      category: 'habit',
    });
  }

  if (input.prompt?.trim()) {
    suggestions.push({
      title: 'Personalized nudge',
      body: `You asked about "${input.prompt.trim()}". Keep the next step tiny: one log today, then review tomorrow in Stats.`,
      category: 'recovery',
    });
  }

  suggestions.push({
    title: 'Weekly review',
    body: 'Open Stats every Sunday, check completion rate, and archive habits you no longer need.',
    category: 'schedule',
  });

  return suggestions.slice(0, 4);
}

export async function getHabitIdeas(
  userId: string,
  input: AiHabitIdeasInput,
): Promise<AiHabitIdeasResponse> {
  const entitlements = await assertHasAi(userId);

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { name: true },
  });

  const habits = await prisma.habit.findMany({
    where: { userId, archivedAt: null },
    orderBy: { sortOrder: 'asc' },
    take: 20,
    select: { title: true },
  });

  const existingTitles = habits.map((habit) => habit.title).join(', ') || 'none';
  const goal = input.goal?.trim() ?? 'build better daily routines';
  const interests = input.interests?.trim() ?? 'general wellness';

  const prompt = `You are a habit coach for the Momentum app.
User: ${user?.name ?? 'there'}
Goal: ${goal}
Interests: ${interests}
Existing habits (avoid duplicates): ${existingTitles}
Generate exactly ${input.count} NEW personal habit ideas.

Return JSON only:
{
  "ideas": [
    {
      "title": "short habit name",
      "description": "one sentence what to do",
      "type": "BUILD or BREAK",
      "scheduleType": "DAILY|SPECIFIC_DAYS|TIMES_PER_WEEK|INTERVAL",
      "scheduleLabel": "human readable schedule e.g. Daily or 3x per week",
      "reason": "why this fits the user",
      "icon": "single emoji"
    }
  ]
}`;

  const gemini = await generateGeminiJson(prompt, geminiHabitIdeasJsonSchema);
  if (gemini) {
    return {
      ideas: gemini.ideas.slice(0, input.count),
      planSlug: entitlements.planSlug,
      source: 'gemini',
    };
  }

  return {
    ideas: fallbackHabitIdeas(input, goal),
    planSlug: entitlements.planSlug,
    source: 'fallback',
  };
}

function fallbackHabitIdeas(input: AiHabitIdeasInput, goal: string): AiHabitIdeasResponse['ideas'] {
  const pool: AiHabitIdeasResponse['ideas'] = [
    {
      title: 'Morning hydration',
      description: 'Drink a full glass of water within 30 minutes of waking.',
      type: 'BUILD',
      scheduleType: 'DAILY',
      scheduleLabel: 'Daily',
      reason: `Supports ${goal} with a simple anchor habit.`,
      icon: '💧',
    },
    {
      title: 'Evening phone curfew',
      description: 'Put your phone in another room 30 minutes before bed.',
      type: 'BREAK',
      scheduleType: 'DAILY',
      scheduleLabel: 'Daily',
      reason: 'Better sleep makes every other habit easier to keep.',
      icon: '📵',
    },
    {
      title: 'Weekly planning',
      description: 'Spend 10 minutes every Sunday reviewing habits and priorities.',
      type: 'BUILD',
      scheduleType: 'SPECIFIC_DAYS',
      scheduleLabel: 'Every Sunday',
      reason: 'A short review keeps your system aligned with your goals.',
      icon: '📝',
    },
  ];

  return pool.slice(0, input.count);
}

export async function getHabitMessage(
  userId: string,
  input: AiHabitMessageInput,
): Promise<AiHabitMessageResponse> {
  const entitlements = await assertHasAi(userId);
  const prefs = await getUserPrefs(userId);

  const habit = await prisma.habit.findFirst({
    where: { id: input.habitId, userId, archivedAt: null },
  });
  if (!habit) throw AppError.notFound('Habit not found');

  const today = todayIn(prefs.timezone);
  const windowStart = addDays(today, -STREAK_LOOKBACK_DAYS);
  const logs = await prisma.habitLog.findMany({
    where: {
      habitId: habit.id,
      userId,
      localDate: { gte: toPrismaDate(windowStart) },
    },
  });

  const map = logsToMap(logs);
  const schedule = toSchedule(habit);
  const currentStreak = streakFor(schedule, map, today, prefs.weekStartsOn);
  const loggedToday = map.has(today);

  const prompt = `You are a warm, concise habit coach in the Momentum app.
Write ONE short message (max 240 characters) for the user about their habit.
Habit: "${habit.title}" (${habit.type}, ${habit.scheduleType})
Context: ${input.context}
Current streak: ${currentStreak} days
Logged today: ${loggedToday ? 'yes' : 'no'}
Tone: encouraging, specific, no guilt. No hashtags.

Return JSON only: { "message": "your message here" }`;

  const gemini = await generateGeminiJson(prompt, geminiHabitMessageJsonSchema);
  if (gemini) {
    return {
      habitId: habit.id,
      habitTitle: habit.title,
      message: gemini.message.slice(0, 280),
      planSlug: entitlements.planSlug,
      source: 'gemini',
    };
  }

  return {
    habitId: habit.id,
    habitTitle: habit.title,
    message: fallbackHabitMessage(habit.title, input.context, currentStreak, loggedToday),
    planSlug: entitlements.planSlug,
    source: 'fallback',
  };
}

function fallbackHabitMessage(
  title: string,
  context: AiHabitMessageInput['context'],
  streak: number,
  loggedToday: boolean,
): string {
  if (context === 'celebration' || streak >= 7) {
    return `"${title}" is at ${streak} days — that's real momentum. Protect it with one small win today.`;
  }
  if (context === 'missed' || !loggedToday) {
    return `No pressure on "${title}" — one tiny action today is enough to restart the chain.`;
  }
  if (context === 'streak') {
    return `Your ${streak}-day streak on "${title}" is worth protecting. Log it while it's fresh.`;
  }
  return `"${title}" fits who you're becoming. Show up once today — that's the whole game.`;
}
