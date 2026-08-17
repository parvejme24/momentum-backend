import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';

const passthrough: RequestHandler = (_req, _res, next) => {
  next();
};

function limit(windowMs: number, max: number): RequestHandler {
  return env.NODE_ENV === 'test'
    ? passthrough
    : rateLimit({
        windowMs,
        limit: max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, _res, next) => {
          next(new AppError('Too many requests', 429, 'RATE_LIMITED'));
        },
      });
}

export const authRateLimit: RequestHandler = limit(60_000, 5);

export const adminWriteRateLimit: RequestHandler = limit(60_000, 30);
