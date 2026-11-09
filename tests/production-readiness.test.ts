import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { server } from '../src/server/app.ts';
import { catalogService } from '../src/services/catalogService.ts';
import { orderService } from '../src/services/orderService.ts';
import { IndexedDBAdapter } from '../src/storage/indexed-db.ts';
import type { AddressInfo } from 'node:net';

describe('Production Readiness & Security Hardening Verification (R01-R13)', () => {
  let baseUrl = '';
  const adminSecret = randomBytes(32).toString('hex');
  const authHeader = `Bearer ${adminSecret}`;

  before(async () => {
    process.env.ADMIN_SECRET_KEY = adminSecret;
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
    server.close(() => {
      delete process.env.ADMIN_SECRET_KEY;
      done();
    });
  });

  test('R06: Server validates customer payload & rejects invalid quantities', async () => {
    // Missing customer fields
    const res1 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: '', phone: '0912345678', address: 'Hanoi' },
        items: [{ bookId: 'ols-book-01', quantity: 1, unitPriceVND: 1000 }]
      })
    });
    assert.equal(res1.status, 400);

    // Negative quantity
    const res2 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: 'Tran Van A', phone: '0912345678', address: 'Hanoi' },
        items: [{ bookId: 'ols-book-01', quantity: -2, unitPriceVND: 1000 }]
      })
    });
    assert.equal(res2.status, 400);

    // Non-existent bookId
    const res3 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: 'Tran Van A', phone: '0912345678', address: 'Hanoi' },
        items: [{ bookId: 'non-existent-book', quantity: 1, unitPriceVND: 1000 }]
      })
    });
    assert.equal(res3.status, 400);
  });

  test('R06: Server ignores client-tampered price and uses authentic catalog price', async () => {
    const book = await catalogService.getBookById('ols-book-01');
    assert.ok(book, 'Book ols-book-01 must exist');

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { fullName: 'Kiem Tra Gia', phone: '0988776655', address: 'Saigon' },
        items: [{ bookId: 'ols-book-01', quantity: 2, unitPriceVND: 10 }] // Fake 10 VND
      })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.subtotalVND, book.priceVND! * 2, 'Subtotal must match server book price * 2');
    assert.equal(body.data.items[0].unitPriceVND, book.priceVND!);
  });

  test('R01 & R07 & R08: Positive Path — Admin can confirm order, decrement stock once and reject double decrement', async () => {
    // Ensure sufficient initial stock before test
    await catalogService.updateStockCount('ols-book-01', 3);
    const bookInitial = await catalogService.getBookById('ols-book-01');
    const initialStock = bookInitial!.stockCount;

    // Create an order
    const order = await orderService.createCollectorRequest(
      { fullName: 'Nguoi Mua A', phone: '0912345678', address: '123 Ba Trieu, Hanoi' },
      [{ bookId: 'ols-book-01', quantity: 1, unitPriceVND: 0, bookTitle: '' }]
    );
    assert.ok(order.id.startsWith('OLS-'));

    // Confirm the order via HTTP endpoint with valid token
    const confirmRes = await fetch(`${baseUrl}/api/admin/orders/${order.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: authHeader }
    });
    assert.equal(confirmRes.status, 200, 'Confirm order must succeed with 200');
    const confirmData = await confirmRes.json();
    assert.equal(confirmData.data.status, 'CONFIRMED');
    assert.equal(confirmData.data.stockDeducted, true);

    // Verify stock is decremented exactly by 1
    const bookAfter = await catalogService.getBookById('ols-book-01');
    assert.equal(bookAfter!.stockCount, initialStock - 1);

    // Calling confirm AGAIN should NOT double-decrement stock
    const secondConfirmRes = await fetch(`${baseUrl}/api/admin/orders/${order.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: authHeader }
    });
    assert.equal(secondConfirmRes.status, 200);
    const bookAfterSecond = await catalogService.getBookById('ols-book-01');
    assert.equal(bookAfterSecond!.stockCount, initialStock - 1, 'Stock must not decrement again');
  });

  test('R05: Cancel order strictly blocks unauthenticated requests with 401', async () => {
    const order = await orderService.createCollectorRequest(
      { fullName: 'Khach Cancel', phone: '0933445566', address: 'Da Nang' },
      [{ bookId: 'ols-book-01', quantity: 1, unitPriceVND: 0, bookTitle: '' }]
    );

    // Request without Authorization header
    const unauthRes = await fetch(`${baseUrl}/api/admin/orders/${order.id}/cancel`, {
      method: 'POST'
    });
    assert.equal(unauthRes.status, 401, 'Unauthenticated request must receive 401');

    // Request with valid Authorization header
    const authRes = await fetch(`${baseUrl}/api/admin/orders/${order.id}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'OWNER', reason: 'Khach doi y' })
    });
    assert.equal(authRes.status, 200);
    const authData = await authRes.json();
    assert.equal(authData.data.status, 'CANCELLED');
  });

  test('R09: Admin endpoints list orders and adjust stock with authentication', async () => {
    // List orders unauthenticated -> 401
    const resUnauth = await fetch(`${baseUrl}/api/admin/orders`);
    assert.equal(resUnauth.status, 401);

    // List orders authenticated -> 200
    const resAuth = await fetch(`${baseUrl}/api/admin/orders`, {
      headers: { Authorization: authHeader }
    });
    assert.equal(resAuth.status, 200);
    const data = await resAuth.json();
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 1);

    // Adjust stock manually -> 200
    const stockRes = await fetch(`${baseUrl}/api/admin/stock`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bookId: 'ols-book-02', stockCount: 10 })
    });
    assert.equal(stockRes.status, 200);
    const updatedBook = await catalogService.getBookById('ols-book-02');
    assert.equal(updatedBook!.stockCount, 10);
  });

  test('Security: Path Traversal attempts on static files are blocked', async () => {
    const res = await fetch(`${baseUrl}/../../package.json`);
    assert.equal(res.status, 404, 'Path traversal attempt must yield 404');
  });
});
