import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayIn } from '@momentum/core';
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

async function authHeaders(prefix: string) {
  const email = trackEmail(`${prefix}-${Date.now()}@example.com`);
  const { res } = await registerUser(app, { email });
  expect(res.status).toBe(201);
  return {
    email,
    userId: res.body.user.id as string,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

async function createHabit(
  auth: { Authorization: string },
  overrides: Record<string, unknown> = {},
) {
  const today = todayIn('Asia/Dhaka');
  const res = await request(app)
    .post('/v1/habits')
    .set(auth)
    .send({
      title: 'Reminder habit',
      startDate: today,
      scheduleType: 'DAILY',
      ...overrides,
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

describe('reminders', () => {
  it('creates with valid timeLocal and lists it back', async () => {
    const { auth } = await authHeaders('rem-create');
    const habitId = await createHabit(auth);

    const created = await request(app)
      .post(`/v1/habits/${habitId}/reminders`)
      .set(auth)
      .send({ timeLocal: '07:30' });
    expect(created.status).toBe(201);
    expect(created.body.reminder.timeLocal).toBe('07:30');
    expect(created.body.reminder.enabled).toBe(true);
    expect(created.body.reminder.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);

    const listed = await request(app).get(`/v1/habits/${habitId}/reminders`).set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.reminders).toHaveLength(1);
    expect(listed.body.reminders[0].id).toBe(created.body.reminder.id);
  });

  it('rejects invalid timeLocal values', async () => {
    const { auth } = await authHeaders('rem-time');
    const habitId = await createHabit(auth);

    for (const timeLocal of ['7:30', '25:00', '07:60']) {
      const res = await request(app)
        .post(`/v1/habits/${habitId}/reminders`)
        .set(auth)
        .send({ timeLocal });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects empty daysOfWeek', async () => {
    const { auth } = await authHeaders('rem-empty');
    const habitId = await createHabit(auth);

    const res = await request(app)
      .post(`/v1/habits/${habitId}/reminders`)
      .set(auth)
      .send({ timeLocal: '08:00', daysOfWeek: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate reminders', async () => {
    const { auth } = await authHeaders('rem-dup');
    const habitId = await createHabit(auth);

    const first = await request(app)
      .post(`/v1/habits/${habitId}/reminders`)
      .set(auth)
      .send({ timeLocal: '09:00', daysOfWeek: [1, 3, 5] });
    expect(first.status).toBe(201);

    const dup = await request(app)
      .post(`/v1/habits/${habitId}/reminders`)
      .set(auth)
      .send({ timeLocal: '09:00', daysOfWeek: [5, 3, 1] });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  it('rejects a 6th reminder on one habit', async () => {
    const { auth } = await authHeaders('rem-cap');
    const habitId = await createHabit(auth);

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post(`/v1/habits/${habitId}/reminders`)
        .set(auth)
        .send({ timeLocal: `0${i}:00` });
      expect(res.status).toBe(201);
    }

    const sixth = await request(app)
      .post(`/v1/habits/${habitId}/reminders`)
      .set(auth)
      .send({ timeLocal: '05:00' });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe('CONFLICT');
  });

  it('warns when reminder day is never due for the habit', async () => {
    const { auth } = await authHeaders('rem-warn');
    const habitId = await createHabit(auth, {
      scheduleType: 'SPECIFIC_DAYS',
      scheduleDays: [6, 1, 3], // Sat, Mon, Wed
    });

    const res = await request(app)
      .post(`/v1/habits/${habitId}/reminders`)
      .set(auth)
      .send({ timeLocal: '07:30', daysOfWeek: [5] }); // Friday
    expect(res.status).toBe(201);
    expect(res.body.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Fri')]));
  });

  it('returns 404 for another user’s habit on create and list', async () => {
    const a = await authHeaders('rem-a');
    const b = await authHeaders('rem-b');
    const habitId = await createHabit(a.auth);

    const create = await request(app)
      .post(`/v1/habits/${habitId}/reminders`)
      .set(b.auth)
      .send({ timeLocal: '07:30' });
    expect(create.status).toBe(404);

    const list = await request(app).get(`/v1/habits/${habitId}/reminders`).set(b.auth);
    expect(list.status).toBe(404);
  });

  it('returns 404 for another user’s reminder on PATCH and DELETE', async () => {
    const a = await authHeaders('rem-own-a');
    const b = await authHeaders('rem-own-b');
    const habitId = await createHabit(a.auth);

    const created = await request(app)
      .post(`/v1/habits/${habitId}/reminders`)
      .set(a.auth)
      .send({ timeLocal: '10:00' });
    const reminderId = created.body.reminder.id as string;

    const patch = await request(app)
      .patch(`/v1/reminders/${reminderId}`)
      .set(b.auth)
      .send({ enabled: false });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/v1/reminders/${reminderId}`).set(b.auth);
    expect(del.status).toBe(404);
  });

  it('archiving a habit leaves reminders in the database', async () => {
    const { auth } = await authHeaders('rem-arch');
    const habitId = await createHabit(auth);

    const created = await request(app)
      .post(`/v1/habits/${habitId}/reminders`)
      .set(auth)
      .send({ timeLocal: '11:00' });
    const reminderId = created.body.reminder.id as string;

    await request(app).post(`/v1/habits/${habitId}/archive`).set(auth);

    const row = await prisma.reminder.findUnique({ where: { id: reminderId } });
    expect(row).not.toBeNull();
    expect(row?.habitId).toBe(habitId);
  });

  it('GET /v1/reminders groups by habit and excludes archived habits', async () => {
    const { auth } = await authHeaders('rem-group');
    const activeId = await createHabit(auth, { title: 'Active' });
    const archivedId = await createHabit(auth, { title: 'Archived' });

    await request(app)
      .post(`/v1/habits/${activeId}/reminders`)
      .set(auth)
      .send({ timeLocal: '07:00' });
    await request(app)
      .post(`/v1/habits/${archivedId}/reminders`)
      .set(auth)
      .send({ timeLocal: '08:00' });
    await request(app).post(`/v1/habits/${archivedId}/archive`).set(auth);

    const res = await request(app).get('/v1/reminders').set(auth);
    expect(res.status).toBe(200);
    const habitIds = res.body.habits.map((h: { habitId: string }) => h.habitId);
    expect(habitIds).toContain(activeId);
    expect(habitIds).not.toContain(archivedId);
  });
});
