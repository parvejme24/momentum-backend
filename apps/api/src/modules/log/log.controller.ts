import type { LogRangeQuery, UpsertLogInput } from '@momentum/types';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import * as logService from './log.service.js';

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
    throw AppError.validation('Check the highlighted fields', [
      { field: key, issue: 'is required' },
    ]);
  }
  return value;
}

export async function upsert(req: Request, res: Response): Promise<void> {
  const result = await logService.upsertLog(
    requireUserId(req),
    requireParam(req, 'id'),
    requireParam(req, 'localDate'),
    req.body as UpsertLogInput,
  );
  res.status(200).json(result);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const result = await logService.deleteLog(
    requireUserId(req),
    requireParam(req, 'id'),
    requireParam(req, 'localDate'),
  );
  res.status(200).json(result);
}

export async function listForHabit(req: Request, res: Response): Promise<void> {
  const logs = await logService.listHabitLogs(
    requireUserId(req),
    requireParam(req, 'id'),
    req.query as unknown as LogRangeQuery,
  );
  res.status(200).json({ logs });
}

export async function listAll(req: Request, res: Response): Promise<void> {
  const logs = await logService.listUserLogs(
    requireUserId(req),
    req.query as unknown as LogRangeQuery,
  );
  res.status(200).json({ logs });
}
