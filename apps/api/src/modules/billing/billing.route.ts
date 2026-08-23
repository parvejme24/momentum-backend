import {
  billingPortalSchema,
  cancelBillingSchema,
  checkoutSchema,
  confirmCheckoutSchema,
} from '@momentum/types';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { billingWriteRateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as billingController from './billing.controller.js';

/** Mounted at `/v1/billing` */
export const billingRouter = Router();

billingRouter.get('/config', asyncHandler(billingController.config));

billingRouter.use(requireAuth);

billingRouter.get('/entitlements', asyncHandler(billingController.entitlements));
billingRouter.get('/subscription', asyncHandler(billingController.me));
billingRouter.get('/invoices', asyncHandler(billingController.invoices));

billingRouter.post(
  '/checkout',
  billingWriteRateLimit,
  validate(checkoutSchema),
  asyncHandler(billingController.checkout),
);

billingRouter.post(
  '/confirm',
  billingWriteRateLimit,
  validate(confirmCheckoutSchema),
  asyncHandler(billingController.confirm),
);

billingRouter.post(
  '/portal',
  billingWriteRateLimit,
  validate(billingPortalSchema),
  asyncHandler(billingController.portal),
);

billingRouter.post(
  '/cancel',
  billingWriteRateLimit,
  validate(cancelBillingSchema),
  asyncHandler(billingController.cancel),
);
