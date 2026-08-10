import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireHabitOwnership } from '../../middleware/ownership.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as statsController from './stats.controller.js';
import { habitStatsQuerySchema, overviewStatsQuerySchema } from './stats.schema.js';

/** Nested under `/v1/habits/:id/stats` */
export const habitStatsRouter = Router({ mergeParams: true });

habitStatsRouter.get(
  '/',
  requireHabitOwnership,
  validate(habitStatsQuerySchema, 'query'),
  asyncHandler(statsController.getHabitStats),
);

/** Mounted at `/v1/stats` */
export const statsRouter = Router();

statsRouter.use(requireAuth);

statsRouter.get(
  '/overview',
  validate(overviewStatsQuerySchema, 'query'),
  asyncHandler(statsController.getOverview),
);
