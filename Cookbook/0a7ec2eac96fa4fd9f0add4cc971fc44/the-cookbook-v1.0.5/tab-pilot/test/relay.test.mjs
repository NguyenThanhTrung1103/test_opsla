// e2e against a running relay with a fake extension.
// usage: node test/relay.test.mjs <baseUrl> <ownerToken> [<readOnlyToken>]
import assert from "node:assert/strict";
const [base, token, roToken] = process.argv.slice(2);
const wsBase = base.replace(/^http/, "ws");
const H = (t = token) => ({ "content-type": "application/json", authorization: `Bearer ${t}`, "user-agent": "tab-pilot-test" });
const mcp = (method, params, t) => fetch(base + "/mcp", { method: "POST", headers: H(t), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json());
const rpc = (tool, args, t) => fetch(base + "/rpc", { method: "POST", headers: H(t), body: JSON.stringify({ tool, args }) }).then((r) => r.json());

assert.equal((await fetch(base + "/mcp", { method: "POST", body: "{}", headers: { "user-agent": "t" } })).status, 401, "no token -> 401");
assert.equal((await rpc("status")).result.connected, false, "no extension yet");
const hub = await fetch(base + "/hub", { headers: H() }).then((r) => r.json()); assert.ok(hub.hub, "/hub");

const ext = new WebSocket(`${wsBase}/ext?token=${token}`);
let hello = null;
await new Promise((res) => (ext.onopen = res));
ext.onmessage = (e) => {
  const m = JSON.parse(e.data); if (m.type === "hello") { hello = m; return; } if (!m.id) return;
  const result = m.tool === "status" ? { version: "fake", scope_seen: m.scope }
    : m.tool === "chatgpt_get_result" ? { status: "done", text: "hi", images: [{ mime: "image/png", data: "iVBORw0KGgo=", width: 1, height: 1 }] }
    : m.tool === "substack_upload_image" ? { url: "https://example.com/x.png" } : null;
  ext.send(JSON.stringify(result ? { id: m.id, ok: true, result } : { id: m.id, ok: false, error: "boom " + m.tool }));
};
await new Promise((r) => setTimeout(r, 500));
assert.equal(hello?.hub, hub.hub, "hub hello");

let r = await mcp("tools/list", {});
const names = r.result.tools.map((t) => t.name);
assert.ok(names.includes("substack_publish") && names.includes("status"));
assert.equal(r.result.tools.find((t) => t.name === "status").annotations.readOnlyHint, true);
r = await rpc("status"); assert.equal(r.result.connected, true); assert.equal(r.result.scope_seen, "read");
r = await mcp("tools/call", { name: "chatgpt_get_result", arguments: {} }); assert.equal(r.result.content[1].type, "image");
r = await mcp("tools/call", { name: "substack_list_posts", arguments: {} }); assert.equal(r.result.isError, true);
r = await rpc("substack_upload_image", { url: "https://example.com/a.png" }); assert.equal(r.result.url, "https://example.com/x.png");
r = await rpc("audit_log", { limit: 5 }); assert.equal(r.result[0].tool, "substack_upload_image", "write audited");

if (roToken) { // limited token: read only
  r = await mcp("tools/list", {}, roToken); const ro = r.result.tools.map((t) => t.name);
  assert.ok(ro.includes("status") && !ro.includes("substack_publish") && !ro.includes("substack_upload_image"), "list filtered by scope");
  r = await rpc("substack_publish", { id: 1, confirm: true }, roToken); assert.match(r.error, /permission denied/);
  assert.equal((await fetch(base + "/files?name=x", { method: "PUT", headers: H(roToken), body: "x" })).status, 403, "read token can't upload");
  const refused = await new Promise((res) => { const w = new WebSocket(`${wsBase}/ext?token=${roToken}`); w.onopen = () => { w.close(); res(false); }; w.onerror = () => res(true); });
  assert.ok(refused, "only the owner token may connect an extension");
}

const ctl = new WebSocket(`${wsBase}/ctl?token=${token}`);
await new Promise((res) => (ctl.onopen = res));
const got = new Promise((res) => (ctl.onmessage = (e) => res(JSON.parse(e.data))));
ctl.send(JSON.stringify({ id: "x1", tool: "status", args: {} }));
r = await got; assert.equal(r.id, "x1"); assert.equal(r.result.version, "fake");

const put = await fetch(base + "/files?name=t.txt&mime=text/plain", { method: "PUT", headers: H(), body: "hello" }).then((x) => x.json());
const back = await fetch(`${base}/files/${put.id}`, { headers: { ...H(), range: "bytes=1-3" } });
assert.equal(back.status, 206); assert.equal(await back.text(), "ell");
await fetch(`${base}/files/${put.id}`, { method: "DELETE", headers: H() });

console.log("relay e2e OK"); ext.close(); ctl.close(); process.exit(0);
