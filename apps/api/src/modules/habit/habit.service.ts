import {
  addDays,
  completionRate,
  describeSchedule,
  localDate,
  streakFor,
  todayIn,
  type HabitSchedule,
  type LocalDate,
  type LogStatus,
} from '@momentum/core';
import type {
  CreateHabitInput,
  HabitDetailResponse,
  HabitResponse,
  UpdateHabitInput,
} from '@momentum/types';
import type { Habit, HabitLog } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

const STREAK_LOOKBACK_DAYS = 400;
const HISTORY_DAYS = 90;

type UserPrefs = {
  timezone: string;
  weekStartsOn: number;
};

function toSchedule(habit: Habit): HabitSchedule {
  return {
    scheduleType: habit.scheduleType,
    scheduleDays: habit.scheduleDays,
    targetPerWeek: habit.targetPerWeek,
    intervalDays: habit.intervalDays,
    startDate: localDate(habit.startDate),
  };
}

function toPublicHabit(habit: Habit, currentStreak: number): HabitResponse {
  const schedule = toSchedule(habit);
  return {
    id: habit.id,
    title: habit.title,
    description: habit.description,
    icon: habit.icon,
    color: habit.color,
    type: habit.type,
    scheduleType: habit.scheduleType,
    scheduleDays: habit.scheduleDays,
    targetPerWeek: habit.targetPerWeek,
    intervalDays: habit.intervalDays,
    targetValue: habit.targetValue,
    unit: habit.unit,
    startDate: localDate(habit.startDate),
    sortOrder: habit.sortOrder,
    archivedAt: habit.archivedAt?.toISOString() ?? null,
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
    currentStreak,
    scheduleLabel: describeSchedule(schedule),
  };
}

function logsToMap(logs: HabitLog[]): Map<LocalDate, LogStatus> {
  const map = new Map<LocalDate, LogStatus>();
  for (const log of logs) {
    map.set(localDate(log.localDate), log.status);
  }
  return map;
}

function groupLogsByHabit(logs: HabitLog[]): Map<string, Map<LocalDate, LogStatus>> {
  const grouped = new Map<string, Map<LocalDate, LogStatus>>();
  for (const log of logs) {
    let habitLogs = grouped.get(log.habitId);
    if (!habitLogs) {
      habitLogs = new Map();
      grouped.set(log.habitId, habitLogs);
    }
    habitLogs.set(localDate(log.localDate), log.status);
  }
  return grouped;
}

async function getUserPrefs(userId: string): Promise<UserPrefs> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { timezone: true, weekStartsOn: true },
  });

  if (!user) {
    throw AppError.unauthorized('User not found');
  }

  return user;
}

function assertStartDateNotFuture(startDate: string, timezone: string): void {
  const today = todayIn(timezone);
  if (startDate > today) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'startDate', issue: 'must not be in the future' },
    ]);
  }
}

function normalizeScheduleForWrite(input: {
  scheduleType: CreateHabitInput['scheduleType'];
  scheduleDays?: number[] | undefined;
  targetPerWeek?: number | null | undefined;
  intervalDays?: number | null | undefined;
}) {
  switch (input.scheduleType) {
    case 'DAILY':
      return {
        scheduleType: input.scheduleType,
        scheduleDays: [] as number[],
        targetPerWeek: null,
        intervalDays: null,
      };
    case 'SPECIFIC_DAYS':
      return {
        scheduleType: input.scheduleType,
        scheduleDays: input.scheduleDays ?? [],
        targetPerWeek: null,
        intervalDays: null,
      };
    case 'TIMES_PER_WEEK':
      return {
        scheduleType: input.scheduleType,
        scheduleDays: [] as number[],
        targetPerWeek: input.targetPerWeek ?? null,
        intervalDays: null,
      };
    case 'INTERVAL':
      return {
        scheduleType: input.scheduleType,
        scheduleDays: [] as number[],
        targetPerWeek: null,
        intervalDays: input.intervalDays ?? null,
      };
  }
}

export async function listHabits(userId: string, archived = false): Promise<HabitResponse[]> {
  const prefs = await getUserPrefs(userId);
  const today = todayIn(prefs.timezone);
  const windowStart = addDays(today, -STREAK_LOOKBACK_DAYS);

  const habits = await prisma.habit.findMany({
    where: {
      userId,
      archivedAt: archived ? { not: null } : null,
    },
    orderBy: { sortOrder: 'asc' },
  });

  if (habits.length === 0) return [];

  const logs = await prisma.habitLog.findMany({
    where: {
      habitId: { in: habits.map((h) => h.id) },
      localDate: { gte: new Date(windowStart) },
    },
  });

  const logsByHabit = groupLogsByHabit(logs);

  return habits.map((habit) => {
    const schedule = toSchedule(habit);
    const habitLogs: Map<LocalDate, LogStatus> =
      logsByHabit.get(habit.id) ?? new Map<LocalDate, LogStatus>();
    const currentStreak = streakFor(schedule, habitLogs, today, prefs.weekStartsOn);
    return toPublicHabit(habit, currentStreak);
  });
}

export async function createHabit(userId: string, input: CreateHabitInput): Promise<HabitResponse> {
  const prefs = await getUserPrefs(userId);
  assertStartDateNotFuture(input.startDate, prefs.timezone);

  const schedule = normalizeScheduleForWrite(input);

  const agg = await prisma.habit.aggregate({
    where: { userId },
    _max: { sortOrder: true },
  });
  const sortOrder = (agg._max.sortOrder ?? -1) + 1;

  const habit = await prisma.habit.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? null,
      icon: input.icon,
      color: input.color,
      type: input.type,
      ...schedule,
      targetValue: input.targetValue ?? null,
      unit: input.unit ?? null,
      startDate: new Date(input.startDate),
      sortOrder,
    },
  });

  return toPublicHabit(habit, 0);
}

export async function getHabit(userId: string, habitId: string): Promise<HabitDetailResponse> {
  const prefs = await getUserPrefs(userId);
  const today = todayIn(prefs.timezone);
  const historyStart = addDays(today, -(HISTORY_DAYS - 1));
  const streakStart = addDays(today, -STREAK_LOOKBACK_DAYS);

  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId },
  });

  if (!habit) {
    throw AppError.notFound('Habit not found');
  }

  const logs = await prisma.habitLog.findMany({
    where: {
      habitId: habit.id,
      localDate: { gte: new Date(streakStart) },
    },
    orderBy: { localDate: 'asc' },
  });

  const schedule = toSchedule(habit);
  const logMap = logsToMap(logs);
  const currentStreak = streakFor(schedule, logMap, today, prefs.weekStartsOn);
  const rate = completionRate(schedule, logMap, historyStart, today, prefs.weekStartsOn);

  const history = logs
    .filter((log) => localDate(log.localDate) >= historyStart)
    .map((log) => ({
      localDate: localDate(log.localDate),
      status: log.status,
      value: log.value,
      note: log.note,
    }));

  return {
    ...toPublicHabit(habit, currentStreak),
    completionRate: rate,
    history,
  };
}

export async function updateHabit(
  userId: string,
  habitId: string,
  input: UpdateHabitInput,
): Promise<HabitResponse> {
  const prefs = await getUserPrefs(userId);

  const existing = await prisma.habit.findFirst({
    where: { id: habitId, userId },
  });

  if (!existing) {
    throw AppError.notFound('Habit not found');
  }

  if (input.startDate) {
    assertStartDateNotFuture(input.startDate, prefs.timezone);
  }

  const schedulePatch =
    input.scheduleType !== undefined
      ? normalizeScheduleForWrite({
          scheduleType: input.scheduleType,
          scheduleDays: input.scheduleDays,
          targetPerWeek: input.targetPerWeek,
          intervalDays: input.intervalDays,
        })
      : {};

  const habit = await prisma.habit.update({
    where: { id: habitId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...schedulePatch,
      ...(input.targetValue !== undefined ? { targetValue: input.targetValue } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
    },
  });

  const today = todayIn(prefs.timezone);
  const windowStart = addDays(today, -STREAK_LOOKBACK_DAYS);
  const logs = await prisma.habitLog.findMany({
    where: {
      habitId: habit.id,
      localDate: { gte: new Date(windowStart) },
    },
  });

  const currentStreak = streakFor(toSchedule(habit), logsToMap(logs), today, prefs.weekStartsOn);

  return toPublicHabit(habit, currentStreak);
}

export async function reorderHabits(userId: string, ids: string[]): Promise<HabitResponse[]> {
  const habits = await prisma.habit.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true },
  });

  if (habits.length !== ids.length) {
    throw AppError.notFound('One or more habits were not found');
  }

  const owned = new Set(habits.map((h) => h.id));
  if (ids.some((id) => !owned.has(id))) {
    throw AppError.notFound('One or more habits were not found');
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.habit.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  return listHabits(userId, false);
}

export async function archiveHabit(userId: string, habitId: string): Promise<HabitResponse> {
  const existing = await prisma.habit.findFirst({
    where: { id: habitId, userId },
  });

  if (!existing) {
    throw AppError.notFound('Habit not found');
  }

  const habit = await prisma.habit.update({
    where: { id: habitId },
    data: { archivedAt: new Date() },
  });

  return toPublicHabit(habit, 0);
}

export async function restoreHabit(userId: string, habitId: string): Promise<HabitResponse> {
  const existing = await prisma.habit.findFirst({
    where: { id: habitId, userId },
  });

  if (!existing) {
    throw AppError.notFound('Habit not found');
  }

  const habit = await prisma.habit.update({
    where: { id: habitId },
    data: { archivedAt: null },
  });

  return toPublicHabit(habit, 0);
}

export async function deleteHabit(
  userId: string,
  habitId: string,
  confirm: boolean,
): Promise<void> {
  if (!confirm) {
    throw AppError.validation('Check the highlighted fields', [
      {
        field: 'confirm',
        issue: 'confirm=true is required to permanently delete a habit',
      },
    ]);
  }

  const existing = await prisma.habit.findFirst({
    where: { id: habitId, userId },
  });

  if (!existing) {
    throw AppError.notFound('Habit not found');
  }

  await prisma.habit.delete({ where: { id: habitId } });
}
