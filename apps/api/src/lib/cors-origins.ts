import { env } from './env.js';

/** Always allowed in addition to `CORS_ORIGINS` from env. */
const BUILTIN_ORIGINS = [
  'http://localhost:3000',
  'https://momentum-pvj.vercel.app',
  'https://momentum-frontend-pi.vercel.app',
] as const;

export function corsOrigins(): string[] {
  return [...new Set([...env.CORS_ORIGINS, ...BUILTIN_ORIGINS])];
}
