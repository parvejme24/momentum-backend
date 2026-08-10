import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as todayController from './today.controller.js';
import { todayQuerySchema } from './today.schema.js';

export const todayRouter = Router();

todayRouter.use(requireAuth);

todayRouter.get('/', validate(todayQuerySchema, 'query'), asyncHandler(todayController.getToday));
