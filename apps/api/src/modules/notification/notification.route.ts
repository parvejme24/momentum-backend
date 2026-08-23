import { listNotificationsQuerySchema, notificationIdParamsSchema } from '@momentum/types';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { adminNotifications, userNotifications } from './notification.controller.js';

/** Mounted at `/v1/notifications` */
export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get(
  '/',
  validate(listNotificationsQuerySchema, 'query'),
  asyncHandler(userNotifications.list),
);

notificationRouter.get('/unread-count', asyncHandler(userNotifications.unread));

notificationRouter.post('/read-all', asyncHandler(userNotifications.readAll));

notificationRouter.post(
  '/:id/read',
  validate(notificationIdParamsSchema, 'params'),
  asyncHandler(userNotifications.read),
);

notificationRouter.delete(
  '/:id',
  validate(notificationIdParamsSchema, 'params'),
  asyncHandler(userNotifications.remove),
);

/** Mounted at `/v1/admin/notifications` */
export const adminNotificationRouter = Router();

adminNotificationRouter.use(requireAuth, requireAdmin);

adminNotificationRouter.get(
  '/',
  validate(listNotificationsQuerySchema, 'query'),
  asyncHandler(adminNotifications.list),
);

adminNotificationRouter.get('/unread-count', asyncHandler(adminNotifications.unread));

adminNotificationRouter.post('/read-all', asyncHandler(adminNotifications.readAll));

adminNotificationRouter.post(
  '/:id/read',
  validate(notificationIdParamsSchema, 'params'),
  asyncHandler(adminNotifications.read),
);

adminNotificationRouter.delete(
  '/:id',
  validate(notificationIdParamsSchema, 'params'),
  asyncHandler(adminNotifications.remove),
);
