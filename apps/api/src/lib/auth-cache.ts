import { env } from './env.js';
import { prisma } from './prisma.js';
import { redis } from './redis.js';

const AUTH_STATUS_TTL_SECONDS = 30;
const MEMORY_TTL_MS = 5_000;

export type AuthStatus = {
  role: 'CUSTOMER' | 'ADMIN';
  deletedAt: string | null;
  bannedAt: string | null;
};

const memoryCache = new Map<string, { expiresAt: number; status: AuthStatus }>();

function cacheKey(userId: string): string {
  return `momentum:auth:status:v2:${userId}`;
}

function readMemory(userId: string): AuthStatus | null {
  const hit = memoryCache.get(userId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(userId);
    return null;
  }
  return hit.status;
}

function writeMemory(userId: string, status: AuthStatus): void {
  memoryCache.set(userId, { expiresAt: Date.now() + MEMORY_TTL_MS, status });
}

async function loadAuthStatus(userId: string): Promise<AuthStatus | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: { role: true, deletedAt: true, bannedAt: true },
  });

  if (!user) return null;

  return {
    role: user.role,
    deletedAt: user.deletedAt?.toISOString() ?? null,
    bannedAt: user.bannedAt?.toISOString() ?? null,
  };
}

export async function getAuthStatus(userId: string): Promise<AuthStatus | null> {
  if (env.NODE_ENV === 'test') {
    return loadAuthStatus(userId);
  }

  const local = readMemory(userId);
  if (local) return local;

  const key = cacheKey(userId);

  try {
    const cached = await redis.get(key);
    if (cached) {
      const status = JSON.parse(cached) as AuthStatus;
      writeMemory(userId, status);
      return status;
    }
  } catch {
    // fall through to Postgres
  }

  const status = await loadAuthStatus(userId);
  if (!status) return null;

  writeMemory(userId, status);

  try {
    await redis.set(key, JSON.stringify(status), 'EX', AUTH_STATUS_TTL_SECONDS);
  } catch {
    // cache miss on next request
  }

  return status;
}

export async function invalidateAuthStatus(userId: string): Promise<void> {
  memoryCache.delete(userId);
  if (env.NODE_ENV === 'test') return;

  try {
    await redis.del(cacheKey(userId));
  } catch {
    // ignore
  }
}
