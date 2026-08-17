import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const requireAdmin: RequestHandler = async (req, _res, next) => {
  try {
    const userId = req.userId;
    if (!userId) {
      next(AppError.unauthorized('Authentication required'));
      return;
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { role: true },
    });

    if (!user) {
      next(AppError.unauthorized('User not found'));
      return;
    }

    if (user.role !== 'ADMIN') {
      next(AppError.forbidden('Admin access required'));
      return;
    }

    req.userRole = user.role;
    next();
  } catch (err) {
    next(err);
  }
};
