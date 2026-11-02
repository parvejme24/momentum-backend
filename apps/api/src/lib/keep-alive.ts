import { env } from './env.js';
import { logger } from './logger.js';

const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;
const KEEP_ALIVE_TIMEOUT_MS = 30_000;

/**
 * Render's free plan sleeps a service after 15 minutes without inbound traffic.
 * Pinging our own PUBLIC url (never localhost — Render wouldn't count it) every
 * 10 minutes keeps it awake. Hits `/`, which never touches Postgres, so Neon can
 * still scale to zero.
 */
export function startKeepAlive(): void {
  if (env.NODE_ENV !== 'production') return;

  const baseUrl = env.RENDER_EXTERNAL_URL ?? env.API_URL;
  if (!baseUrl) {
    logger.warn('Keep-alive disabled: neither RENDER_EXTERNAL_URL nor API_URL is set');
    return;
  }

  const url = new URL('/', baseUrl).toString();

  const ping = async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(KEEP_ALIVE_TIMEOUT_MS) });
      logger.debug({ url, status: res.status }, 'Keep-alive ping');
    } catch (err) {
      logger.warn({ err, url }, 'Keep-alive ping failed');
    }
  };

  setInterval(() => {
    void ping();
  }, KEEP_ALIVE_INTERVAL_MS).unref();

  logger.info({ url, everyMinutes: KEEP_ALIVE_INTERVAL_MS / 60_000 }, 'Keep-alive started');
}
