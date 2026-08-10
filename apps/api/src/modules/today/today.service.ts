import {
  addDays,
  describeSchedule,
  isDue,
  isStreakAtRisk,
  localDate,
  nextDueDate,
  streakFor,
  type HabitSchedule,
  type LocalDate,
  type LogStatus,
} from '@momentum/core';
import type { TodayQuery, TodayResponse } from '@momentum/types';
import type { Habit, HabitLog } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { fromPrismaDate, toPrismaDate } from '../../utils/date-guard.js';
import { resolveTodayDate } from '../../utils/parse-range.js';

const STREAK_LOOKBACK_DAYS = 400;

function toSchedule(habit: Habit): HabitSchedule {
  return {
    scheduleType: habit.scheduleType,
    scheduleDays: habit.scheduleDays,
    targetPerWeek: habit.targetPerWeek,
    intervalDays: habit.intervalDays,
    startDate: localDate(habit.startDate),
  };
}

function groupLogs(logs: HabitLog[]): Map<string, Map<LocalDate, LogStatus>> {
  const grouped = new Map<string, Map<LocalDate, LogStatus>>();
  for (const log of logs) {
    let habitLogs = grouped.get(log.habitId);
    if (!habitLogs) {
      habitLogs = new Map();
      grouped.set(log.habitId, habitLogs);
    }
    habitLogs.set(fromPrismaDate(log.localDate), log.status);
  }
  return grouped;
}

function longestStreak(
  schedule: HabitSchedule,
  logs: Map<LocalDate, LogStatus>,
  today: LocalDate,
  weekStartsOn: number,
): number {
  let longest = streakFor(schedule, logs, today, weekStartsOn);
  for (const date of logs.keys()) {
    longest = Math.max(longest, streakFor(schedule, logs, date, weekStartsOn));
  }
  return longest;
}

export async function getToday(userId: string, query: TodayQuery): Promise<TodayResponse> {
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

  if (!user) {
    throw AppError.unauthorized('User not found');
  }

  const date = resolveTodayDate(query.date, user.timezone);
  const habits = user.habits;
  const habitIds = habits.map((h) => h.id);

  // Query 2: all logs for streak window
  const windowStart = addDays(date, -STREAK_LOOKBACK_DAYS);
  const logs =
    habitIds.length === 0
      ? []
      : await prisma.habitLog.findMany({
          where: {
            habitId: { in: habitIds },
            localDate: { gte: toPrismaDate(windowStart) },
          },
        });

  const logsByHabit = groupLogs(logs);

  const dueItems: TodayResponse['habits'] = [];
  const notDueItems: TodayResponse['notDueToday'] = [];

  let completed = 0;
  let skipped = 0;

  for (const habit of habits) {
    const schedule = toSchedule(habit);
    const habitLogs = logsByHabit.get(habit.id) ?? new Map<LocalDate, LogStatus>();
    const due = isDue(schedule, date);

    if (!due) {
      notDueItems.push({
        id: habit.id,
        title: habit.title,
        icon: habit.icon,
        schedule: describeSchedule(schedule),
        nextDueDate: nextDueDate(schedule, date),
      });
      continue;
    }

    const dayStatus = habitLogs.get(date);
    if (dayStatus === 'DONE' || dayStatus === 'PARTIAL') completed += 1;
    if (dayStatus === 'SKIPPED') skipped += 1;

    const current = streakFor(schedule, habitLogs, date, user.weekStartsOn);
    const dayLog = dayStatus
      ? logs.find((l) => l.habitId === habit.id && fromPrismaDate(l.localDate) === date)
      : undefined;

    dueItems.push({
      id: habit.id,
      title: habit.title,
      icon: habit.icon,
      color: habit.color,
      type: habit.type,
      schedule: describeSchedule(schedule),
      targetValue: habit.targetValue,
      unit: habit.unit,
      log: dayLog
        ? {
            status: dayLog.status,
            value: dayLog.value,
            note: dayLog.note,
          }
        : null,
      streak: {
        current,
        longest: longestStreak(schedule, habitLogs, date, user.weekStartsOn),
      },
      atRisk: isStreakAtRisk(schedule, habitLogs, date, user.weekStartsOn),
    });
  }

  const total = dueItems.length;

  return {
    date,
    summary: {
      total,
      completed,
      skipped,
      rate: total === 0 ? 0 : completed / total,
    },
    habits: dueItems,
    notDueToday: notDueItems,
  };
}
