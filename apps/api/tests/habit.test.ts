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

async function authHeaders(emailPrefix: string) {
  const email = trackEmail(`${emailPrefix}-${Date.now()}@example.com`);
  const { res } = await registerUser(app, { email });
  expect(res.status).toBe(201);
  return {
    email,
    token: res.body.accessToken as string,
    userId: res.body.user.id as string,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('habits', () => {
  it('creates with each of the four schedule types', async () => {
    const { auth } = await authHeaders('sched');
    const today = todayIn('Asia/Dhaka');

    const daily = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({ title: 'Daily water', startDate: today, scheduleType: 'DAILY' });
    expect(daily.status).toBe(201);
    expect(daily.body.habit.scheduleType).toBe('DAILY');
    expect(daily.body.habit).not.toHaveProperty('userId');

    const specific = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({
        title: 'Gym',
        startDate: today,
        scheduleType: 'SPECIFIC_DAYS',
        scheduleDays: [1, 3, 5],
      });
    expect(specific.status).toBe(201);
    expect(specific.body.habit.scheduleDays).toEqual([1, 3, 5]);

    const times = await request(app).post('/v1/habits').set(auth).send({
      title: 'Read',
      startDate: today,
      scheduleType: 'TIMES_PER_WEEK',
      targetPerWeek: 3,
    });
    expect(times.status).toBe(201);
    expect(times.body.habit.targetPerWeek).toBe(3);

    const interval = await request(app).post('/v1/habits').set(auth).send({
      title: 'Deep clean',
      startDate: today,
      scheduleType: 'INTERVAL',
      intervalDays: 7,
    });
    expect(interval.status).toBe(201);
    expect(interval.body.habit.intervalDays).toBe(7);
  });

  it('create with SPECIFIC_DAYS but no days → VALIDATION_ERROR naming scheduleDays', async () => {
    const { auth } = await authHeaders('nodays');
    const today = todayIn('Asia/Dhaka');

    const res = await request(app).post('/v1/habits').set(auth).send({
      title: 'Broken',
      startDate: today,
      scheduleType: 'SPECIFIC_DAYS',
      scheduleDays: [],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'scheduleDays' })]),
    );
  });

  it('create with TIMES_PER_WEEK but targetPerWeek: 9 → validation error', async () => {
    const { auth } = await authHeaders('tpw9');
    const today = todayIn('Asia/Dhaka');

    const res = await request(app).post('/v1/habits').set(auth).send({
      title: 'Too much',
      startDate: today,
      scheduleType: 'TIMES_PER_WEEK',
      targetPerWeek: 9,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'targetPerWeek' })]),
    );
  });

  it('create with INTERVAL fields on a DAILY habit → rejected, not ignored', async () => {
    const { auth } = await authHeaders('daily-interval');
    const today = todayIn('Asia/Dhaka');

    const res = await request(app).post('/v1/habits').set(auth).send({
      title: 'Daily bad',
      startDate: today,
      scheduleType: 'DAILY',
      intervalDays: 3,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'intervalDays' })]),
    );
  });

  it('create with a future startDate → rejected', async () => {
    const { auth } = await authHeaders('future');
    const future = addDays(todayIn('Asia/Dhaka'), 3);

    const res = await request(app).post('/v1/habits').set(auth).send({
      title: 'Future',
      startDate: future,
      scheduleType: 'DAILY',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'startDate' })]),
    );
  });

  it('list excludes archived habits by default, includes them with ?archived=true', async () => {
    const { auth } = await authHeaders('archive-list');
    const today = todayIn('Asia/Dhaka');

    const created = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({ title: 'Active then archive', startDate: today });
    const id = created.body.habit.id as string;

    await request(app).post(`/v1/habits/${id}/archive`).set(auth);

    const activeList = await request(app).get('/v1/habits').set(auth);
    expect(activeList.status).toBe(200);
    expect(activeList.body.habits.map((h: { id: string }) => h.id)).not.toContain(id);

    const archivedList = await request(app).get('/v1/habits?archived=true').set(auth);
    expect(archivedList.body.habits.map((h: { id: string }) => h.id)).toContain(id);
  });

  it('another user habit id returns 404 on GET, PATCH and DELETE', async () => {
    const owner = await authHeaders('owner');
    const other = await authHeaders('other');
    const today = todayIn('Asia/Dhaka');

    const created = await request(app)
      .post('/v1/habits')
      .set(owner.auth)
      .send({ title: 'Private', startDate: today });
    const id = created.body.habit.id as string;

    const getRes = await request(app).get(`/v1/habits/${id}`).set(other.auth);
    expect(getRes.status).toBe(404);

    const patchRes = await request(app)
      .patch(`/v1/habits/${id}`)
      .set(other.auth)
      .send({ title: 'Hacked' });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app).delete(`/v1/habits/${id}?confirm=true`).set(other.auth);
    expect(deleteRes.status).toBe(404);
  });

  it('archive removes it from the list but its logs still exist; restore brings it back', async () => {
    const { auth, userId } = await authHeaders('archive-restore');
    const today = todayIn('Asia/Dhaka');

    const created = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({ title: 'Keep logs', startDate: today });
    const id = created.body.habit.id as string;

    await prisma.habitLog.create({
      data: {
        habitId: id,
        userId,
        localDate: new Date(today),
        status: 'DONE',
      },
    });

    await request(app).post(`/v1/habits/${id}/archive`).set(auth);

    const list = await request(app).get('/v1/habits').set(auth);
    expect(list.body.habits.map((h: { id: string }) => h.id)).not.toContain(id);

    const logCount = await prisma.habitLog.count({ where: { habitId: id } });
    expect(logCount).toBe(1);

    const restored = await request(app).post(`/v1/habits/${id}/restore`).set(auth);
    expect(restored.status).toBe(200);

    const listAfter = await request(app).get('/v1/habits').set(auth);
    expect(listAfter.body.habits.map((h: { id: string }) => h.id)).toContain(id);
  });

  it('DELETE without ?confirm=true → validation error', async () => {
    const { auth } = await authHeaders('del-confirm');
    const today = todayIn('Asia/Dhaka');

    const created = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({ title: 'Doomed', startDate: today });
    const id = created.body.habit.id as string;

    const res = await request(app).delete(`/v1/habits/${id}`).set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('reorder rewrites sortOrder; foreign id is rejected entirely', async () => {
    const a = await authHeaders('reorder-a');
    const b = await authHeaders('reorder-b');
    const today = todayIn('Asia/Dhaka');

    const first = await request(app)
      .post('/v1/habits')
      .set(a.auth)
      .send({ title: 'A1', startDate: today });
    const second = await request(app)
      .post('/v1/habits')
      .set(a.auth)
      .send({ title: 'A2', startDate: today });
    const foreign = await request(app)
      .post('/v1/habits')
      .set(b.auth)
      .send({ title: 'B1', startDate: today });

    const id1 = first.body.habit.id as string;
    const id2 = second.body.habit.id as string;
    const foreignId = foreign.body.habit.id as string;

    const bad = await request(app)
      .patch('/v1/habits/reorder')
      .set(a.auth)
      .send({ ids: [id2, foreignId, id1] });
    expect(bad.status).toBe(404);

    const ok = await request(app)
      .patch('/v1/habits/reorder')
      .set(a.auth)
      .send({ ids: [id2, id1] });
    expect(ok.status).toBe(200);
    expect(ok.body.habits.map((h: { id: string }) => h.id)).toEqual([id2, id1]);
    expect(ok.body.habits[0].sortOrder).toBe(0);
    expect(ok.body.habits[1].sortOrder).toBe(1);
  });

  it('list returns the correct streak for a habit with known logs', async () => {
    const { auth, userId } = await authHeaders('streak');
    const today = todayIn('Asia/Dhaka');
    const yesterday = addDays(today, -1);

    const created = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({
        title: 'Streak habit',
        startDate: addDays(today, -10),
        scheduleType: 'DAILY',
      });
    const id = created.body.habit.id as string;

    await prisma.habitLog.createMany({
      data: [
        {
          habitId: id,
          userId,
          localDate: new Date(yesterday),
          status: 'DONE',
        },
        {
          habitId: id,
          userId,
          localDate: new Date(today),
          status: 'DONE',
        },
      ],
    });

    const list = await request(app).get('/v1/habits').set(auth);
    expect(list.status).toBe(200);
    const habit = list.body.habits.find((h: { id: string }) => h.id === id);
    expect(habit.currentStreak).toBe(2);
  });
});
