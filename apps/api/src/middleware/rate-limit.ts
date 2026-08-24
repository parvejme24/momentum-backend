import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { env } from '../lib/env.js';
import { AppError } from '../lib/errors.js';

const passthrough: RequestHandler = (_req, _res, next) => {
  next();
};

function clientKey(req: Request, perUser: boolean): string {
  if (perUser && req.userId) return req.userId;
  return ipKeyGenerator(req.ip ?? 'unknown');
}

function limit(
  windowMs: number,
  max: number,
  options: { skipInDev?: boolean; perUser?: boolean } = {},
): RequestHandler {
  if (env.NODE_ENV === 'test' || (options.skipInDev && env.NODE_ENV === 'development')) {
    return passthrough;
  }

  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientKey(req, options.perUser === true),
    handler: (_req, _res, next) => {
      next(new AppError('Too many requests. Try again in a minute.', 429, 'RATE_LIMITED'));
    },
  });
}

export const authRateLimit: RequestHandler = limit(60_000, 5);

export const adminWriteRateLimit: RequestHandler = limit(60_000, 30);

export const billingWriteRateLimit: RequestHandler = limit(60_000, 20);

/** Auto-fetched panels (suggestions) — own bucket so chat does not starve them. */
export const aiSuggestionsRateLimit: RequestHandler = limit(60_000, 120, {
  skipInDev: true,
  perUser: true,
});

/** Chat / generate / create — more expensive Gemini calls. */
export const aiWriteRateLimit: RequestHandler = limit(60_000, 60, {
  skipInDev: true,
  perUser: true,
});
