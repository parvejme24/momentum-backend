import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupUserByEmail,
  createTestApp,
  hashRefreshToken,
  prisma,
  registerUser,
  request,
} from './helpers.js';

const app = createTestApp();

const emails: string[] = [];

function trackEmail(email: string) {
  emails.push(email);
  return email;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const email of emails) {
    await cleanupUserByEmail(email);
  }
  await prisma.$disconnect();
});

describe('auth', () => {
  it('register succeeds and returns a token pair', async () => {
    const email = trackEmail(`reg-${Date.now()}@example.com`);
    const { res } = await registerUser(app, { email });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('register with a duplicate email returns CONFLICT', async () => {
    const email = trackEmail(`dup-${Date.now()}@example.com`);
    await registerUser(app, { email });

    const second = await request(app).post('/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Other User',
    });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('login with a wrong password returns UNAUTHORIZED', async () => {
    const email = trackEmail(`login-bad-${Date.now()}@example.com`);
    await registerUser(app, { email, password: 'password123' });

    const res = await request(app).post('/v1/auth/login').send({
      email,
      password: 'wrong-password',
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('login with an unknown email returns the same message as a wrong password', async () => {
    const unknown = await request(app)
      .post('/v1/auth/login')
      .send({
        email: `missing-${Date.now()}@example.com`,
        password: 'password123',
      });

    const email = trackEmail(`known-${Date.now()}@example.com`);
    await registerUser(app, { email, password: 'password123' });

    const wrongPassword = await request(app).post('/v1/auth/login').send({
      email,
      password: 'not-the-password',
    });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknown.body.error.code).toBe('UNAUTHORIZED');
    expect(wrongPassword.body.error.code).toBe('UNAUTHORIZED');
    expect(unknown.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('a protected route without a token returns UNAUTHORIZED', async () => {
    const res = await request(app).get('/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('a protected route with a valid token returns 200', async () => {
    const email = trackEmail(`me-${Date.now()}@example.com`);
    const { res: registered } = await registerUser(app, { email });

    const res = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${registered.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('refresh returns a new pair and the old refresh token stops working', async () => {
    const email = trackEmail(`refresh-${Date.now()}@example.com`);
    const { res: registered } = await registerUser(app, { email });
    const oldRefresh = registered.body.refreshToken as string;

    const refreshed = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: oldRefresh });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(oldRefresh);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    const reuseOld = await request(app).post('/v1/auth/refresh').send({ refreshToken: oldRefresh });

    expect(reuseOld.status).toBe(401);
    expect(reuseOld.body.error.code).toBe('UNAUTHORIZED');
  });

  it('reusing an already-revoked refresh token revokes the whole family', async () => {
    const email = trackEmail(`reuse-${Date.now()}@example.com`);
    const { res: registered } = await registerUser(app, { email });
    const firstRefresh = registered.body.refreshToken as string;

    const rotated = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: firstRefresh });

    expect(rotated.status).toBe(200);
    const secondRefresh = rotated.body.refreshToken as string;

    const reuse = await request(app).post('/v1/auth/refresh').send({ refreshToken: firstRefresh });

    expect(reuse.status).toBe(401);

    const secondAlsoDead = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: secondRefresh });

    expect(secondAlsoDead.status).toBe(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const active = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(active).toBe(0);
  });

  it('changePassword invalidates existing refresh tokens', async () => {
    const email = trackEmail(`pw-${Date.now()}@example.com`);
    const password = 'password123';
    const { res: registered } = await registerUser(app, { email, password });
    const refreshToken = registered.body.refreshToken as string;
    const accessToken = registered.body.accessToken as string;

    const changed = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        oldPassword: password,
        newPassword: 'newpassword123',
      });

    expect(changed.status).toBe(200);
    expect(changed.body.success).toBe(true);
    expect(changed.body.message).toEqual(expect.any(String));

    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });
    expect(row?.revokedAt).not.toBeNull();

    const refreshAfter = await request(app).post('/v1/auth/refresh').send({ refreshToken });

    expect(refreshAfter.status).toBe(401);
  });
});
