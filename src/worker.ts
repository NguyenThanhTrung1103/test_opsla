/**
 * Oops La Book Store — Cloudflare Worker Edge Handler
 * Serves static assets via env.ASSETS and handles /api/ requests at the edge.
 */

interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  ORDERS_KV?: any;
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Health check endpoint
    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          runtime: 'cloudflare-worker',
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
          },
        }
      );
    }

    // Order submission endpoint
    if (url.pathname === '/api/orders' && request.method === 'POST') {
      try {
        const body = (await request.json()) as any;
        const customer = body.customer;
        const items = body.items;

        if (!customer?.fullName?.trim() || !customer?.phone?.trim() || !customer?.address?.trim()) {
          return new Response(
            JSON.stringify({ error: 'Vui lòng điền đầy đủ Họ tên, Số điện thoại và Địa chỉ nhận sách.' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
          );
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Túi yêu cầu mua của bạn đang trống.' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
          );
        }

        const phoneClean = customer.phone.replace(/[\s.-]/g, '');
        const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
        if (!phoneRegex.test(phoneClean)) {
          return new Response(
            JSON.stringify({ error: 'Số điện thoại không hợp lệ theo định dạng Việt Nam.' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
          );
        }

        const orderId = generateOrderId();
        const totalVND = items.reduce((sum: number, it: any) => sum + (it.unitPriceVND || 0) * (it.quantity || 1), 0);

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
          createdAt: new Date().toISOString(),
        };

        // If KV is configured, save order
        if (env.ORDERS_KV) {
          await env.ORDERS_KV.put(`order:${orderId}`, JSON.stringify(order));
        }

        return new Response(
          JSON.stringify({ success: true, data: order }),
          { status: 201, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err.message || 'Lỗi xử lý yêu cầu đặt sách.' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
      }
    }

    // Default: Delegate to Static Assets (serves dist/index.html)
    return env.ASSETS.fetch(request);
  },
};
