import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { server, verifyAdminAuth, assertAdminSecretConfigured } from '../src/server/app.ts';
import type { AddressInfo } from 'node:net';

describe('Server Security & Auth Verification', () => {
  let baseUrl = '';
  const adminSecret = randomBytes(32).toString('hex');

  before((_, done) => {
    process.env.ADMIN_SECRET_KEY = adminSecret;
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  after((_, done) => {
    server.close(() => {
      delete process.env.ADMIN_SECRET_KEY;
      done();
    });
  });

  test('GET /api/health responds with 200 and security headers', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    const data = await res.json();
    assert.equal(data.status, 'healthy');
  });

  test('POST /api/admin/orders/:id/confirm rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders/OLS-000001/confirm`, {
      method: 'POST'
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.includes('Unauthorized'));
  });

  test('verifyAdminAuth validates Bearer secret accurately', () => {
    assert.equal(verifyAdminAuth(undefined), false);
    assert.equal(verifyAdminAuth('Basic 12345'), false);
    assert.equal(verifyAdminAuth('Bearer wrong-key'), false);
    assert.equal(verifyAdminAuth('Bearer oopsla-secret-admin-key-change-in-prod'), false);
    assert.equal(verifyAdminAuth(`Bearer ${adminSecret}`), true);
  });

  test('missing ADMIN_SECRET_KEY fails closed across auth and assertions', async () => {
    delete process.env.ADMIN_SECRET_KEY;
    try {
      assert.equal(verifyAdminAuth('Bearer oopsla-secret-admin-key-change-in-prod'), false);
      assert.equal(verifyAdminAuth('Bearer '), false);
      const res = await fetch(`${baseUrl}/api/admin/orders/OLS-000001/confirm`, {
        method: 'POST',
        headers: { Authorization: 'Bearer oopsla-secret-admin-key-change-in-prod' }
      });
      assert.equal(res.status, 401);
      assert.throws(() => assertAdminSecretConfigured(), /ADMIN_SECRET_KEY is not configured/);
    } finally {
      process.env.ADMIN_SECRET_KEY = adminSecret;
    }
  });
});
