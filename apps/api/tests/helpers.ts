import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashRefreshToken } from '../src/lib/tokens.js';

export function createTestApp() {
  return createApp();
}

export async function cleanupUserByEmail(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
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
