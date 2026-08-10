import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';

const passthrough: RequestHandler = (_req, _res, next) => {
  next();
};

export const authRateLimit: RequestHandler =
  env.NODE_ENV === 'test'
    ? passthrough
    : rateLimit({
        windowMs: 60_000,
        limit: 5,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, _res, next) => {
          next(new AppError('Too many requests', 429, 'RATE_LIMITED'));
        },
      });
