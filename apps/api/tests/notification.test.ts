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

async function authHeaders(prefix: string) {
  const email = trackEmail(`${prefix}-${Date.now()}@example.com`);
  const { res } = await registerUser(app, { email, name: prefix });
  expect(res.status).toBe(201);
  return {
    email,
    userId: res.body.user.id as string,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

async function adminAuth(prefix: string) {
  const session = await authHeaders(prefix);
  await prisma.user.update({
    where: { id: session.userId },
    data: { role: 'ADMIN' },
  });
  return session;
}

beforeAll(async () => {
  await prisma.$connect();
});

async function waitForNotifications(
  auth: { Authorization: string },
  path: string,
  predicate: (body: {
    notifications: Array<{ id: string; type: string; data: { email?: string } }>;
    unreadCount: number;
  }) => boolean,
) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const res = await request(app).get(path).set(auth);
    if (res.status === 200 && predicate(res.body)) return res.body;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for notifications at ${path}`);
}

afterAll(async () => {
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('notifications', () => {
  it('notifies a customer when they complete a habit and lets them mark it read', async () => {
    const { auth } = await authHeaders('n-habit');
    const today = todayIn('Asia/Dhaka');
    const habit = await request(app)
      .post('/v1/habits')
      .set(auth)
      .send({ title: 'Drink water', startDate: addDays(today, -3), scheduleType: 'DAILY' });
    expect(habit.status).toBe(201);

    const logged = await request(app)
      .put(`/v1/habits/${habit.body.habit.id}/logs/${today}`)
      .set(auth)
      .send({ status: 'DONE' });
    expect(logged.status).toBe(200);

    const list = await waitForNotifications(auth, '/v1/notifications', (body) => {
      const types = body.notifications.map((n) => n.type);
      return (
        types.includes('welcome') &&
        types.includes('habit_created') &&
        types.includes('habit_completed') &&
        body.unreadCount >= 3
      );
    });

    const completed = list.notifications.find((n) => n.type === 'habit_completed');
    expect(completed).toBeTruthy();
    const read = await request(app).post(`/v1/notifications/${completed?.id}/read`).set(auth);
    expect(read.status).toBe(200);
    expect(read.body.notification.readAt).toBeTruthy();

    const unread = await request(app).get('/v1/notifications/unread-count').set(auth);
    expect(unread.status).toBe(200);
    expect(unread.body.count).toBe(list.unreadCount - 1);
  });

  it('notifies admins of a new customer and a successful payment', async () => {
    const admin = await adminAuth('n-adm');
    const customer = await authHeaders('n-pay');

    await waitForNotifications(admin.auth, '/v1/admin/notifications?type=admin_new_user', (body) =>
      body.notifications.some((n) => n.data.email === customer.email),
    );

    const plan = await prisma.plan.upsert({
      where: { slug: 'pro-year' },
      update: {
        status: 'PUBLISHED',
        priceCents: 600,
        interval: 'YEAR',
        limits: { maxHabits: null, stats: true, ai: true },
      },
      create: {
        slug: 'pro-year',
        name: 'Notify Pro',
        blurb: 'Used by notification tests.',
        priceCents: 600,
        currency: 'USD',
        interval: 'YEAR',
        intervalCount: 1,
        seatBased: false,
        highlighted: true,
        sortOrder: 1,
        status: 'PUBLISHED',
        ctaLabel: 'Get Pro',
        ctaHref: '/register',
        limits: { maxHabits: null, stats: true, ai: true },
        publishedAt: new Date(),
      },
    });

    const { fulfillCheckout } = await import('../src/modules/billing/billing.service.js');
    await fulfillCheckout({
      sessionId: `cs_notify_${Date.now()}`,
      provider: 'stripe',
      customerId: `cus_notify_${Date.now()}`,
      stripeSubscriptionId: `sub_notify_${Date.now()}`,
      amountCents: 600,
      currency: 'usd',
      userId: customer.userId,
      planId: plan.id,
      seats: 1,
      paymentMethod: 'CARD',
    });

    await waitForNotifications(
      customer.auth,
      '/v1/notifications?type=payment_succeeded',
      (body) => body.notifications.length >= 1,
    );
    await waitForNotifications(
      admin.auth,
      '/v1/admin/notifications?type=admin_new_payment',
      (body) => body.notifications.length >= 1,
    );
  });

  it('forbids customers from the admin notification feed', async () => {
    const customer = await authHeaders('n-forbid');
    const res = await request(app).get('/v1/admin/notifications').set(customer.auth);
    expect(res.status).toBe(403);
  });
});
