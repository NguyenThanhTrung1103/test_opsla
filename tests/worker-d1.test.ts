import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker, { type D1Database } from '../src/worker.ts';

function createMockD1(): { db: D1Database; ordersTable: any[]; booksTable: any[] } {
  const booksTable: any[] = [
    {
      id: 'ols-book-01',
      title: 'Graphic Anatomy Atelier Bow-Wow',
      category: 'Monograph',
      price_vnd: 1250000,
      stock_count: 3,
      featured: 1,
      tags_json: '["Atelier Bow-Wow", "1:20"]',
    },
  ];

  const ordersTable: any[] = [];

  const mockDb: D1Database = {
    prepare(query: string) {
      let boundParams: any[] = [];
      return {
        bind(...values: any[]) {
          boundParams = values;
          return this;
        },
        async first<T = unknown>(colName?: string): Promise<T | null> {
          return null;
        },
        async run<T = unknown>() {
          if (query.includes('SELECT 1')) {
            return { results: [], success: true, meta: {} };
          }
          if (query.includes('INSERT INTO orders')) {
            const [id, name, phone, address, notes, itemsJson, total, nowIso] = boundParams;
            ordersTable.push({
              id,
              customer_name: name,
              customer_phone: phone,
              customer_address: address,
              customer_notes: notes,
              items_json: itemsJson,
              total_amount_vnd: total,
              status: 'REQUEST_RECEIVED',
              created_at: nowIso,
            });
            return { results: [], success: true, meta: {} };
          }
          return { results: [], success: true, meta: {} };
        },
        async all<T = unknown>() {
          if (query.includes('SELECT * FROM books')) {
            return { results: booksTable as any as T[], success: true, meta: {} };
          }
          if (query.includes('SELECT * FROM orders')) {
            return { results: ordersTable as any as T[], success: true, meta: {} };
          }
          return { results: [], success: true, meta: {} };
        },
      };
    },
    async batch() {
      return [];
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
  };

  return { db: mockDb, ordersTable, booksTable };
}

describe('Cloudflare Worker & D1 Edge Integration Tests', () => {
  it('GET /api/health returns ok and checks D1 connectivity', async () => {
    const { db } = createMockD1();
    const req = new Request('http://localhost/api/health');
    const res = await worker.fetch(req, { DB: db });
    assert.equal(res.status, 200);

    const body = (await res.json()) as any;
    assert.equal(body.status, 'ok');
    assert.equal(body.runtime, 'cloudflare-worker');
    assert.equal(body.d1, 'connected');
  });

  it('GET /api/books queries books from D1 and parses tags', async () => {
    const { db } = createMockD1();
    const req = new Request('http://localhost/api/books');
    const res = await worker.fetch(req, { DB: db });
    assert.equal(res.status, 200);

    const body = (await res.json()) as any;
    assert.equal(body.count, 1);
    assert.equal(body.books[0].id, 'ols-book-01');
    assert.deepEqual(body.books[0].tags, ['Atelier Bow-Wow', '1:20']);
  });

  it('POST /api/orders validates customer payload and persists order to D1', async () => {
    const { db, ordersTable } = createMockD1();
    const req = new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          fullName: 'Trịnh Hoài Nam',
          phone: '0901234567',
          address: '42 Trần Phú, Hải Châu, Đà Nẵng',
          notes: 'Giao giờ hành chính',
        },
        items: [
          {
            bookId: 'ols-book-01',
            title: 'Graphic Anatomy Atelier Bow-Wow',
            unitPriceVND: 1250000,
            quantity: 1,
          },
        ],
      }),
    });

    const res = await worker.fetch(req, { DB: db });
    assert.equal(res.status, 201);

    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'REQUEST_RECEIVED');
    assert.match(body.data.id, /^OLS-[0-9A-Z]{6}$/);

    // Verify written to mock D1 orders table
    assert.equal(ordersTable.length, 1);
    assert.equal(ordersTable[0].id, body.data.id);
    assert.equal(ordersTable[0].customer_name, 'Trịnh Hoài Nam');
    assert.equal(ordersTable[0].total_amount_vnd, 1250000);
  });

  it('POST /api/orders rejects invalid VN phone numbers with 400', async () => {
    const { db } = createMockD1();
    const req = new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: {
          fullName: 'Test User',
          phone: '12345',
          address: 'Hà Nội',
        },
        items: [{ bookId: 'ols-book-01', unitPriceVND: 1000, quantity: 1 }],
      }),
    });

    const res = await worker.fetch(req, { DB: db });
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.match(body.error, /Số điện thoại không hợp lệ/);
  });

  it('GET /api/admin/orders blocks unauthenticated requests with 401', async () => {
    const { db } = createMockD1();
    const req = new Request('http://localhost/api/admin/orders');
    const res = await worker.fetch(req, { DB: db });
    assert.equal(res.status, 401);
  });
});

