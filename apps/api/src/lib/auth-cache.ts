import { env } from './env.js';
import { prisma } from './prisma.js';
import { redis } from './redis.js';

const AUTH_STATUS_TTL_SECONDS = 30;

export type AuthStatus = {
  deletedAt: string | null;
  bannedAt: string | null;
};

function cacheKey(userId: string): string {
  return `momentum:auth:status:${userId}`;
}

async function loadAuthStatus(userId: string): Promise<AuthStatus | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { deletedAt: true, bannedAt: true },
  });

  if (!user) return null;

  return {
    deletedAt: user.deletedAt?.toISOString() ?? null,
    bannedAt: user.bannedAt?.toISOString() ?? null,
  };
}

export async function getAuthStatus(userId: string): Promise<AuthStatus | null> {
  if (env.NODE_ENV === 'test') {
    return loadAuthStatus(userId);
  }

  const key = cacheKey(userId);

  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as AuthStatus;
    }
  } catch {
    // fall through to Postgres
  }

  const status = await loadAuthStatus(userId);
  if (!status) return null;

  try {
    await redis.set(key, JSON.stringify(status), 'EX', AUTH_STATUS_TTL_SECONDS);
  } catch {
    // cache miss on next request
  }

  return status;
}

export async function invalidateAuthStatus(userId: string): Promise<void> {
  if (env.NODE_ENV === 'test') return;

  try {
    await redis.del(cacheKey(userId));
  } catch {
    // ignore
  }
}
