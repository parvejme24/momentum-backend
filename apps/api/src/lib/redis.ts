import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

function shouldUseTls(redisUrl: string, redisTlsFlag: boolean): boolean {
  if (redisUrl.startsWith('rediss://')) return true;
  // Prefer URL scheme: redis:// with REDIS_TLS=true is often a misconfig
  // (Redis Cloud non-TLS endpoints reject TLS handshakes).
  if (redisTlsFlag && redisUrl.startsWith('redis://')) {
    logger.warn(
      'REDIS_TLS=true but REDIS_URL uses redis://; connecting without TLS. Use rediss:// to enable TLS.',
    );
  }
  return false;
}

export function createRedisClient(): Redis {
  const useTls = shouldUseTls(env.REDIS_URL, env.REDIS_TLS);

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...(useTls ? { tls: {} } : {}),
  });

  client.on('error', (err: Error) => {
    logger.error({ err }, 'Redis client error');
  });

  return client;
}

export const redis = createRedisClient();
