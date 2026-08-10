import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { authRateLimit } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import * as authController from './auth.controller.js';
import {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  updateMeSchema,
} from './auth.schema.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimit,
  validate(registerSchema),
  asyncHandler(authController.register),
);

authRouter.post('/login', authRateLimit, validate(loginSchema), asyncHandler(authController.login));

authRouter.post(
  '/refresh',
  authRateLimit,
  validate(refreshSchema),
  asyncHandler(authController.refresh),
);

authRouter.post('/logout', validate(logoutSchema), asyncHandler(authController.logout));

authRouter.post('/logout-all', requireAuth, asyncHandler(authController.logoutAll));

authRouter.get('/me', requireAuth, asyncHandler(authController.me));

authRouter.patch(
  '/me',
  requireAuth,
  validate(updateMeSchema),
  asyncHandler(authController.updateMe),
);

authRouter.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(authController.changePassword),
);
