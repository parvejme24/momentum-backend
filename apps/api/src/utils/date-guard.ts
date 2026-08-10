import { diffDays, localDate, todayIn, type LocalDate } from '@momentum/core';
import { AppError } from '../lib/errors.js';

const MAX_BACKFILL_DAYS = 7;

/**
 * Validates a client-provided localDate against the user's timezone and habit start.
 * No timezone conversion — only range checks against todayIn(userTimezone).
 */
export function assertLoggableLocalDate(
  raw: string,
  userTimezone: string,
  habitStartDate: string | Date,
): LocalDate {
  let date: LocalDate;
  try {
    date = localDate(raw);
  } catch {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'localDate', issue: 'must be a real calendar date (YYYY-MM-DD)' },
    ]);
  }

  const today = todayIn(userTimezone);

  if (date > today) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'localDate', issue: "can't log a future date" },
    ]);
  }

  if (diffDays(date, today) > MAX_BACKFILL_DAYS) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'localDate', issue: "can't log more than 7 days back" },
    ]);
  }

  const start = localDate(habitStartDate);
  if (date < start) {
    throw AppError.validation('Check the highlighted fields', [
      { field: 'localDate', issue: "can't log before the habit's start date" },
    ]);
  }

  return date;
}

export function toPrismaDate(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromPrismaDate(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}
