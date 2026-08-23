import {
  adminIdParamsSchema,
  createPaymentSchema,
  listAdminPaymentsQuerySchema,
  refundPaymentSchema,
  revenueQuerySchema,
  updatePaymentSchema,
} from '@momentum/types';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { adminWriteRateLimit } from '../../middleware/rate-limit.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as controller from './admin-payment.controller.js';

/** Mounted at `/v1/admin/payments` */
export const adminPaymentRouter = Router();

adminPaymentRouter.use(requireAuth, requireAdmin);

adminPaymentRouter.get(
  '/',
  validate(listAdminPaymentsQuerySchema, 'query'),
  asyncHandler(controller.list),
);

adminPaymentRouter.post(
  '/',
  adminWriteRateLimit,
  validate(createPaymentSchema),
  asyncHandler(controller.create),
);

adminPaymentRouter.get(
  '/:id',
  validate(adminIdParamsSchema, 'params'),
  asyncHandler(controller.get),
);

adminPaymentRouter.patch(
  '/:id',
  adminWriteRateLimit,
  validate(adminIdParamsSchema, 'params'),
  validate(updatePaymentSchema),
  asyncHandler(controller.update),
);

adminPaymentRouter.post(
  '/:id/refund',
  adminWriteRateLimit,
  validate(adminIdParamsSchema, 'params'),
  validate(refundPaymentSchema),
  asyncHandler(controller.refund),
);

/** Mounted at `/v1/admin/revenue` */
export const adminRevenueRouter = Router();

adminRevenueRouter.use(requireAuth, requireAdmin);

adminRevenueRouter.get(
  '/',
  validate(revenueQuerySchema, 'query'),
  asyncHandler(controller.revenue),
);
