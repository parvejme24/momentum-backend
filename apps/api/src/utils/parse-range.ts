import { addDays, daysBetween, localDate, todayIn, type LocalDate } from '@momentum/core';
import { AppError } from '../lib/errors.js';

const RANGE_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
} as const;

const ALL_CAP_DAYS = 400;

export type ParsedRange = {
  from: LocalDate;
  to: LocalDate;
  days: number;
};

/**
 * Shared range parser for today/stats modules.
 * `to` is always today in the user's timezone.
 */
export function parseRange(range: string, timezone: string, startDate?: LocalDate): ParsedRange {
  if (!(range in RANGE_DAYS) && range !== 'all') {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'range', issue: 'must be one of 7d, 30d, 90d, 365d, all' },
    ]);
  }

  const to = todayIn(timezone);
  let from: LocalDate;

  if (range === 'all') {
    const start = startDate ?? addDays(to, -(ALL_CAP_DAYS - 1));
    const uncappedFrom = start < to ? start : to;
    const span = daysBetween(uncappedFrom, to) + 1;
    from = span > ALL_CAP_DAYS ? addDays(to, -(ALL_CAP_DAYS - 1)) : uncappedFrom;
  } else {
    const days = RANGE_DAYS[range as keyof typeof RANGE_DAYS];
    from = addDays(to, -(days - 1));
  }

  return {
    from,
    to,
    days: daysBetween(from, to) + 1,
  };
}

export function resolveTodayDate(rawDate: string | undefined, timezone: string): LocalDate {
  if (!rawDate) return todayIn(timezone);

  let date: LocalDate;
  try {
    date = localDate(rawDate);
  } catch {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'date', issue: 'must be a real calendar date (YYYY-MM-DD)' },
    ]);
  }

  const today = todayIn(timezone);
  if (date > today) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'date', issue: "can't log a future date" },
    ]);
  }
  if (daysBetween(date, today) > 7) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'date', issue: "can't log more than 7 days back" },
    ]);
  }

  return date;
}
