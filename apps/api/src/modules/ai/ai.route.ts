import { aiHabitIdeasSchema, aiHabitMessageSchema, aiSuggestionsSchema } from '@momentum/types';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as aiController from './ai.controller.js';

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.get('/status', asyncHandler(aiController.status));

aiRouter.post(
  '/suggestions',
  validate(aiSuggestionsSchema),
  asyncHandler(aiController.suggestions),
);

aiRouter.post('/habit-ideas', validate(aiHabitIdeasSchema), asyncHandler(aiController.habitIdeas));

aiRouter.post(
  '/habit-message',
  validate(aiHabitMessageSchema),
  asyncHandler(aiController.habitMessage),
);
