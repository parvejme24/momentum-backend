import {
  adminUserIdParamsSchema,
  banUserSchema,
  grantPlanAccessSchema,
  listAdminUsersQuerySchema,
  updateAdminUserSchema,
} from '@momentum/types';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { adminWriteRateLimit } from '../../middleware/rate-limit.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as adminUserController from './admin-user.controller.js';

/** Mounted at `/v1/admin/users` */
export const adminUserRouter = Router();

adminUserRouter.use(requireAuth, requireAdmin);

adminUserRouter.get(
  '/',
  validate(listAdminUsersQuerySchema, 'query'),
  asyncHandler(adminUserController.list),
);

adminUserRouter.get(
  '/:id',
  validate(adminUserIdParamsSchema, 'params'),
  asyncHandler(adminUserController.get),
);

adminUserRouter.patch(
  '/:id',
  adminWriteRateLimit,
  validate(adminUserIdParamsSchema, 'params'),
  validate(updateAdminUserSchema),
  asyncHandler(adminUserController.update),
);

adminUserRouter.post(
  '/:id/ban',
  adminWriteRateLimit,
  validate(adminUserIdParamsSchema, 'params'),
  validate(banUserSchema),
  asyncHandler(adminUserController.ban),
);

adminUserRouter.post(
  '/:id/unban',
  adminWriteRateLimit,
  validate(adminUserIdParamsSchema, 'params'),
  asyncHandler(adminUserController.unban),
);

adminUserRouter.post(
  '/:id/trash',
  adminWriteRateLimit,
  validate(adminUserIdParamsSchema, 'params'),
  asyncHandler(adminUserController.trash),
);

adminUserRouter.post(
  '/:id/restore',
  adminWriteRateLimit,
  validate(adminUserIdParamsSchema, 'params'),
  asyncHandler(adminUserController.restore),
);

adminUserRouter.post(
  '/:id/grant-access',
  adminWriteRateLimit,
  validate(adminUserIdParamsSchema, 'params'),
  validate(grantPlanAccessSchema),
  asyncHandler(adminUserController.grantAccess),
);

adminUserRouter.delete(
  '/:id',
  adminWriteRateLimit,
  validate(adminUserIdParamsSchema, 'params'),
  asyncHandler(adminUserController.remove),
);
