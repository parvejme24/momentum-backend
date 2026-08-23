import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fulfillCheckout } from '../src/modules/billing/billing.service.js';
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
let catalogProYearPlanId = '';
let catalogFreePlanId = '';

async function ensureCatalogFreePlan(): Promise<string> {
  if (catalogFreePlanId) return catalogFreePlanId;

  const plan = await prisma.plan.upsert({
    where: { slug: 'free' },
    update: { status: 'PUBLISHED', priceCents: 0, interval: 'FOREVER' },
    create: {
      slug: 'free',
      name: 'Free',
      blurb: 'Billing tests',
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
      limits: { maxHabits: 20, stats: false, ai: false },
      publishedAt: new Date(),
    },
  });

  catalogFreePlanId = plan.id;
  return plan.id;
}

async function ensureCatalogProYearPlan(): Promise<string> {
  if (catalogProYearPlanId) return catalogProYearPlanId;

  const plan = await prisma.plan.upsert({
    where: { slug: 'pro-year' },
    update: {
      status: 'PUBLISHED',
      priceCents: 4900,
      interval: 'YEAR',
      limits: {
        maxHabits: null,
        stats: true,
        ai: true,
      },
    },
    create: {
      slug: 'pro-year',
      name: 'Pro — 1 year',
      blurb: 'Billing tests',
      priceCents: 4900,
      currency: 'USD',
      interval: 'YEAR',
      intervalCount: 1,
      seatBased: false,
      highlighted: true,
      sortOrder: 1,
      status: 'PUBLISHED',
      ctaLabel: 'Get Pro',
      ctaHref: '/register',
      limits: {
        maxHabits: null,
        stats: true,
        ai: true,
      },
      publishedAt: new Date(),
    },
  });

  catalogProYearPlanId = plan.id;
  return plan.id;
}

function trackEmail(email: string) {
  emails.push(email);
  return email;
}

async function authHeaders(prefix: string) {
  const email = trackEmail(`${prefix}-${Date.now()}@example.com`);
  const { res } = await registerUser(app, { email, name: prefix });
  expect(res.status).toBe(201);
  return {
    userId: res.body.user.id as string,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

beforeAll(async () => {
  await prisma.$connect();
  await ensureCatalogProYearPlan();
});

afterAll(async () => {
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('customer Stripe billing', () => {
  it('returns billing config without auth', async () => {
    const res = await request(app).get('/v1/billing/config');
    expect(res.status).toBe(200);
    expect(res.body.stripe).toEqual({
      publishableKey: expect.any(String),
      configured: expect.any(Boolean),
    });
    expect(res.body.sslcommerz.configured).toEqual(expect.any(Boolean));
  });

  it('activates a free plan without Stripe', async () => {
    const customer = await authHeaders('bill-free');
    const planId = await ensureCatalogFreePlan();

    const checkout = await request(app)
      .post('/v1/billing/checkout')
      .set(customer.auth)
      .send({ planId });
    expect(checkout.status).toBe(200);
    expect(checkout.body.url).toBeNull();
    expect(checkout.body.subscription.plan.id).toBe(planId);
    expect(checkout.body.subscription.status).toBe('active');

    const me = await request(app).get('/v1/billing/subscription').set(customer.auth);
    expect(me.status).toBe(200);
    expect(me.body.subscription.plan.id).toBe(planId);
  });

  it('records a paid Stripe checkout into the local subscription', async () => {
    const customer = await authHeaders('bill-pay');
    const planId = await ensureCatalogProYearPlan();

    const paid = await request(app)
      .post('/v1/billing/checkout')
      .set(customer.auth)
      .send({ planId });
    expect(paid.status).toBe(503);
    expect(paid.body.error.code).toBe('STRIPE_NOT_CONFIGURED');

    const subscription = await fulfillCheckout({
      sessionId: `cs_test_${Date.now()}`,
      provider: 'stripe',
      customerId: `cus_test_${Date.now()}`,
      stripeSubscriptionId: `sub_test_${Date.now()}`,
      amountCents: 4900,
      currency: 'usd',
      userId: customer.userId,
      planId,
      seats: 1,
      paymentMethod: 'CARD',
    });

    expect(subscription.status).toBe('active');
    expect(subscription.plan.id).toBe(planId);
    expect(subscription.currentPeriodEnd).toBeTruthy();

    const invoices = await request(app).get('/v1/billing/invoices').set(customer.auth);
    expect(invoices.status).toBe(200);
    expect(invoices.body.invoices).toHaveLength(1);
    expect(invoices.body.invoices[0].amountCents).toBe(4900);
    expect(invoices.body.invoices[0].status).toBe('succeeded');
  });

  it('starts SSLCommerz checkout for catalog pro-year plan', async () => {
    const customer = await authHeaders('bill-ssl');
    const planId = await ensureCatalogProYearPlan();

    const checkout = await request(app)
      .post('/v1/billing/checkout')
      .set(customer.auth)
      .send({ planId, provider: 'sslcommerz' });

    expect([201, 502, 503]).toContain(checkout.status);
    if (checkout.status === 201) {
      expect(checkout.body.provider).toBe('sslcommerz');
      expect(checkout.body.url).toEqual(expect.any(String));
      expect(checkout.body.sessionId).toEqual(expect.any(String));
    }
  });

  it('records a fulfilled SSLCommerz payment into subscription', async () => {
    const customer = await authHeaders('bill-ssl-fulfill');
    const planId = await ensureCatalogProYearPlan();

    const tranId = `momtest${Date.now()}`;
    await prisma.payment.create({
      data: {
        userId: customer.userId,
        planId,
        amountCents: 4900,
        currency: 'USD',
        status: 'PENDING',
        method: 'OTHER',
        provider: 'sslcommerz',
        providerRef: tranId,
        description: 'Pending SSLCommerz test payment',
      },
    });

    const subscription = await fulfillCheckout({
      sessionId: tranId,
      provider: 'sslcommerz',
      amountCents: 4900,
      currency: 'USD',
      userId: customer.userId,
      planId,
      seats: 1,
      paymentMethod: 'OTHER',
    });

    expect(subscription.status).toBe('active');
    expect(subscription.plan.id).toBe(planId);
  });

  it('rejects unauthenticated checkout', async () => {
    const res = await request(app)
      .post('/v1/billing/checkout')
      .send({ planId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(401);
  });
});
