import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireHabitOwnership } from '../../middleware/ownership.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { habitLogRouter } from '../log/log.route.js';
import * as habitController from './habit.controller.js';
import {
  createHabitSchema,
  deleteHabitQuerySchema,
  listHabitsQuerySchema,
  reorderHabitsSchema,
  updateHabitSchema,
} from './habit.schema.js';

export const habitRouter = Router();

habitRouter.use(requireAuth);

habitRouter.get('/', validate(listHabitsQuerySchema, 'query'), asyncHandler(habitController.list));

habitRouter.post('/', validate(createHabitSchema), asyncHandler(habitController.create));

habitRouter.patch('/reorder', validate(reorderHabitsSchema), asyncHandler(habitController.reorder));

// Nested log routes before bare `/:id` handlers for clarity
habitRouter.use('/:id/logs', habitLogRouter);

habitRouter.get('/:id', requireHabitOwnership, asyncHandler(habitController.getById));

habitRouter.patch(
  '/:id',
  requireHabitOwnership,
  validate(updateHabitSchema),
  asyncHandler(habitController.update),
);

habitRouter.post('/:id/archive', requireHabitOwnership, asyncHandler(habitController.archive));

habitRouter.post('/:id/restore', requireHabitOwnership, asyncHandler(habitController.restore));

habitRouter.delete(
  '/:id',
  requireHabitOwnership,
  validate(deleteHabitQuerySchema, 'query'),
  asyncHandler(habitController.remove),
);
