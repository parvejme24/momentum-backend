import { z } from 'zod';

export const habitTypeSchema = z.enum(['BUILD', 'BREAK']);
export const scheduleTypeSchema = z.enum(['DAILY', 'SPECIFIC_DAYS', 'TIMES_PER_WEEK', 'INTERVAL']);

export const localDateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #2B4CE0');

type ScheduleIssue = { field: string; issue: string };

export function validateScheduleFields(input: {
  scheduleType: z.infer<typeof scheduleTypeSchema>;
  scheduleDays?: number[] | undefined;
  targetPerWeek?: number | null | undefined;
  intervalDays?: number | null | undefined;
}): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const days = input.scheduleDays ?? [];
  const target = input.targetPerWeek;
  const interval = input.intervalDays;

  const hasDays = days.length > 0;
  const hasTarget = target !== undefined && target !== null;
  const hasInterval = interval !== undefined && interval !== null;

  switch (input.scheduleType) {
    case 'DAILY': {
      if (hasDays) {
        issues.push({
          field: 'scheduleDays',
          issue: 'must be empty for DAILY habits',
        });
      }
      if (hasTarget) {
        issues.push({
          field: 'targetPerWeek',
          issue: 'must be null for DAILY habits',
        });
      }
      if (hasInterval) {
        issues.push({
          field: 'intervalDays',
          issue: 'must be null for DAILY habits',
        });
      }
      break;
    }
    case 'SPECIFIC_DAYS': {
      if (!hasDays) {
        issues.push({
          field: 'scheduleDays',
          issue: 'must include 1–7 unique days (0–6)',
        });
      } else {
        if (days.length > 7) {
          issues.push({
            field: 'scheduleDays',
            issue: 'must include at most 7 days',
          });
        }
        if (new Set(days).size !== days.length) {
          issues.push({
            field: 'scheduleDays',
            issue: 'must be unique',
          });
        }
        if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
          issues.push({
            field: 'scheduleDays',
            issue: 'each day must be an integer between 0 and 6',
          });
        }
      }
      if (hasTarget) {
        issues.push({
          field: 'targetPerWeek',
          issue: 'must be null for SPECIFIC_DAYS habits',
        });
      }
      if (hasInterval) {
        issues.push({
          field: 'intervalDays',
          issue: 'must be null for INTERVAL-incompatible SPECIFIC_DAYS habits',
        });
      }
      break;
    }
    case 'TIMES_PER_WEEK': {
      if (!hasTarget) {
        issues.push({
          field: 'targetPerWeek',
          issue: 'must be between 1 and 7',
        });
      } else if (!Number.isInteger(target) || target < 1 || target > 7) {
        issues.push({
          field: 'targetPerWeek',
          issue: 'must be between 1 and 7',
        });
      }
      if (hasDays) {
        issues.push({
          field: 'scheduleDays',
          issue: 'must be empty for TIMES_PER_WEEK habits',
        });
      }
      if (hasInterval) {
        issues.push({
          field: 'intervalDays',
          issue: 'must be null for TIMES_PER_WEEK habits',
        });
      }
      break;
    }
    case 'INTERVAL': {
      if (!hasInterval) {
        issues.push({
          field: 'intervalDays',
          issue: 'must be between 2 and 365',
        });
      } else if (!Number.isInteger(interval) || interval < 2 || interval > 365) {
        issues.push({
          field: 'intervalDays',
          issue: 'must be between 2 and 365',
        });
      }
      if (hasDays) {
        issues.push({
          field: 'scheduleDays',
          issue: 'must be empty for INTERVAL habits',
        });
      }
      if (hasTarget) {
        issues.push({
          field: 'targetPerWeek',
          issue: 'must be null for INTERVAL habits',
        });
      }
      break;
    }
  }

  return issues;
}

type ScheduleFields = {
  scheduleType: z.infer<typeof scheduleTypeSchema>;
  scheduleDays?: number[] | undefined;
  targetPerWeek?: number | null | undefined;
  intervalDays?: number | null | undefined;
};

function withScheduleRefine<T extends z.ZodType>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const schedule = value as ScheduleFields;
    if (!schedule.scheduleType) return;

    for (const issue of validateScheduleFields(schedule)) {
      ctx.addIssue({
        code: 'custom',
        path: [issue.field],
        message: issue.issue,
      });
    }
  });
}

const measurementRefine = <T extends z.ZodType>(schema: T) =>
  schema.superRefine((value, ctx) => {
    const body = value as {
      targetValue?: number | null | undefined;
      unit?: string | null | undefined;
    };
    if (body.targetValue !== undefined && body.targetValue !== null) {
      if (!(body.targetValue > 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['targetValue'],
          message: 'must be a positive number',
        });
      }
      if (!body.unit) {
        ctx.addIssue({
          code: 'custom',
          path: ['unit'],
          message: 'is required when targetValue is set',
        });
      }
    }
  });

export const createHabitSchema = measurementRefine(
  withScheduleRefine(
    z.object({
      title: z.string().trim().min(1).max(80),
      description: z.string().trim().max(500).optional(),
      icon: z.string().trim().min(1).max(32).default('check'),
      color: colorSchema.default('#2B4CE0'),
      type: habitTypeSchema.default('BUILD'),
      scheduleType: scheduleTypeSchema.default('DAILY'),
      scheduleDays: z.array(z.number().int()).default([]),
      targetPerWeek: z.number().int().nullable().optional(),
      intervalDays: z.number().int().nullable().optional(),
      targetValue: z.number().positive().optional(),
      unit: z.string().trim().min(1).max(24).optional(),
      startDate: localDateStringSchema,
    }),
  ),
);

export const updateHabitSchema = measurementRefine(
  z
    .object({
      title: z.string().trim().min(1).max(80).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      icon: z.string().trim().min(1).max(32).optional(),
      color: colorSchema.optional(),
      type: habitTypeSchema.optional(),
      scheduleType: scheduleTypeSchema.optional(),
      scheduleDays: z.array(z.number().int()).optional(),
      targetPerWeek: z.number().int().nullable().optional(),
      intervalDays: z.number().int().nullable().optional(),
      targetValue: z.number().positive().nullable().optional(),
      unit: z.string().trim().min(1).max(24).nullable().optional(),
      startDate: localDateStringSchema.optional(),
    })
    .superRefine((value, ctx) => {
      const touchesSchedule =
        value.scheduleType !== undefined ||
        value.scheduleDays !== undefined ||
        value.targetPerWeek !== undefined ||
        value.intervalDays !== undefined;

      if (!touchesSchedule) return;

      if (!value.scheduleType) {
        ctx.addIssue({
          code: 'custom',
          path: ['scheduleType'],
          message: 'is required when changing schedule fields',
        });
        return;
      }

      for (const issue of validateScheduleFields({
        scheduleType: value.scheduleType,
        scheduleDays: value.scheduleDays,
        targetPerWeek: value.targetPerWeek,
        intervalDays: value.intervalDays,
      })) {
        ctx.addIssue({
          code: 'custom',
          path: [issue.field],
          message: issue.issue,
        });
      }
    }),
);

export const reorderHabitsSchema = z.object({
  ids: z.array(z.uuid()).min(1),
});

export const listHabitsQuerySchema = z.object({
  archived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const deleteHabitQuerySchema = z.object({
  confirm: z.literal('true'),
});

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
export type ReorderHabitsInput = z.infer<typeof reorderHabitsSchema>;
export type ListHabitsQuery = z.infer<typeof listHabitsQuerySchema>;
export type DeleteHabitQuery = z.infer<typeof deleteHabitQuerySchema>;

export type HabitResponse = {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  color: string;
  type: z.infer<typeof habitTypeSchema>;
  scheduleType: z.infer<typeof scheduleTypeSchema>;
  scheduleDays: number[];
  targetPerWeek: number | null;
  intervalDays: number | null;
  targetValue: number | null;
  unit: string | null;
  startDate: string;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentStreak: number;
  scheduleLabel: string;
};

export type HabitDetailResponse = HabitResponse & {
  completionRate: number;
  history: Array<{
    localDate: string;
    status: 'DONE' | 'PARTIAL' | 'SKIPPED';
    value: number | null;
    note: string | null;
  }>;
};
