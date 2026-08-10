import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, todayIn } from '@momentum/core';
import {
  cleanupUsersByEmails,
  closeTestResources,
  createTestApp,
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

async function authHeaders(prefix: string, timezone = 'Asia/Dhaka') {
  const email = trackEmail(`${prefix}-${Date.now()}@example.com`);
  const { res } = await registerUser(app, { email });
  expect(res.status).toBe(201);

  if (timezone !== 'Asia/Dhaka') {
    const patched = await request(app)
      .patch('/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .send({ timezone });
    expect(patched.status).toBe(200);
  }

  return {
    email,
    userId: res.body.user.id as string,
    token: res.body.accessToken as string,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
    timezone,
  };
}

async function createDailyHabit(
  auth: { Authorization: string },
  startDate: string,
  extras: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/v1/habits')
    .set(auth)
    .send({
      title: 'Log habit',
      startDate,
      scheduleType: 'DAILY',
      ...extras,
    });
  expect(res.status).toBe(201);
  return res.body.habit.id as string;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('logs', () => {
  it('PUT same day twice is idempotent; second PUT updates status', async () => {
    const { auth, userId } = await authHeaders('idem');
    const today = todayIn('Asia/Dhaka');
    const habitId = await createDailyHabit(auth, addDays(today, -10));

    const first = await request(app)
      .put(`/v1/habits/${habitId}/logs/${today}`)
      .set(auth)
      .send({ status: 'DONE' });
    expect(first.status).toBe(200);
    expect(first.body.log.status).toBe('DONE');

    const second = await request(app)
      .put(`/v1/habits/${habitId}/logs/${today}`)
      .set(auth)
      .send({ status: 'SKIPPED' });
    expect(second.status).toBe(200);
    expect(second.body.log.status).toBe('SKIPPED');

    const count = await prisma.habitLog.count({ where: { habitId, userId } });
    expect(count).toBe(1);
  });

  it('DELETE a day that was never logged returns 200 with log null', async () => {
    const { auth } = await authHeaders('del-missing');
    const today = todayIn('Asia/Dhaka');
    const habitId = await createDailyHabit(auth, addDays(today, -10));

    const res = await request(app).delete(`/v1/habits/${habitId}/logs/${today}`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.log).toBeNull();
    expect(res.body.streak).toEqual(
      expect.objectContaining({
        current: expect.any(Number),
        longest: expect.any(Number),
      }),
    );
  });

  it('rejects tomorrow, 8 days ago, before startDate, and invalid calendar dates', async () => {
    const { auth } = await authHeaders('dates');
    const today = todayIn('Asia/Dhaka');
    const start = addDays(today, -3);
    const habitId = await createDailyHabit(auth, start);

    const tomorrow = await request(app)
      .put(`/v1/habits/${habitId}/logs/${addDays(today, 1)}`)
      .set(auth)
      .send({});
    expect(tomorrow.status).toBe(400);
    expect(tomorrow.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ issue: "can't log a future date" })]),
    );

    const eightAgo = await request(app)
      .put(`/v1/habits/${habitId}/logs/${addDays(today, -8)}`)
      .set(auth)
      .send({});
    expect(eightAgo.status).toBe(400);
    expect(eightAgo.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issue: "can't log more than 7 days back" }),
      ]),
    );

    const sevenAgo = await request(app)
      .put(`/v1/habits/${habitId}/logs/${addDays(today, -7)}`)
      .set(auth)
      .send({});
    // May fail if startDate is only 3 days ago
    const sevenOkHabit = await createDailyHabit(auth, addDays(today, -10));
    const sevenOk = await request(app)
      .put(`/v1/habits/${sevenOkHabit}/logs/${addDays(today, -7)}`)
      .set(auth)
      .send({});
    expect(sevenOk.status).toBe(200);
    expect(sevenAgo.status).toBe(400); // before this habit's start

    const beforeStart = await request(app)
      .put(`/v1/habits/${habitId}/logs/${addDays(start, -1)}`)
      .set(auth)
      .send({});
    expect(beforeStart.status).toBe(400);

    const invalid = await request(app)
      .put(`/v1/habits/${habitId}/logs/2026-02-30`)
      .set(auth)
      .send({});
    expect(invalid.status).toBe(400);
  });

  it('Kiritimati user can log a date that is still tomorrow in UTC', async () => {
    const { auth, timezone } = await authHeaders('kiri', 'Pacific/Kiritimati');
    const theirToday = todayIn(timezone);
    const utcToday = todayIn('UTC');

    // Only meaningful when Kiritimati is ahead of UTC
    if (theirToday <= utcToday) {
      expect(true).toBe(true);
      return;
    }

    const habitId = await createDailyHabit(auth, addDays(theirToday, -5));
    const res = await request(app)
      .put(`/v1/habits/${habitId}/logs/${theirToday}`)
      .set(auth)
      .send({ status: 'DONE' });

    expect(res.status).toBe(200);
    expect(res.body.log.localDate).toBe(theirToday);
  });

  it('value below target becomes PARTIAL; value on yes/no habit rejected', async () => {
    const { auth } = await authHeaders('value');
    const today = todayIn('Asia/Dhaka');

    const measurable = await createDailyHabit(auth, addDays(today, -5), {
      title: 'Read',
      targetValue: 30,
      unit: 'pages',
    });

    const partial = await request(app)
      .put(`/v1/habits/${measurable}/logs/${today}`)
      .set(auth)
      .send({ value: 10 });
    expect(partial.status).toBe(200);
    expect(partial.body.log.status).toBe('PARTIAL');
    expect(partial.body.log.value).toBe(10);

    const binary = await createDailyHabit(auth, addDays(today, -5), {
      title: 'Meditate',
    });
    const rejected = await request(app)
      .put(`/v1/habits/${binary}/logs/${today}`)
      .set(auth)
      .send({ value: 1 });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'value' })]),
    );
  });

  it('SKIPPED does not break the streak', async () => {
    const { auth, userId } = await authHeaders('skip');
    const today = todayIn('Asia/Dhaka');
    const habitId = await createDailyHabit(auth, addDays(today, -10));

    for (let i = 5; i >= 1; i -= 1) {
      await prisma.habitLog.create({
        data: {
          habitId,
          userId,
          localDate: new Date(`${addDays(today, -i)}T00:00:00.000Z`),
          status: 'DONE',
        },
      });
    }

    const skipped = await request(app)
      .put(`/v1/habits/${habitId}/logs/${today}`)
      .set(auth)
      .send({ status: 'SKIPPED' });

    expect(skipped.status).toBe(200);
    expect(skipped.body.streak.current).toBe(5);
  });

  it('marking today after a 5-day run returns current 6; deleting today returns 5', async () => {
    const { auth, userId } = await authHeaders('streak');
    const today = todayIn('Asia/Dhaka');
    const habitId = await createDailyHabit(auth, addDays(today, -10));

    for (let i = 5; i >= 1; i -= 1) {
      await prisma.habitLog.create({
        data: {
          habitId,
          userId,
          localDate: new Date(`${addDays(today, -i)}T00:00:00.000Z`),
          status: 'DONE',
        },
      });
    }

    const marked = await request(app)
      .put(`/v1/habits/${habitId}/logs/${today}`)
      .set(auth)
      .send({ status: 'DONE' });
    expect(marked.status).toBe(200);
    expect(marked.body.streak.current).toBe(6);

    const deleted = await request(app).delete(`/v1/habits/${habitId}/logs/${today}`).set(auth);
    expect(deleted.status).toBe(200);
    expect(deleted.body.log).toBeNull();
    expect(deleted.body.streak.current).toBe(5);
  });

  it('another user habit id returns 404 on PUT, DELETE and GET', async () => {
    const owner = await authHeaders('owner');
    const other = await authHeaders('intruder');
    const today = todayIn('Asia/Dhaka');
    const habitId = await createDailyHabit(owner.auth, addDays(today, -5));

    const put = await request(app)
      .put(`/v1/habits/${habitId}/logs/${today}`)
      .set(other.auth)
      .send({});
    expect(put.status).toBe(404);

    const del = await request(app).delete(`/v1/habits/${habitId}/logs/${today}`).set(other.auth);
    expect(del.status).toBe(404);

    const get = await request(app)
      .get(`/v1/habits/${habitId}/logs?from=${addDays(today, -7)}&to=${today}`)
      .set(other.auth);
    expect(get.status).toBe(404);
  });

  it('range validation and GET /v1/logs across habits', async () => {
    const { auth } = await authHeaders('range');
    const today = todayIn('Asia/Dhaka');
    const start = addDays(today, -10);
    const a = await createDailyHabit(auth, start, { title: 'A' });
    const b = await createDailyHabit(auth, start, { title: 'B' });

    await request(app).put(`/v1/habits/${a}/logs/${today}`).set(auth).send({});
    await request(app)
      .put(`/v1/habits/${b}/logs/${addDays(today, -1)}`)
      .set(auth)
      .send({});

    const inverted = await request(app)
      .get(`/v1/habits/${a}/logs?from=${today}&to=${addDays(today, -1)}`)
      .set(auth);
    expect(inverted.status).toBe(400);

    const tooLong = await request(app)
      .get(`/v1/logs?from=${addDays(today, -400)}&to=${today}`)
      .set(auth);
    expect(tooLong.status).toBe(400);

    const ok = await request(app)
      .get(`/v1/logs?from=${addDays(today, -30)}&to=${today}`)
      .set(auth);
    expect(ok.status).toBe(200);
    expect(ok.body.logs.length).toBeGreaterThanOrEqual(2);
    const habitIds = new Set((ok.body.logs as Array<{ habitId: string }>).map((l) => l.habitId));
    expect(habitIds.has(a)).toBe(true);
    expect(habitIds.has(b)).toBe(true);
  });
});
