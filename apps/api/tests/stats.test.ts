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

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('GET /v1/habits/:id/stats', () => {
  it('excludes skipped from due; reports skipped separately; byWeekday has 7; heatmap omits gaps', async () => {
    const { auth, timezone } = await authHeaders('stats-habit');
    const today = todayIn(timezone);
    const start = addDays(today, -14);

    const created = await request(app).post('/v1/habits').set(auth).send({
      title: 'Measurable',
      startDate: start,
      scheduleType: 'DAILY',
      targetValue: 10,
      unit: 'reps',
    });
    const habitId = created.body.habit.id as string;

    const days = [0, 1, 2, 3, 4].map((n) => addDays(today, -n));
    await request(app)
      .put(`/v1/habits/${habitId}/logs/${days[0]}`)
      .set(auth)
      .send({ status: 'DONE', value: 12 });
    await request(app)
      .put(`/v1/habits/${habitId}/logs/${days[1]}`)
      .set(auth)
      .send({ status: 'SKIPPED' });
    await request(app)
      .put(`/v1/habits/${habitId}/logs/${days[2]}`)
      .set(auth)
      .send({ status: 'DONE', value: 8 });
    // days[3], days[4] unmarked → missed when in range of recent week

    // Seed older missed/done via prisma outside the 7-day API guard
    await prisma.habitLog.createMany({
      data: [
        {
          habitId,
          userId: (await prisma.habit.findUniqueOrThrow({ where: { id: habitId } })).userId,
          localDate: new Date(`${addDays(today, -10)}T00:00:00.000Z`),
          status: 'DONE',
          value: 10,
        },
      ],
    });

    const res = await request(app).get(`/v1/habits/${habitId}/stats?range=7d`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.completion.skipped).toBeGreaterThanOrEqual(1);
    expect(res.body.completion.due).toBe(res.body.completion.done + res.body.completion.missed);
    expect(res.body.byWeekday).toHaveLength(7);

    const heatmapDates = new Set(res.body.heatmap.map((h: { date: string }) => h.date));
    expect(heatmapDates.has(days[0]!)).toBe(true);
    // An unmarked day in range must not appear as a padded null cell
    const unmarked = days[3]!;
    if (unmarked >= res.body.range.from) {
      expect(heatmapDates.has(unmarked)).toBe(false);
    }
  });

  it('caps range=all at 400 days for old habits', async () => {
    const { auth, timezone } = await authHeaders('stats-cap');
    const today = todayIn(timezone);
    const start = addDays(today, -500);

    const created = await request(app).post('/v1/habits').set(auth).send({
      title: 'Ancient',
      startDate: start,
      scheduleType: 'DAILY',
    });
    const habitId = created.body.habit.id as string;

    const res = await request(app).get(`/v1/habits/${habitId}/stats?range=all`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.range.days).toBeLessThanOrEqual(400);
    expect(res.body.range.from).toBe(addDays(today, -399));
  });

  it('invalid range → VALIDATION_ERROR', async () => {
    const { auth, timezone } = await authHeaders('stats-bad');
    const today = todayIn(timezone);
    const created = await request(app).post('/v1/habits').set(auth).send({
      title: 'X',
      startDate: today,
      scheduleType: 'DAILY',
    });

    const res = await request(app)
      .get(`/v1/habits/${created.body.habit.id}/stats?range=2d`)
      .set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('another user’s habit id → 404', async () => {
    const a = await authHeaders('stats-a');
    const b = await authHeaders('stats-b');
    const today = todayIn(a.timezone);

    const created = await request(app).post('/v1/habits').set(a.auth).send({
      title: 'Private',
      startDate: today,
      scheduleType: 'DAILY',
    });

    const res = await request(app).get(`/v1/habits/${created.body.habit.id}/stats`).set(b.auth);
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/stats/overview', () => {
  it('perfectDays ignores days with no due habits', async () => {
    const { auth, timezone } = await authHeaders('stats-perfect');
    const today = todayIn(timezone);
    const friday = 5;

    await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({
        title: 'Friday only',
        startDate: addDays(today, -30),
        scheduleType: 'SPECIFIC_DAYS',
        scheduleDays: [friday],
      });

    const res = await request(app).get('/v1/stats/overview?range=7d').set(auth);
    expect(res.status).toBe(200);
    // At most one perfect Friday in a 7-day window if completed; non-Friday days must not
    // inflate perfectDays as "perfect" rest days.
    expect(res.body.totals.perfectDays).toBeLessThanOrEqual(2);
    // With nothing logged, zero perfect days
    expect(res.body.totals.perfectDays).toBe(0);
  });
});
