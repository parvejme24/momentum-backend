import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireHabitOwnership } from '../../middleware/ownership.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as logController from './log.controller.js';
import { habitLogParamsSchema, logRangeQuerySchema, upsertLogSchema } from './log.schema.js';

/** Nested under `/v1/habits` */
export const habitLogRouter = Router({ mergeParams: true });

habitLogRouter.put(
  '/:localDate',
  requireHabitOwnership,
  validate(habitLogParamsSchema, 'params'),
  validate(upsertLogSchema),
  asyncHandler(logController.upsert),
);

habitLogRouter.delete(
  '/:localDate',
  requireHabitOwnership,
  validate(habitLogParamsSchema, 'params'),
  asyncHandler(logController.remove),
);

habitLogRouter.get(
  '/',
  requireHabitOwnership,
  validate(logRangeQuerySchema, 'query'),
  asyncHandler(logController.listForHabit),
);

/** Mounted at `/v1/logs` */
export const logsRouter = Router();

logsRouter.use(requireAuth);

logsRouter.get('/', validate(logRangeQuerySchema, 'query'), asyncHandler(logController.listAll));
