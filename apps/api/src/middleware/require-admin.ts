import type { RequestHandler } from 'express';
import { getAuthStatus } from '../lib/auth-cache.js';
import { AppError } from '../lib/errors.js';

export const requireAdmin: RequestHandler = async (req, _res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      next(AppError.unauthorized('Authentication required'));
      return;
    }

    const user = req.authStatus ?? (await getAuthStatus(userId));

    if (!user || user.deletedAt) {
      next(AppError.unauthorized('User not found'));
      return;
    }

    if (user.bannedAt) {
      next(new AppError('This account has been banned', 403, 'ACCOUNT_BANNED'));
      return;
    }

    if (user.role !== 'ADMIN') {
      next(AppError.forbidden('Admin access required'));
      return;
    }

    req.authStatus = user;
    req.userRole = user.role;
    next();
  } catch (err) {
    next(err);
  }
};
