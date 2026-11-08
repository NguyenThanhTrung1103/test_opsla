// tab-pilot relay: the Chrome extension holds a WebSocket (/ext) to a Durable Object "hub";
// agents drive it via MCP (/mcp), HTTP (/rpc) or WebSocket (/ctl). Files: R2 (/files).
import { DurableObject } from "cloudflare:workers";
import { TOOLS, TOOL_BY_NAME, scopeOf, type Scope } from "./tools";

const RELAY_VERSION = "0.3.0";
// A live Durable Object keeps running the code it started with while the extension socket holds it.
// So the DO is a thin, stable pipe; everything else lives in the stateless Worker (always the latest deploy).
// Bump HUB_NAME only when Hub code changes: extensions poll /hub and reconnect to the new instance.
const HUB_NAME = "hub-v3";
export interface Env {
  HUB: DurableObjectNamespace<Hub>; FILES: R2Bucket;
  TOKEN: string;          // owner token: read+draft+publish (+dev if DEV_TOOLS=1)
  TOKENS?: string;        // optional JSON: [{"token":"…","label":"bot","scopes":["read","draft"]}] for limited agents
  DEV_TOOLS?: string;     // "1" = expose dev/debug tools to the owner token
}
type Principal = { label: string; scopes: Scope[] };

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

const same = (x: string, y: string) => { if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0; };
function principal(req: Request, env: Env): Principal | null {
  const url = new URL(req.url); const h = req.headers.get("authorization") || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : url.searchParams.get("token") || "";
  if (!tok) return null;
  if (env.TOKEN && same(tok, env.TOKEN)) return { label: "owner", scopes: ["read", "draft", "publish", ...(env.DEV_TOOLS === "1" ? ["dev" as Scope] : [])] };
  try { for (const t of JSON.parse(env.TOKENS || "[]")) if (t.token && same(tok, t.token)) return { label: t.label || "token", scopes: t.scopes || ["read"] }; } catch {}
  return null;
}

const hub = (env: Env): any => env.HUB.get(env.HUB.idFromName(HUB_NAME)); // any: DO RPC stub types recurse too deep for tsc

// permission check + audit (Worker side), then forward through the hub
async function call(env: Env, who: Principal, tool: string, args: Record<string, unknown>): Promise<any> {
  const def = TOOL_BY_NAME.get(tool);
  if (!def) throw new Error(`unknown tool: ${tool}`);
  const scope = scopeOf(tool);
  if (!who.scopes.includes(scope)) throw new Error(`permission denied: '${tool}' needs '${scope}' scope (token '${who.label}' has ${who.scopes.join(",") || "none"})`);
  if (tool === "audit_log") return hub(env).auditRead(args);
  const run = async () => { const r = await hub(env).forward(tool, args, scope, def.timeoutMs ?? 60_000);
    return tool === "status" ? { relay: RELAY_VERSION, hub: HUB_NAME, ...r } : r; };
  if (scope === "read" && !args.async) return run();
  let r: any, ok = 1;
  try { r = await run(); return r; }
  catch (e: any) { ok = 0; r = { error: e.message }; throw e; }
  finally { await hub(env).auditWrite(who.label, tool, scope, brief(args), ok, brief(r ?? null)).catch(() => {}); }
}
const brief = (v: any) => JSON.stringify(v, (k, x) => (k === "base64" || k === "data" ? `<${String(x).length} chars>`
  : typeof x === "string" && x.length > 300 ? x.slice(0, 300) + "…" : x)).slice(0, 2000);

// ---- MCP (Streamable HTTP, stateless, JSON responses) ----
async function mcp(env: Env, who: Principal, body: any): Promise<Response> {
  const batch = Array.isArray(body);
  const out = (await Promise.all((batch ? body : [body]).map((m: any) => rpc(env, who, m)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202 });
  return json(batch ? out : out[0]);
}
async function rpc(env: Env, who: Principal, m: any): Promise<any> {
  if (m.id === undefined || m.id === null) return null; // notification
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
  switch (m.method) {
    case "initialize":
      return ok({ protocolVersion: m.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} },
        serverInfo: { name: "tab-pilot", version: RELAY_VERSION },
        instructions: "Controls the user's real Chrome (their logged-in ChatGPT, Substack, LinkedIn, TikTok sessions). Every publish-scope tool acts publicly and for real. Long tasks: pass async:true and poll job_status. Large files: upload to /files first, then pass file_id. If a tool breaks after a site UI change: health_check, then selectors_get/selectors_set." });
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS.filter((t) => who.scopes.includes(scopeOf(t.name))).map(({ timeoutMs, ...t }) => {
      const sc = scopeOf(t.name); // MCP hints so agents/clients can tell side effects apart
      return { ...t, annotations: { readOnlyHint: sc === "read", destructiveHint: sc === "publish", openWorldHint: true, title: `${t.name} [${sc}]` } };
    }) });
    case "tools/call":
      try { return ok(toContent(await call(env, who, m.params?.name, m.params?.arguments || {}))); }
      catch (e: any) { return ok({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }); }
    default: return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `method not found: ${m.method}` } };
  }
}

// /ctl: plain WebSocket for scripts — {id, tool, args} -> {id, ok, result|error}
function ctl(env: Env, who: Principal): Response {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.addEventListener("message", async (e) => {
    let m: any; try { m = JSON.parse(String(e.data)); } catch { return; }
    try { server.send(JSON.stringify({ id: m.id, ok: true, result: await call(env, who, m.tool, m.args || {}) })); }
    catch (err: any) { server.send(JSON.stringify({ id: m.id, ok: false, error: err.message })); }
  });
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/") return new Response("tab-pilot relay " + RELAY_VERSION);
    const who = principal(req, env);
    if (pathname === "/files" || pathname.startsWith("/files/")) {
      if (!who) return json({ error: "unauthorized" }, 401);
      if (req.method !== "GET" && req.method !== "HEAD" && !who.scopes.includes("draft")) return json({ error: "token lacks draft scope (needed to upload files)" }, 403);
      return files(req, env);
    }
    if (!["/ext", "/ctl", "/rpc", "/mcp", "/hub"].includes(pathname)) return new Response("not found", { status: 404 });
    if (!who) return json({ error: "unauthorized" }, 401);
    if (pathname === "/hub") return json({ hub: HUB_NAME, relay: RELAY_VERSION });
    if (pathname === "/ext") {
      if (who.label !== "owner") return json({ error: "only the owner token may connect an extension" }, 403);
      const fwd = new Request(req); fwd.headers.set("x-tp-hub", HUB_NAME);
      return hub(env).fetch(fwd);
    }
    if (pathname === "/ctl") {
      if (req.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      return ctl(env, who);
    }
    if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: { allow: "POST" } });
    let body: any;
    try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400); }
    if (pathname === "/rpc") {
      try { return json({ ok: true, result: await call(env, who, body.tool, body.args || {}) }); }
      catch (e: any) { return json({ ok: false, error: e.message }, 200); }
    }
    return mcp(env, who, body);
  },
} satisfies ExportedHandler<Env>;

// ---- file staging (R2, objects expire after 1 day via bucket lifecycle rule) ----
// PUT  /files?name=&mime=                         single upload (body <= ~95 MB, Workers request cap)
// POST /files/mpu?name=&mime=                     -> {id, uploadId}   multipart for larger files
// PUT  /files/mpu/<id>?uploadId=&part=<n>         -> {part, etag}     (parts >= 5 MiB except the last)
// POST /files/mpu/<id>/complete?uploadId=         body {parts:[{part,etag}]} -> {id, size}
// GET|HEAD /files/<id>                            stream (Range supported)
async function files(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url); const q = url.searchParams; const seg = url.pathname.split("/").filter(Boolean); // ["files", ...]
  const meta = () => ({ httpMetadata: { contentType: q.get("mime") || "application/octet-stream" },
    customMetadata: { name: q.get("name") || "file" } });
  if (seg.length === 1 && req.method === "PUT") {
    const id = crypto.randomUUID();
    const obj = await env.FILES.put(id, req.body, meta());
    return json({ id, name: q.get("name") || "file", size: obj?.size });
  }
  if (seg[1] === "mpu") {
    if (seg.length === 2 && req.method === "POST") {
      const id = crypto.randomUUID(); const m = await env.FILES.createMultipartUpload(id, meta());
      return json({ id, uploadId: m.uploadId });
    }
    const m = env.FILES.resumeMultipartUpload(seg[2], q.get("uploadId") || "");
    if (seg.length === 3 && req.method === "PUT") {
      const n = Number(q.get("part")); if (!req.body || !n) return json({ error: "part + body required" }, 400);
      const p = await m.uploadPart(n, req.body); return json({ part: p.partNumber, etag: p.etag });
    }
    if (seg[3] === "complete" && req.method === "POST") {
      const { parts } = await req.json<{ parts: { part: number; etag: string }[] }>();
      const obj = await m.complete(parts.map((p) => ({ partNumber: p.part, etag: p.etag })));
      return json({ id: seg[2], size: obj.size });
    }
    if (req.method === "DELETE") { await m.abort(); return json({ aborted: true }); }
  }
  if (seg.length === 2 && (req.method === "GET" || req.method === "HEAD")) {
    const obj = req.method === "HEAD" ? await env.FILES.head(seg[1]) : await env.FILES.get(seg[1], { range: req.headers, onlyIf: req.headers });
    if (!obj) return json({ error: "not found" }, 404);
    const h = new Headers(); obj.writeHttpMetadata(h); h.set("etag", obj.httpEtag); h.set("accept-ranges", "bytes");
    h.set("x-file-name", encodeURIComponent(obj.customMetadata?.name || "file")); h.set("x-file-size", String(obj.size));
    const range = (obj as R2ObjectBody).range as { offset?: number; length?: number } | undefined;
    if (req.method === "GET" && range && req.headers.has("range")) {
      const off = range.offset ?? 0, len = range.length ?? obj.size - off;
      h.set("content-range", `bytes ${off}-${off + len - 1}/${obj.size}`); h.set("content-length", String(len));
      return new Response((obj as R2ObjectBody).body, { status: 206, headers: h });
    }
    h.set("content-length", String(obj.size));
    return new Response(req.method === "HEAD" ? null : (obj as R2ObjectBody).body, { headers: h });
  }
  if (seg.length === 2 && req.method === "DELETE") { await env.FILES.delete(seg[1]); return json({ deleted: true }); }
  return json({ error: "bad files request" }, 400);
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

// Thin, stable hub: holds the extension socket, forwards calls, stores the audit log. Keep changes here rare (see HUB_NAME).
export class Hub extends DurableObject<Env> {
  private pending = new Map<string, Pending>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS audit (ts INTEGER, who TEXT, tool TEXT, scope TEXT, args TEXT, ok INTEGER, result TEXT)`);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')); // keepalive at the edge
  }

  async fetch(req: Request): Promise<Response> { // only /ext reaches the hub
    if (req.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    for (const old of this.ctx.getWebSockets("ext")) { try { old.close(4000, "replaced"); } catch {} }
    this.ctx.acceptWebSocket(server, ["ext"]);
    server.send(JSON.stringify({ type: "hello", hub: req.headers.get("x-tp-hub") || "?" }));
    return new Response(null, { status: 101, webSocket: client });
  }

  private ext(): WebSocket | undefined { return this.ctx.getWebSockets("ext").filter((w) => w.readyState === WebSocket.OPEN).pop(); }

  async forward(tool: string, args: Record<string, unknown>, scope: string, timeoutMs: number): Promise<any> {
    const ws = this.ext();
    if (!ws) {
      if (tool === "status") return { connected: false };
      throw new Error("Chrome extension not connected (is Chrome open? check the tab-pilot extension options)");
    }
    const id = crypto.randomUUID();
    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`timeout after ${timeoutMs}ms (long task? use async:true)`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    try { ws.send(JSON.stringify({ id, tool, args, scope })); }
    catch { clearTimeout(this.pending.get(id)?.timer); this.pending.delete(id); throw new Error("extension connection dropped — retry in a few seconds"); }
    const r: any = await p;
    return tool === "status" ? { connected: true, ...r } : r;
  }

  async auditWrite(who: string, tool: string, scope: string, args: string, ok: number, result: string) {
    this.ctx.storage.sql.exec("INSERT INTO audit VALUES (?,?,?,?,?,?,?)", Date.now(), who, tool, scope, args, ok, result);
    this.ctx.storage.sql.exec("DELETE FROM audit WHERE ts < ?", Date.now() - 90 * 864e5); // keep 90 days
  }
  async auditRead(a: any) {
    const lim = Math.min(Number(a.limit) || 30, 200);
    const rows = a.tool ? this.ctx.storage.sql.exec("SELECT * FROM audit WHERE tool = ? ORDER BY ts DESC LIMIT ?", a.tool, lim).toArray()
      : this.ctx.storage.sql.exec("SELECT * FROM audit ORDER BY ts DESC LIMIT ?", lim).toArray();
    return rows.map((r: any) => ({ ...r, ts: new Date(r.ts).toISOString(), ok: !!r.ok, args: safeJson(r.args), result: safeJson(r.result) }));
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    let m: any; try { m = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (m.type === "hb") { ws.send(JSON.stringify({ type: "hb" })); return; }
    const p = m.id && this.pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer); this.pending.delete(m.id);
    m.ok ? p.resolve(m.result) : p.reject(new Error(m.error || "extension error"));
  }

  async webSocketClose(ws: WebSocket, code: number) { try { ws.close(code, "closed"); } catch {} }
}

const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return s; } };

// extension results may carry images: [{mime, data(base64), ...}] -> MCP image blocks
function toContent(r: any) {
  const content: any[] = [];
  const images = r && Array.isArray(r.images) ? r.images : [];
  const rest = images.length ? { ...r, images: images.map((i: any, n: number) => ({ index: n, mime: i.mime, width: i.width, height: i.height, alt: i.alt })) } : r;
  content.push({ type: "text", text: typeof rest === "string" ? rest : JSON.stringify(rest, null, 2) });
  for (const i of images) if (i.data) content.push({ type: "image", data: i.data, mimeType: i.mime || "image/png" });
  return { content };
}
