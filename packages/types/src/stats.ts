import { z } from 'zod';

export const statsRangeSchema = z.enum(['7d', '30d', '90d', '365d', 'all']);

export const habitStatsQuerySchema = z.object({
  range: statsRangeSchema.default('90d'),
});

export const overviewStatsQuerySchema = z.object({
  range: statsRangeSchema.default('90d'),
});

export type StatsRange = z.infer<typeof statsRangeSchema>;
export type HabitStatsQuery = z.infer<typeof habitStatsQuerySchema>;
export type OverviewStatsQuery = z.infer<typeof overviewStatsQuerySchema>;

export type StatsRangeInfo = {
  from: string;
  to: string;
  days: number;
};

export type HabitStatsResponse = {
  range: StatsRangeInfo;
  streak: { current: number; longest: number };
  completion: {
    rate: number;
    due: number;
    done: number;
    skipped: number;
    missed: number;
  };
  byWeekday: Array<{
    day: number;
    name: string;
    due: number;
    done: number;
    rate: number;
  }>;
  byWeek: Array<{
    weekStart: string;
    due: number;
    done: number;
    rate: number;
  }>;
  heatmap: Array<{
    date: string;
    status: 'DONE' | 'PARTIAL' | 'SKIPPED';
    value: number | null;
    level: number;
  }>;
  totalValue: number | null;
};

export type OverviewStatsResponse = {
  range: StatsRangeInfo;
  totals: {
    activeHabits: number;
    daysTracked: number;
    perfectDays: number;
  };
  completion: {
    rate: number;
    due: number;
    done: number;
  };
  bestStreak: {
    habitId: string;
    title: string;
    length: number;
  } | null;
  byWeekday: Array<{ day: number; name: string; rate: number }>;
  byWeek: Array<{ weekStart: string; rate: number }>;
  habits: Array<{
    id: string;
    title: string;
    icon: string;
    streak: { current: number; longest: number };
    rate: number;
  }>;
};
