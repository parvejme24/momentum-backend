import { z } from 'zod';

export const timeLocalSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM in 24-hour form (e.g. 07:30)');

export const daysOfWeekSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, 'must include at least one day')
  .max(7)
  .refine((days) => new Set(days).size === days.length, {
    message: 'must be unique',
  });

export const createReminderSchema = z.object({
  timeLocal: timeLocalSchema,
  daysOfWeek: daysOfWeekSchema.default([0, 1, 2, 3, 4, 5, 6]),
  enabled: z.boolean().default(true),
});

export const updateReminderSchema = z
  .object({
    timeLocal: timeLocalSchema.optional(),
    daysOfWeek: daysOfWeekSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field is required',
  });

export const reminderIdParamsSchema = z.object({
  reminderId: z.string().uuid(),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type ReminderIdParams = z.infer<typeof reminderIdParamsSchema>;

export type ReminderResponse = {
  id: string;
  habitId: string;
  timeLocal: string;
  daysOfWeek: number[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateReminderResponse = {
  reminder: ReminderResponse;
  warnings: string[];
};

export type ReminderHabitGroup = {
  habitId: string;
  title: string;
  icon: string;
  reminders: ReminderResponse[];
};

export type GroupedRemindersResponse = {
  habits: ReminderHabitGroup[];
};
