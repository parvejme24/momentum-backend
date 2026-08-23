import {
  adminIdParamsSchema,
  cancelSubscriptionSchema,
  createSubscriptionSchema,
  listAdminSubscriptionsQuerySchema,
  renewSubscriptionSchema,
  updateSubscriptionSchema,
} from '@momentum/types';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { adminWriteRateLimit } from '../../middleware/rate-limit.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './admin-subscription.controller.js';

/** Mounted at `/v1/admin/subscriptions` */
export const adminSubscriptionRouter = Router();

adminSubscriptionRouter.use(requireAuth, requireAdmin);

adminSubscriptionRouter.get(
  '/',
  validate(listAdminSubscriptionsQuerySchema, 'query'),
  asyncHandler(controller.list),
);

adminSubscriptionRouter.post(
  '/',
  adminWriteRateLimit,
  validate(createSubscriptionSchema),
  asyncHandler(controller.create),
);

adminSubscriptionRouter.get(
  '/:id',
  validate(adminIdParamsSchema, 'params'),
  asyncHandler(controller.get),
);

adminSubscriptionRouter.patch(
  '/:id',
  adminWriteRateLimit,
  validate(adminIdParamsSchema, 'params'),
  validate(updateSubscriptionSchema),
  asyncHandler(controller.update),
);

adminSubscriptionRouter.post(
  '/:id/cancel',
  adminWriteRateLimit,
  validate(adminIdParamsSchema, 'params'),
  validate(cancelSubscriptionSchema),
  asyncHandler(controller.cancel),
);

adminSubscriptionRouter.post(
  '/:id/renew',
  adminWriteRateLimit,
  validate(adminIdParamsSchema, 'params'),
  validate(renewSubscriptionSchema),
  asyncHandler(controller.renew),
);
