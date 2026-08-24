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
  const { res } = await registerUser(app, { email });
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

function trackPlan(id: string) {
  planIds.push(id);
  return id;
}

function planBody(overrides: Record<string, unknown> = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    slug: `plan-${suffix}`,
    name: 'Test plan',
    blurb: 'A short marketing line for tests.',
    priceCents: 0,
    interval: 'forever',
    features: ['One feature'],
    limits: { maxHabits: 3 },
    ...overrides,
  };
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  if (planIds.length > 0) {
    await prisma.planSubscription.deleteMany({ where: { planId: { in: planIds } } });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
  }
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('pricing catalog', () => {
  it('public list only shows published catalog plans; drafts stay hidden', async () => {
    const { auth } = await adminAuth('price-seed');

    await prisma.plan.upsert({
      where: { slug: 'free' },
      update: { status: 'PUBLISHED', priceCents: 0, interval: 'FOREVER' },
      create: {
        slug: 'free',
        name: 'Free',
        blurb: 'Limited habits and features.',
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
        limits: { maxHabits: 20 },
        publishedAt: new Date(),
      },
    });
    await prisma.plan.upsert({
      where: { slug: 'pro-year' },
      update: { status: 'PUBLISHED', interval: 'YEAR' },
      create: {
        slug: 'pro-year',
        name: 'Pro Year',
        blurb: 'Unlimited habits for a year.',
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
        limits: { maxHabits: null, stats: true, ai: true },
        publishedAt: new Date(),
      },
    });
    await prisma.plan.upsert({
      where: { slug: 'pro-lifetime' },
      update: { status: 'PUBLISHED', interval: 'FOREVER' },
      create: {
        slug: 'pro-lifetime',
        name: 'Pro Lifetime',
        blurb: 'Pay once, keep Pro.',
        priceCents: 9900,
        currency: 'USD',
        interval: 'FOREVER',
        intervalCount: 1,
        seatBased: false,
        highlighted: false,
        sortOrder: 2,
        status: 'PUBLISHED',
        ctaLabel: 'Get lifetime Pro',
        ctaHref: '/register',
        limits: { maxHabits: null, stats: true, ai: true },
        publishedAt: new Date(),
      },
    });

    const extra = await request(app)
      .post('/v1/admin/pricing/plans')
      .set(auth)
      .send(
        planBody({
          slug: `extra-${Date.now()}`,
          name: 'Internal Extra',
        }),
      );
    expect(extra.status).toBe(201);
    trackPlan(extra.body.plan.id);
    expect(
      (await request(app).post(`/v1/admin/pricing/plans/${extra.body.plan.id}/publish`).set(auth))
        .status,
    ).toBe(200);

    const draft = await request(app)
      .post('/v1/admin/pricing/plans')
      .set(auth)
      .send(planBody({ name: 'Secret draft' }));
    expect(draft.status).toBe(201);
    trackPlan(draft.body.plan.id);

    const publicList = await request(app).get('/v1/pricing/plans');
    expect(publicList.status).toBe(200);
    const slugs = publicList.body.plans.map((p: { slug: string }) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining(['free', 'pro-year', 'pro-lifetime']));
    expect(slugs).not.toContain(extra.body.plan.slug);
    expect(slugs).not.toContain(draft.body.plan.slug);

    const hidden = await request(app).get(`/v1/pricing/plans/${draft.body.plan.slug}`);
    expect(hidden.status).toBe(404);
  });

  it('admin CRUD + reorder', async () => {
    const { auth } = await adminAuth('price-crud');
    const created = await request(app)
      .post('/v1/admin/pricing/plans')
      .set(auth)
      .send(planBody({ name: 'Reorder A' }));
    expect(created.status).toBe(201);
    const a = trackPlan(created.body.plan.id);

    const createdB = await request(app)
      .post('/v1/admin/pricing/plans')
      .set(auth)
      .send(planBody({ name: 'Reorder B' }));
    const b = trackPlan(createdB.body.plan.id);

    const patched = await request(app)
      .patch(`/v1/admin/pricing/plans/${a}`)
      .set(auth)
      .send({ name: 'Reorder A2', blurb: 'Updated blurb for the card.' });
    expect(patched.status).toBe(200);
    expect(patched.body.plan.name).toBe('Reorder A2');

    const all = await request(app).get('/v1/admin/pricing/plans').set(auth);
    expect(all.status).toBe(200);
    const ids = all.body.plans.map((p: { id: string }) => p.id) as string[];
    const without = ids.filter((id) => id !== a && id !== b);
    const reordered = await request(app)
      .post('/v1/admin/pricing/plans/reorder')
      .set(auth)
      .send({ ids: [b, a, ...without] });
    expect(reordered.status).toBe(200);
    expect(reordered.body.plans[0].id).toBe(b);
    expect(reordered.body.plans[1].id).toBe(a);
  });

  it('keeps a single highlighted published plan', async () => {
    const { auth } = await adminAuth('price-hi');
    const first = await request(app)
      .post('/v1/admin/pricing/plans')
      .set(auth)
      .send(planBody({ highlighted: true, name: 'First popular' }));
    const second = await request(app)
      .post('/v1/admin/pricing/plans')
      .set(auth)
      .send(planBody({ highlighted: true, name: 'Second popular' }));
    trackPlan(first.body.plan.id);
    trackPlan(second.body.plan.id);

    await request(app).post(`/v1/admin/pricing/plans/${first.body.plan.id}/publish`).set(auth);
    await request(app).post(`/v1/admin/pricing/plans/${second.body.plan.id}/publish`).set(auth);

    const listed = await request(app).get('/v1/admin/pricing/plans?status=published').set(auth);
    const highlighted = listed.body.plans.filter((p: { highlighted: boolean }) => p.highlighted);
    const ours = highlighted.filter((p: { id: string }) =>
      [first.body.plan.id, second.body.plan.id].includes(p.id),
    );
    expect(ours).toHaveLength(1);
    expect(ours[0].id).toBe(second.body.plan.id);
  });

  it('deletes drafts; refuses delete when subscribed; archives instead', async () => {
    const { auth, userId } = await adminAuth('price-del');
    const draft = await request(app).post('/v1/admin/pricing/plans').set(auth).send(planBody());
    const draftId = trackPlan(draft.body.plan.id);

    const delDraft = await request(app).delete(`/v1/admin/pricing/plans/${draftId}`).set(auth);
    expect(delDraft.status).toBe(200);

    const published = await request(app).post('/v1/admin/pricing/plans').set(auth).send(planBody());
    const pubId = trackPlan(published.body.plan.id);
    expect(
      (await request(app).post(`/v1/admin/pricing/plans/${pubId}/publish`).set(auth)).status,
    ).toBe(200);

    await prisma.planSubscription.create({
      data: { userId, planId: pubId, status: 'ACTIVE' },
    });

    const delSub = await request(app).delete(`/v1/admin/pricing/plans/${pubId}`).set(auth);
    expect(delSub.status).toBe(409);
    expect(delSub.body.error.code).toBe('CONFLICT');

    const archived = await request(app).post(`/v1/admin/pricing/plans/${pubId}/archive`).set(auth);
    expect(archived.status).toBe(200);
    expect(archived.body.plan.status).toBe('archived');
  });

  it('cannot archive the last published plan', async () => {
    const { auth } = await adminAuth('price-last');
    const created = await request(app).post('/v1/admin/pricing/plans').set(auth).send(planBody());
    const id = trackPlan(created.body.plan.id);
    await request(app).post(`/v1/admin/pricing/plans/${id}/publish`).set(auth);

    const others = await prisma.plan.findMany({
      where: { status: 'PUBLISHED', id: { not: id } },
      select: { id: true },
    });
    const otherIds = others.map((p) => p.id);

    try {
      if (otherIds.length > 0) {
        await prisma.plan.updateMany({
          where: { id: { in: otherIds } },
          data: { status: 'DRAFT' },
        });
      }
      const res = await request(app).post(`/v1/admin/pricing/plans/${id}/archive`).set(auth);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    } finally {
      if (otherIds.length > 0) {
        await prisma.plan.updateMany({
          where: { id: { in: otherIds } },
          data: { status: 'PUBLISHED' },
        });
      }
    }
  });

  it('non-admin cannot PATCH', async () => {
    const admin = await adminAuth('price-adm');
    const customer = await authHeaders('price-cust');
    const created = await request(app)
      .post('/v1/admin/pricing/plans')
      .set(admin.auth)
      .send(planBody());
    trackPlan(created.body.plan.id);

    const res = await request(app)
      .patch(`/v1/admin/pricing/plans/${created.body.plan.id}`)
      .set(customer.auth)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('validation errors include details[].field', async () => {
    const { auth } = await adminAuth('price-val');
    const res = await request(app).post('/v1/admin/pricing/plans').set(auth).send({
      slug: 'Not Valid',
      name: '',
      blurb: '',
      priceCents: -1,
      interval: 'month',
      features: [],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['slug', 'priceCents', 'features']));
  });

  it('price change on a published plan creates a version', async () => {
    const { auth } = await adminAuth('price-ver');
    const created = await request(app)
      .post('/v1/admin/pricing/plans')
      .set(auth)
      .send(planBody({ priceCents: 600, interval: 'month' }));
    const id = trackPlan(created.body.plan.id);
    await request(app).post(`/v1/admin/pricing/plans/${id}/publish`).set(auth);

    const updated = await request(app)
      .patch(`/v1/admin/pricing/plans/${id}`)
      .set(auth)
      .send({ priceCents: 800 });
    expect(updated.status).toBe(200);
    expect(updated.body.versionCreated).toBe(true);
    expect(updated.body.plan.priceCents).toBe(800);
    expect(updated.body.plan.currentVersion).toBe(2);

    const versions = await prisma.planVersion.findMany({ where: { planId: id } });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.priceCents).toBe(600);
  });
});
