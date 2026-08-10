import type { HabitStatsQuery, OverviewStatsQuery } from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as statsService from './stats.service.js';

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

export async function getHabitStats(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as HabitStatsQuery;
  const result = await statsService.getHabitStats(requireUserId(req), requireHabitId(req), query);
  res.status(200).json(result);
}

export async function getOverview(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as OverviewStatsQuery;
  const result = await statsService.getOverviewStats(requireUserId(req), query);
  res.status(200).json(result);
}
