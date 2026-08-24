import type { Request, Response } from 'express';
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { asyncHandler } from '../../utils/async-handler.js';

export function live(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
  });
}

export async function ready(_req: Request, res: Response): Promise<void> {
  const [redisOk, dbOk] = await Promise.all([
    redis
      .ping()
      .then((result) => result === 'PONG')
      .catch(() => false),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
  ]);

  const healthy = redisOk && dbOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    checks: {
      redis: redisOk ? 'up' : 'down',
      db: dbOk ? 'up' : 'down',
    },
  });
}

export const healthRouter = Router();

healthRouter.get('/health', live);
healthRouter.get('/ready', asyncHandler(ready));
