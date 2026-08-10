import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.route.js';
import { deviceRouter } from './modules/device/device.route.js';
import { habitRouter } from './modules/habit/habit.route.js';
import { logsRouter } from './modules/log/log.route.js';
import { reminderRouter } from './modules/reminder/reminder.route.js';
import { statsRouter } from './modules/stats/stats.route.js';
import { todayRouter } from './modules/today/today.route.js';
import { apiRouter } from './routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== 'test',
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

  app.use(errorHandler);

  return app;
}
