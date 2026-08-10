import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/lib/env.js';
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

const sampleSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/momentum-test-endpoint',
  keys: {
    p256dh: 'BN_test_p256dh_public_key_material_xxxxxxxx',
    auth: 'k9_test_auth_secret',
  },
};

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await cleanupUsersByEmails(emails);
  await closeTestResources();
});

describe('devices', () => {
  it('registers a subscription and lists it without the endpoint', async () => {
    const { auth } = await authHeaders('dev-reg');

    const created = await request(app)
      .post('/v1/devices')
      .set(auth)
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0.0.0')
      .send(sampleSubscription);
    expect(created.status).toBe(200);
    expect(created.body.device).toMatchObject({
      platform: 'WEB',
    });
    expect(created.body.device.deviceName).toMatch(/Chrome/);
    expect(created.body.device).not.toHaveProperty('endpoint');
    expect(created.body.device).not.toHaveProperty('pushToken');
    expect(created.body.device).not.toHaveProperty('keys');

    const listed = await request(app).get('/v1/devices').set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.devices).toHaveLength(1);
    expect(listed.body.devices[0]).not.toHaveProperty('endpoint');
    expect(listed.body.devices[0]).not.toHaveProperty('pushToken');
  });

  it('registering the same endpoint twice upserts one row and updates lastSeenAt', async () => {
    const { auth } = await authHeaders('dev-up');

    const first = await request(app)
      .post('/v1/devices')
      .set(auth)
      .send({
        ...sampleSubscription,
        endpoint: 'https://fcm.googleapis.com/fcm/send/upsert-once',
        deviceName: 'First',
      });
    expect(first.status).toBe(200);
    const id = first.body.device.id as string;
    const firstSeen = first.body.device.lastSeenAt as string;

    await new Promise((r) => setTimeout(r, 20));

    const second = await request(app)
      .post('/v1/devices')
      .set(auth)
      .send({
        ...sampleSubscription,
        endpoint: 'https://fcm.googleapis.com/fcm/send/upsert-once',
        deviceName: 'Second',
      });
    expect(second.status).toBe(200);
    expect(second.body.device.id).toBe(id);
    expect(second.body.device.deviceName).toBe('Second');
    expect(second.body.device.lastSeenAt >= firstSeen).toBe(true);

    const listed = await request(app).get('/v1/devices').set(auth);
    expect(listed.body.devices).toHaveLength(1);
  });

  it('moves a subscription already owned by another user', async () => {
    const a = await authHeaders('dev-move-a');
    const b = await authHeaders('dev-move-b');
    const endpoint = 'https://fcm.googleapis.com/fcm/send/shared-browser';

    const first = await request(app)
      .post('/v1/devices')
      .set(a.auth)
      .send({ ...sampleSubscription, endpoint });
    expect(first.status).toBe(200);
    const deviceId = first.body.device.id as string;

    const moved = await request(app)
      .post('/v1/devices')
      .set(b.auth)
      .send({ ...sampleSubscription, endpoint });
    expect(moved.status).toBe(200);
    expect(moved.body.device.id).toBe(deviceId);

    const aList = await request(app).get('/v1/devices').set(a.auth);
    expect(aList.body.devices).toHaveLength(0);

    const bList = await request(app).get('/v1/devices').set(b.auth);
    expect(bList.body.devices).toHaveLength(1);
    expect(bList.body.devices[0].id).toBe(deviceId);
  });

  it('rejects malformed subscription missing keys.auth', async () => {
    const { auth } = await authHeaders('dev-bad-keys');

    const res = await request(app)
      .post('/v1/devices')
      .set(auth)
      .send({
        endpoint: 'https://fcm.googleapis.com/fcm/send/bad',
        keys: { p256dh: 'only-one' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects non-https endpoint', async () => {
    const { auth } = await authHeaders('dev-http');

    const res = await request(app)
      .post('/v1/devices')
      .set(auth)
      .send({
        ...sampleSubscription,
        endpoint: 'http://fcm.googleapis.com/fcm/send/insecure',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE another user’s device id → 404', async () => {
    const a = await authHeaders('dev-del-a');
    const b = await authHeaders('dev-del-b');

    const created = await request(app)
      .post('/v1/devices')
      .set(a.auth)
      .send({
        ...sampleSubscription,
        endpoint: 'https://fcm.googleapis.com/fcm/send/private-device',
      });
    const deviceId = created.body.device.id as string;

    const res = await request(app).delete(`/v1/devices/${deviceId}`).set(b.auth);
    expect(res.status).toBe(404);
  });

  it('GET /v1/devices/vapid-public-key returns the key without a token', async () => {
    const res = await request(app).get('/v1/devices/vapid-public-key');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ publicKey: env.VAPID_PUBLIC_KEY ?? '' });
  });
});
