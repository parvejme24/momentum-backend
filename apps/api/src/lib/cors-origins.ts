import { env } from './env.js';

/** Always allowed in addition to `CORS_ORIGINS` from env. Trailing slashes are stripped. */
const BUILTIN_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://momentum-pvj.vercel.app',
  'https://momentum-frontend-pi.vercel.app',
] as const;

const VERCEL_PREVIEW =
  /^https:\/\/(?:momentum-pvj|momentum-frontend-pi)(?:-[a-z0-9-]+)*\.vercel\.app$/i;

/** Local dev on any port (e.g. Next.js on 3001). */
const LOCALHOST_DEV = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/i;

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function corsOrigins(): string[] {
  return [...new Set([...env.CORS_ORIGINS.map(normalizeOrigin), ...BUILTIN_ORIGINS])];
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (corsOrigins().includes(normalized)) return true;
  if (LOCALHOST_DEV.test(normalized)) return true;
  return VERCEL_PREVIEW.test(normalized);
}
