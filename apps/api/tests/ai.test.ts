import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
const promptIds: string[] = [];

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
    auth: { Authorization: `Bearer ${res.body.accessToken as string}` },
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

async function proAuth(prefix: string) {
  const session = await authHeaders(prefix);
  await grantProAccess(app, session.userId, { planSlug: 'pro-lifetime', accessType: 'lifetime' });
  return session;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  if (promptIds.length > 0) {
    await prisma.aiPrompt.deleteMany({ where: { id: { in: promptIds } } });
  }
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('AI chat and prompts', () => {
  it('lists habit AI features for signed-in users', async () => {
    const customer = await authHeaders('ai-feat');
    const res = await request(app).get('/v1/ai/features').set(customer.auth);
    expect(res.status).toBe(200);
    expect(res.body.features.length).toBeGreaterThan(0);
    expect(res.body.features.map((row: { feature: string }) => row.feature)).toEqual(
      expect.arrayContaining(['chat', 'generate_habit', 'create_habit']),
    );
  });

  it('blocks free users from chat and create-habit', async () => {
    const customer = await authHeaders('ai-free');
    const chat = await request(app)
      .post('/v1/ai/chat')
      .set(customer.auth)
      .send({ message: 'How do I start running?' });
    expect(chat.status).toBe(403);

    const create = await request(app)
      .post('/v1/ai/create-habit')
      .set(customer.auth)
      .send({ message: 'Drink water' });
    expect(create.status).toBe(403);
  });

  it('lets Pro users chat about habits and draft a habit', async () => {
    const customer = await proAuth('ai-pro');

    const chat = await request(app)
      .post('/v1/ai/chat')
      .set(customer.auth)
      .send({
        message: 'I missed yesterday. How do I restart without guilt?',
        history: [{ role: 'user', content: 'I keep skipping evening walks.' }],
      });
    expect(chat.status).toBe(200);
    expect(typeof chat.body.reply).toBe('string');
    expect(chat.body.reply.length).toBeGreaterThan(0);
    expect(['gemini', 'fallback']).toContain(chat.body.source);

    const bangla = await request(app)
      .post('/v1/ai/chat')
      .set(customer.auth)
      .send({ message: 'আজকে আমার অভ্যাস কেমন চলছে?' });
    expect(bangla.status).toBe(200);
    expect(typeof bangla.body.reply).toBe('string');
    expect(bangla.body.reply.length).toBeGreaterThan(0);

    const banglish = await request(app)
      .post('/v1/ai/chat')
      .set(customer.auth)
      .send({ message: 'Ami ajke gym miss korchi, ki korbo?' });
    expect(banglish.status).toBe(200);
    expect(typeof banglish.body.reply).toBe('string');
    expect(banglish.body.reply.length).toBeGreaterThan(0);

    const draft = await request(app)
      .post('/v1/ai/create-habit')
      .set(customer.auth)
      .send({ goal: 'read more', message: 'I want a tiny reading habit' });
    expect(draft.status).toBe(200);
    expect(draft.body.habit.title.length).toBeGreaterThan(0);
    expect(draft.body.habit.scheduleType).toBeTruthy();
    expect(draft.body.habit.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('lets admins create and publish prompts; customers cannot', async () => {
    const admin = await adminAuth('ai-adm');
    const customer = await authHeaders('ai-cust');

    const forbidden = await request(app)
      .post('/v1/admin/ai/prompts')
      .set(customer.auth)
      .send({
        slug: `chat-custom-${Date.now()}`,
        name: 'Custom chat',
        feature: 'chat',
        body: 'You are a strict habit coach. Always answer in two sentences. {{message}}',
      });
    expect(forbidden.status).toBe(403);

    const created = await request(app)
      .post('/v1/admin/ai/prompts')
      .set(admin.auth)
      .send({
        slug: `chat-custom-${Date.now()}`,
        name: 'Custom chat',
        feature: 'chat',
        body: 'You are a strict habit coach. Always answer in two sentences. {{message}}',
      });
    expect(created.status).toBe(201);
    const id = created.body.prompt.id as string;
    promptIds.push(id);
    expect(created.body.prompt.status).toBe('draft');

    const published = await request(app).post(`/v1/admin/ai/prompts/${id}/publish`).set(admin.auth);
    expect(published.status).toBe(200);
    expect(published.body.prompt.status).toBe('published');

    const listed = await request(app)
      .get('/v1/admin/ai/prompts?feature=chat&status=published')
      .set(admin.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.prompts.some((row: { id: string }) => row.id === id)).toBe(true);
  });
});
