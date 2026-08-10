import { addDays, dayOfWeek, isDue, localDate, type HabitSchedule } from '@momentum/core';
import type {
  CreateReminderInput,
  CreateReminderResponse,
  GroupedRemindersResponse,
  ReminderResponse,
  UpdateReminderInput,
} from '@momentum/types';
import type { Habit, Reminder } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

const MAX_REMINDERS_PER_HABIT = 5;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function toSchedule(habit: Habit): HabitSchedule {
  return {
    scheduleType: habit.scheduleType,
    scheduleDays: habit.scheduleDays,
    targetPerWeek: habit.targetPerWeek,
    intervalDays: habit.intervalDays,
    startDate: localDate(habit.startDate),
  };
}

function toPublicReminder(reminder: Reminder): ReminderResponse {
  return {
    id: reminder.id,
    habitId: reminder.habitId,
    timeLocal: reminder.timeLocal,
    daysOfWeek: reminder.daysOfWeek,
    enabled: reminder.enabled,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  };
}

function sameDays(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

function canEverBeDueOnWeekday(schedule: HabitSchedule, dow: number): boolean {
  if (schedule.scheduleType === 'DAILY' || schedule.scheduleType === 'TIMES_PER_WEEK') {
    return true;
  }
  if (schedule.scheduleType === 'SPECIFIC_DAYS') {
    return schedule.scheduleDays.includes(dow);
  }

  for (let i = 0; i < 366 * 2; i += 1) {
    const date = addDays(schedule.startDate, i);
    if (dayOfWeek(date) === dow && isDue(schedule, date)) {
      return true;
    }
  }
  return false;
}

function scheduleWarnings(habit: Habit, daysOfWeek: number[]): string[] {
  const schedule = toSchedule(habit);
  const warnings: string[] = [];

  for (const day of daysOfWeek) {
    if (canEverBeDueOnWeekday(schedule, day)) continue;
    const name = WEEKDAY_NAMES[day] ?? String(day);
    warnings.push(`This habit is never due on ${name}, so that reminder won't fire`);
  }

  return warnings;
}

async function requireOwnedHabit(userId: string, habitId: string): Promise<Habit> {
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId },
  });
  if (!habit) throw AppError.notFound('Habit not found');
  return habit;
}

async function requireOwnedReminder(userId: string, reminderId: string): Promise<Reminder> {
  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, habit: { userId } },
  });
  if (!reminder) throw AppError.notFound('Reminder not found');
  return reminder;
}

async function assertNoDuplicate(
  habitId: string,
  timeLocal: string,
  daysOfWeek: number[],
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.reminder.findMany({
    where: {
      habitId,
      timeLocal,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  if (existing.some((row) => sameDays(row.daysOfWeek, daysOfWeek))) {
    throw AppError.conflict('A reminder with this time and days already exists for this habit');
  }
}

export async function listHabitReminders(
  userId: string,
  habitId: string,
): Promise<ReminderResponse[]> {
  await requireOwnedHabit(userId, habitId);

  const reminders = await prisma.reminder.findMany({
    where: { habitId },
    orderBy: [{ timeLocal: 'asc' }, { createdAt: 'asc' }],
  });

  return reminders.map(toPublicReminder);
}

export async function createReminder(
  userId: string,
  habitId: string,
  input: CreateReminderInput,
): Promise<CreateReminderResponse> {
  const habit = await requireOwnedHabit(userId, habitId);

  const count = await prisma.reminder.count({ where: { habitId } });
  if (count >= MAX_REMINDERS_PER_HABIT) {
    throw AppError.conflict(`A habit can have at most ${MAX_REMINDERS_PER_HABIT} reminders`);
  }

  await assertNoDuplicate(habitId, input.timeLocal, input.daysOfWeek);

  const reminder = await prisma.reminder.create({
    data: {
      habitId,
      timeLocal: input.timeLocal,
      daysOfWeek: input.daysOfWeek,
      enabled: input.enabled,
    },
  });

  return {
    reminder: toPublicReminder(reminder),
    warnings: scheduleWarnings(habit, input.daysOfWeek),
  };
}

export async function updateReminder(
  userId: string,
  reminderId: string,
  input: UpdateReminderInput,
): Promise<CreateReminderResponse> {
  const existing = await requireOwnedReminder(userId, reminderId);
  const habit = await requireOwnedHabit(userId, existing.habitId);

  const timeLocal = input.timeLocal ?? existing.timeLocal;
  const daysOfWeek = input.daysOfWeek ?? existing.daysOfWeek;
  const enabled = input.enabled ?? existing.enabled;

  await assertNoDuplicate(existing.habitId, timeLocal, daysOfWeek, existing.id);

  const reminder = await prisma.reminder.update({
    where: { id: existing.id },
    data: { timeLocal, daysOfWeek, enabled },
  });

  return {
    reminder: toPublicReminder(reminder),
    warnings: scheduleWarnings(habit, daysOfWeek),
  };
}

export async function deleteReminder(userId: string, reminderId: string): Promise<void> {
  const existing = await requireOwnedReminder(userId, reminderId);
  await prisma.reminder.delete({ where: { id: existing.id } });
}

export async function listGroupedReminders(userId: string): Promise<GroupedRemindersResponse> {
  const habits = await prisma.habit.findMany({
    where: { userId, archivedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      reminders: {
        orderBy: [{ timeLocal: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  return {
    habits: habits.map((habit) => ({
      habitId: habit.id,
      title: habit.title,
      icon: habit.icon,
      reminders: habit.reminders.map(toPublicReminder),
    })),
  };
}
