import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from '../lib/errors.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(err);
  }
};
