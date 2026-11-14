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
const [subdomain, settings, deployments, database] = await Promise.all([
  get('workers/subdomain'), get(`workers/scripts/${name}/settings`),
  get(`workers/scripts/${name}/deployments`),
  get('d1/database/3c078acc-b184-480b-81c4-58bc7b1c73c5'),
]);
const bindings = settings.bindings?.map(b => ({ name: b.name, type: b.type, id: b.id }));
if (!bindings?.some(b => b.name === 'DB' && b.type === 'd1' && b.id === '3c078acc-b184-480b-81c4-58bc7b1c73c5')) {
  throw new Error('Remote DB binding does not match wrangler.toml; refusing deployment');
}
const expected = new Set(['DB', 'ASSETS', 'ADMIN_SECRET_KEY', 'ENVIRONMENT', 'DEFAULT_ADMIN_ROLE']);
if (bindings.some(b => !expected.has(b.name))) throw new Error('Unrecognized remote binding; inspect ownership before deploy');
const url = `https://${name}.${subdomain.subdomain}.workers.dev`;
const snapshot = { account, worker: name, url, bindings, deployments, database: { name: database.name, uuid: database.uuid } };
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/cloudflare-before.json', JSON.stringify(snapshot, null, 2));
appendFileSync(process.env.GITHUB_OUTPUT, `worker_url=${url}\n`);
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Cloudflare target (read-only)\nWorker: ${name}\n\nURL: ${url}\n\nD1: ${database.name}\n\nPrior versions/binding names: cloudflare-before artifact.\n`);
console.log(JSON.stringify({ account, worker: name, url, bindings, deployments, database: snapshot.database }));
