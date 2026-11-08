import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { server, verifyAdminAuth } from '../src/server/app.ts';
import type { AddressInfo } from 'node:net';

describe('Server Security & Auth Verification', () => {
  let baseUrl = '';

  before((_, done) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  after((_, done) => {
    server.close(done);
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
    assert.equal(verifyAdminAuth('Bearer oopsla-secret-admin-key-change-in-prod'), true);
  });
});
