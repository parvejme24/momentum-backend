import type { CreateReminderInput, UpdateReminderInput } from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as reminderService from './reminder.service.js';

function requireUserId(req: Request): string {
  if (!req.userId) {
    throw AppError.unauthorized('Authentication required');
  }
  return req.userId;
}

function requireParam(req: Request, key: string): string {
  const raw = req.params[key];
  const value = typeof raw === 'string' ? raw : raw?.[0];
  if (!value) {
    throw AppError.notFound('Not found');
  }
  return value;
}

export async function listForHabit(req: Request, res: Response): Promise<void> {
  const reminders = await reminderService.listHabitReminders(
    requireUserId(req),
    requireParam(req, 'id'),
  );
  res.status(200).json({ reminders });
}

export async function create(req: Request, res: Response): Promise<void> {
  const result = await reminderService.createReminder(
    requireUserId(req),
    requireParam(req, 'id'),
    req.body as CreateReminderInput,
  );
  res.status(201).json(result);
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await reminderService.updateReminder(
    requireUserId(req),
    requireParam(req, 'reminderId'),
    req.body as UpdateReminderInput,
  );
  res.status(200).json(result);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await reminderService.deleteReminder(requireUserId(req), requireParam(req, 'reminderId'));
  res.status(200).json({ success: true });
}

export async function listGrouped(req: Request, res: Response): Promise<void> {
  const result = await reminderService.listGroupedReminders(requireUserId(req));
  res.status(200).json(result);
}
