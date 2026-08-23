import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayIn } from '@momentum/core';
import {
  cleanupUsersByEmails,
  closeTestResources,
  createTestApp,
  grantProAccess,
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

  await prisma.plan.upsert({
    where: { slug: 'free' },
    update: {
      limits: {
        maxHabits: 20,
        heatmapDays: 90,
        reminders: 'one_device',
        export: ['csv'],
        sharedBoards: false,
        adminSeats: 0,
        stats: false,
        ai: false,
      },
      status: 'PUBLISHED',
    },
    create: {
      slug: 'free',
      name: 'Free',
      blurb: 'Free tier',
      priceCents: 0,
      currency: 'USD',
      interval: 'FOREVER',
      intervalCount: 1,
      seatBased: false,
      highlighted: false,
      sortOrder: 0,
      status: 'PUBLISHED',
      ctaLabel: 'Start free',
      ctaHref: '/register',
      limits: {
        maxHabits: 20,
        heatmapDays: 90,
        reminders: 'one_device',
        export: ['csv'],
        sharedBoards: false,
        adminSeats: 0,
        stats: false,
        ai: false,
      },
      publishedAt: new Date(),
    },
  });

  for (const plan of [
    {
      slug: 'pro-year',
      name: 'Pro — 1 year',
      interval: 'YEAR' as const,
      priceCents: 4900,
      limits: {
        maxHabits: null,
        heatmapDays: 364,
        reminders: 'all_devices',
        export: ['csv', 'json'],
        sharedBoards: false,
        adminSeats: 0,
        stats: true,
        ai: true,
      },
    },
    {
      slug: 'pro-lifetime',
      name: 'Pro — Lifetime',
      interval: 'FOREVER' as const,
      priceCents: 9900,
      limits: {
        maxHabits: null,
        heatmapDays: 364,
        reminders: 'all_devices',
        export: ['csv', 'json'],
        sharedBoards: false,
        adminSeats: 0,
        stats: true,
        ai: true,
      },
    },
  ]) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        limits: plan.limits,
        status: 'PUBLISHED',
        priceCents: plan.priceCents,
        interval: plan.interval,
      },
      create: {
        slug: plan.slug,
        name: plan.name,
        blurb: plan.name,
        priceCents: plan.priceCents,
        currency: 'USD',
        interval: plan.interval,
        intervalCount: 1,
        seatBased: false,
        highlighted: plan.slug === 'pro-year',
        sortOrder: plan.slug === 'pro-year' ? 1 : 2,
        status: 'PUBLISHED',
        ctaLabel: 'Get Pro',
        ctaHref: '/register',
        limits: plan.limits,
        publishedAt: new Date(),
      },
    });
  }
});

afterAll(async () => {
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('entitlements', () => {
  it('free users are limited to 20 active habits', async () => {
    const email = trackEmail(`free-limit-${Date.now()}@example.com`);
    const { res: registered } = await registerUser(app, { email });
    const userId = registered.body.user.id as string;
    const auth = { Authorization: `Bearer ${registered.body.accessToken as string}` };
    const today = todayIn('Asia/Dhaka');

    await prisma.habit.createMany({
      data: Array.from({ length: 19 }, (_, index) => ({
        userId,
        title: `Seeded ${index}`,
        startDate: new Date(today),
        sortOrder: index,
      })),
    });

    const twentieth = await request(app).post('/v1/habits').set(auth).send({
      title: 'Habit 20',
      startDate: today,
    });
    expect(twentieth.status).toBe(201);

    const blocked = await request(app).post('/v1/habits').set(auth).send({
      title: 'Habit 21',
      startDate: today,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PLAN_LIMIT');
  }, 120_000);

  it('admin can grant timed Pro access without payment', async () => {
    const email = trackEmail(`grant-timed-${Date.now()}@example.com`);
    const { res: registered } = await registerUser(app, { email });
    const userId = registered.body.user.id as string;
    const auth = { Authorization: `Bearer ${registered.body.accessToken as string}` };

    const { res: granted } = await grantProAccess(app, userId, {
      planSlug: 'pro-year',
      accessType: 'timed',
      days: 30,
    });
    expect(granted.status).toBe(201);
    expect(granted.body.subscription.plan.slug).toBe('pro-year');

    const entitlements = await request(app).get('/v1/billing/entitlements').set(auth);
    expect(entitlements.status).toBe(200);
    expect(entitlements.body.entitlements.tier).toBe('pro');
    expect(entitlements.body.entitlements.aiEnabled).toBe(true);
    expect(entitlements.body.entitlements.expiresAt).not.toBeNull();
  });

  it('admin can grant lifetime Pro access without payment', async () => {
    const email = trackEmail(`grant-life-${Date.now()}@example.com`);
    const { res: registered } = await registerUser(app, { email });
    const userId = registered.body.user.id as string;
    const auth = { Authorization: `Bearer ${registered.body.accessToken as string}` };

    const { res: granted } = await grantProAccess(app, userId, {
      planSlug: 'pro-lifetime',
      accessType: 'lifetime',
    });
    expect(granted.status).toBe(201);

    const entitlements = await request(app).get('/v1/billing/entitlements').set(auth);
    expect(entitlements.body.entitlements.isLifetime).toBe(true);
    expect(entitlements.body.entitlements.expiresAt).toBeNull();
  });

  it('blocks AI suggestions for free users and allows Pro users', async () => {
    const freeEmail = trackEmail(`ai-free-${Date.now()}@example.com`);
    const { res: freeReg } = await registerUser(app, { email: freeEmail });
    const freeAuth = { Authorization: `Bearer ${freeReg.body.accessToken as string}` };

    const blocked = await request(app)
      .post('/v1/ai/suggestions')
      .set(freeAuth)
      .send({ focus: 'general' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('FEATURE_REQUIRES_PRO');

    const proEmail = trackEmail(`ai-pro-${Date.now()}@example.com`);
    const { res: proReg } = await registerUser(app, { email: proEmail });
    const proUserId = proReg.body.user.id as string;
    const proAuth = { Authorization: `Bearer ${proReg.body.accessToken as string}` };
    await grantProAccess(app, proUserId, { planSlug: 'pro-lifetime', accessType: 'lifetime' });

    const allowed = await request(app)
      .post('/v1/ai/suggestions')
      .set(proAuth)
      .send({ focus: 'general' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.suggestions.length).toBeGreaterThan(0);
    expect(['gemini', 'fallback']).toContain(allowed.body.source);

    const ideas = await request(app)
      .post('/v1/ai/habit-ideas')
      .set(proAuth)
      .send({ goal: 'sleep better', count: 2 });
    expect(ideas.status).toBe(200);
    expect(ideas.body.ideas.length).toBe(2);

    const habit = await request(app)
      .post('/v1/habits')
      .set(proAuth)
      .send({
        title: 'AI test habit',
        startDate: todayIn('Asia/Dhaka'),
      });
    expect(habit.status).toBe(201);

    const message = await request(app)
      .post('/v1/ai/habit-message')
      .set(proAuth)
      .send({ habitId: habit.body.habit.id, context: 'check_in' });
    expect(message.status).toBe(200);
    expect(message.body.message.length).toBeGreaterThan(0);
  });
});
