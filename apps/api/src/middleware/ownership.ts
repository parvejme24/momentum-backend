import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const requireHabitOwnership: RequestHandler = async (req, _res, next) => {
  try {
    const userId = req.userId;
    const rawId = req.params['id'];
    const habitId = typeof rawId === 'string' ? rawId : rawId?.[0];

    if (!userId) {
      next(AppError.unauthorized('Authentication required'));
      return;
    }

    if (!habitId) {
      next(AppError.notFound('Habit not found'));
      return;
    }

    const habit = await prisma.habit.findFirst({
      where: { id: habitId, userId },
    });

    if (!habit) {
      next(AppError.notFound('Habit not found'));
      return;
    }

    req.habit = habit;
    next();
  } catch (err) {
    next(err);
  }
};
