import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { adminWriteRateLimit } from '../../middleware/rate-limit.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as pricingController from './pricing.controller.js';
import {
  createPlanSchema,
  listAdminPlansQuerySchema,
  planIdParamsSchema,
  planSlugParamsSchema,
  reorderPlansSchema,
  updatePlanSchema,
} from './pricing.schema.js';

/** Public + signed-in catalog. Mounted at `/v1/pricing`. */
export const pricingRouter = Router();

pricingRouter.get('/plans', asyncHandler(pricingController.listPublic));
pricingRouter.get('/compare', asyncHandler(pricingController.compare));
pricingRouter.get(
  '/plans/:slug',
  validate(planSlugParamsSchema, 'params'),
  asyncHandler(pricingController.getPublicBySlug),
);

/** Admin catalog. Mounted at `/v1/admin/pricing`. */
export const adminPricingRouter = Router();

adminPricingRouter.use(requireAuth, requireAdmin);

adminPricingRouter.get(
  '/plans',
  validate(listAdminPlansQuerySchema, 'query'),
  asyncHandler(pricingController.listAdmin),
);

adminPricingRouter.post(
  '/plans',
  adminWriteRateLimit,
  validate(createPlanSchema),
  asyncHandler(pricingController.create),
);

adminPricingRouter.post(
  '/plans/reorder',
  adminWriteRateLimit,
  validate(reorderPlansSchema),
  asyncHandler(pricingController.reorder),
);

adminPricingRouter.get(
  '/plans/:id',
  validate(planIdParamsSchema, 'params'),
  asyncHandler(pricingController.getAdmin),
);

adminPricingRouter.patch(
  '/plans/:id',
  adminWriteRateLimit,
  validate(planIdParamsSchema, 'params'),
  validate(updatePlanSchema),
  asyncHandler(pricingController.update),
);

adminPricingRouter.post(
  '/plans/:id/publish',
  adminWriteRateLimit,
  validate(planIdParamsSchema, 'params'),
  asyncHandler(pricingController.publish),
);

adminPricingRouter.post(
  '/plans/:id/archive',
  adminWriteRateLimit,
  validate(planIdParamsSchema, 'params'),
  asyncHandler(pricingController.archive),
);

adminPricingRouter.delete(
  '/plans/:id',
  adminWriteRateLimit,
  validate(planIdParamsSchema, 'params'),
  asyncHandler(pricingController.remove),
);
