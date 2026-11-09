#!/usr/bin/env node
/**
 * API Security Validation Runner (Node 22 ESM)
 * Validates fail-closed authentication and security boundaries across Node server and Edge Worker.
 * Modes:
 *   node scripts/ci/api-security-check.mjs server
 *   node --experimental-strip-types scripts/ci/api-security-check.mjs worker
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];

if (!mode || (mode !== 'server' && mode !== 'worker')) {
  console.error('Usage: node scripts/ci/api-security-check.mjs <server|worker>');
  process.exit(1);
}

const resultsFile = process.env.RESULTS_FILE || '';

function saveResults(newChecks) {
  if (!resultsFile) return;
  const absPath = path.resolve(process.cwd(), resultsFile);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  let existing = { checks: [], passed: 0, failed: 0 };
  if (fs.existsSync(absPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(absPath, 'utf8'));
      if (!Array.isArray(existing.checks)) existing.checks = [];
    } catch {
      existing = { checks: [], passed: 0, failed: 0 };
    }
  }

  const combinedChecks = [...existing.checks, ...newChecks];
  const passed = combinedChecks.filter(c => c.pass).length;
  const failed = combinedChecks.filter(c => !c.pass).length;

  fs.writeFileSync(
    absPath,
    JSON.stringify({ checks: combinedChecks, passed, failed }, null, 2),
    'utf8'
  );
}

function printTable(checks) {
  console.log('\n--- API Security Validation Summary ---');
  const pad = (str, len) => (str.length > len ? str.slice(0, len - 3) + '...' : str.padEnd(len));
  console.log('┌' + '─'.repeat(56) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(8) + '┐');
  console.log(`│ ${pad('Check Name', 54)} │ ${pad('Expected', 8)} │ ${pad('Actual', 8)} │ ${pad('Status', 6)} │`);
  console.log('├' + '─'.repeat(56) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(8) + '┤');

  for (const c of checks) {
    const status = c.pass ? 'PASS' : 'FAIL';
    console.log(
      `│ ${pad(c.name, 54)} │ ${pad(String(c.expected), 8)} │ ${pad(String(c.actual), 8)} │ ${pad(status, 6)} │`
    );
  }
  console.log('└' + '─'.repeat(56) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(8) + '┘');
  const passCount = checks.filter(c => c.pass).length;
  const failCount = checks.filter(c => !c.pass).length;
  console.log(`Total: ${checks.length} | Passed: ${passCount} | Failed: ${failCount}\n`);
}

async function runServerMode() {
  const baseUrl = process.env.BASE_URL?.replace(/\/+$/, '');
  const adminSecret = process.env.ADMIN_SECRET_KEY?.trim();

  if (!baseUrl) {
    console.error('Error: BASE_URL environment variable is required.');
    process.exit(1);
  }
  if (!adminSecret) {
    console.error('Error: ADMIN_SECRET_KEY environment variable is required.');
    process.exit(1);
  }

  const checks = [];

  // a) GET /api/health -> 200
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    checks.push({
      name: 'GET /api/health - Public health check',
      expected: 200,
      actual: res.status,
      pass: res.status === 200,
    });
  } catch (err) {
    checks.push({
      name: 'GET /api/health - Public health check',
      expected: 200,
      actual: err.message,
      pass: false,
    });
  }

  // b) For ALL 5 admin routes: 4 unauthorized variations
  const adminRoutes = [
    { method: 'GET', path: '/api/admin/orders', desc: 'GET /api/admin/orders' },
    { method: 'POST', path: '/api/admin/orders/OLS-SEC001/confirm', desc: 'POST /api/admin/orders/:id/confirm' },
    { method: 'POST', path: '/api/admin/orders/OLS-SEC001/cancel', desc: 'POST /api/admin/orders/:id/cancel' },
    { method: 'POST', path: '/api/admin/orders/OLS-SEC001/status', desc: 'POST /api/admin/orders/:id/status' },
    { method: 'POST', path: '/api/admin/stock', desc: 'POST /api/admin/stock' },
  ];

  const oldPublicFallback = 'oopsla-secret-admin-key-' + 'change-in-prod';
  const wrongToken = randomBytes(32).toString('hex');

  for (const route of adminRoutes) {
    // 1. No Authorization header
    try {
      const res = await fetch(`${baseUrl}${route.path}`, { method: route.method });
      checks.push({
        name: `${route.desc} [No Auth Header]`,
        expected: 401,
        actual: res.status,
        pass: res.status === 401,
      });
    } catch (err) {
      checks.push({ name: `${route.desc} [No Auth Header]`, expected: 401, actual: err.message, pass: false });
    }

    // 2. Bearer <random wrong 64-hex>
    try {
      const res = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: { Authorization: `Bearer ${wrongToken}` },
      });
      checks.push({
        name: `${route.desc} [Wrong Bearer Token]`,
        expected: 401,
        actual: res.status,
        pass: res.status === 401,
      });
    } catch (err) {
      checks.push({ name: `${route.desc} [Wrong Bearer Token]`, expected: 401, actual: err.message, pass: false });
    }

    // 3. Bearer + old public fallback
    try {
      const res = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: { Authorization: `Bearer ${oldPublicFallback}` },
      });
      checks.push({
        name: `${route.desc} [Old Public Fallback Secret]`,
        expected: 401,
        actual: res.status,
        pass: res.status === 401,
      });
    } catch (err) {
      checks.push({ name: `${route.desc} [Old Public Fallback Secret]`, expected: 401, actual: err.message, pass: false });
    }

    // 4. Basic xyz
    try {
      const res = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      checks.push({
        name: `${route.desc} [Basic Auth Header]`,
        expected: 401,
        actual: res.status,
        pass: res.status === 401,
      });
    } catch (err) {
      checks.push({ name: `${route.desc} [Basic Auth Header]`, expected: 401, actual: err.message, pass: false });
    }
  }

  // c) Valid path with correct secret on isolated test data
  // 1. GET /api/admin/orders -> 200 and JSON shape { data: [] }
  try {
    const res = await fetch(`${baseUrl}/api/admin/orders`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminSecret}` },
    });
    const body = res.status === 200 ? await res.json() : null;
    const validShape = body && Array.isArray(body.data);
    checks.push({
      name: 'GET /api/admin/orders [Valid Auth & Shape]',
      expected: '200 {data:[]}',
      actual: validShape ? '200 {data:[]}' : `${res.status} invalid-shape`,
      pass: res.status === 200 && validShape,
    });
  } catch (err) {
    checks.push({
      name: 'GET /api/admin/orders [Valid Auth & Shape]',
      expected: '200 {data:[]}',
      actual: err.message,
      pass: false,
    });
  }

  // 2. Create order via POST /api/orders (single request, rate-limit friendly)
  let createdOrderId = '';
  try {
    const orderPayload = {
      customer: {
        fullName: 'Security CI Collector',
        phone: '0912345678',
        address: '123 Ba Trieu, Hanoi',
        notes: 'Security CI check order',
      },
      items: [{ bookId: 'ols-book-01', quantity: 1, unitPriceVND: 1250000 }],
    };
    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });
    const orderBody = await orderRes.json();
    if (orderRes.status === 201 && orderBody?.data?.id) {
      createdOrderId = orderBody.data.id;
    }
    checks.push({
      name: 'POST /api/orders [Create Test Order]',
      expected: 201,
      actual: orderRes.status,
      pass: orderRes.status === 201 && !!createdOrderId,
    });
  } catch (err) {
    checks.push({
      name: 'POST /api/orders [Create Test Order]',
      expected: 201,
      actual: err.message,
      pass: false,
    });
  }

  // 3. Confirm the created order via POST /api/admin/orders/:id/confirm
  if (createdOrderId) {
    try {
      const confirmRes = await fetch(`${baseUrl}/api/admin/orders/${createdOrderId}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminSecret}` },
      });
      const confirmBody = confirmRes.status === 200 ? await confirmRes.json() : null;
      const isConfirmed = confirmBody?.data?.status === 'CONFIRMED';
      checks.push({
        name: `POST /api/admin/orders/:id/confirm [Valid Auth & Confirm]`,
        expected: '200 CONFIRMED',
        actual: isConfirmed ? '200 CONFIRMED' : `${confirmRes.status} ${confirmBody?.data?.status || 'fail'}`,
        pass: confirmRes.status === 200 && isConfirmed,
      });
    } catch (err) {
      checks.push({
        name: 'POST /api/admin/orders/:id/confirm [Valid Auth & Confirm]',
        expected: '200 CONFIRMED',
        actual: err.message,
        pass: false,
      });
    }
  } else {
    checks.push({
      name: 'POST /api/admin/orders/:id/confirm [Skipped due to order creation failure]',
      expected: 200,
      actual: 'SKIPPED',
      pass: false,
    });
  }

  // 4. Second isolated order -> status CONTACTED -> cancel (covers the remaining 2 admin routes' valid path)
  let secondOrderId = '';
  try {
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: 'Security CI Collector Two', phone: '0987654321', address: '45 Hang Bai, Hanoi', notes: 'Security CI check order 2' },
        items: [{ bookId: 'ols-book-01', quantity: 1, unitPriceVND: 1250000 }],
      }),
    });
    const body = await res.json();
    if (res.status === 201 && body?.data?.id) secondOrderId = body.data.id;
    checks.push({ name: 'POST /api/orders [Create Second Test Order]', expected: 201, actual: res.status, pass: res.status === 201 && !!secondOrderId });
  } catch (err) {
    checks.push({ name: 'POST /api/orders [Create Second Test Order]', expected: 201, actual: err.message, pass: false });
  }

  const postAdminJson = async (name, p, payload, expectedStatus) => {
    try {
      const res = await fetch(`${baseUrl}${p}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminSecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = res.status === 200 ? await res.json() : null;
      const ok = res.status === 200 && body?.data?.status === expectedStatus;
      checks.push({ name, expected: `200 ${expectedStatus}`, actual: ok ? `200 ${expectedStatus}` : `${res.status} ${body?.data?.status || 'fail'}`, pass: ok });
    } catch (err) {
      checks.push({ name, expected: `200 ${expectedStatus}`, actual: err.message, pass: false });
    }
  };

  if (secondOrderId) {
    await postAdminJson('POST /api/admin/orders/:id/status [Valid Auth & CONTACTED]', `/api/admin/orders/${secondOrderId}/status`, { status: 'CONTACTED' }, 'CONTACTED');
    await postAdminJson('POST /api/admin/orders/:id/cancel [Valid Auth & Cancel]', `/api/admin/orders/${secondOrderId}/cancel`, { reason: 'Security CI cleanup' }, 'CANCELLED');
  } else {
    checks.push({ name: 'POST /api/admin/orders/:id/status|cancel [Not run: second order missing]', expected: 200, actual: 'NOT RUN', pass: false });
  }

  // 5. Update stock via POST /api/admin/stock with seed bookId
  try {
    const stockRes = await fetch(`${baseUrl}/api/admin/stock`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId: 'ols-book-01', stockCount: 10 }),
    });
    const stockBody = stockRes.status === 200 ? await stockRes.json() : null;
    const stockUpdated = stockBody?.data?.stockCount === 10;
    checks.push({
      name: 'POST /api/admin/stock [Valid Auth & Stock Update]',
      expected: '200 stock=10',
      actual: stockUpdated ? '200 stock=10' : `${stockRes.status} fail`,
      pass: stockRes.status === 200 && stockUpdated,
    });
  } catch (err) {
    checks.push({
      name: 'POST /api/admin/stock [Valid Auth & Stock Update]',
      expected: '200 stock=10',
      actual: err.message,
      pass: false,
    });
  }

  printTable(checks);
  saveResults(checks);

  const hasFail = checks.some(c => !c.pass);
  if (hasFail) {
    process.exit(1);
  }
}

async function runWorkerMode() {
  const checks = [];

  try {
    const workerModule = await import('../../src/worker.ts');
    const worker = workerModule.default;

    // Test 1: Env lacking ADMIN_SECRET_KEY -> 503
    const req1 = new Request('http://localhost/api/admin/orders', {
      headers: { Authorization: 'Bearer random-test-token' },
    });
    const res1 = await worker.fetch(req1, {});
    checks.push({
      name: 'Worker GET /api/admin/orders [Missing ADMIN_SECRET_KEY]',
      expected: 503,
      actual: res1.status,
      pass: res1.status === 503,
    });

    // Test 2: Env with random secret and wrong token -> 401
    const testSecret = randomBytes(32).toString('hex');
    const req2 = new Request('http://localhost/api/admin/orders', {
      headers: { Authorization: 'Bearer wrong-secret-token' },
    });
    const res2 = await worker.fetch(req2, { ADMIN_SECRET_KEY: testSecret });
    checks.push({
      name: 'Worker GET /api/admin/orders [Configured Secret, Wrong Token]',
      expected: 401,
      actual: res2.status,
      pass: res2.status === 401,
    });

    // Test 3: Env with random secret and valid token -> 200 (unbound D1 notice)
    const req3 = new Request('http://localhost/api/admin/orders', {
      headers: { Authorization: `Bearer ${testSecret}` },
    });
    const res3 = await worker.fetch(req3, { ADMIN_SECRET_KEY: testSecret });
    checks.push({
      name: 'Worker GET /api/admin/orders [Configured Secret, Valid Token]',
      expected: 200,
      actual: res3.status,
      pass: res3.status === 200,
    });
  } catch (err) {
    checks.push({
      name: 'Worker mode execution',
      expected: 'No uncaught exceptions',
      actual: err.message,
      pass: false,
    });
  }

  printTable(checks);
  saveResults(checks);

  const hasFail = checks.some(c => !c.pass);
  if (hasFail) {
    process.exit(1);
  }
}

if (mode === 'server') {
  runServerMode().catch(err => {
    console.error('Fatal server check error:', err);
    process.exit(1);
  });
} else if (mode === 'worker') {
  runWorkerMode().catch(err => {
    console.error('Fatal worker check error:', err);
    process.exit(1);
  });
}
