import { z } from 'zod';

export const logStatusSchema = z.enum(['DONE', 'PARTIAL', 'SKIPPED']);

export const upsertLogSchema = z.object({
  status: logStatusSchema.optional(),
  value: z.number().min(0).optional(),
  note: z.string().trim().max(280).nullable().optional(),
});

export const logRangeQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  })
  .superRefine((value, ctx) => {
    if (value.from > value.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'must be on or before to',
      });
    }
  });

export const habitLogParamsSchema = z.object({
  id: z.uuid(),
  localDate: z.string().min(1),
});

export type UpsertLogInput = z.infer<typeof upsertLogSchema>;
export type LogRangeQuery = z.infer<typeof logRangeQuerySchema>;
export type HabitLogParams = z.infer<typeof habitLogParamsSchema>;

export type LogEntry = {
  localDate: string;
  status: z.infer<typeof logStatusSchema>;
  value: number | null;
  note: string | null;
};

export type StreakSnapshot = {
  current: number;
  longest: number;
};

export type UpsertLogResponse = {
  log: LogEntry;
  streak: StreakSnapshot;
};

export type DeleteLogResponse = {
  log: null;
  streak: StreakSnapshot;
};

export type HabitLogListItem = LogEntry & {
  habitId: string;
};
