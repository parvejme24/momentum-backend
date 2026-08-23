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

export async function grantProAccess(
  app: ReturnType<typeof createApp>,
  userId: string,
  input: {
    planSlug?: 'pro-year' | 'pro-lifetime';
    accessType?: 'timed' | 'lifetime';
    days?: number;
  } = {},
) {
  const adminEmail = `grant-admin-${Date.now()}-${Math.random()}@example.com`;
  const { res: adminReg } = await registerUser(app, { email: adminEmail, name: 'Grant Admin' });
  await prisma.user.update({
    where: { id: adminReg.body.user.id as string },
    data: { role: 'ADMIN' },
  });

  const planSlug = input.planSlug ?? 'pro-lifetime';
  const accessType = input.accessType ?? 'lifetime';

  const res = await request(app)
    .post(`/v1/admin/users/${userId}/grant-access`)
    .set('Authorization', `Bearer ${adminReg.body.accessToken as string}`)
    .send({
      planSlug,
      accessType,
      ...(input.days !== undefined ? { days: input.days } : {}),
    });

  return { res, adminEmail };
}

export { prisma, hashRefreshToken, request };
