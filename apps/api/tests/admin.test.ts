import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const planIds: string[] = [];

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
    password: 'password123',
    userId: res.body.user.id as string,
    accessToken: res.body.accessToken as string,
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

async function createPublishedPlan(auth: { Authorization: string }, priceCents = 900) {
  const created = await request(app)
    .post('/v1/admin/pricing/plans')
    .set(auth)
    .send({
      slug: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: 'Pro test',
      blurb: 'Used by admin billing tests.',
      priceCents,
      interval: 'month',
      features: ['Unlimited habits'],
      limits: { maxHabits: null },
    });
  expect(created.status).toBe(201);
  const id = created.body.plan.id as string;
  planIds.push(id);
  expect((await request(app).post(`/v1/admin/pricing/plans/${id}/publish`).set(auth)).status).toBe(
    200,
  );
  return { id, slug: created.body.plan.slug as string };
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  if (planIds.length > 0) {
    await prisma.payment.deleteMany({ where: { planId: { in: planIds } } });
    await prisma.planSubscription.deleteMany({ where: { planId: { in: planIds } } });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
  }
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('admin users', () => {
  it('lists users with filters and forbids customers', async () => {
    const admin = await adminAuth('adm-list');
    const customer = await authHeaders('cust-list');

    const forbidden = await request(app).get('/v1/admin/users').set(customer.auth);
    expect(forbidden.status).toBe(403);

    const list = await request(app)
      .get('/v1/admin/users')
      .query({ q: customer.email, status: 'live' })
      .set(admin.auth);
    expect(list.status).toBe(200);
    expect(list.body.users.some((u: { email: string }) => u.email === customer.email)).toBe(true);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.page).toBe(1);
  });

  it('bans, unbans, trashes, restores, and permanently deletes a user', async () => {
    const admin = await adminAuth('adm-mod');
    const target = await authHeaders('cust-mod');

    const banned = await request(app)
      .post(`/v1/admin/users/${target.userId}/ban`)
      .set(admin.auth)
      .send({ reason: 'Abuse' });
    expect(banned.status).toBe(200);
    expect(banned.body.user.status).toBe('banned');
    expect(banned.body.user.bannedReason).toBe('Abuse');

    const loginBanned = await request(app)
      .post('/v1/auth/login')
      .send({ email: target.email, password: target.password });
    expect(loginBanned.status).toBe(403);
    expect(loginBanned.body.error.code).toBe('ACCOUNT_BANNED');

    const authedBanned = await request(app).get('/v1/auth/me').set(target.auth);
    expect(authedBanned.status).toBe(403);
    expect(authedBanned.body.error.code).toBe('ACCOUNT_BANNED');

    const unbanned = await request(app)
      .post(`/v1/admin/users/${target.userId}/unban`)
      .set(admin.auth);
    expect(unbanned.status).toBe(200);
    expect(unbanned.body.user.status).toBe('active');

    const trashed = await request(app)
      .post(`/v1/admin/users/${target.userId}/trash`)
      .set(admin.auth);
    expect(trashed.status).toBe(200);
    expect(trashed.body.user.status).toBe('trashed');

    const live = await request(app)
      .get('/v1/admin/users')
      .query({ q: target.email, status: 'live' })
      .set(admin.auth);
    expect(live.body.users.some((u: { id: string }) => u.id === target.userId)).toBe(false);

    const inTrash = await request(app)
      .get('/v1/admin/users')
      .query({ q: target.email, status: 'trashed' })
      .set(admin.auth);
    expect(inTrash.body.users.some((u: { id: string }) => u.id === target.userId)).toBe(true);

    const restored = await request(app)
      .post(`/v1/admin/users/${target.userId}/restore`)
      .set(admin.auth);
    expect(restored.status).toBe(200);
    expect(restored.body.user.status).toBe('active');

    await request(app).post(`/v1/admin/users/${target.userId}/trash`).set(admin.auth);
    const hard = await request(app).delete(`/v1/admin/users/${target.userId}`).set(admin.auth);
    expect(hard.status).toBe(200);

    const missing = await request(app).get(`/v1/admin/users/${target.userId}`).set(admin.auth);
    expect(missing.status).toBe(404);
  });

  it('refuses to ban or trash the acting admin', async () => {
    const admin = await adminAuth('adm-self');
    const banSelf = await request(app).post(`/v1/admin/users/${admin.userId}/ban`).set(admin.auth);
    expect(banSelf.status).toBe(409);
    const trashSelf = await request(app)
      .post(`/v1/admin/users/${admin.userId}/trash`)
      .set(admin.auth);
    expect(trashSelf.status).toBe(409);
  });
});

describe('admin subscriptions, payments, and revenue', () => {
  it('assigns a plan, records payment, refunds, and reports revenue', async () => {
    const admin = await adminAuth('adm-bill');
    const customer = await authHeaders('cust-bill');
    const plan = await createPublishedPlan(admin.auth, 1200);

    const assigned = await request(app)
      .post('/v1/admin/subscriptions')
      .set(admin.auth)
      .send({
        userId: customer.userId,
        planId: plan.id,
        payment: { method: 'card', amountCents: 1200 },
      });
    expect(assigned.status).toBe(201);
    expect(assigned.body.subscription.status).toBe('active');
    expect(assigned.body.subscription.plan.id).toBe(plan.id);
    expect(assigned.body.subscription.currentPeriodEnd).toBeTruthy();

    const subId = assigned.body.subscription.id as string;

    const listed = await request(app)
      .get('/v1/admin/subscriptions')
      .query({ userId: customer.userId })
      .set(admin.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.subscriptions).toHaveLength(1);

    const payments = await request(app)
      .get('/v1/admin/payments')
      .query({ userId: customer.userId })
      .set(admin.auth);
    expect(payments.status).toBe(200);
    expect(payments.body.payments).toHaveLength(1);
    expect(payments.body.payments[0].status).toBe('succeeded');
    expect(payments.body.payments[0].amountCents).toBe(1200);

    const paymentId = payments.body.payments[0].id as string;
    const refunded = await request(app)
      .post(`/v1/admin/payments/${paymentId}/refund`)
      .set(admin.auth)
      .send({ notes: 'Chargeback' });
    expect(refunded.status).toBe(200);
    expect(refunded.body.payment.status).toBe('refunded');

    const extra = await request(app).post('/v1/admin/payments').set(admin.auth).send({
      subscriptionId: subId,
      amountCents: 1200,
      method: 'bank_transfer',
      status: 'succeeded',
    });
    expect(extra.status).toBe(201);

    const today = new Date().toISOString().slice(0, 10);
    const revenue = await request(app)
      .get('/v1/admin/revenue')
      .query({ from: today, to: today, planId: plan.id, groupBy: 'day' })
      .set(admin.auth);
    expect(revenue.status).toBe(200);
    expect(revenue.body.totals.grossCents).toBe(2400);
    expect(revenue.body.totals.refundedCents).toBe(1200);
    expect(revenue.body.totals.netCents).toBe(1200);
    expect(revenue.body.byPlan[0].key).toBe(plan.slug);
    expect(revenue.body.series.length).toBeGreaterThanOrEqual(1);

    const canceled = await request(app)
      .post(`/v1/admin/subscriptions/${subId}/cancel`)
      .set(admin.auth)
      .send({});
    expect(canceled.status).toBe(200);
    expect(canceled.body.subscription.status).toBe('canceled');

    const detail = await request(app).get(`/v1/admin/users/${customer.userId}`).set(admin.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.subscriptions).toHaveLength(1);
    expect(detail.body.payments.length).toBeGreaterThanOrEqual(2);
  });

  it('replaces a live subscription when assigning a new plan', async () => {
    const admin = await adminAuth('adm-swap');
    const customer = await authHeaders('cust-swap');
    const first = await createPublishedPlan(admin.auth, 500);
    const second = await createPublishedPlan(admin.auth, 1500);

    const original = await request(app)
      .post('/v1/admin/subscriptions')
      .set(admin.auth)
      .send({ userId: customer.userId, planId: first.id });
    expect(original.status).toBe(201);

    const next = await request(app)
      .post('/v1/admin/subscriptions')
      .set(admin.auth)
      .send({ userId: customer.userId, planId: second.id });
    expect(next.status).toBe(201);

    const list = await request(app)
      .get('/v1/admin/subscriptions')
      .query({ userId: customer.userId })
      .set(admin.auth);
    const statuses = list.body.subscriptions.map((s: { status: string }) => s.status).sort();
    expect(statuses).toEqual(['active', 'canceled']);
  });
});
