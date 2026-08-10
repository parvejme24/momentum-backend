import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import { hashRefreshToken } from '../src/lib/tokens.js';

export function createTestApp() {
  return createApp();
}

export async function cleanupUserByEmail(email: string): Promise<void> {
  await prisma.user.deleteMany({ where: { email } });
}

export async function cleanupUsersByEmails(emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

export async function closeTestResources(): Promise<void> {
  await prisma.$disconnect();
  await redis.quit().catch(() => undefined);
}

export async function registerUser(
  app: ReturnType<typeof createApp>,
  overrides: Partial<{
    email: string;
    password: string;
    name: string;
  }> = {},
) {
  const email = overrides.email ?? `user-${Date.now()}@example.com`;
  const password = overrides.password ?? 'password123';
  const name = overrides.name ?? 'Test User';

  const res = await request(app).post('/v1/auth/register').send({
    email,
    password,
    name,
  });

  return { res, email, password, name };
}

export { prisma, hashRefreshToken, request };
