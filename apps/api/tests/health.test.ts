import { afterAll, describe, expect, it } from 'vitest';
import { closeTestResources, createTestApp, request } from './helpers.js';

const app = createTestApp();

describe('health', () => {
  afterAll(async () => {
    await closeTestResources();
  });

  it('answers liveness on deploy probe paths without Redis', async () => {
    for (const path of ['/health', '/v1/health', '/api/health']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.uptime).toBe('number');
    }
  });
});
