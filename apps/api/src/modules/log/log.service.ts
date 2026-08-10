import {
  addDays,
  localDate,
  streakFor,
  todayIn,
  type HabitSchedule,
  type LocalDate,
  type LogStatus,
} from '@momentum/core';
import type {
  DeleteLogResponse,
  HabitLogListItem,
  LogEntry,
  LogRangeQuery,
  StreakSnapshot,
  UpsertLogInput,
  UpsertLogResponse,
} from '@momentum/types';
import type { Habit, HabitLog } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { assertLoggableLocalDate, fromPrismaDate, toPrismaDate } from '../../utils/date-guard.js';

const STREAK_LOOKBACK_DAYS = 400;
const MAX_RANGE_DAYS = 400;

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

function toLogEntry(row: HabitLog): LogEntry {
  return {
    localDate: fromPrismaDate(row.localDate),
    status: row.status,
    value: row.value,
    note: row.note,
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

  if (!user) {
    throw AppError.unauthorized('User not found');
  }

  return user;
}

async function requireOwnedHabit(userId: string, habitId: string): Promise<Habit> {
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId },
  });

  if (!habit) {
    throw AppError.notFound('Habit not found');
  }

  return habit;
}

function assertRange(query: LogRangeQuery): { from: LocalDate; to: LocalDate } {
  let from: LocalDate;
  let to: LocalDate;

  try {
    from = localDate(query.from);
    to = localDate(query.to);
  } catch {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'from', issue: 'must be a real calendar date (YYYY-MM-DD)' },
    ]);
  }

  if (from > to) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'from', issue: 'must be on or before to' },
    ]);
  }

  const span = Math.abs(Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`));
  const days = Math.round(span / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'to', issue: `range can't exceed ${MAX_RANGE_DAYS} days` },
    ]);
  }

  return { from, to };
}

async function computeStreakSnapshot(
  habit: Habit,
  userId: string,
  prefs: UserPrefs,
): Promise<StreakSnapshot> {
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
  const current = streakFor(schedule, map, today, prefs.weekStartsOn);

  let longest = current;
  const dates = [...map.keys()].sort();
  for (const date of dates) {
    longest = Math.max(longest, streakFor(schedule, map, date, prefs.weekStartsOn));
  }

  return { current, longest };
}

function resolveStatusAndValue(
  habit: Habit,
  input: UpsertLogInput,
): { status: LogStatus; value: number | null } {
  if (input.value !== undefined && habit.targetValue === null) {
    throw AppError.validation('Check the highlighted fields', [
      {
        field: 'value',
        issue: 'only measurable habits (with targetValue) accept a value',
      },
    ]);
  }

  if (input.status === 'SKIPPED') {
    return { status: 'SKIPPED', value: null };
  }

  const value = input.value !== undefined ? input.value : null;

  if (value !== null && habit.targetValue !== null && value < habit.targetValue) {
    return { status: 'PARTIAL', value };
  }

  return {
    status: input.status ?? 'DONE',
    value,
  };
}

export async function upsertLog(
  userId: string,
  habitId: string,
  rawLocalDate: string,
  input: UpsertLogInput,
): Promise<UpsertLogResponse> {
  const prefs = await getUserPrefs(userId);
  const habit = await requireOwnedHabit(userId, habitId);
  const date = assertLoggableLocalDate(rawLocalDate, prefs.timezone, habit.startDate);
  const { status, value } = resolveStatusAndValue(habit, input);

  const row = await prisma.habitLog.upsert({
    where: {
      habitId_localDate: {
        habitId,
        localDate: toPrismaDate(date),
      },
    },
    create: {
      habitId,
      userId,
      localDate: toPrismaDate(date),
      status,
      value,
      note: input.note ?? null,
    },
    update: {
      status,
      value,
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });

  const streak = await computeStreakSnapshot(habit, userId, prefs);

  return {
    log: toLogEntry(row),
    streak,
  };
}

export async function deleteLog(
  userId: string,
  habitId: string,
  rawLocalDate: string,
): Promise<DeleteLogResponse> {
  const prefs = await getUserPrefs(userId);
  const habit = await requireOwnedHabit(userId, habitId);
  const date = assertLoggableLocalDate(rawLocalDate, prefs.timezone, habit.startDate);

  await prisma.habitLog.deleteMany({
    where: {
      habitId,
      userId,
      localDate: toPrismaDate(date),
    },
  });

  const streak = await computeStreakSnapshot(habit, userId, prefs);

  return {
    log: null,
    streak,
  };
}

export async function listHabitLogs(
  userId: string,
  habitId: string,
  query: LogRangeQuery,
): Promise<LogEntry[]> {
  await requireOwnedHabit(userId, habitId);
  const { from, to } = assertRange(query);

  const rows = await prisma.habitLog.findMany({
    where: {
      habitId,
      userId,
      localDate: {
        gte: toPrismaDate(from),
        lte: toPrismaDate(to),
      },
    },
    orderBy: { localDate: 'asc' },
  });

  return rows.map(toLogEntry);
}

export async function listUserLogs(
  userId: string,
  query: LogRangeQuery,
): Promise<HabitLogListItem[]> {
  const { from, to } = assertRange(query);

  const rows = await prisma.habitLog.findMany({
    where: {
      userId,
      localDate: {
        gte: toPrismaDate(from),
        lte: toPrismaDate(to),
      },
    },
    orderBy: [{ localDate: 'asc' }, { habitId: 'asc' }],
  });

  return rows.map((row) => ({
    habitId: row.habitId,
    ...toLogEntry(row),
  }));
}
