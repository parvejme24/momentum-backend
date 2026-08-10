import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as deviceController from './device.controller.js';
import { deviceIdParamsSchema, registerDeviceSchema } from './device.schema.js';

export const deviceRouter = Router();

// Public: browser needs the VAPID key before it can subscribe.
deviceRouter.get('/vapid-public-key', asyncHandler(deviceController.vapidPublicKey));

deviceRouter.use(requireAuth);

deviceRouter.get('/', asyncHandler(deviceController.list));

deviceRouter.post('/', validate(registerDeviceSchema), asyncHandler(deviceController.register));

deviceRouter.delete(
  '/:deviceId',
  validate(deviceIdParamsSchema, 'params'),
  asyncHandler(deviceController.remove),
);
