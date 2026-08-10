import { describe, expect, it } from 'vitest';
import { completionRate, daysSinceStart, streakFor } from '../streak.js';
import type { HabitSchedule, LocalDate, LogStatus } from '../types.js';

function logs(entries: Array<[LocalDate, LogStatus]>): Map<LocalDate, LogStatus> {
  return new Map(entries);
}

const daily: HabitSchedule = {
  scheduleType: 'DAILY',
  scheduleDays: [],
  targetPerWeek: null,
  intervalDays: null,
  startDate: '2026-08-01',
};

const specific: HabitSchedule = {
  scheduleType: 'SPECIFIC_DAYS',
  scheduleDays: [1, 3, 5],
  targetPerWeek: null,
  intervalDays: null,
  startDate: '2026-08-01',
};

const weekly: HabitSchedule = {
  scheduleType: 'TIMES_PER_WEEK',
  scheduleDays: [],
  targetPerWeek: 3,
  intervalDays: null,
  startDate: '2026-08-01',
};

describe('streak', () => {
  it('computes daily streaks with skips and open today', () => {
    expect(streakFor(daily, logs([]), '2026-08-10')).toBe(0);

    expect(
      streakFor(
        daily,
        logs([
          ['2026-08-09', 'DONE'],
          ['2026-08-10', 'DONE'],
        ]),
        '2026-08-10',
      ),
    ).toBe(2);

    expect(
      streakFor(
        daily,
        logs([
          ['2026-08-08', 'DONE'],
          ['2026-08-09', 'SKIPPED'],
          ['2026-08-10', 'PARTIAL'],
        ]),
        '2026-08-10',
      ),
    ).toBe(2);

    // Today due but incomplete → count from yesterday
    expect(streakFor(daily, logs([['2026-08-09', 'DONE']]), '2026-08-10')).toBe(1);

    // Today skipped still continues the chain
    expect(
      streakFor(
        daily,
        logs([
          ['2026-08-09', 'DONE'],
          ['2026-08-10', 'SKIPPED'],
        ]),
        '2026-08-10',
      ),
    ).toBe(1);

    // Today not due (Tuesday) — do not require a log for today
    expect(streakFor(specific, logs([['2026-08-10', 'DONE']]), '2026-08-11')).toBe(1);

    // SPECIFIC_DAYS skips non-due days
    expect(
      streakFor(
        specific,
        logs([
          ['2026-08-07', 'DONE'], // Fri
          ['2026-08-10', 'DONE'], // Mon
        ]),
        '2026-08-10',
      ),
    ).toBe(2);
  });

  it('computes weekly streaks', () => {
    expect(streakFor({ ...weekly, targetPerWeek: null }, logs([]), '2026-08-10', 1)).toBe(0);
    expect(streakFor({ ...weekly, targetPerWeek: 0 }, logs([]), '2026-08-10', 1)).toBe(0);

    // Week starting Monday 2026-08-10: Mon/Tue/Wed done → current week met
    expect(
      streakFor(
        weekly,
        logs([
          ['2026-08-10', 'DONE'],
          ['2026-08-11', 'DONE'],
          ['2026-08-12', 'DONE'],
          ['2026-08-03', 'DONE'],
          ['2026-08-04', 'DONE'],
          ['2026-08-05', 'DONE'],
        ]),
        '2026-08-12',
        1,
      ),
    ).toBe(2);

    // In-progress current week does not break previous streak
    expect(
      streakFor(
        weekly,
        logs([
          ['2026-08-10', 'DONE'],
          ['2026-08-03', 'DONE'],
          ['2026-08-04', 'DONE'],
          ['2026-08-05', 'DONE'],
        ]),
        '2026-08-11',
        1,
      ),
    ).toBe(1);

    // Current week empty but weekStart already at/before habit start
    expect(streakFor({ ...weekly, startDate: '2026-08-10' }, logs([]), '2026-08-11', 1)).toBe(0);

    // No completions and week after start → 0
    expect(streakFor(weekly, logs([]), '2026-08-20', 1)).toBe(0);

    // Broken previous week stops streak after counting current
    expect(
      streakFor(
        weekly,
        logs([
          ['2026-08-10', 'DONE'],
          ['2026-08-11', 'DONE'],
          ['2026-08-12', 'DONE'],
        ]),
        '2026-08-12',
        1,
      ),
    ).toBe(1);

    // Walk far enough that weekEnd is before startDate
    expect(
      streakFor(
        { ...weekly, startDate: '2026-08-10' },
        logs([
          ['2026-08-10', 'DONE'],
          ['2026-08-11', 'DONE'],
          ['2026-08-12', 'DONE'],
        ]),
        '2026-08-12',
        1,
      ),
    ).toBe(1);
  });

  it('completionRate for daily and weekly schedules', () => {
    expect(completionRate(daily, logs([]), '2026-08-10', '2026-08-09')).toBe(0);

    expect(
      completionRate(
        daily,
        logs([
          ['2026-08-10', 'DONE'],
          ['2026-08-11', 'PARTIAL'],
        ]),
        '2026-08-10',
        '2026-08-11',
      ),
    ).toBe(1);

    expect(completionRate(daily, logs([['2026-08-10', 'DONE']]), '2026-08-10', '2026-08-11')).toBe(
      0.5,
    );

    expect(
      completionRate({ ...weekly, targetPerWeek: null }, logs([]), '2026-08-10', '2026-08-16'),
    ).toBe(0);

    expect(completionRate(weekly, logs([]), '2026-08-16', '2026-08-10')).toBe(0);

    expect(
      completionRate(
        weekly,
        logs([
          ['2026-08-10', 'DONE'],
          ['2026-08-11', 'DONE'],
          ['2026-08-12', 'DONE'],
          ['2026-08-13', 'DONE'],
        ]),
        '2026-08-10',
        '2026-08-16',
      ),
    ).toBe(1);

    expect(
      completionRate(weekly, logs([['2026-08-10', 'DONE']]), '2026-08-10', '2026-08-16'),
    ).toBeCloseTo(1 / 3);

    // Mid-week from/to clips days outside the requested window
    expect(
      completionRate(
        { ...weekly, startDate: '2026-08-12' },
        logs([
          ['2026-08-10', 'DONE'],
          ['2026-08-12', 'DONE'],
          ['2026-08-13', 'DONE'],
        ]),
        '2026-08-12',
        '2026-08-13',
      ),
    ).toBeCloseTo(2 / 3);

    // Days before habit.startDate inside the window are ignored
    expect(
      completionRate(
        { ...weekly, startDate: '2026-08-12' },
        logs([
          ['2026-08-10', 'DONE'],
          ['2026-08-11', 'DONE'],
          ['2026-08-12', 'DONE'],
          ['2026-08-13', 'DONE'],
          ['2026-08-14', 'DONE'],
        ]),
        '2026-08-10',
        '2026-08-16',
      ),
    ).toBe(1);
  });

  it('daysSinceStart never goes negative', () => {
    expect(daysSinceStart(daily, '2026-08-10')).toBe(9);
    expect(daysSinceStart(daily, '2026-07-01')).toBe(0);
  });
});
