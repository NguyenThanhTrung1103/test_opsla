// Read-only account/target inspection. Never log API credential values.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!account || !token) throw new Error('Missing Cloudflare account/token secrets');
async function get(path) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
  });
  const b = await r.json();
  if (!r.ok || !b.success) throw new Error(`Cloudflare read failed for ${path}: HTTP ${r.status}, codes ${b.errors?.map(e => e.code).join(',')}`);
  return b.result;
}
const name = 'oops-la-bookstore';
const scripts = await get('workers/scripts');
console.log(JSON.stringify({ availableWorkers: scripts.map(s => s.id) }));
const exists = scripts.some(s => s.id === name);
const [subdomain, settings, deployments, database] = await Promise.all([
  get('workers/subdomain'),
  exists ? get(`workers/scripts/${name}/settings`) : Promise.resolve({ bindings: [] }),
  exists ? get(`workers/scripts/${name}/deployments`) : Promise.resolve({ deployments: [] }),
  get('d1/database/3c078acc-b184-480b-81c4-58bc7b1c73c5'),
]);
if (database.name !== 'oopsla-db') throw new Error('Configured D1 ID belongs to an unexpected database name');
const bindings = settings.bindings?.map(b => ({ name: b.name, type: b.type, id: b.id }));
console.log(JSON.stringify({ worker: name, bindings }));
if (exists && !bindings?.some(b => b.name === 'DB' && b.type === 'd1' && b.id === '3c078acc-b184-480b-81c4-58bc7b1c73c5')) {
  throw new Error('Remote DB binding does not match wrangler.toml; refusing deployment');
}
const expected = new Set(['DB', 'ASSETS', 'ADMIN_SECRET_KEY', 'ENVIRONMENT', 'DEFAULT_ADMIN_ROLE']);
if (bindings.some(b => !expected.has(b.name))) throw new Error('Unrecognized remote binding; inspect ownership before deploy');
const url = `https://${name}.${subdomain.subdomain}.workers.dev`;
let status = { d1: 'new Worker - verified D1 resource metadata only' };
if (exists) {
  const health = await fetch(url + '/api/health', { signal: AbortSignal.timeout(15000) });
  status = await health.json();
  if (!health.ok || status.d1 !== 'connected') throw new Error('Existing Worker D1 health is not connected; refusing rollout');
}
const snapshot = { account, worker: name, newWorker: !exists, url, bindings, deployments,
  database: { name: database.name, uuid: database.uuid }, health: status };
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/cloudflare-before.json', JSON.stringify(snapshot, null, 2));
appendFileSync(process.env.GITHUB_OUTPUT, `worker_url=${url}\n`);
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Cloudflare target (read-only)\nWorker: ${name}\n\nURL: ${url}\n\nD1: ${database.name}\n\nPrior versions/binding names: cloudflare-before artifact.\n`);
console.log(JSON.stringify(snapshot));
