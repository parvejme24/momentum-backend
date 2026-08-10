import { describe, expect, it } from 'vitest';
import { describeSchedule, eachDueDate, isDue } from '../schedule.js';
import type { HabitSchedule } from '../types.js';

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

const times: HabitSchedule = {
  scheduleType: 'TIMES_PER_WEEK',
  scheduleDays: [],
  targetPerWeek: 3,
  intervalDays: null,
  startDate: '2026-08-01',
};

const interval: HabitSchedule = {
  scheduleType: 'INTERVAL',
  scheduleDays: [],
  targetPerWeek: null,
  intervalDays: 3,
  startDate: '2026-08-01',
};

describe('schedule', () => {
  it('isDue respects startDate and schedule types', () => {
    expect(isDue(daily, '2026-07-31')).toBe(false);
    expect(isDue(daily, '2026-08-10')).toBe(true);

    expect(isDue(specific, '2026-08-10')).toBe(true); // Monday
    expect(isDue(specific, '2026-08-11')).toBe(false); // Tuesday

    expect(isDue(times, '2026-08-10')).toBe(true);

    expect(isDue(interval, '2026-08-01')).toBe(true);
    expect(isDue(interval, '2026-08-02')).toBe(false);
    expect(isDue(interval, '2026-08-04')).toBe(true);
    expect(isDue({ ...interval, intervalDays: 1 }, '2026-08-04')).toBe(false);
    expect(isDue({ ...interval, intervalDays: null }, '2026-08-04')).toBe(false);
  });

  it('isDue default branch returns false', () => {
    const unknown = {
      ...daily,
      scheduleType: 'UNKNOWN',
    } as unknown as HabitSchedule;
    expect(isDue(unknown, '2026-08-10')).toBe(false);
  });

  it('describeSchedule covers all labels', () => {
    expect(describeSchedule(daily)).toBe('Every day');
    expect(describeSchedule(specific)).toBe('Mon, Wed, Fri');
    expect(describeSchedule({ ...specific, scheduleDays: [] })).toBe('No days selected');
    expect(describeSchedule({ ...specific, scheduleDays: [99] })).toBe('99');
    expect(describeSchedule(times)).toBe('3× per week');
    expect(describeSchedule({ ...times, targetPerWeek: null })).toBe('0× per week');
    expect(describeSchedule(interval)).toBe('Every 3 days');
    expect(describeSchedule({ ...interval, intervalDays: null })).toBe('Every 0 days');

    const unknown = {
      ...daily,
      scheduleType: 'UNKNOWN',
    } as unknown as HabitSchedule;
    expect(describeSchedule(unknown)).toBe('Unknown schedule');
  });

  it('eachDueDate enumerates due days in range', () => {
    expect(eachDueDate(daily, '2026-08-10', '2026-08-09')).toEqual([]);
    expect(eachDueDate(daily, '2026-07-01', '2026-07-02')).toEqual([]);
    expect(eachDueDate(specific, '2026-08-10', '2026-08-12')).toEqual(['2026-08-10', '2026-08-12']);
    expect(eachDueDate(daily, '2026-07-30', '2026-08-02')).toEqual(['2026-08-01', '2026-08-02']);
  });
});
