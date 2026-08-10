import { addDays, compareLocalDates, dayOfWeek, diffDays } from './date.js';
import { eachDueDate, isDue } from './schedule.js';
import type { HabitSchedule, LocalDate, LogStatus, WeekStartsOn } from './types.js';

function isCompleted(status: LogStatus | undefined): boolean {
  return status === 'DONE' || status === 'PARTIAL';
}

function weekStart(date: LocalDate, weekStartsOn: WeekStartsOn): LocalDate {
  const dow = dayOfWeek(date);
  const offset = (dow - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

function dailyStreak(
  habit: HabitSchedule,
  logs: Map<LocalDate, LogStatus>,
  today: LocalDate,
): number {
  let streak = 0;
  let cursor = today;

  // If today is due and not completed (and not skipped), streak starts from yesterday.
  if (isDue(habit, today)) {
    const todayStatus = logs.get(today);
    if (!isCompleted(todayStatus) && todayStatus !== 'SKIPPED') {
      cursor = addDays(today, -1);
    }
  }

  while (compareLocalDates(cursor, habit.startDate) >= 0) {
    if (!isDue(habit, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    const status = logs.get(cursor);
    if (status === 'SKIPPED') {
      cursor = addDays(cursor, -1);
      continue;
    }

    if (isCompleted(status)) {
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }

    break;
  }

  return streak;
}

function weeklyStreak(
  habit: HabitSchedule,
  logs: Map<LocalDate, LogStatus>,
  today: LocalDate,
  weekStartsOn: WeekStartsOn,
): number {
  const target = habit.targetPerWeek ?? 0;
  if (target < 1) return 0;

  let streak = 0;
  let weekCursor = weekStart(today, weekStartsOn);

  const completionsInWeek = (start: LocalDate): number => {
    let count = 0;
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(start, i);
      if (compareLocalDates(date, habit.startDate) < 0) continue;
      if (compareLocalDates(date, today) > 0) continue;
      if (isCompleted(logs.get(date))) count += 1;
    }
    return count;
  };

  // Current week may still be in progress — only count if target already met.
  const currentCount = completionsInWeek(weekCursor);
  if (currentCount >= target) {
    streak += 1;
    weekCursor = addDays(weekCursor, -7);
  } else if (currentCount > 0 || compareLocalDates(weekCursor, habit.startDate) <= 0) {
    // In-progress week doesn't break yet; continue checking previous weeks.
    weekCursor = addDays(weekCursor, -7);
  } else {
    return 0;
  }

  while (true) {
    const weekEnd = addDays(weekCursor, 6);
    if (compareLocalDates(weekEnd, habit.startDate) < 0) break;

    if (completionsInWeek(weekCursor) >= target) {
      streak += 1;
      weekCursor = addDays(weekCursor, -7);
      continue;
    }

    break;
  }

  return streak;
}

export function streakFor(
  habit: HabitSchedule,
  logs: Map<LocalDate, LogStatus>,
  today: LocalDate,
  weekStartsOn: number = 0,
): number {
  const weekStartDay = (weekStartsOn % 7) as WeekStartsOn;

  if (habit.scheduleType === 'TIMES_PER_WEEK') {
    return weeklyStreak(habit, logs, today, weekStartDay);
  }

  return dailyStreak(habit, logs, today);
}

export function completionRate(
  habit: HabitSchedule,
  logs: Map<LocalDate, LogStatus>,
  from: LocalDate,
  to: LocalDate,
  _weekStartsOn: number = 0,
): number {
  void _weekStartsOn;

  if (habit.scheduleType === 'TIMES_PER_WEEK') {
    const target = habit.targetPerWeek ?? 0;
    if (target < 1) return 0;

    let expected = 0;
    let completed = 0;
    let cursor = from;

    // Walk week by week within range using calendar weeks from `from`.
    while (compareLocalDates(cursor, to) <= 0) {
      expected += target;
      let weekCompleted = 0;
      for (let i = 0; i < 7; i += 1) {
        const date = addDays(cursor, i);
        if (compareLocalDates(date, from) < 0 || compareLocalDates(date, to) > 0) continue;
        if (compareLocalDates(date, habit.startDate) < 0) continue;
        if (isCompleted(logs.get(date))) weekCompleted += 1;
      }
      completed += Math.min(weekCompleted, target);
      cursor = addDays(cursor, 7);
    }

    return expected === 0 ? 0 : completed / expected;
  }

  const dueDates = eachDueDate(habit, from, to);
  if (dueDates.length === 0) return 0;

  let completed = 0;
  for (const date of dueDates) {
    const status = logs.get(date);
    if (isCompleted(status)) completed += 1;
  }

  return completed / dueDates.length;
}

export function daysSinceStart(habit: HabitSchedule, today: LocalDate): number {
  return Math.max(0, diffDays(habit.startDate, today));
}
