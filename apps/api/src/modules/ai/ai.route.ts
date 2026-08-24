import {
  aiChatSchema,
  aiCreateHabitSchema,
  aiHabitIdeasSchema,
  aiHabitMessageSchema,
  aiSuggestionsSchema,
} from '@momentum/types';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { aiSuggestionsRateLimit, aiWriteRateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as aiController from './ai.controller.js';

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.get('/status', asyncHandler(aiController.status));
aiRouter.get('/features', asyncHandler(aiController.features));

aiRouter.post(
  '/suggestions',
  aiSuggestionsRateLimit,
  validate(aiSuggestionsSchema),
  asyncHandler(aiController.suggestions),
);

aiRouter.post(
  '/habit-ideas',
  aiWriteRateLimit,
  validate(aiHabitIdeasSchema),
  asyncHandler(aiController.habitIdeas),
);

aiRouter.post(
  '/habit-message',
  aiWriteRateLimit,
  validate(aiHabitMessageSchema),
  asyncHandler(aiController.habitMessage),
);

aiRouter.post('/chat', aiWriteRateLimit, validate(aiChatSchema), asyncHandler(aiController.chat));

aiRouter.post(
  '/create-habit',
  aiWriteRateLimit,
  validate(aiCreateHabitSchema),
  asyncHandler(aiController.createHabit),
);
