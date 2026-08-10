import {
  addDays,
  completionRate,
  dayOfWeek,
  eachDay,
  eachDueDate,
  isDue,
  localDate,
  startOfWeek,
  streakFor,
  type HabitSchedule,
  type LocalDate,
  type LogStatus,
} from '@momentum/core';
import type {
  HabitStatsQuery,
  HabitStatsResponse,
  OverviewStatsQuery,
  OverviewStatsResponse,
} from '@momentum/types';
import type { Habit, HabitLog } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { fromPrismaDate, toPrismaDate } from '../../utils/date-guard.js';
import { parseRange } from '../../utils/parse-range.js';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

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

function groupLogs(logs: HabitLog[]): Map<string, HabitLog[]> {
  const grouped = new Map<string, HabitLog[]>();
  for (const log of logs) {
    const list = grouped.get(log.habitId) ?? [];
    list.push(log);
    grouped.set(log.habitId, list);
  }
  return grouped;
}

function isCompleted(status: LogStatus | undefined): boolean {
  return status === 'DONE' || status === 'PARTIAL';
}

function longestStreak(
  schedule: HabitSchedule,
  map: Map<LocalDate, LogStatus>,
  today: LocalDate,
  weekStartsOn: number,
): number {
  let longest = streakFor(schedule, map, today, weekStartsOn);
  for (const date of map.keys()) {
    longest = Math.max(longest, streakFor(schedule, map, date, weekStartsOn));
  }
  return longest;
}

function classifyDueDays(
  schedule: HabitSchedule,
  map: Map<LocalDate, LogStatus>,
  from: LocalDate,
  to: LocalDate,
): { due: number; done: number; skipped: number; missed: number; rate: number } {
  let done = 0;
  let skipped = 0;
  let missed = 0;

  for (const date of eachDueDate(schedule, from, to)) {
    const status = map.get(date);
    if (status === 'SKIPPED') {
      skipped += 1;
      continue;
    }
    if (isCompleted(status)) {
      done += 1;
    } else {
      missed += 1;
    }
  }

  const due = done + missed;
  return {
    due,
    done,
    skipped,
    missed,
    rate: due === 0 ? 0 : done / due,
  };
}

function heatmapLevel(habit: Habit, status: LogStatus, value: number | null): number {
  if (habit.targetValue !== null && value !== null && habit.targetValue > 0) {
    const ratio = value / habit.targetValue;
    if (ratio >= 1) return 4;
    if (ratio >= 0.75) return 3;
    if (ratio >= 0.5) return 2;
    return 1;
  }
  if (status === 'DONE') return 4;
  if (status === 'PARTIAL') return 2;
  return 1; // SKIPPED
}

export async function getHabitStats(
  userId: string,
  habitId: string,
  query: HabitStatsQuery,
): Promise<HabitStatsResponse> {
  // Query 1: habit + owner prefs
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId },
    include: {
      user: { select: { timezone: true, weekStartsOn: true, deletedAt: true } },
    },
  });
  if (!habit || habit.user.deletedAt) throw AppError.notFound('Habit not found');

  const prefs = habit.user;
  const range = parseRange(query.range, prefs.timezone, localDate(habit.startDate));
  const schedule = toSchedule(habit);
  const lookbackFrom = addDays(range.to, -400);

  // Query 2: logs for range + streak lookback
  const logs = await prisma.habitLog.findMany({
    where: {
      habitId,
      userId,
      localDate: {
        gte: toPrismaDate(lookbackFrom),
        lte: toPrismaDate(range.to),
      },
    },
    orderBy: { localDate: 'asc' },
  });

  const rangeLogs = logs.filter((log) => {
    const d = fromPrismaDate(log.localDate);
    return d >= range.from && d <= range.to;
  });

  const map = logsToMap(rangeLogs);
  const streakMap = logsToMap(logs);
  const completion = classifyDueDays(schedule, map, range.from, range.to);
  const rate = completionRate(schedule, map, range.from, range.to, prefs.weekStartsOn);

  const byWeekday = WEEKDAY_NAMES.map((name, day) => {
    let due = 0;
    let done = 0;
    for (const date of eachDueDate(schedule, range.from, range.to)) {
      if (dayOfWeek(date) !== day) continue;
      const status = map.get(date);
      if (status === 'SKIPPED') continue;
      due += 1;
      if (isCompleted(status)) done += 1;
    }
    return {
      day,
      name,
      due,
      done,
      rate: due === 0 ? 0 : done / due,
    };
  });

  const weekBuckets = new Map<string, { due: number; done: number }>();
  for (const date of eachDueDate(schedule, range.from, range.to)) {
    const status = map.get(date);
    if (status === 'SKIPPED') continue;
    const week = startOfWeek(date, prefs.weekStartsOn);
    const bucket = weekBuckets.get(week) ?? { due: 0, done: 0 };
    bucket.due += 1;
    if (isCompleted(status)) bucket.done += 1;
    weekBuckets.set(week, bucket);
  }

  const byWeek = [...weekBuckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, bucket]) => ({
      weekStart,
      due: bucket.due,
      done: bucket.done,
      rate: bucket.due === 0 ? 0 : bucket.done / bucket.due,
    }));

  const heatmap = rangeLogs.map((log) => ({
    date: fromPrismaDate(log.localDate),
    status: log.status,
    value: log.value,
    level: heatmapLevel(habit, log.status, log.value),
  }));

  let totalValue: number | null = null;
  if (habit.targetValue !== null) {
    totalValue = rangeLogs.reduce((sum, log) => sum + (log.value ?? 0), 0);
  }

  const current = streakFor(schedule, streakMap, range.to, prefs.weekStartsOn);

  return {
    range,
    streak: {
      current,
      longest: longestStreak(schedule, streakMap, range.to, prefs.weekStartsOn),
    },
    completion: {
      rate,
      due: completion.due,
      done: completion.done,
      skipped: completion.skipped,
      missed: completion.missed,
    },
    byWeekday,
    byWeek,
    heatmap,
    totalValue,
  };
}

export async function getOverviewStats(
  userId: string,
  query: OverviewStatsQuery,
): Promise<OverviewStatsResponse> {
  // Query 1: user + active habits
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      habits: {
        where: { archivedAt: null },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!user) throw AppError.unauthorized('User not found');

  const prefs = { timezone: user.timezone, weekStartsOn: user.weekStartsOn };
  const range = parseRange(query.range, prefs.timezone);
  const habits = user.habits;
  const habitIds = habits.map((h) => h.id);

  // Query 2: all logs up to today (range stats + daysTracked)
  const logs =
    habitIds.length === 0
      ? []
      : await prisma.habitLog.findMany({
          where: {
            userId,
            habitId: { in: habitIds },
            localDate: { lte: toPrismaDate(range.to) },
          },
        });

  const logsByHabit = groupLogs(logs);
  const statusByHabit = new Map<string, Map<LocalDate, LogStatus>>();
  for (const habit of habits) {
    statusByHabit.set(habit.id, logsToMap(logsByHabit.get(habit.id) ?? []));
  }

  const daysTracked = new Set(logs.map((l) => fromPrismaDate(l.localDate))).size;

  let totalDue = 0;
  let totalDone = 0;
  let perfectDays = 0;

  const weekdayDue = Array.from({ length: 7 }, () => 0);
  const weekdayDone = Array.from({ length: 7 }, () => 0);
  const weekBuckets = new Map<string, { due: number; done: number }>();

  for (const date of eachDay(range.from, range.to)) {
    let dayDue = 0;
    let dayDone = 0;

    for (const habit of habits) {
      const schedule = toSchedule(habit);
      if (!isDue(schedule, date)) continue;

      const map = statusByHabit.get(habit.id) ?? new Map<LocalDate, LogStatus>();
      const status = map.get(date);
      if (status === 'SKIPPED') continue;

      dayDue += 1;
      totalDue += 1;
      const dow = dayOfWeek(date);
      weekdayDue[dow] = (weekdayDue[dow] ?? 0) + 1;

      const week = startOfWeek(date, prefs.weekStartsOn);
      const bucket = weekBuckets.get(week) ?? { due: 0, done: 0 };
      bucket.due += 1;

      if (isCompleted(status)) {
        dayDone += 1;
        totalDone += 1;
        weekdayDone[dow] = (weekdayDone[dow] ?? 0) + 1;
        bucket.done += 1;
      }

      weekBuckets.set(week, bucket);
    }

    if (dayDue > 0 && dayDone === dayDue) {
      perfectDays += 1;
    }
  }

  let bestStreak: OverviewStatsResponse['bestStreak'] = null;
  const habitSummaries: OverviewStatsResponse['habits'] = [];

  for (const habit of habits) {
    const schedule = toSchedule(habit);
    const map = statusByHabit.get(habit.id) ?? new Map<LocalDate, LogStatus>();
    const current = streakFor(schedule, map, range.to, prefs.weekStartsOn);
    const longest = longestStreak(schedule, map, range.to, prefs.weekStartsOn);
    const rate = completionRate(schedule, map, range.from, range.to, prefs.weekStartsOn);

    habitSummaries.push({
      id: habit.id,
      title: habit.title,
      icon: habit.icon,
      streak: { current, longest },
      rate,
    });

    if (!bestStreak || longest > bestStreak.length) {
      bestStreak = { habitId: habit.id, title: habit.title, length: longest };
    }
  }

  return {
    range,
    totals: {
      activeHabits: habits.length,
      daysTracked,
      perfectDays,
    },
    completion: {
      rate: totalDue === 0 ? 0 : totalDone / totalDue,
      due: totalDue,
      done: totalDone,
    },
    bestStreak,
    byWeekday: WEEKDAY_NAMES.map((name, day) => ({
      day,
      name,
      rate: (weekdayDue[day] ?? 0) === 0 ? 0 : (weekdayDone[day] ?? 0) / (weekdayDue[day] ?? 1),
    })),
    byWeek: [...weekBuckets.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([weekStart, bucket]) => ({
        weekStart,
        rate: bucket.due === 0 ? 0 : bucket.done / bucket.due,
      })),
    habits: habitSummaries,
  };
}
