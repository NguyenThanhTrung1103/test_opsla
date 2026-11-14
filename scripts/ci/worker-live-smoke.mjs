// Read-only live verification: never create orders or mutate D1.
import assert from 'node:assert/strict';
const base = process.env.WORKER_URL;
if (!base || new URL(base).protocol !== 'https:') throw new Error('Expected HTTPS WORKER_URL');
async function get(path, headers = {}) {
  return fetch(base + path, { headers: { 'Cache-Control': 'no-cache', ...headers }, signal: AbortSignal.timeout(20000) });
}
let last;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const html = await get('/');
    assert.equal(html.status, 200);
    assert.match(await html.text(), /API_KEY:\s*"DEMO_ONLY_OOPSLA_PUBLIC_KEY_NOT_VALID"/);
    const metadata = await (await get('/deploy-metadata.json')).json();
    assert.equal(metadata.sha, process.env.GITHUB_SHA, 'Unexpected deployed revision');
    const health = await (await get('/api/health')).json();
    assert.equal(health.d1, 'connected');
    const catalog = await get('/api/books');
    assert.equal(catalog.status, 200);
    assert.ok(Array.isArray((await catalog.json()).books));
    assert.equal((await get('/api/admin/orders')).status, 401, 'Anonymous admin request must be rejected');
    assert.equal((await get('/api/admin/orders', { Authorization: 'Bearer DEMO_ONLY_OOPSLA_PUBLIC_KEY_NOT_VALID' })).status, 401, 'Public dummy key must not grant admin access');
    console.log(`Live smoke PASS: ${base} revision ${metadata.sha}; demo visible, D1 connected, anonymous/demo admin rejected.`);
    process.exit(0);
  } catch (e) { last = e; }
  await new Promise(r => setTimeout(r, 5000));
}
throw new Error(`Live verification failed: ${last?.message}`);
