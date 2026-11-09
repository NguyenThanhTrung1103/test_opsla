/**
 * Oops La Book Store — Production Server (Node.js Native HTTP)
 * Zero external dependency.
 * Enforces:
 * - Admin Auth Guard via Bearer Token (AC-11, OD-01 Protection, Fail-Closed)
 * - Basic IP Rate Limiting with TTL cleanup (5 requests/minute for order submissions)
 * - Path Traversal Guard on static files
 * - REST API for storefront and operational CMS management
 * - Cross-restart JSON file persistence via OopsLaDB
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderService } from '../services/orderService.ts';
import { catalogService } from '../services/catalogService.ts';
import { dbAdapter } from '../storage/indexed-db.ts';
import type { CustomerInfo, OrderItem, UserRole } from '../types/domain.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../../dist');

const PORT = parseInt(process.env.PORT || '3000', 10);

export function getAdminSecret(): string {
  return process.env.ADMIN_SECRET_KEY?.trim() ?? '';
}

export function assertAdminSecretConfigured(): void {
  if (!getAdminSecret()) {
    throw new Error('[FATAL] ADMIN_SECRET_KEY is not configured - refusing to start (fail closed).');
  }
}

// In-memory rate limiting map: IP -> array of timestamps
const rateLimitMap = new Map<string, number[]>();
let lastRateLimitCleanup = Date.now();

function isRateLimited(ip: string, limit = 5, windowMs = 60000): boolean {
  const now = Date.now();

  // Periodic cleanup of stale IPs every 5 minutes to prevent memory leak
  if (now - lastRateLimitCleanup > 300000) {
    for (const [key, timestamps] of rateLimitMap.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) rateLimitMap.delete(key);
      else rateLimitMap.set(key, valid);
    }
    lastRateLimitCleanup = now;
  }

  const timestamps = rateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter(t => now - t < windowMs);

  if (validTimestamps.length >= limit) {
    rateLimitMap.set(ip, validTimestamps);
    return true;
  }

  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return false;
}

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const ips = forwarded.split(',').map(s => s.trim());
    if (ips[0]) return ips[0];
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

export function verifyAdminAuth(authHeader: string | undefined): boolean {
  const secret = getAdminSecret();
  if (!secret) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  return token === secret && token.length > 0;
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const clientIp = getClientIp(req);

  // Common CORS and Security Headers (V05: Aligned with Storefront UI requirements)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com;"
  );

  // Helper JSON Response
  const sendJson = (statusCode: number, data: unknown) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  // Helper to parse JSON body
  const parseBody = async (): Promise<any> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e6) { // 1MB limit
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  };

  try {
    // 1. Health check
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(200, { status: 'healthy', timestamp: new Date().toISOString() });
    }

    // 2. Books Catalog
    if (req.method === 'GET' && url.pathname === '/api/books') {
      const books = await catalogService.getBooks();
      return sendJson(200, { data: books });
    }

    // 3. Create Collector Request (Rate-limited, zero inventory decrement - BD-04)
    if (req.method === 'POST' && url.pathname === '/api/orders') {
      if (isRateLimited(clientIp, 5, 60000)) {
        return sendJson(429, { error: 'Too many requests. Please try again after 1 minute.' });
      }

      const body = await parseBody();
      if (!body.customer || !body.items || !Array.isArray(body.items)) {
        return sendJson(400, { error: 'Invalid payload: customer and items required.' });
      }

      try {
        const order = await orderService.createCollectorRequest(body.customer as CustomerInfo, body.items as OrderItem[]);
        return sendJson(201, { data: order });
      } catch (err: any) {
        return sendJson(400, { error: err.message || 'Validation error' });
      }
    }

    // 4. Admin Protected Endpoints: List Orders (R09)
    if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
      if (!verifyAdminAuth(req.headers.authorization)) {
        return sendJson(401, { error: 'Unauthorized: Admin secret token required.' });
      }
      const orders = await orderService.getAllOrders();
      return sendJson(200, { data: orders });
    }

    // 5. Admin Protected Endpoints: Confirm Order (OD-02, AC-11, AC-15, R01)
    if (req.method === 'POST' && url.pathname.startsWith('/api/admin/orders/') && url.pathname.endsWith('/confirm')) {
      if (!verifyAdminAuth(req.headers.authorization)) {
        return sendJson(401, { error: 'Unauthorized: Owner secret token required (AC-11).' });
      }

      const parts = url.pathname.split('/');
      const orderId = parts[4]; // /api/admin/orders/:id/confirm

      const result = await orderService.confirmOrder(orderId, 'OWNER');
      if (!result.success) {
        return sendJson(400, { error: result.error });
      }
      return sendJson(200, { data: result.order });
    }

    // 6. Admin Protected Endpoints: Cancel Order (OD-01, R05)
    if (req.method === 'POST' && url.pathname.startsWith('/api/admin/orders/') && url.pathname.endsWith('/cancel')) {
      if (!verifyAdminAuth(req.headers.authorization)) {
        return sendJson(401, { error: 'Unauthorized: Admin secret token required.' });
      }

      const body = await parseBody().catch(() => ({}));
      const role: UserRole = body.role === 'STAFF' ? 'STAFF' : 'OWNER';
      const reason = body.reason || 'Admin cancelled';

      const parts = url.pathname.split('/');
      const orderId = parts[4];

      const result = await orderService.cancelOrder(orderId, role, role === 'OWNER' ? 'Chủ tiệm' : 'Nhân viên', reason);
      if (!result.success) {
        return sendJson(result.error?.includes('AC-11') || result.error?.includes('OD-01') ? 403 : 400, { error: result.error });
      }
      return sendJson(200, { data: result.order });
    }

    // 7. Admin Protected Endpoints: Status Transition (CONTACTED, etc. - R09, V03 Allowlist Guard)
    if (req.method === 'POST' && url.pathname.startsWith('/api/admin/orders/') && url.pathname.endsWith('/status')) {
      if (!verifyAdminAuth(req.headers.authorization)) {
        return sendJson(401, { error: 'Unauthorized: Admin secret token required.' });
      }

      const body = await parseBody();
      const VALID_STATUSES: OrderStatus[] = ['PENDING_CONTACT', 'CONTACTED', 'CONFIRMED', 'CANCELLED'];
      if (!body.status || !VALID_STATUSES.includes(body.status)) {
        return sendJson(400, {
          error: `Invalid status: "${body.status}". Allowed values: ${VALID_STATUSES.join(', ')}`
        });
      }

      const parts = url.pathname.split('/');
      const orderId = parts[4];
      const role: UserRole = body.role === 'STAFF' ? 'STAFF' : 'OWNER';

      try {
        const order = await orderService.transitionOrderStatus(
          orderId,
          body.status,
          role,
          body.actorName || (role === 'OWNER' ? 'Chủ tiệm' : 'Nhân viên'),
          body.reason
        );
        return sendJson(200, { data: order });
      } catch (err: any) {
        const statusCode = err.message?.includes('AC-11') || err.message?.includes('OD-01') ? 403 : 400;
        return sendJson(statusCode, { error: err.message });
      }
    }

    // 8. Admin Protected Endpoints: Manual Stock Adjustment (R09)
    if (req.method === 'POST' && url.pathname === '/api/admin/stock') {
      if (!verifyAdminAuth(req.headers.authorization)) {
        return sendJson(401, { error: 'Unauthorized: Admin secret token required.' });
      }

      const body = await parseBody();
      if (!body.bookId || typeof body.stockCount !== 'number') {
        return sendJson(400, { error: 'bookId and stockCount required.' });
      }

      const updated = await catalogService.updateStockCount(body.bookId, body.stockCount);
      return sendJson(200, { data: updated });
    }

    // 9. Serve static files from dist with Path Traversal Protection
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      const rawPath = url.pathname === '/' ? 'index.html' : url.pathname;
      const safePath = path.normalize(rawPath).replace(/^(\.\.[\/\\])+/, '');
      const resolvedPath = path.resolve(DIST_DIR, safePath.startsWith(path.sep) ? safePath.slice(1) : safePath);

      if (resolvedPath.startsWith(DIST_DIR) && fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        const ext = path.extname(resolvedPath);
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(resolvedPath).pipe(res);
        return;
      }
    }

    return sendJson(404, { error: 'Not found' });
  } catch (err: any) {
    return sendJson(500, { error: err.message || 'Internal Server Error' });
  }
});

function isEntry(): boolean {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename);
  } catch {
    return false;
  }
}
const isEntryModule = isEntry();

if (isEntryModule && process.env.NODE_ENV !== 'test') {
  try {
    assertAdminSecretConfigured();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const storagePath = process.env.STORAGE_FILE || path.resolve(process.cwd(), 'data/oopsla-storage.json');
  dbAdapter.setStorageFile(storagePath);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[OopsLa Bookstore] Production server running on http://0.0.0.0:${PORT}`);
  });
}
