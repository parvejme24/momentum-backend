import { z } from 'zod';

export const todayQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .optional(),
});

export type TodayQuery = z.infer<typeof todayQuerySchema>;

export type TodayLogSnapshot = {
  status: 'DONE' | 'PARTIAL' | 'SKIPPED';
  value: number | null;
  note: string | null;
};

export type TodayHabitItem = {
  id: string;
  title: string;
  icon: string;
  color: string;
  type: 'BUILD' | 'BREAK';
  schedule: string;
  targetValue: number | null;
  unit: string | null;
  log: TodayLogSnapshot | null;
  streak: { current: number; longest: number };
  atRisk: boolean;
};

export type TodayNotDueItem = {
  id: string;
  title: string;
  icon: string;
  schedule: string;
  nextDueDate: string | null;
};

export type TodayResponse = {
  date: string;
  summary: {
    total: number;
    completed: number;
    skipped: number;
    rate: number;
  };
  habits: TodayHabitItem[];
  notDueToday: TodayNotDueItem[];
};
