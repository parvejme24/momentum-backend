import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './lib/env.js';
import { corsOrigins } from './lib/cors-origins.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.route.js';
import { deviceRouter } from './modules/device/device.route.js';
import { habitRouter } from './modules/habit/habit.route.js';
import { logsRouter } from './modules/log/log.route.js';
import { reminderRouter } from './modules/reminder/reminder.route.js';
import { statsRouter } from './modules/stats/stats.route.js';
import { todayRouter } from './modules/today/today.route.js';
import { adminUserRouter } from './modules/admin-user/admin-user.route.js';
import { adminSubscriptionRouter } from './modules/admin-subscription/admin-subscription.route.js';
import {
  adminPaymentRouter,
  adminRevenueRouter,
} from './modules/admin-payment/admin-payment.route.js';
import { adminPricingRouter, pricingRouter } from './modules/pricing/pricing.route.js';
import { billingRouter } from './modules/billing/billing.route.js';
import { mediaRouter } from './modules/media/media.route.js';
import {
  adminNotificationRouter,
  notificationRouter,
} from './modules/notification/notification.route.js';
import { aiRouter } from './modules/ai/ai.route.js';
import { adminAiRouter } from './modules/ai/ai-prompt.route.js';
import * as billingController from './modules/billing/billing.controller.js';
import { asyncHandler } from './utils/async-handler.js';
import { apiRouter } from './routes.js';
import { live, ready } from './modules/health/health.route.js';

const LIVE_PATHS = new Set(['/health', '/v1/health', '/api/health', '/ready', '/api/ready']);

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins(),
      credentials: true,
    }),
  );

  app.get('/health', live);
  app.get('/v1/health', live);
  app.get('/ready', asyncHandler(ready));

  app.post(
    '/v1/billing/webhook',
    express.raw({ type: 'application/json' }),
    asyncHandler(billingController.webhook),
  );

  app.post(
    '/v1/billing/sslcommerz/ipn',
    express.urlencoded({ extended: false }),
    asyncHandler(billingController.sslCommerzIpn),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging:
        env.NODE_ENV === 'test'
          ? false
          : {
              ignore: (req) => LIVE_PATHS.has(req.url?.split('?')[0] ?? ''),
            },
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: 'Welcome to Momentum API',
    });
  });

  app.use('/api', apiRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/habits', habitRouter);
  app.use('/v1/logs', logsRouter);
  app.use('/v1/today', todayRouter);
  app.use('/v1/stats', statsRouter);
  app.use('/v1/reminders', reminderRouter);
  app.use('/v1/devices', deviceRouter);
  app.use('/v1/pricing', pricingRouter);
  app.use('/v1/billing', billingRouter);
  app.use('/v1/media', mediaRouter);
  app.use('/v1/ai', aiRouter);
  app.use('/v1/admin/ai', adminAiRouter);
  app.use('/v1/notifications', notificationRouter);
  app.use('/v1/admin/users', adminUserRouter);
  app.use('/v1/admin/subscriptions', adminSubscriptionRouter);
  app.use('/v1/admin/payments', adminPaymentRouter);
  app.use('/v1/admin/revenue', adminRevenueRouter);
  app.use('/v1/admin/pricing', adminPricingRouter);
  app.use('/v1/admin/notifications', adminNotificationRouter);

  app.use(errorHandler);

  return app;
}
