import { Router } from 'express';
import { redis } from '../../lib/redis.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const redisOk = await redis
    .ping()
    .then((result) => result === 'PONG')
    .catch(() => false);

  const healthy = redisOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    checks: {
      redis: redisOk ? 'up' : 'down',
    },
  });
});
