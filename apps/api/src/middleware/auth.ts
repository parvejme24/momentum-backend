import type { RequestHandler } from 'express';
import { getAuthStatus } from '../lib/auth-cache.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from '../lib/errors.js';

export const requireAuth: RequestHandler = async (req, _res, next) => {
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
    const user = await getAuthStatus(payload.sub);

    if (!user || user.deletedAt) {
      next(AppError.unauthorized('Authentication required'));
      return;
    }

    if (user.bannedAt) {
      next(new AppError('This account has been banned', 403, 'ACCOUNT_BANNED'));
      return;
    }

    req.userId = payload.sub;
    next();
  } catch (err) {
    next(err);
  }
};
