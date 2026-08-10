import type { TodayQuery } from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as todayService from './today.service.js';

function requireUserId(req: Request): string {
  if (!req.userId) {
    throw AppError.unauthorized('Authentication required');
  }
  return req.userId;
}

export async function getToday(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as TodayQuery;
  const result = await todayService.getToday(requireUserId(req), query);
  res.status(200).json(result);
}
