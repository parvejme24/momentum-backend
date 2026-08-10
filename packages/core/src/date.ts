import type { LocalDate } from './types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertLocalDate(value: string): LocalDate {
  if (!DATE_RE.test(value)) {
    throw new Error(`Invalid local date: ${value}`);
  }
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) {
    throw new Error(`Invalid local date: ${value}`);
  }
  return value;
}

export function localDate(value: Date | string): LocalDate {
  if (typeof value === 'string') {
    return assertLocalDate(value.slice(0, 10));
  }
  return value.toISOString().slice(0, 10);
}

export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to resolve today for timezone: ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

export function diffDays(from: LocalDate, to: LocalDate): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

export function dayOfWeek(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Absolute day distance between two local dates. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.abs(diffDays(from, to));
}

export function startOfWeek(date: LocalDate, weekStartsOn: number = 0): LocalDate {
  const start = ((weekStartsOn % 7) + 7) % 7;
  const dow = dayOfWeek(date);
  const offset = (dow - start + 7) % 7;
  return addDays(date, -offset);
}

export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  if (compareLocalDates(from, to) > 0) return [];
  const days: LocalDate[] = [];
  let cursor = from;
  while (compareLocalDates(cursor, to) <= 0) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}
