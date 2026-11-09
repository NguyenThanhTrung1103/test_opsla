/**
 * Oops La Book Store — Cloudflare Worker Edge Handler with D1 Database Support
 * Serves static assets via env.ASSETS and handles /api/ endpoints with Cloudflare D1.
 */

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  error?: string;
  meta?: any;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface Env {
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
  DB?: D1Database;
  ORDERS_KV?: any;
  ADMIN_SECRET_KEY?: string;
}

function generateOrderId(prefix = 'OLS'): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    randomPart += chars[randomIndex];
  }
  return `${prefix}-${randomPart}`;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // 1. Health check & D1 Connectivity endpoint
    if (url.pathname === '/api/health') {
      let d1Status = 'unbound';
      if (env.DB) {
        try {
          await env.DB.prepare('SELECT 1').run();
          d1Status = 'connected';
        } catch (err: any) {
          d1Status = `error: ${err.message}`;
        }
      }

      return jsonResponse({
        status: 'ok',
        runtime: 'cloudflare-worker',
        d1: d1Status,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Catalog / Books endpoint
    if ((url.pathname === '/api/books' || url.pathname === '/api/catalog') && request.method === 'GET') {
      if (!env.DB) {
        return jsonResponse({ books: [], count: 0, notice: 'D1 not bound' });
      }

      try {
        const category = url.searchParams.get('category');
        let query = 'SELECT * FROM books';
        const params: any[] = [];

        if (category && category !== 'ALL') {
          query += ' WHERE category = ?';
          params.push(category);
        }

        query += ' ORDER BY featured DESC, publication_year DESC';
        const stmt = env.DB.prepare(query);
        const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

        const formatted = (results || []).map((b: any) => ({
          ...b,
          tags: b.tags_json ? JSON.parse(b.tags_json) : [],
        }));

        return jsonResponse({ books: formatted, count: formatted.length });
      } catch (err: any) {
        return jsonResponse({ error: `Catalog query error: ${err.message}` }, 500);
      }
    }

    // 3. Order submission endpoint (Zero Auto-Reservation BD-04)
    if (url.pathname === '/api/orders' && request.method === 'POST') {
      try {
        const body = (await request.json()) as any;
        const customer = body.customer;
        const items = body.items;

        if (!customer?.fullName?.trim() || !customer?.phone?.trim() || !customer?.address?.trim()) {
          return jsonResponse({ error: 'Vui lòng điền đầy đủ Họ tên, Số điện thoại và Địa chỉ nhận sách.' }, 400);
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
          return jsonResponse({ error: 'Túi yêu cầu mua của bạn đang trống.' }, 400);
        }

        const phoneClean = customer.phone.replace(/[\s.-]/g, '');
        const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
        if (!phoneRegex.test(phoneClean)) {
          return jsonResponse({ error: 'Số điện thoại không hợp lệ theo định dạng Việt Nam.' }, 400);
        }

        const orderId = generateOrderId();
        const totalVND = items.reduce((sum: number, it: any) => sum + (it.unitPriceVND || 0) * (it.quantity || 1), 0);
        const nowIso = new Date().toISOString();

        const order = {
          id: orderId,
          customer: {
            fullName: customer.fullName.trim(),
            phone: phoneClean,
            address: customer.address.trim(),
            notes: customer.notes?.trim() || '',
          },
          items,
          totalAmountVND: totalVND,
          status: 'REQUEST_RECEIVED',
          createdAt: nowIso,
        };

        // Persist to Cloudflare D1
        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO orders (id, customer_name, customer_phone, customer_address, customer_notes, items_json, total_amount_vnd, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'REQUEST_RECEIVED', ?)`
          )
            .bind(
              orderId,
              order.customer.fullName,
              order.customer.phone,
              order.customer.address,
              order.customer.notes,
              JSON.stringify(items),
              totalVND,
              nowIso
            )
            .run();
        }

        // Secondary / Fallback cache in KV if available
        if (env.ORDERS_KV) {
          await env.ORDERS_KV.put(`order:${orderId}`, JSON.stringify(order));
        }

        return jsonResponse({ success: true, data: order }, 201);
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'Lỗi xử lý yêu cầu đặt sách.' }, 500);
      }
    }

    // 4. Admin Orders endpoint (Guarded with Bearer Auth)
    if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
      if (!env.ADMIN_SECRET_KEY) {
        return jsonResponse({ error: 'Service Unavailable: admin authentication is not configured' }, 503);
      }
      const auth = request.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ') || auth.slice(7).trim() !== env.ADMIN_SECRET_KEY) {
        return jsonResponse({ error: 'Unauthorized: Admin authentication required' }, 401);
      }

      if (!env.DB) {
        return jsonResponse({ orders: [], count: 0, notice: 'D1 not bound' });
      }

      try {
        const { results } = await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
        const orders = (results || []).map((o: any) => ({
          id: o.id,
          customer: {
            fullName: o.customer_name,
            phone: o.customer_phone,
            address: o.customer_address,
            notes: o.customer_notes || '',
          },
          items: JSON.parse(o.items_json || '[]'),
          totalAmountVND: o.total_amount_vnd,
          status: o.status,
          createdAt: o.created_at,
        }));
        return jsonResponse({ orders, count: orders.length });
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // 5. Default: Delegate to Static Assets (serves dist/index.html)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
