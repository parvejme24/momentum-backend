import {
  aiPromptIdParamsSchema,
  createAiPromptSchema,
  listAdminAiPromptsQuerySchema,
  updateAiPromptSchema,
} from '@momentum/types';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { adminWriteRateLimit } from '../../middleware/rate-limit.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as aiPromptController from './ai-prompt.controller.js';

/** Mounted at `/v1/admin/ai`. */
export const adminAiRouter = Router();

adminAiRouter.use(requireAuth, requireAdmin);

adminAiRouter.get(
  '/prompts',
  validate(listAdminAiPromptsQuerySchema, 'query'),
  asyncHandler(aiPromptController.list),
);

adminAiRouter.post(
  '/prompts',
  adminWriteRateLimit,
  validate(createAiPromptSchema),
  asyncHandler(aiPromptController.create),
);

adminAiRouter.get(
  '/prompts/:id',
  validate(aiPromptIdParamsSchema, 'params'),
  asyncHandler(aiPromptController.get),
);

adminAiRouter.patch(
  '/prompts/:id',
  adminWriteRateLimit,
  validate(aiPromptIdParamsSchema, 'params'),
  validate(updateAiPromptSchema),
  asyncHandler(aiPromptController.update),
);

adminAiRouter.post(
  '/prompts/:id/publish',
  adminWriteRateLimit,
  validate(aiPromptIdParamsSchema, 'params'),
  asyncHandler(aiPromptController.publish),
);

adminAiRouter.post(
  '/prompts/:id/archive',
  adminWriteRateLimit,
  validate(aiPromptIdParamsSchema, 'params'),
  asyncHandler(aiPromptController.archive),
);

adminAiRouter.delete(
  '/prompts/:id',
  adminWriteRateLimit,
  validate(aiPromptIdParamsSchema, 'params'),
  asyncHandler(aiPromptController.remove),
);
