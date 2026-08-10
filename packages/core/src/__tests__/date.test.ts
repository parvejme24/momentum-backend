import { describe, expect, it, vi } from 'vitest';
import {
  addDays,
  assertLocalDate,
  compareLocalDates,
  dayOfWeek,
  daysBetween,
  diffDays,
  eachDay,
  localDate,
  startOfWeek,
  todayIn,
} from '../date.js';

describe('date', () => {
  it('assertLocalDate accepts valid dates', () => {
    expect(assertLocalDate('2026-08-10')).toBe('2026-08-10');
  });

  it('assertLocalDate rejects bad format and impossible calendar dates', () => {
    expect(() => assertLocalDate('2026/08/10')).toThrow('Invalid local date');
    expect(() => assertLocalDate('2026-02-30')).toThrow('Invalid local date');
  });

  it('localDate handles Date and string inputs', () => {
    expect(localDate(new Date('2026-08-10T12:00:00.000Z'))).toBe('2026-08-10');
    expect(localDate('2026-08-10T99:99:99')).toBe('2026-08-10');
  });

  it('todayIn returns YYYY-MM-DD for a timezone', () => {
    const result = todayIn('UTC', new Date('2026-08-10T15:00:00.000Z'));
    expect(result).toBe('2026-08-10');
  });

  it('todayIn throws when format parts are missing', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
      this: Intl.DateTimeFormat,
    ) {
      return {
        formatToParts: () => [],
        format: () => '',
        resolvedOptions: () => ({}) as Intl.ResolvedDateTimeFormatOptions,
        formatRange: () => '',
        formatRangeToParts: () => [],
      } as unknown as Intl.DateTimeFormat;
    } as unknown as typeof Intl.DateTimeFormat);

    expect(() => todayIn('UTC')).toThrow('Unable to resolve today');
    spy.mockRestore();
  });

  it('addDays / diffDays / dayOfWeek / compareLocalDates', () => {
    expect(addDays('2026-08-10', 1)).toBe('2026-08-11');
    expect(addDays('2026-08-10', -1)).toBe('2026-08-09');
    expect(diffDays('2026-08-01', '2026-08-10')).toBe(9);
    expect(daysBetween('2026-08-10', '2026-08-01')).toBe(9);
    expect(dayOfWeek('2026-08-10')).toBe(1); // Monday
    expect(compareLocalDates('2026-08-09', '2026-08-10')).toBe(-1);
    expect(compareLocalDates('2026-08-10', '2026-08-09')).toBe(1);
    expect(compareLocalDates('2026-08-10', '2026-08-10')).toBe(0);
  });

  it('startOfWeek and eachDay', () => {
    expect(startOfWeek('2026-08-12', 1)).toBe('2026-08-10'); // Wed → Mon
    expect(startOfWeek('2026-08-10', 0)).toBe('2026-08-09'); // Mon → Sun
    expect(eachDay('2026-08-10', '2026-08-09')).toEqual([]);
    expect(eachDay('2026-08-10', '2026-08-12')).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });
});
