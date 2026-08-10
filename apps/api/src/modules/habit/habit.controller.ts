import type {
  CreateHabitInput,
  DeleteHabitQuery,
  ListHabitsQuery,
  ReorderHabitsInput,
  UpdateHabitInput,
} from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as habitService from './habit.service.js';

function requireUserId(req: Request): string {
  if (!req.userId) {
    throw AppError.unauthorized('Authentication required');
  }
  return req.userId;
}

function requireHabitId(req: Request): string {
  const rawId = req.params['id'];
  const id = typeof rawId === 'string' ? rawId : rawId?.[0];
  if (!id) {
    throw AppError.notFound('Habit not found');
  }
  return id;
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListHabitsQuery;
  const habits = await habitService.listHabits(requireUserId(req), query.archived);
  res.status(200).json({ habits });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateHabitInput;
  const habit = await habitService.createHabit(requireUserId(req), body);
  res.status(201).json({ habit });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const habit = await habitService.getHabit(requireUserId(req), requireHabitId(req));
  res.status(200).json({ habit });
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateHabitInput;
  const habit = await habitService.updateHabit(requireUserId(req), requireHabitId(req), body);
  res.status(200).json({ habit });
}

export async function reorder(req: Request, res: Response): Promise<void> {
  const body = req.body as ReorderHabitsInput;
  const habits = await habitService.reorderHabits(requireUserId(req), body.ids);
  res.status(200).json({ habits });
}

export async function archive(req: Request, res: Response): Promise<void> {
  const habit = await habitService.archiveHabit(requireUserId(req), requireHabitId(req));
  res.status(200).json({ habit });
}

export async function restore(req: Request, res: Response): Promise<void> {
  const habit = await habitService.restoreHabit(requireUserId(req), requireHabitId(req));
  res.status(200).json({ habit });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as DeleteHabitQuery;
  await habitService.deleteHabit(requireUserId(req), requireHabitId(req), query.confirm === 'true');
  res.status(200).json({
    success: true,
    message: 'Habit permanently deleted',
  });
}
