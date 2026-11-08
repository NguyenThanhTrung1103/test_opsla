import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../src/server/app.ts';
import { catalogService } from '../src/services/catalogService.ts';
import { orderService } from '../src/services/orderService.ts';
import { IndexedDBAdapter } from '../src/storage/indexed-db.ts';
import type { AddressInfo } from 'node:net';

describe('Concurrency, Persistence Fail-Closed & Storefront Integration (V01-V06)', () => {
  let baseUrl = '';
  const adminSecret = 'oopsla-secret-admin-key-change-in-prod';
  const authHeader = `Bearer ${adminSecret}`;

  before(async () => {
    await catalogService.initialize();
    await orderService.initialize();

    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after((_, done) => {
    server.close(done);
  });

  test('V01: Concurrency — Two concurrent confirmOrder calls for the last copy must NOT double-decrement', async () => {
    // Set stock to 1
    await catalogService.updateStockCount('ols-book-01', 1);

    // Create 2 independent orders for ols-book-01
    const orderA = await orderService.createCollectorRequest(
      { fullName: 'Buyer A', phone: '0912345678', address: 'Hanoi' },
      [{ bookId: 'ols-book-01', quantity: 1, unitPriceVND: 0, bookTitle: '' }]
    );
    const orderB = await orderService.createCollectorRequest(
      { fullName: 'Buyer B', phone: '0987654321', address: 'Saigon' },
      [{ bookId: 'ols-book-01', quantity: 1, unitPriceVND: 0, bookTitle: '' }]
    );

    // Trigger concurrent confirmation via Promise.all
    const [resA, resB] = await Promise.all([
      orderService.confirmOrder(orderA.id, 'OWNER'),
      orderService.confirmOrder(orderB.id, 'OWNER')
    ]);

    const successes = [resA, resB].filter(r => r.success);
    const failures = [resA, resB].filter(r => !r.success);

    assert.equal(successes.length, 1, 'Exactly one order must be successfully confirmed');
    assert.equal(failures.length, 1, 'The competing order must fail due to OD-02 inventory check');
    assert.ok(failures[0].error?.includes('OD-02'), 'Failure error must cite OD-02 stock insufficiency');

    // Verify stock is exactly 0, never negative
    const bookFinal = await catalogService.getBookById('ols-book-01');
    assert.equal(bookFinal!.stockCount, 0, 'Final stock must remain exactly 0');

    // Clean up: Restore stock for subsequent test suites
    await catalogService.updateStockCount('ols-book-01', 3);
  });

  test('V02: Fail-Closed Persistence — Disk write errors must reject put() and not silently resolve', async () => {
    // Create an adapter configured to save to an invalid path that cannot be written
    const invalidPath = process.cwd(); // Passing directory path instead of file causes EISDIR on writeFileSync
    const adapter = new IndexedDBAdapter(invalidPath);

    await assert.rejects(
      async () => {
        await adapter.put('settings', { key: 'fail_test', value: 123 });
      },
      /EISDIR|EPERM|EACCES/,
      'put() must reject when disk persistence fails'
    );
  });

  test('V03: Runtime Allowlist — POST /api/admin/orders/:id/status rejects invalid statuses with 400', async () => {
    const order = await orderService.createCollectorRequest(
      { fullName: 'Tester Status', phone: '0933221100', address: 'Hue' },
      [{ bookId: 'ols-book-01', quantity: 1, unitPriceVND: 0, bookTitle: '' }]
    );

    const res = await fetch(`${baseUrl}/api/admin/orders/${order.id}/status`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'INVALID_STATUS_FOOBAR' })
    });

    assert.equal(res.status, 400, 'Invalid status must receive HTTP 400');
    const data = await res.json();
    assert.ok(data.error.includes('Invalid status'), 'Error message must identify invalid status');

    // Verify status was NOT changed in database
    const freshOrder = await orderService.getOrderById(order.id);
    assert.equal(freshOrder!.status, 'PENDING_CONTACT');
  });

  test('V04: Catalog ID Aliases — Storefront mockup IDs map seamlessly to authentic backend books', async () => {
    // Test getBookById resolving mockup alias
    const aliasedBook = await catalogService.getBookById('book-bowwow-1');
    assert.ok(aliasedBook, 'book-bowwow-1 must resolve to ols-book-01');
    assert.equal(aliasedBook.id, 'ols-book-01');

    // Test creating an order via HTTP API using mockup bookId
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: 'Mockup User', phone: '0911223344', address: 'Can Tho' },
        items: [{ bookId: 'book-bowwow-1', quantity: 1, unitPriceVND: 0 }]
      })
    });

    assert.equal(res.status, 201, 'Submitting with mockup ID must succeed with 201');
    const data = await res.json();
    assert.equal(data.data.items[0].bookId, 'ols-book-01');
  });

  test('V05: CSP Headers permit essential frontend script & style CDNs', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const csp = res.headers.get('content-security-policy') || '';

    assert.ok(csp.includes('cdn.tailwindcss.com'), 'CSP must permit Tailwind CDN');
    assert.ok(csp.includes('unpkg.com'), 'CSP must permit Lucide icons unpkg CDN');
    assert.ok(csp.includes('fonts.googleapis.com'), 'CSP must permit Google Fonts style');
  });
});
