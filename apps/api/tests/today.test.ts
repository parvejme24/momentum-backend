import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { addDays, dayOfWeek, todayIn } from '@momentum/core';
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

function findWeekday(from: string, targetDow: number): string {
  let cursor = from;
  for (let i = 0; i < 7; i += 1) {
    if (dayOfWeek(cursor) === targetDow) return cursor;
    cursor = addDays(cursor, 1);
  }
  throw new Error(`no weekday ${targetDow} near ${from}`);
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('GET /v1/today', () => {
  it('puts SPECIFIC_DAYS habit in habits or notDueToday with nextDueDate', async () => {
    const { auth, timezone } = await authHeaders('today-spec');
    const today = todayIn(timezone);
    const friday = 5;
    const start = addDays(today, -30);

    const created = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({
        title: 'Friday only',
        icon: 'lotus',
        startDate: start,
        scheduleType: 'SPECIFIC_DAYS',
        scheduleDays: [friday],
      });
    expect(created.status).toBe(201);
    const habitId = created.body.habit.id as string;

    const dueDate = findWeekday(addDays(today, -6), friday);
    // Prefer a due date within the last 7 days that is <= today
    const probeDue = dueDate <= today ? dueDate : findWeekday(addDays(today, -13), friday);

    const dueRes = await request(app).get(`/v1/today?date=${probeDue}`).set(auth);
    expect(dueRes.status).toBe(200);
    expect(dueRes.body.habits.map((h: { id: string }) => h.id)).toContain(habitId);
    expect(dueRes.body.notDueToday.map((h: { id: string }) => h.id)).not.toContain(habitId);

    const notDue = addDays(probeDue, 1);
    if (notDue <= today) {
      const offRes = await request(app).get(`/v1/today?date=${notDue}`).set(auth);
      expect(offRes.status).toBe(200);
      const item = offRes.body.notDueToday.find((h: { id: string }) => h.id === habitId);
      expect(item).toBeDefined();
      expect(item.nextDueDate).toBe(addDays(probeDue, 7));
      expect(offRes.body.habits.map((h: { id: string }) => h.id)).not.toContain(habitId);
    }
  });

  it('log is null when unmarked and populated when marked', async () => {
    const { auth, timezone } = await authHeaders('today-log');
    const today = todayIn(timezone);

    const created = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({
        title: 'Read',
        startDate: addDays(today, -5),
        scheduleType: 'DAILY',
        targetValue: 30,
        unit: 'pages',
      });
    const habitId = created.body.habit.id as string;

    const unmarked = await request(app).get('/v1/today').set(auth);
    expect(unmarked.status).toBe(200);
    const before = unmarked.body.habits.find((h: { id: string }) => h.id === habitId);
    expect(before.log).toBeNull();

    await request(app)
      .put(`/v1/habits/${habitId}/logs/${today}`)
      .set(auth)
      .send({ status: 'DONE', value: 32 });

    const marked = await request(app).get('/v1/today').set(auth);
    const after = marked.body.habits.find((h: { id: string }) => h.id === habitId);
    expect(after.log).toEqual({ status: 'DONE', value: 32, note: null });
  });

  it('summary.rate is 0 when nothing is due today', async () => {
    const { auth, timezone } = await authHeaders('today-rest');
    const today = todayIn(timezone);
    const friday = 5;
    // Pick a day that is NOT Friday within last week
    let restDay = today;
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(today, -i);
      if (dayOfWeek(d) !== friday) {
        restDay = d;
        break;
      }
    }

    await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({
        title: 'Friday only',
        startDate: addDays(today, -30),
        scheduleType: 'SPECIFIC_DAYS',
        scheduleDays: [friday],
      });

    const res = await request(app).get(`/v1/today?date=${restDay}`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(0);
    expect(res.body.summary.rate).toBe(0);
    expect(Number.isNaN(res.body.summary.rate)).toBe(false);
  });

  it('excludes archived habits from both arrays', async () => {
    const { auth, timezone } = await authHeaders('today-arch');
    const today = todayIn(timezone);

    const created = await request(app).post('/v1/habits').set(auth).send({
      title: 'Archived',
      startDate: today,
      scheduleType: 'DAILY',
    });
    const habitId = created.body.habit.id as string;
    await request(app).post(`/v1/habits/${habitId}/archive`).set(auth);

    const res = await request(app).get('/v1/today').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.habits.map((h: { id: string }) => h.id)).not.toContain(habitId);
    expect(res.body.notDueToday.map((h: { id: string }) => h.id)).not.toContain(habitId);
  });

  it('atRisk is true for live unmarked streak, false once marked', async () => {
    const { auth, timezone } = await authHeaders('today-risk');
    const today = todayIn(timezone);
    const yesterday = addDays(today, -1);

    const created = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({
        title: 'Streak',
        startDate: addDays(today, -10),
        scheduleType: 'DAILY',
      });
    const habitId = created.body.habit.id as string;

    await request(app)
      .put(`/v1/habits/${habitId}/logs/${yesterday}`)
      .set(auth)
      .send({ status: 'DONE' });

    const atRisk = await request(app).get('/v1/today').set(auth);
    const habit = atRisk.body.habits.find((h: { id: string }) => h.id === habitId);
    expect(habit.atRisk).toBe(true);

    await request(app)
      .put(`/v1/habits/${habitId}/logs/${today}`)
      .set(auth)
      .send({ status: 'DONE' });

    const safe = await request(app).get('/v1/today').set(auth);
    const after = safe.body.habits.find((h: { id: string }) => h.id === habitId);
    expect(after.atRisk).toBe(false);
  });

  it('uses Pacific/Kiritimati local day, not UTC', async () => {
    const { auth, timezone } = await authHeaders('today-kiri', 'Pacific/Kiritimati');
    const theirToday = todayIn(timezone);
    const utcToday = todayIn('UTC');

    await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({
        title: 'Kiri',
        startDate: addDays(theirToday, -2),
        scheduleType: 'DAILY',
      });

    const res = await request(app).get('/v1/today').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(theirToday);
    if (theirToday !== utcToday) {
      expect(res.body.date).not.toBe(utcToday);
    }
  });

  it('rejects future ?date= with VALIDATION_ERROR', async () => {
    const { auth, timezone } = await authHeaders('today-future');
    const future = addDays(todayIn(timezone), 1);

    const res = await request(app).get(`/v1/today?date=${future}`).set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('issues exactly two Prisma queries with 20 habits and dense logs', async () => {
    const { auth, userId, timezone } = await authHeaders('today-perf');
    const today = todayIn(timezone);
    const start = addDays(today, -400);

    const habitIds: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const created = await request(app)
        .post('/v1/habits')
        .set(auth)
        .send({
          title: `Habit ${i}`,
          startDate: start,
          scheduleType: 'DAILY',
        });
      expect(created.status).toBe(201);
      habitIds.push(created.body.habit.id as string);
    }

    // ~400 days × 20 habits is heavy; seed ~50 days × 20 = 1000 rows for density
    // while still exercising the batch path. Query count is independent of row count.
    const rows: Array<{
      habitId: string;
      userId: string;
      localDate: Date;
      status: 'DONE';
    }> = [];
    for (const habitId of habitIds) {
      for (let d = 0; d < 400; d += 1) {
        rows.push({
          habitId,
          userId,
          localDate: new Date(`${addDays(start, d)}T00:00:00.000Z`),
          status: 'DONE',
        });
      }
    }
    for (let i = 0; i < rows.length; i += 1000) {
      await prisma.habitLog.createMany({ data: rows.slice(i, i + 1000) });
    }

    const userSpy = vi.spyOn(prisma.user, 'findFirst');
    const logSpy = vi.spyOn(prisma.habitLog, 'findMany');

    try {
      const res = await request(app).get('/v1/today').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.habits).toHaveLength(20);
      expect(userSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledTimes(1);
    } finally {
      userSpy.mockRestore();
      logSpy.mockRestore();
    }
  }, 120_000);
});
