import { addDays, compareLocalDates, dayOfWeek, diffDays } from './date.js';
import type { HabitSchedule, LocalDate } from './types.js';

export function isDue(habit: HabitSchedule, date: LocalDate): boolean {
  if (compareLocalDates(date, habit.startDate) < 0) {
    return false;
  }

  switch (habit.scheduleType) {
    case 'DAILY':
      return true;
    case 'SPECIFIC_DAYS':
      return habit.scheduleDays.includes(dayOfWeek(date));
    case 'TIMES_PER_WEEK':
      return true;
    case 'INTERVAL': {
      const interval = habit.intervalDays ?? 0;
      if (interval < 2) return false;
      const delta = diffDays(habit.startDate, date);
      return delta >= 0 && delta % interval === 0;
    }
    default:
      return false;
  }
}

export function describeSchedule(habit: HabitSchedule): string {
  switch (habit.scheduleType) {
    case 'DAILY':
      return 'Every day';
    case 'SPECIFIC_DAYS': {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = [...habit.scheduleDays].sort((a, b) => a - b).map((d) => names[d] ?? String(d));
      return days.length > 0 ? days.join(', ') : 'No days selected';
    }
    case 'TIMES_PER_WEEK':
      return `${habit.targetPerWeek ?? 0}× per week`;
    case 'INTERVAL':
      return `Every ${habit.intervalDays ?? 0} days`;
    default:
      return 'Unknown schedule';
  }
}

export function eachDueDate(habit: HabitSchedule, from: LocalDate, to: LocalDate): LocalDate[] {
  const start = compareLocalDates(from, habit.startDate) < 0 ? habit.startDate : from;
  if (compareLocalDates(start, to) > 0) return [];

  const dates: LocalDate[] = [];
  let cursor = start;
  while (compareLocalDates(cursor, to) <= 0) {
    if (isDue(habit, cursor)) {
      dates.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** Next due date strictly after `from` (searches up to ~2 years). */
export function nextDueDate(habit: HabitSchedule, from: LocalDate): LocalDate | null {
  const searchStart = addDays(from, 1);
  const limit = addDays(searchStart, 366 * 2);
  let cursor = searchStart;
  while (compareLocalDates(cursor, limit) <= 0) {
    if (isDue(habit, cursor)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
}
