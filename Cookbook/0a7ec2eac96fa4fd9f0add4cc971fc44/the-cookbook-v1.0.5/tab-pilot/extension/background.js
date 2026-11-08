// tab-pilot background: holds the relay WebSocket, runs tool calls against ChatGPT / Substack tabs.
import { chatgptPage } from "./sites/chatgpt.js";
import { geminiPage } from "./sites/gemini.js";
import { linkedinPage } from "./sites/linkedin.js";
import { tiktokPage } from "./sites/tiktok.js";
import { SELECTORS } from "./sites/selectors.js";

// selectors = defaults (sites/selectors.js) + overrides saved via selectors_set (hot-fix without a code update)
async function sel(site) { const { selOverrides = {} } = await chrome.storage.local.get("selOverrides"); return { ...SELECTORS[site], ...(selOverrides[site] || {}) }; }
const page = (fn, site) => async (tab, op, a, world = "ISOLATED") => exec(tab, fn, [op, a || {}, await sel(site)], world);
const tt = page(tiktokPage, "tiktok");
import { markdownToDoc, docToMarkdown, docToHtml, images as docImages, imageNode } from "./lib/substack-doc.js";

const VERSION = chrome.runtime.getManifest().version;
let ws = null, pingTimer = null, backoff = 1000, lastError = null, lastHb = 0, relayVersion = null, connectedHub = null;

// the relay may move to a new hub instance after an update: follow it (stateless /hub tells the current one)
async function checkHub() {
  const { relayUrl, token } = await cfg(); if (!relayUrl || !token || !ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const r = await fetch(relayUrl.replace(/\/$/, "") + "/hub", { headers: { authorization: "Bearer " + token } });
    const j = await r.json(); relayVersion = j.relay;
    if (connectedHub && j.hub && j.hub !== connectedHub) { lastError = `relay moved to ${j.hub} — reconnecting`; try { ws.close(4002, "hub moved"); } catch {} }
  } catch {}
}

// ---------- relay connection ----------
async function cfg() { return chrome.storage.local.get({ relayUrl: "", token: "", substackPub: "" }); }

async function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const { relayUrl, token } = await cfg();
  if (!relayUrl || !token) { lastError = "relay URL / token not set (options)"; return; }
  const url = relayUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/ext?token=" + encodeURIComponent(token);
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => {
    backoff = 1000; lastError = null; badge("on"); setTimeout(checkHub, 3000);
    clearInterval(pingTimer); // <30s traffic keeps the MV3 service worker alive
    lastHb = Date.now(); let n = 0;
    pingTimer = setInterval(() => {
      if (sock.readyState !== WebSocket.OPEN) return;
      sock.send('{"type":"ping"}'); // edge auto-response, keeps the service worker alive
      if (++n % 3 === 0) sock.send('{"type":"hb"}'); // answered by relay code itself
      if (Date.now() - lastHb > 150000) { lastError = "relay heartbeat lost — reconnecting"; try { sock.close(4001, "hb timeout"); } catch {} }
    }, 20000);
  };
  sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === "hb") { lastHb = Date.now(); return; }
    if (m.type === "hello") { connectedHub = m.hub; lastHb = Date.now(); return; }
    if (m.id && m.tool) handle(sock, m); };
  sock.onclose = (e) => {
    clearInterval(pingTimer); if (ws === sock) ws = null; badge("off");
    lastError = `closed ${e.code} ${e.reason || ""}`.trim();
    if (e.code === 4000) return; // replaced by a newer connection
    setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000);
  };
  sock.onerror = () => { lastError = "socket error"; };
}
function badge(s) {
  chrome.action.setBadgeText({ text: s === "on" ? "" : "off" });
  chrome.action.setBadgeBackgroundColor({ color: "#b00" });
}

chrome.runtime.onStartup.addListener(() => { chrome.alarms.create("keepalive", { periodInMinutes: 0.5 }); connect(); });
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create("keepalive", { periodInMinutes: 0.5 }); connect(); });
let alarmN = 0;
chrome.alarms.onAlarm.addListener(() => { connect(); cleanup(); if (++alarmN % 4 === 0) checkHub(); }); // alarm every 30 s -> hub check every 2 min
chrome.storage.onChanged.addListener((c) => { if (c.relayUrl || c.token) { try { ws?.close(); } catch {} ws = null; connect(); } });
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m === "status") reply({ connected: ws?.readyState === WebSocket.OPEN, lastError, relayVersion });
  if (m === "reconnect") { try { ws?.close(); } catch {} ws = null; connect().then(() => reply(true)); return true; }
});
connect();

// second lock in the browser itself: publishing / dev tools must be enabled in the extension options
async function gate(tool, scope) {
  const { allowPublish = false, allowDev = false } = await chrome.storage.local.get(["allowPublish", "allowDev"]);
  if (scope === "publish" && !allowPublish) throw new Error(`'${tool}' publishes publicly — enable "Allow publishing" in the tab-pilot extension options`);
  if (scope === "dev" && !allowDev && tool !== "ext_reload") throw new Error(`'${tool}' is a developer tool — enable "Developer tools" in the extension options`);
}

// background jobs (args.async): result kept in memory for 2 h; the open relay socket keeps the service worker alive
const JOBS = new Map();
function startJob(tool, args, fn) {
  const job_id = "job_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const j = { job_id, tool, state: "running", started: new Date().toISOString() };
  j.promise = fn(args).then((r) => { j.state = "done"; j.result = r; }, (e) => { j.state = "error"; j.error = String(e?.message || e); })
    .finally(() => { j.finished = new Date().toISOString(); });
  JOBS.set(job_id, j);
  for (const [k, v] of JOBS) if (v.finished && Date.now() - Date.parse(v.finished) > 2 * 3600e3) JOBS.delete(k);
  return { job_id, state: "running", hint: "call job_status {job_id, wait_seconds}" };
}
const jobView = ({ promise, ...j }) => j;

async function handle(sock, { id, tool, args, scope }) {
  let msg; if (tool !== "debug_trace" && tool !== "job_status") { TRACE = []; T0.t = Date.now(); trace("tool " + tool); }
  try {
    const fn = TOOLS[tool]; if (!fn) throw new Error("extension has no tool " + tool);
    await gate(tool, scope);
    const { async: bg, ...rest } = args || {};
    msg = { id, ok: true, result: bg ? startJob(tool, rest, fn) : await fn(rest) };
  } catch (e) { msg = { id, ok: false, error: String(e?.message || e) }; }
  if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(msg));
}

// ---------- tab helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let TRACE = []; const T0 = { t: 0 };
const trace = (m) => { TRACE.push(`${((Date.now() - T0.t) / 1000).toFixed(1)}s ${m}`); if (TRACE.length > 200) TRACE.shift(); };
async function until(fn, ms, step = 1000) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } }
// MAIN world: hidden tabs never run IntersectionObserver callbacks, so lazily rendered UI (Angular @defer on viewport,
// e.g. Gemini's upload menu) never appears. While the page is hidden, report every observed element as visible.
function patchHiddenObservers() {
  if (window.__tpIO) return { patched: "already" };
  const IO = window.IntersectionObserver; window.__tpIO = IO;
  window.IntersectionObserver = class extends IO {
    constructor(cb, opts) { super(cb, opts); this.__cb = cb; }
    observe(el) { super.observe(el); if (document.hidden) setTimeout(() => { const r = el.getBoundingClientRect();
      try { this.__cb([{ target: el, isIntersecting: true, intersectionRatio: 1, boundingClientRect: r, intersectionRect: r, rootBounds: null, time: performance.now() }], this); } catch (e) { console.warn("tp IO shim", e); } }, 0); }
  };
  return { patched: true };
}
// Hidden tabs get no animation frames, and Gemini's Angular UI renders on frames (menus stay empty, chips never appear).
// A CDP screencast makes the compositor produce frames for a background tab while fn runs; frames are acked and dropped.
async function withFrames(tabId, fn) {
  const t = { tabId }; let attached = false;
  const onEvent = (src, method, params) => { if (src.tabId === tabId && method === "Page.screencastFrame") chrome.debugger.sendCommand(t, "Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {}); };
  try { await chrome.debugger.attach(t, "1.3"); attached = true; chrome.debugger.onEvent.addListener(onEvent);
    await chrome.debugger.sendCommand(t, "Page.enable");
    await chrome.debugger.sendCommand(t, "Page.startScreencast", { format: "jpeg", quality: 1, maxWidth: 64, maxHeight: 64, everyNthFrame: 1 });
  } catch (e) { trace(`screencast ${tabId} failed: ${e?.message || e}`); }
  try { return await fn(); }
  finally { chrome.debugger.onEvent.removeListener(onEvent);
    if (attached) { await chrome.debugger.sendCommand(t, "Page.stopScreencast").catch(() => {}); await chrome.debugger.detach(t).catch(() => {}); } }
}
// Chrome freezes background tabs (tab.frozen): injected scripts then never return. Wake the page via CDP lifecycle state.
async function unfreeze(tabId) {
  const t = { tabId };
  try { await chrome.debugger.attach(t, "1.3"); await chrome.debugger.sendCommand(t, "Page.enable");
    await chrome.debugger.sendCommand(t, "Page.setWebLifecycleState", { state: "active" }); trace(`unfroze tab ${tabId}`); }
  catch (e) { trace(`unfreeze ${tabId} failed: ${e?.message || e}`); }
  finally { await chrome.debugger.detach(t).catch(() => {}); }
  await sleep(300);
}
async function exec(tabId, func, args, world = "ISOLATED") {
  trace(`exec ${func.name}(${typeof args[0] === "string" ? args[0] : ""}) tab ${tabId}`);
  busy.set(tabId, (busy.get(tabId) || 0) + 1); touch(tabId);
  const tab0 = await chrome.tabs.get(tabId);
  if (tab0.frozen) await unfreeze(tabId);
  if (tab0.groupId > 0) { const g = await chrome.tabGroups.get(tab0.groupId).catch(() => null); if (g?.collapsed) await chrome.tabGroups.update(g.id, { collapsed: false }); }
  try {
    const run = chrome.scripting.executeScript({ target: { tabId }, func, args: args.map((v) => v ?? null), world });
    const t = await chrome.tabs.get(tabId);
    const [r] = await Promise.race([run, sleep(120000).then(() => {
      throw new Error(`page script hung in tab ${tabId} (discarded=${t.discarded} frozen=${t.frozen} status=${t.status})`); })]);
    if (r?.error) throw new Error(r.error.message || String(r.error));
    if (r?.result && r.result.__error) throw new Error(r.result.__error);
    return r?.result;
  } finally { busy.set(tabId, busy.get(tabId) - 1); touch(tabId); }
}
function waitLoaded(tabId, ms = 45000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(l); clearTimeout(t); resolve(); };
    const l = (id, info) => { if (id === tabId && info.status === "complete") done(); };
    const t = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(l);
    chrome.tabs.get(tabId).then((tab) => tab.status === "complete" && done()).catch(done);
  });
}
// ---------- owned tabs: grouped, idle-closed (machine is under load) ----------
const busy = new Map(); // tabId -> in-flight count
// storage.local: survives extension reloads (session storage does not -> orphan tabs)
let ownedLock = Promise.resolve();
async function owned() { return (await chrome.storage.local.get({ owned: {} })).owned; }
function setOwned(fn) {
  ownedLock = ownedLock.then(async () => { const o = await owned(); fn(o); await chrome.storage.local.set({ owned: o }); }).catch(() => {});
  return ownedLock;
}
// startup: forget dead ids, adopt anything sitting in a "tab-pilot" group
async function adopt() {
  const live = new Set((await chrome.tabs.query({})).map((t) => t.id));
  const groups = await chrome.tabGroups.query({ title: "tab-pilot" });
  const inGroup = (await Promise.all(groups.map((g) => chrome.tabs.query({ groupId: g.id })))).flat();
  await setOwned((o) => { for (const id of Object.keys(o)) if (!live.has(Number(id))) delete o[id]; for (const t of inGroup) o[t.id] ??= Date.now(); });
}
adopt();
async function touch(tabId) { await setOwned((o) => { if (o[tabId]) o[tabId] = Date.now(); }); }
async function newTab(url) {
  const t = await chrome.tabs.create({ url, active: false });
  await setOwned((o) => { o[t.id] = Date.now(); });
  chrome.tabs.update(t.id, { autoDiscardable: false }).catch(() => {});
  try {
    const [g] = await chrome.tabGroups.query({ title: "tab-pilot", windowId: t.windowId });
    const groupId = await chrome.tabs.group({ tabIds: t.id, ...(g ? { groupId: g.id } : { createProperties: { windowId: t.windowId } }) });
    // NOT collapsed: Chrome freezes tabs in collapsed groups (page scripts then hang)
    await chrome.tabGroups.update(groupId, { title: "tab-pilot", color: "grey", collapsed: false });
  } catch {} // grouping is cosmetic
  await waitLoaded(t.id);
  return t.id;
}
async function cleanup(force = false) {
  const { idleMinutes } = await chrome.storage.local.get({ idleMinutes: 5 });
  const o = await owned(); const closed = [];
  for (const [id, last] of Object.entries(o)) {
    const tid = Number(id);
    if (busy.get(tid)) continue;
    if (force || Date.now() - last > idleMinutes * 60000) { try { await chrome.tabs.remove(tid); } catch {} closed.push(tid); }
  }
  if (closed.length) await setOwned((x) => closed.forEach((id) => delete x[id]));
  return { closed: closed.length, kept: Object.keys(o).length - closed.length };
}
chrome.tabs.onRemoved.addListener((id) => setOwned((o) => delete o[id]));

// navigate one of OUR tabs (never the user's) and wait for load
async function goto(tabId, url) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url !== url) { await chrome.tabs.update(tabId, { url }); await sleep(300); }
  await waitLoaded(tabId);
}
// relay-hosted files (file_id) -> authenticated URL; token is only ever sent to the relay origin
async function relayBase() { return (await cfg()).relayUrl.replace(/\/$/, ""); }
async function fileUrl(f) { return f.file_id ? `${await relayBase()}/files/${encodeURIComponent(f.file_id)}` : f.url; }
async function xfetch(url, init = {}) {
  const { relayUrl, token } = await cfg();
  const headers = new Headers(init.headers || {});
  if (relayUrl && url.startsWith(relayUrl.replace(/\/$/, "") + "/files/")) headers.set("authorization", "Bearer " + token);
  return fetch(url, { ...init, headers });
}
const b64 = (buf) => { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const utf8b64 = (t) => b64(new TextEncoder().encode(t));
async function fetchB64(url) {
  if (url.startsWith("data:")) { const [h, d] = url.split(","); return { mime: h.slice(5).split(";")[0], base64: h.includes(";base64") ? d : utf8b64(decodeURIComponent(d)) }; }
  const r = await xfetch(url); if (!r.ok) throw new Error(`fetch ${url.split("?")[0]} -> ${r.status}`);
  return { mime: (r.headers.get("content-type") || "application/octet-stream").split(";")[0], base64: b64(await r.arrayBuffer()) };
}
async function normFiles(files = []) {
  return Promise.all(files.map(async (f) => {
    if (f.base64) return { name: f.name, mime: f.mime || "application/octet-stream", base64: f.base64 };
    if (f.text !== undefined) return { name: f.name, mime: f.mime || "text/plain", base64: utf8b64(f.text) };
    if (f.url || f.file_id) { const d = await fetchB64(await fileUrl(f)); return { name: f.name, mime: f.mime || d.mime, base64: d.base64 }; }
    throw new Error(`file ${f.name}: give text | base64 | file_id | url`);
  }));
}

// tab for a site URL: reuse an owned tab on that host (navigating if url differs), else open one
const ALLOWED = /^https:\/\/([\w-]+\.)*(linkedin\.com|chatgpt\.com|substack\.com|tiktok\.com|viblo\.asia|dev\.to|gemini\.google\.com)\//;
async function siteTab(url, { navigate = true } = {}) {
  if (!ALLOWED.test(url)) throw new Error("site not allowed: " + url);
  const host = new URL(url).host; const o = await owned();
  const t = (await chrome.tabs.query({ url: `https://${host}/*` })).find((x) => o[x.id]);
  if (!t) return newTab(url);
  if (navigate && t.url !== url) await goto(t.id, url);
  return t.id;
}

// ---------- write outcome convention ----------
// every write tool returns { ...result, verified, evidence }: verified = re-read from the site after acting, not "the click happened"
const outcome = (result, ok, evidence) => ({ ...result, verified: !!ok, ...(evidence !== undefined ? { evidence } : {}) });

// ---------- LinkedIn ----------
const li = page(linkedinPage, "linkedin");
const human = (min = 800, max = 2200) => sleep(min + Math.random() * (max - min)); // human-ish pacing
async function liTab(url = "https://www.linkedin.com/feed/", navigate = true) {
  const tab = await siteTab(url, { navigate });
  for (let i = 0; i < 20; i++) {
    const s = await li(tab, "state").catch(() => null);
    if (s?.challenge) throw new Error("LinkedIn is showing a security checkpoint — resolve it in Chrome first");
    if (s?.loggedIn) return tab;
    await sleep(1000);
  }
  throw new Error("LinkedIn not logged in (or page did not load)");
}

// MAIN world: next file-input click() (or showPicker) gets these files instead of opening the OS picker
function armFileInput(files) {
  const toFiles = () => { const dt = new DataTransfer(); for (const f of files) { const bin = atob(f.base64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); dt.items.add(new File([u], f.name, { type: f.mime })); } return dt.files; };
  const P = HTMLInputElement.prototype; const oc = P.click, op = P.showPicker;
  const hook = function () {
    if (this.type !== "file") return oc.call(this);
    P.click = oc; P.showPicker = op; window.__tpArmed = false;
    this.files = toFiles(); this.dispatchEvent(new Event("input", { bubbles: true })); this.dispatchEvent(new Event("change", { bubbles: true }));
  };
  P.click = hook; P.showPicker = hook; window.__tpArmed = true;
  setTimeout(() => { if (window.__tpArmed) { P.click = oc; P.showPicker = op; window.__tpArmed = false; } }, 30000); // auto-disarm
  return { armed: true };
}

async function publishArticle(tab, a, st, draft_url) {
  if (a.publish === false) return { published: false, draft_url, state: st };
    await human(); await li(tab, "clickLabel", { label: "Next" });
    if (!(await until(async () => (await li(tab, "dialogs")).some((d) => d.buttons.includes("Publish")), 20000))) throw new Error("publish dialog did not open");
    if (a.share_text) { await human(); await li(tab, "insertText", { scope: "[role=dialog]:not([aria-hidden=true])", text: a.share_text }); }
    await human(); await li(tab, "clickLabel", { label: "Publish", scope: "[role=dialog]:not([aria-hidden=true])" });
    const done = await until(async () => { const u = (await chrome.tabs.get(tab)).url; return !/\/article\/edit\//.test(u) || !(await li(tab, "dialogs")).some((d) => d.buttons.includes("Publish")) ? u : null; }, 60000);
    if (!done) throw new Error("publish did not complete");
    await human(4000, 6000);
    // the feed post can lag on the activity page; the article itself lists immediately
    await goto(tab, "https://www.linkedin.com/in/me/recent-activity/articles/"); await human(2000, 3000);
    const arts = await li(tab, "myArticles").catch(() => []);
    const art = arts.find((x) => !a.title || x.title === a.title) || arts[0] || null;
    return outcome({ published: true, draft_url, article: art, url: art?.url || null, state: st }, !!art && (!a.title || art.title === a.title), art ? { listed_as: art.title } : "article not found in your articles list");
}

// ---------- large files: fetched by the extension, streamed into the tab's isolated world in chunks ----------
// (relay messages are capped ~1 MiB, so big media must come by URL — e.g. a temporary 127.0.0.1 file server)
async function stageFile(tab, f) {
  const ref = "f" + Date.now() + Math.random().toString(36).slice(2, 6); const CH = 4 * 1024 * 1024;
  const push = (i, d) => exec(tab, (ref, i, d) => { (window.__tp ||= {})[ref] ||= []; window.__tp[ref][i] = d; return true; }, [ref, i, d]);
  let n = 0, size = 0, mime = f.mime;
  if (f.base64) { const bin = atob(f.base64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    for (let off = 0; off < u.length; off += CH) await push(n++, b64of(u.subarray(off, off + CH))); size = u.length; }
  else if (f.url || f.file_id) {
    const url = await fileUrl(f);
    // Range-download 4 MiB at a time: the service worker never holds the whole file
    const head = await xfetch(url, { headers: { range: "bytes=0-" + (CH - 1) } });
    if (!head.ok) throw new Error(`fetch ${url.split("?")[0]} -> ${head.status}`);
    mime ||= (head.headers.get("content-type") || "").split(";")[0];
    const total = head.status === 206 ? Number((head.headers.get("content-range") || "").split("/")[1]) : null;
    if (!total) { const u = new Uint8Array(await head.arrayBuffer()); for (let off = 0; off < u.length; off += CH) await push(n++, b64of(u.subarray(off, off + CH))); size = u.length; } // no Range support
    else {
      await push(n++, b64of(new Uint8Array(await head.arrayBuffer())));
      for (let off = CH; off < total; off += CH) {
        const r = await xfetch(url, { headers: { range: `bytes=${off}-${Math.min(off + CH, total) - 1}` } });
        if (r.status !== 206) throw new Error(`range fetch -> ${r.status}`);
        await push(n++, b64of(new Uint8Array(await r.arrayBuffer())));
      }
      size = total;
    }
  } else throw new Error(`file ${f.name}: give file_id | url | base64`);
  trace(`staged ${f.name} ${size} bytes in ${n} chunks`);
  return { ref, name: f.name, mime: mime || "application/octet-stream", size };
}
const b64of = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

// ---------- trusted input via CDP (for editors that ignore synthetic events, e.g. TikTok's DraftJS form) ----------
// Focus target first (page op), then: attach -> keys/insertText -> detach. Infobar shows only while attached.
async function cdpInput(tabId, steps) {
  const t = { tabId };
  await chrome.debugger.attach(t, "1.3");
  try {
    const key = (type, k) => chrome.debugger.sendCommand(t, "Input.dispatchKeyEvent", { type, ...k });
    for (const s of steps) {
      if (s.text !== undefined) await chrome.debugger.sendCommand(t, "Input.insertText", { text: s.text });
      else if (s.key) {
        const K = { Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
          SelectAll: { key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 4, commands: ["selectAll"] } }[s.key];
        await key("keyDown", K); await key("keyUp", { ...K, text: undefined, commands: undefined });
      }
      await sleep(s.pause ?? 60);
    }
  } finally { await chrome.debugger.detach(t).catch(() => {}); }
}
// type multi-line text: insertText per line, Enter between lines
const typeSteps = (text) => text.split("\n").flatMap((l, i) => [...(i ? [{ key: "Enter" }] : []), ...(l ? [{ text: l }] : [])]);

// ---------- ChatGPT ----------
// One dedicated background tab, created inactive so the user's tabs/focus are never touched.
// ChatGPT shows a temporary /c/local-chatgpt:<id> URL until the conversation is saved; never hand that out or navigate to it
const isLocalChat = (u) => /local-chatgpt/.test(decodeURIComponent(u || ""));
const chatLinks = (tab) => exec(tab, () => [...document.querySelectorAll('a[href*="/c/"]')].map((a) => [a.getAttribute("href"), (a.getAttribute("aria-label") || a.textContent || "").trim()]).filter(([h]) => /\/c\/[0-9a-f]{8}-/.test(h)), []);
const gptKnown = new Map(); // tabId -> chat hrefs that existed before this tab sent its prompt
// Real /c/<uuid> URL of the conversation in this tab. ChatGPT keeps a temporary local-chatgpt: URL in hidden tabs,
// often for the whole generation. Fallback: a sidebar chat link that did NOT exist before we sent (`known`);
// when several appeared (other sessions sending too), the one whose label equals this tab's generated title.
async function realChatUrl(tab, waitS = 30, known = null) {
  known = known || gptKnown.get(tab) || null;
  for (let i = 0; i < waitS; i++) {
    const t = await chrome.tabs.get(tab).catch(() => null); if (!t) return null;
    if (/\/c\/[0-9a-f]{8}-[0-9a-f-]{20,}/.test(t.url)) return t.url;
    if (known) { // the sidebar is shared with the user's own tabs: never take a link just because it is new
      const proj = t.url.match(/\/g\/(g-p-[0-9a-f]+)/)?.[1]; // same scope only: same project, or plain /c/ chats
      const fresh = ((await chatLinks(tab)) || []).filter(([h]) => !known.includes(h) && (proj ? h.includes(proj) : /^\/c\//.test(h)));
      const title = (t.title || "").replace(/^ChatGPT\s*[-–]\s*/, "").trim();
      const pick = title && title !== "ChatGPT" ? fresh.filter(([, l]) => l === title) : [];
      if (pick.length === 1) return new URL(pick[0][0], "https://chatgpt.com").href;
    }
    await sleep(1000);
  }
  return null;
}
// ---------- ChatGPT: one tab per job ----------
// Each ChatGPT tool call claims its own tab for its whole duration, so concurrent jobs (other agent
// sessions sharing this relay) never navigate or type into each other's conversation. A finished
// tab stays open (unclaimed) so chatgpt_get_result can pick the same chat up again; extras are trimmed.
const gptClaimed = new Set();
const GPT_IDLE_KEEP = 3;
const chatId = (u) => (decodeURIComponent(u || "").match(/\/c\/([0-9a-f]{8}-[0-9a-f-]{20,})/) || [])[1] || null;
let gptLock = Promise.resolve();
function gptAcquire(url) { // serialize claim decisions; the claim itself lasts for the whole call
  const run = gptLock.then(async () => {
    const o = await owned(); const want = chatId(url);
    const free = (await chrome.tabs.query({ url: "https://chatgpt.com/*" })).filter((t) => o[t.id] && !gptClaimed.has(t.id) && !busy.get(t.id));
    const same = want && free.find((t) => chatId(t.url) === want);
    if (same) { gptClaimed.add(same.id); return same.id; }
    free.sort((x, y) => (o[y.id] || 0) - (o[x.id] || 0));
    for (const t of free.slice(GPT_IDLE_KEEP - 1)) chrome.tabs.remove(t.id).catch(() => {});
    const id = await newTab("https://chatgpt.com/");
    gptClaimed.add(id); return id;
  });
  gptLock = run.catch(() => {});
  return run;
}
async function withGpt(url, fn) { const tab = await gptAcquire(url); try { return await fn(tab); } finally { gptClaimed.delete(tab); } }
const gpt = page(chatgptPage, "chatgpt");
async function gptReady(tabId) {
  let r, err;
  for (let i = 0; i < 90; i++) { // Cloudflare challenge on fresh tabs can take ~60s
    try { r = await gpt(tabId, "ready"); err = null; } catch (e) { r = null; err = String(e?.message || e); }
    if (r?.composer) return r;
    if (r?.loggedOut) throw new Error("ChatGPT is logged out in Chrome — log in, then retry");
    await sleep(1000);
  }
  throw new Error("ChatGPT composer never appeared: " + JSON.stringify({ last: r, err, url: (await chrome.tabs.get(tabId)).url }));
}
// read conversation; wait (up to waitS) until generation done, turns rendered and unchanged across two polls
async function gptRead(tabId, { waitS = 45, minAssistant = 0, images = false, imagesLastN, lastN, debug } = {}) {
  const end = Date.now() + Math.min(Math.max(waitS, 0), 280) * 1000;
  let r = null, prev = "", stable = 0, frozenSince = 0;
  for (;;) {
    try { r = await gpt(tabId, "readAll", { debug, lastN }); } catch { r = null; }
    if (r && !r.turns.length && !/\/(c|share)\//.test(r.url)) { r.status = "empty"; return r; } // no conversation open
    if (r) {
      const sig = JSON.stringify(r.turns.map((t) => [t.text.length, t.images.length]));
      const asst = r.turns.filter((t) => t.role === "assistant").length;
      const last = r.turns[r.turns.length - 1];
      // background tabs briefly render a placeholder instead of the reply; it is not a finished answer
      const placeholder = last?.role === "assistant" && /^This response couldn.t load\.?$/i.test(last.text.trim());
      // stuck "generating" flag (hidden tabs): accept a non-empty reply whose text has not changed for 60 s
      if (sig === prev) frozenSince ||= Date.now(); else frozenSince = 0;
      const stuckDone = r.generating && frozenSince && Date.now() - frozenSince > 60000 && last?.role === "assistant" && last.text.trim().length > 0;
      const ok = r.turns.length && (!r.generating || stuckDone) && !r.pending && !placeholder && asst >= minAssistant;
      stable = ok && sig === prev ? stable + 1 : 0; prev = sig;
      if (stable >= 1) { if (stuckDone) r.done_by = "text frozen 60 s (generating flag stuck)"; break; }
    }
    if (Date.now() > end) break;
    await sleep(2000);
  }
  if (!r) throw new Error("could not read conversation");
  const done = stable >= 1;
  if (images && done) r = await gpt(tabId, "readAll", { images: true, imagesLastN, lastN, debug });
  r.status = done ? "done" : "running";
  return r;
}
// MCP image blocks live at top level; turns keep metadata only
function liftImages(r) {
  r.images = r.turns.flatMap((t) => t.images.filter((i) => i.data));
  for (const t of r.turns) t.images = t.images.map(({ data, ...i }) => i);
  return r;
}
function lastReply(r) {
  const t = [...r.turns].reverse().find((x) => x.role === "assistant") || { text: "", code_blocks: [], images: [] };
  const u = [...r.turns].reverse().find((x) => x.role === "user");
  return { status: r.status, url: r.url, title: r.title, text: t.text, code_blocks: t.code_blocks, last_user: (u?.text || "").slice(0, 300),
    reply_after_last_user: r.turns.lastIndexOf(t) > r.turns.lastIndexOf(u),
    images: t.images.filter((i) => i.data), image_meta: t.images.map(({ data, ...i }) => i),
    ...(r.status !== "done" ? { hint: "still generating — call chatgpt_get_result" } : {}) };
}

// ---------- Gemini: one tab per job (same model as ChatGPT) ----------
// The chat URL is read from the job's own tab only (gemini.google.com/app/<id>), never from the shared sidebar.
const gem = (tab, op, a) => exec(tab, geminiPage, [op, a || {}]);
const gemClaimed = new Set();
const gemId = (u) => (String(u || "").match(/gemini\.google\.com\/(?:u\/\d+\/)?(?:app|gem\/[^/]+)\/([0-9a-f]{8,})/) || [])[1] || null;
let gemLock = Promise.resolve();
function gemAcquire(url) {
  const run = gemLock.then(async () => {
    const o = await owned(); const want = gemId(url);
    const free = (await chrome.tabs.query({ url: "https://gemini.google.com/*" })).filter((t) => o[t.id] && !gemClaimed.has(t.id) && !busy.get(t.id));
    const same = want && free.find((t) => gemId(t.url) === want);
    if (same) { gemClaimed.add(same.id); return same.id; }
    free.sort((x, y) => (o[y.id] || 0) - (o[x.id] || 0));
    for (const t of free.slice(GPT_IDLE_KEEP - 1)) chrome.tabs.remove(t.id).catch(() => {});
    const id = await newTab("https://gemini.google.com/app"); gemClaimed.add(id); return id;
  });
  gemLock = run.catch(() => {});
  return run;
}
async function withGem(url, fn) { const tab = await gemAcquire(url); try { return await fn(tab); } finally { gemClaimed.delete(tab); } }
async function gemReady(tab) {
  let r, err;
  for (let i = 0; i < 60; i++) {
    try { r = await gem(tab, "ready"); err = null; } catch (e) { r = null; err = String(e?.message || e); }
    if (r?.composer) return r;
    if (r?.loggedOut) throw new Error("Gemini is logged out in Chrome: log in at gemini.google.com, then retry");
    await sleep(1000);
  }
  throw new Error("Gemini composer never appeared: " + JSON.stringify({ last: r, err }));
}
const gemChatUrl = async (tab) => { const t = await chrome.tabs.get(tab).catch(() => null); return t && gemId(t.url) ? t.url.split("?")[0] : null; };
// done = assistant text present and unchanged for 3 polls (~6 s) AND (stop button gone OR text frozen 25 s)
// the second branch: hidden tabs update the stop button late, so a complete reply can keep a stuck "generating" flag
async function gemRead(tab, { waitS = 60, minAssistant = 0, lastN } = {}) {
  const end = Date.now() + Math.min(Math.max(waitS, 0), 280) * 1000;
  let r = null, prev = "", stable = 0, frozenSince = 0;
  for (;;) {
    try { r = await gem(tab, "readAll", { lastN }); } catch { r = null; }
    if (r && !r.turns.length && !gemId(r.url)) { r.status = "empty"; return r; }
    if (r) {
      const last = r.turns[r.turns.length - 1]; const asst = r.assistant_total ?? r.turns.filter((t) => t.role === "assistant").length;
      const sig = JSON.stringify(r.turns.map((t) => t.text.length + ":" + t.code_blocks.length));
      if (sig === prev) { stable++; frozenSince ||= Date.now(); } else { stable = 0; frozenSince = 0; } prev = sig;
      const have = last?.role === "assistant" && last.text.length > 0 && asst >= minAssistant;
      if (have && stable >= 3 && (!r.generating || Date.now() - frozenSince > 25000)) { r.status = "done"; r.done_by = r.generating ? "text frozen 25 s (generating flag stuck)" : "stop button gone"; return r; }
    }
    if (Date.now() > end) break;
    await sleep(2000);
  }
  if (!r) throw new Error("could not read Gemini conversation");
  r.status = "running"; return r;
}
const gemReply = (r) => { const t = [...r.turns].reverse().find((x) => x.role === "assistant") || { text: "", code_blocks: [] };
  const u = [...r.turns].reverse().find((x) => x.role === "user");
  return { status: r.status, url: r.url, title: r.title, text: t.text, code_blocks: t.code_blocks, last_user: (u?.text || "").slice(0, 300),
    reply_after_last_user: r.turns.lastIndexOf(t) > r.turns.lastIndexOf(u), ...(r.status !== "done" ? { hint: "still generating: call gemini_get_result with tab_id" } : {}) }; };

// ---------- Substack ----------
// runs in the page (MAIN world) so requests carry the logged-in session, exactly like the editor's own calls
async function substackFetchPage(method, path, body) {
  const r = await fetch(path, { method, credentials: "include", headers: body != null ? { "content-type": "application/json" } : {},
    body: body != null ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 500); }
  return { status: r.status, body: j };
}
// ---------- Viblo ----------
async function vapi(method, path, body) {
  const tab = await siteTab("https://viblo.asia/", { navigate: false });
  const r = await exec(tab, vibloFetchPage, [method, "/api" + path, body ?? null], "MAIN");
  if (r.status === 401) throw new Error("Viblo: not logged in — log in at viblo.asia in Chrome");
  if (r.status >= 400) throw new Error(`Viblo ${method} ${path} -> ${r.status}: ${JSON.stringify(r.body).slice(0, 400)}`);
  return r.body;
}
// post hash id from a URL (/p/<title>-<hash>, /posts/<hash>/edit) or a bare id
function vibloId(x) {
  if (!x) throw new Error("give id or url");
  const s = String(x).trim(); const m = s.match(/\/posts\/([A-Za-z0-9]+)/) || s.match(/\/p\/(?:[^/?#]*-)?([A-Za-z0-9]{6,})(?:[/?#]|$)/);
  return m ? m[1] : s;
}
const vibloTags = (t) => (Array.isArray(t) ? t : String(t || "").split(",")).map((x) => x.trim()).filter(Boolean).slice(0, 5).join(",");
const vibloPost = (p) => ({ id: p.slug, title: p.title, status: p.status, url: p.url || p.canonical_url || `https://viblo.asia/p/${p.transliterated}-${p.slug}`,
  edit_url: `https://viblo.asia/posts/${p.slug}/edit`, tags: (p.tags?.data || []).map((t) => t.name), published_at: p.published_at || null,
  updated_at: p.updated_at, views: p.views_count, points: p.points, comments_count: p.comments_count });
async function vibloGet(id) { const r = await vapi("GET", `/posts/${id}`); return r.post?.data ?? r.post; }
async function vibloMine(id) { // the editable copy; throws if not yours
  const me = (await vapi("GET", "/me")).data; const p = await vibloGet(id);
  if (p.user_id !== me.id) throw new Error(`post ${id} belongs to user ${p.user_id}, not you (${me.username})`);
  return p;
}
// scout: one row shape for feed / tag / search results
const vibloRow = (p) => { const st = p.stats || p; const views = st.views_count ?? 0;
  return { id: p.slug, title: p.title, url: `https://viblo.asia/p/${p.transliterated ? p.transliterated + "-" : ""}${p.slug}`,
    author: p.user?.data?.username, tags: (p.tags?.data || []).map((t) => t.name), published_at: p.published_at,
    views, points: p.points ?? 0, clips: st.clips_count ?? 0, comments: st.comments_count ?? 0, reading_time: p.reading_time ?? null,
    clips_per_1k_views: views ? Math.round((st.clips_count || 0) * 10000 / views) / 10 : null }; };
const VIBLO_METRIC = { views: "views", points: "points", clips: "clips", comments: "comments" };

const vibloComment = (c) => ({ id: c.id, hash_id: c.hash_id, author: c.user?.data?.username, text: c.contents, created_at: c.created_at,
  reply_to: c.in_reply_to_comment || null, level: c.level, points: c.points });

// MAIN world: multipart image upload to Viblo's CDN (same call as the editor's paste/drop)
async function vibloUploadPage(b64, mime, name) {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const fd = new FormData(); fd.append("file", new File([u], name, { type: mime })); fd.append("has_wartermark", "0");
  const x = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
  const r = await fetch("/api/uploads", { method: "POST", credentials: "include", body: fd,
    headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest", ...(x ? { "x-xsrf-token": decodeURIComponent(x[1]) } : {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 500); }
  return { status: r.status, body: j };
}
// viblo.asia (Laravel API behind a Nuxt app): session cookie + X-XSRF-TOKEN from the XSRF-TOKEN cookie
async function vibloFetchPage(method, path, body) {
  const x = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
  const headers = { accept: "application/json", "x-requested-with": "XMLHttpRequest", ...(x ? { "x-xsrf-token": decodeURIComponent(x[1]) } : {}),
    ...(body != null ? { "content-type": "application/json" } : {}) };
  const r = await fetch(path, { method, credentials: "include", headers, body: body != null ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 800); }
  return { status: r.status, body: j };
}
// dev.to (Forem, Rails): session cookie + X-CSRF-Token from <meta name=csrf-token>
async function devtoFetchPage(method, path, body, form) {
  const csrf = document.querySelector("meta[name=csrf-token]")?.content;
  const headers = { accept: "application/json, text/html", ...(csrf ? { "x-csrf-token": csrf } : {}) };
  let payload;
  if (form) { payload = new URLSearchParams({ authenticity_token: csrf || "", ...form }); headers["content-type"] = "application/x-www-form-urlencoded"; }
  else if (body != null) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
  const r = await fetch(path, { method, credentials: "include", headers, body: payload, redirect: "follow" });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, url: r.url, body: j };
}
// ---- dev.to: official API with a personal key that never leaves the extension (chrome.storage.local) ----
async function devtoKey(create = false) {
  const { devtoApiKey } = await chrome.storage.local.get("devtoApiKey");
  if (devtoApiKey || !create) return devtoApiKey || null;
  // create one through the logged-in session (Settings > Extensions), then read it back from the page
  const tab = await siteTab("https://dev.to/", { navigate: false });
  const before = await exec(tab, devtoFetchPage, ["GET", "/settings/extensions", null, null], "MAIN");
  if (!/api_secret\[description\]/.test(String(before.body))) throw new Error("dev.to: not logged in (no API key form at /settings/extensions)");
  await exec(tab, devtoFetchPage, ["POST", "/users/api_secrets", null, { "api_secret[description]": "tab-pilot" }], "MAIN");
  const page = await exec(tab, devtoFetchPage, ["GET", "/settings/extensions", null, null], "MAIN");
  const keys = [...String(page.body).matchAll(/>\s*([A-Za-z0-9]{24})\s*</g)].map((m) => m[1]);
  if (!keys.length) throw new Error("dev.to: key created but not found on the settings page");
  const key = keys[keys.length - 1];
  const ok = await fetch("https://dev.to/api/users/me", { headers: { "api-key": key, accept: "application/vnd.forem.api-v1+json" } });
  if (!ok.ok) throw new Error("dev.to: new key rejected by /api/users/me (" + ok.status + ")");
  await chrome.storage.local.set({ devtoApiKey: key });
  return key;
}
async function devapi(method, path, body) {
  const key = await devtoKey(); if (!key) throw new Error("dev.to API key not set up — call devto_setup first");
  const r = await fetch("https://dev.to/api" + path, { method, headers: { "api-key": key, accept: "application/vnd.forem.api-v1+json", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 500); }
  if (!r.ok) throw new Error(`dev.to ${method} ${path} -> ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}
async function devtoMine(id) { // my article by id, including unpublished (body included)
  for (let page = 1; page <= 10; page++) {
    const list = await devapi("GET", `/articles/me/all?per_page=100&page=${page}`);
    const a = list.find((x) => String(x.id) === String(id)); if (a) return a;
    if (list.length < 100) break;
  }
  throw new Error("dev.to article not found among your articles: " + id);
}
const devtoRow = (a) => ({ id: a.id, title: a.title, published: a.published, url: a.url, tags: a.tag_list, published_at: a.published_at, reactions: a.public_reactions_count, comments: a.comments_count, page_views: a.page_views_count, cover: a.cover_image });
async function devtoUploadPage(b64, mime, name) {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const fd = new FormData(); fd.append("image[]", new File([u], name, { type: mime }));
  const csrf = document.querySelector("meta[name=csrf-token]")?.content;
  const r = await fetch("/image_uploads", { method: "POST", credentials: "include", body: fd, headers: { accept: "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) } });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 400); }
  return { status: r.status, body: j };
}
async function pubHost(p) {
  const host = (p || (await cfg()).substackPub || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) throw new Error("publication not given and no default set in extension options");
  return host;
}
async function pubTab(host) {
  const o = await owned();
  const tabs = await chrome.tabs.query({ url: `https://${host}/*` });
  const mine = tabs.find((t) => o[t.id]) || tabs[0]; // reuse ours first, else any open tab of the pub (read-only use)
  if (mine && mine.status === "complete") return mine.id;
  return newTab(host === "substack.com" ? "https://substack.com/home" : `https://${host}/publish/home`);
}
async function sapi(host, method, path, body) {
  const tab = await pubTab(host);
  const r = await exec(tab, substackFetchPage, [method, path, body], "MAIN");
  if (r.status === 401 || r.status === 403) throw new Error(`Substack ${r.status} on ${path} — logged in as an admin of ${host}?`);
  if (r.status >= 400) throw new Error(`Substack ${method} ${path} -> ${r.status}: ${JSON.stringify(r.body).slice(0, 400)}`);
  return r.body;
}
async function uploadImage(host, { url, base64, mime }) {
  const d = base64 ? { base64, mime: mime || "image/png" } : await fetchB64(url);
  const r = await sapi(host, "POST", "/api/v1/image", { image: `data:${d.mime};base64,${d.base64}` });
  return { url: r.url, ...(r.imageWidth ? { width: r.imageWidth, height: r.imageHeight } : {}), bytes: r.bytes };
}
const onCdn = (src) => /(^|\.)substackcdn\.com\/|substack-post-media\.s3\.amazonaws\.com\//.test(src);
async function buildBody(host, a) {
  if (!a.body_doc && a.body_markdown === undefined) return undefined;
  const doc = a.body_doc || markdownToDoc(a.body_markdown);
  const nodes = []; docImages(doc, (n) => nodes.push(n));
  for (const n of nodes) if (n.attrs?.src && !onCdn(n.attrs.src)) {
    const up = await uploadImage(host, { url: n.attrs.src });
    n.attrs.src = up.url; if (up.width) { n.attrs.width = up.width; n.attrs.height = up.height; } if (up.bytes) n.attrs.bytes = up.bytes;
  }
  return JSON.stringify(doc);
}
async function selfId(host) {
  try { const p = await sapi(host, "GET", "/api/v1/user/profile/self"); return p.id; } catch { return null; }
}
async function draftFields(host, a) {
  const f = {};
  if (a.title !== undefined) f.draft_title = a.title;
  if (a.subtitle !== undefined) f.draft_subtitle = a.subtitle;
  const body = await buildBody(host, a); if (body !== undefined) f.draft_body = body;
  if (a.audience) f.audience = a.audience;
  if (a.section_id) { f.draft_section_id = a.section_id; f.section_chosen = true; }
  if (a.cover_image) f.cover_image = onCdn(a.cover_image) ? a.cover_image : (await uploadImage(host, { url: a.cover_image })).url;
  return f;
}
const postOut = (host, p) => ({ id: p.id, title: p.draft_title ?? p.title, subtitle: p.draft_subtitle ?? p.subtitle, slug: p.slug,
  is_published: !!p.is_published, post_date: p.post_date, audience: p.audience,
  edit_url: `https://${host}/publish/post/${p.id}`, url: p.canonical_url || (p.slug && p.is_published ? `https://${host}/p/${p.slug}` : null) });

// ---------- tool table ----------
const TOOLS = {
  // unpacked dev: reload from disk (picks up file edits)
  async ext_reload() { setTimeout(() => chrome.runtime.reload(), 300); return { reloading: true }; },

  async cleanup() { return cleanup(true); },

  // ---- cross-post workflow: prepare (drafts only) -> human review -> publish ----
  async crosspost_prepare(a) {
    const host = await pubHost(a.publication);
    const id = "xp_" + Date.now().toString(36); const steps = {};
    // 1. Substack draft (or reuse an existing one)
    let draftId = a.substack_draft_id;
    if (!draftId) {
      if (!a.essay_markdown || !a.title) throw new Error("give essay_markdown + title, or substack_draft_id");
      const d = await TOOLS.substack_create_draft({ publication: host, title: a.title, subtitle: a.subtitle, body_markdown: a.essay_markdown, cover_image: a.cover_url });
      draftId = d.id; steps.substack = { ok: d.verified, id: d.id, edit_url: d.edit_url };
    } else steps.substack = { ok: true, id: draftId, edit_url: `https://${host}/publish/post/${draftId}`, reused: true };
    const essay = a.essay_markdown || (await TOOLS.substack_get_post({ publication: host, id: draftId })).body_markdown;
    const title = a.title || (await TOOLS.substack_get_post({ publication: host, id: draftId })).title;
    // 2. ChatGPT writes the LinkedIn pieces (plain markers: robust to code-block rendering changes)
    const prompt = `${a.chatgpt_instructions || ""}
Rewrite the essay below as a SHORT LinkedIn article (${a.linkedin_words || "500-700"} words) in the same language and voice as the essay. Hook in the first 2 lines, short paragraphs, 3-4 H2 subheadings, at most one short list, no links, last line invites readers to the full essay "linked in the first comment".
Then write: (a) a 2-3 line announcement for the LinkedIn feed post, (b) a one-line first comment that ends with the placeholder {URL}.
Answer EXACTLY in this format:
===TITLE===
<article title>
===ARTICLE===
<article body in Markdown, no title line>
===SHARE===
<announcement>
===COMMENT===
<comment with {URL}>
===END===

ESSAY TITLE: ${title}
ESSAY:
${essay}`;
    const g = await TOOLS.chatgpt_chat({ prompt, chat_url: a.chatgpt_chat_url, project_url: a.chatgpt_project_url, wait_seconds: 280, images: "none" });
    let reply = g.text || ""; let chat = g.chat_url;
    for (let i = 0; i < 3 && !/===END===/.test(reply); i++) reply = (await TOOLS.chatgpt_get_result({ chat_url: chat, wait_seconds: 280, images: "none" })).text || reply;
    const part = (k) => ((reply.split(`===${k}===`)[1] || "").split(/===[A-Z]+===/)[0] || "").trim();
    const lt = { title: part("TITLE"), article_md: part("ARTICLE"), share_text: part("SHARE"), comment_template: part("COMMENT") };
    if (!lt.title || !lt.article_md || !lt.comment_template.includes("{URL}")) throw new Error("ChatGPT reply not in the expected format; see " + chat);
    steps.chatgpt = { ok: true, chat_url: chat };
    // 3. LinkedIn article draft (not published)
    const ld = await TOOLS.linkedin_post_article({ title: lt.title, body_markdown: lt.article_md, cover: a.cover, publish: false });
    steps.linkedin = { ok: !!ld.draft_url, draft_url: ld.draft_url, state: ld.state };
    const pkg = { id, created: new Date().toISOString(), publication: host, substack_draft_id: draftId, linkedin: { ...lt, draft_url: ld.draft_url }, chatgpt_chat_url: chat, steps, published: null };
    const { crossposts = {} } = await chrome.storage.local.get("crossposts"); crossposts[id] = pkg; await chrome.storage.local.set({ crossposts });
    return { ...pkg, next: `Review: Substack ${steps.substack.edit_url} and LinkedIn ${ld.draft_url}; then crosspost_publish {id:"${id}"}` };
  },

  async crosspost_publish(a) {
    const { crossposts = {} } = await chrome.storage.local.get("crossposts"); const pkg = crossposts[a.id];
    if (!pkg) throw new Error("unknown crosspost id " + a.id);
    const done = pkg.published || {}; const out = {};
    if (!done.substack_url) {
      const p = await TOOLS.substack_publish({ publication: pkg.publication, id: pkg.substack_draft_id, send_email: !!a.send_email, confirm: true });
      if (!p.verified) throw new Error("Substack publish not verified: " + JSON.stringify(p.evidence));
      done.substack_url = p.url; out.substack = p.url;
    }
    if (!done.linkedin_url) {
      const r = await TOOLS.linkedin_post_article({ draft_url: pkg.linkedin.draft_url, share_text: pkg.linkedin.share_text, title: pkg.linkedin.title });
      if (!r.url) throw new Error("LinkedIn article published but URL not found yet — re-run crosspost_publish to continue: " + JSON.stringify(r.evidence));
      done.linkedin_url = r.url; out.linkedin = r.url;
    }
    if (!done.comment) {
      const c = await TOOLS.linkedin_comment({ post_url: done.linkedin_url, text: pkg.linkedin.comment_template.replace("{URL}", done.substack_url) });
      done.comment = c.verified ? "verified" : "submitted"; out.comment = done.comment;
    }
    pkg.published = done; crossposts[a.id] = pkg; await chrome.storage.local.set({ crossposts });
    return outcome({ id: a.id, ...done }, done.substack_url && done.linkedin_url && done.comment === "verified", out);
  },

  // read-only probe of every site: catches logged-out sessions and selector drift before a real task does
  async health_check(a) {
    const sites = a.sites || ["chatgpt", "gemini", "substack", "linkedin", "tiktok", "viblo"];
    const has = (list) => (sels) => Object.fromEntries(sels.map(([k, q]) => [k, !!document.querySelector(q)]));
    const probe = async (site, fn) => {
      const checks = []; const t0 = Date.now();
      const check = async (name, f) => { const t = Date.now(); try { const d = await f(); checks.push({ name, ok: d !== false, ms: Date.now() - t, ...(d && d !== true ? { detail: d } : {}) }); }
        catch (e) { checks.push({ name, ok: false, ms: Date.now() - t, error: String(e.message || e).slice(0, 200) }); } };
      try { await Promise.race([fn(check), sleep(90000).then(() => { throw new Error("site probe timed out (90 s)"); })]); }
      catch (e) { checks.push({ name: "probe", ok: false, error: String(e.message || e) }); }
      return { site, ok: checks.every((c) => c.ok), ms: Date.now() - t0, checks };
    };
    // keys may be "a|b" = either selector is fine; retries ~10 s (UIs mount pieces after the page "loads")
    const selCheck = async (tab, site, keys) => { const S = await sel(site); let missing = keys;
      for (let i = 0; i < 7 && missing.length; i++) {
        const r = await exec(tab, has(), [keys.flatMap((k) => k.split("|")).map((k) => [k, S[k]])]);
        missing = keys.filter((k) => !k.split("|").some((x) => r[x]));
        if (missing.length) await sleep(1500);
      }
      if (missing.length) throw new Error("selectors not found: " + missing.join(", ") + " (fix with selectors_set, or update sites/selectors.js)"); return true; };
    const P = {
      chatgpt: (check) => (async () => { let tab;
        await check("open + logged in", async () => { tab = await gptAcquire(null); gptClaimed.delete(tab); await goto(tab, "https://chatgpt.com/"); await gptReady(tab); return true; });
        if (tab) await check("selectors", () => selCheck(tab, "chatgpt", ["editor", "modelBtn", "fileInput"])); })(),
      gemini: (check) => (async () => { let tab;
        await check("open + logged in", async () => { tab = await gemAcquire(null); gemClaimed.delete(tab); await goto(tab, "https://gemini.google.com/app"); const r = await gemReady(tab); return { model: r.model }; }); })(),
      substack: (check) => (async () => {
        await check("default publication set", async () => { const h = await pubHost(a.publication); return { publication: h }; });
        await check("API session", async () => { const r = await sapi(await pubHost(a.publication), "GET", "/api/v1/post_management/counts"); return { counts: r }; }); })(),
      linkedin: (check) => (async () => { let tab;
        await check("feed loads + logged in", async () => { tab = await liTab(); const r = await until(async () => { const f = await li(tab, "readFeed"); return f.posts.length ? f : null; }, 20000, 1500);
          if (!r) throw new Error("no posts parsed from feed"); return { posts: r.posts.length }; });
        if (tab) await check("selectors", () => selCheck(tab, "linkedin", ["feed", "startPost", "commentary|expandableText"])); })(),
      tiktok: (check) => (async () => { let tab;
        await check("Studio loads + logged in", async () => { tab = await siteTab("https://www.tiktok.com/tiktokstudio/content");
          const r = await until(async () => { const x = await tt(tab, "contentRows").catch(() => null); return x && x.length ? x : null; }, 30000, 1500);
          if (!r) throw new Error("no videos parsed from Studio content list (logged out?)"); return { videos: r.length }; });
        await check("upload page selectors", async () => { tab = await siteTab(`https://www.tiktok.com/tiktokstudio/upload?from=webapp&tp=${Date.now()}`);
          const ok = await until(async () => (await tt(tab, "state")).fileInput, 20000, 1500); if (!ok) throw new Error("upload file input not found"); return true; }); })(),
      viblo: (check) => (async () => {
        await check("logged in", async () => ({ user: (await vapi("GET", "/me")).data.username }));
        await check("post + comments API", async () => { const p = (await vapi("GET", "/posts/newest?page=1&limit=1")).data[0];
          await vapi("GET", `/posts/${p.slug}`); await vapi("GET", `/posts/${p.slug}/comments`); return { sample: p.slug }; }); })(),
    };
    const results = [];
    for (const site of sites) if (P[site]) { results.push(await probe(site, P[site])); await human(500, 1200); }
    return { ok: results.every((r) => r.ok), at: new Date().toISOString(), results };
  },

  async job_status(a) {
    const j = JOBS.get(a.job_id); if (!j) throw new Error("unknown or expired job (extension restarted?) " + a.job_id);
    if (j.state === "running" && a.wait_seconds) await Promise.race([j.promise, sleep(Math.min(a.wait_seconds, 280) * 1000)]);
    return jobView(j);
  },
  async jobs_list() { return [...JOBS.values()].map(({ promise, result, ...j }) => j).reverse(); },

  async selectors_get(a) { const { selOverrides = {} } = await chrome.storage.local.get("selOverrides");
    return a.site ? { defaults: SELECTORS[a.site], overrides: selOverrides[a.site] || {} } : { sites: Object.keys(SELECTORS), overrides: selOverrides }; },
  async selectors_set(a) { // {site, key, value|null}: value null removes the override
    if (!SELECTORS[a.site]) throw new Error("unknown site " + a.site);
    const { selOverrides = {} } = await chrome.storage.local.get("selOverrides"); const o = selOverrides[a.site] ||= {};
    if (a.value === null || a.value === undefined) delete o[a.key]; else o[a.key] = a.value;
    await chrome.storage.local.set({ selOverrides }); return { site: a.site, overrides: o };
  },

  async linkedin_read_feed(a) {
    const tab = await liTab();
    const want = Math.min(a.limit || 10, 40); let posts = new Map();
    for (let i = 0; i < 8; i++) {
      for (const p of (await li(tab, "readFeed")).posts) posts.set(p.urn || p.text.slice(0, 80), p);
      if (posts.size >= want) break;
      await li(tab, "scroll", { by: 2200 }); await human(1500, 3000);
    }
    return { posts: [...posts.values()].slice(0, want) };
  },
  async linkedin_search(a) {
    const type = { all: "all", people: "people", posts: "content", content: "content", companies: "companies", jobs: "jobs" }[a.type || "content"] || "content";
    const tab = await liTab(`https://www.linkedin.com/search/results/${type}/?keywords=${encodeURIComponent(a.query)}`);
    const want = Math.min(a.limit || 10, 30); const seen = new Map();
    for (let i = 0; i < 6; i++) {
      await human(1200, 2500);
      for (const r of (await li(tab, "readResults")).results) seen.set(r.urn || r.url || r.text?.slice(0, 80), r);
      if (seen.size >= want) break;
      await li(tab, "scroll", { by: 1800 });
    }
    return { query: a.query, type, results: [...seen.values()].slice(0, want) };
  },

  async linkedin_article_drafts() { // read-only: your unpublished article drafts (LinkedIn's Drafts tab)
    const tab = await liTab("https://www.linkedin.com/article/manage/drafts/");
    const list = await until(async () => { const l = await li(tab, "articleDrafts").catch(() => null); return l && l.length ? l : null; }, 15000, 1500);
    return { drafts: (list || []).map((d) => ({ ...d, edit_url: `https://www.linkedin.com/article/edit/${d.id}/` })),
      note: "Deleting drafts must be done in the LinkedIn UI (its menu only renders in a visible tab)." };
  },

  async linkedin_stats() { // creator content analytics (LinkedIn's default 7-day window)
    const tab = await liTab("https://www.linkedin.com/analytics/creator/content/");
    const r = await until(async () => { const x = await li(tab, "contentAnalytics").catch(() => null); return x && x.impressions !== null ? x : null; }, 30000, 1500);
    if (!r) throw new Error("analytics page did not load");
    return r;
  },

  async linkedin_my_posts(a) {
    const tab = await liTab("https://www.linkedin.com/in/me/recent-activity/all/");
    await human(2000, 3000);
    let posts = [];
    for (let i = 0; i < 5 && posts.length < (a.limit || 5); i++) { posts = (await li(tab, "readFeed")).posts; if (posts.length < (a.limit || 5)) { await li(tab, "scroll", { by: 1800 }); await human(1200, 2000); } }
    return { posts: posts.slice(0, a.limit || 5) };
  },

  async linkedin_post(a) { // feed post with optional images/video
    const tab = await liTab();
    await li(tab, "openComposer");
    if (!(await until(async () => (await li(tab, "composer")).editor, 15000))) throw new Error("post composer did not open");
    await human();
    await li(tab, "insertText", { scope: (await sel("linkedin")).composeDialog, text: a.text });
    if (a.files?.length) {
      await human(); await li(tab, "clickLabel", { label: "Media" });
      if (!(await until(async () => (await li(tab, "dialogs")).some((d) => d.header === "Editor"), 10000))) throw new Error("media dialog did not open");
      await li(tab, "dropFiles", { selector: (await sel("linkedin")).mediaDropZone, files: await normFiles(a.files) });
      if (!(await until(async () => (await li(tab, "dialogs")).some((d) => d.header === "Editor" && d.imgs > 0 && d.buttons.includes("Next")), 60000))) throw new Error("media did not load");
      await human(); await li(tab, "clickLabel", { label: "Next", scope: "dialog[data-testid=dialog]:last-of-type" });
      if (!(await until(async () => (await li(tab, "composer")).media > 0 && (await li(tab, "dialogs")).length === 1, 20000))) throw new Error("media not attached");
    }
    const st = await li(tab, "composer");
    if (!st.text.trim().startsWith(a.text.trim().slice(0, 30))) throw new Error("composer text mismatch before posting");
    if (a.dry_run) { await li(tab, "clickLabel", { label: "Dismiss" }); await sleep(800); await li(tab, "clickLabel", { label: "Discard" }).catch(() => {}); return { dry_run: true, verified: st }; }
    await human(); const r = await li(tab, "clickLabel", { label: "Post", scope: (await sel("linkedin")).composeDialog });
    if (!r.clicked) throw new Error("Post button disabled");
    if (!(await until(async () => !(await li(tab, "composer")).open, 60000))) throw new Error("composer did not close after Post");
    await human(3000, 5000);
    const head = a.text.trim().slice(0, 40); let latest = null;
    for (let i = 0; i < 4 && !(latest && latest.text.startsWith(head)); i++) { latest = (await TOOLS.linkedin_my_posts({ limit: 1 })).posts[0] || null; if (!(latest && latest.text.startsWith(head))) await human(5000, 8000); }
    return outcome({ posted: true, url: latest?.url || null, latest }, latest && latest.text.startsWith(head), latest ? { text_head: latest.text.slice(0, 60) } : "post not visible on activity page yet");
  },

  async linkedin_post_article(a) {
    if (a.draft_url) { // publish an existing, already-filled draft
      const tab = await liTab(a.draft_url);
      const st = await until(async () => { const s = await li(tab, "articleState"); return s.title && s.bodyChars > 50 ? s : null; }, 30000);
      if (!st) throw new Error("draft not loaded / empty");
      return publishArticle(tab, a, st, a.draft_url);
    }
    let tab = await liTab("https://www.linkedin.com/article/new/");
    if (!(await until(async () => (await li(tab, "articleState")).title !== null, 20000))) throw new Error("article editor did not load");
    await li(tab, "articleFill", { title: a.title });
    // first edit creates the draft and moves to /article/edit/<id>/ (editor re-inits) — fill body only after that
    const ed = await until(async () => /\/article\/edit\/\d+/.test((await chrome.tabs.get(tab)).url), 30000);
    if (!ed) throw new Error("draft was not created");
    await human(2500, 4000);
    const doc = markdownToDoc(a.body_markdown);
    await li(tab, "articleFill", { html: docToHtml(doc), text: a.body_markdown });
    if (a.cover) {
      await exec(tab, armFileInput, [await normFiles([a.cover])], "MAIN");
      await li(tab, "clickLabel", { label: "Upload from computer" });
      if (!(await until(async () => (await li(tab, "dialogs")).some((d) => d.buttons.includes("Next") && d.imgs > 0), 30000))) throw new Error("cover dialog did not appear");
      await human(); await li(tab, "clickLabel", { label: "Next", scope: "[role=dialog]:not([aria-hidden=true])" });
      if (!(await until(async () => (await li(tab, "articleState")).cover, 20000))) throw new Error("cover not set");
    }
    const st = await until(async () => { const s = await li(tab, "articleState"); return /saved/i.test(s.status || "") && s.bodyChars > 50 ? s : null; }, 30000);
    if (!st) throw new Error("article draft not saved: " + JSON.stringify(await li(tab, "articleState")));
    const draft_url = (await chrome.tabs.get(tab)).url;
    if (a.publish === false) return { published: false, draft_url, state: st };
    return publishArticle(tab, a, st, draft_url);
  },

  async linkedin_comment(a) {
    if (!/linkedin\.com\/(feed\/update|posts|pulse)\//.test(a.post_url)) throw new Error("post_url must be a linkedin post permalink");
    const tab = await liTab(a.post_url);
    const found = await until(async () => { if ((await li(tab, "commentBox")).found) return true; await li(tab, "scroll", { by: 2500 }); return false; }, 30000, 1500);
    if (!found) throw new Error("comment box not found");
    await human();
    const cb = await li(tab, "commentBox");
    await li(tab, "insertText", { label: cb.label, text: a.text });
    if (!(await until(async () => (await li(tab, "commentBox")).text.length > 0, 5000))) throw new Error("comment text not inserted");
    await human(); const r = await li(tab, "submitComment");
    if (!r.clicked) throw new Error("comment button disabled");
    let { profile } = await li(tab, "me").catch(() => ({ profile: null }));
    if (profile) chrome.storage.local.set({ liProfile: profile }); else profile = (await chrome.storage.local.get("liProfile")).liProfile || "https://www.linkedin.com/in/me/";
    const ok = await until(async () => (await li(tab, "commentBox")).text.length === 0, 20000);
    await human(2000, 3000);
    const mine = profile ? await li(tab, "commentsByMe", { profile }) : [];
    const hit = mine.some((c) => c.text.includes(a.text.trim().slice(0, 40)));
    return outcome({ commented: !!ok, my_comments: mine.slice(-3) }, hit, hit ? "comment found on the page under your profile" : "submitted, but not found under your profile on re-read");
  },

  async tiktok_upload(a) { // {file:{name,url|base64}, caption, dry_run}
    const tab = await siteTab(`https://www.tiktok.com/tiktokstudio/upload?from=webapp&tp=${Date.now()}`); // fresh form every run
    let last = null;
    const st = await until(async () => { last = await tt(tab, "state").catch(() => null); return last && (last.fileInput || !last.loggedIn) ? last : null; }, 30000);
    if (!st) throw new Error("upload page not ready: " + JSON.stringify(last));
    if (!st.loggedIn) throw new Error("TikTok not logged in");
    const ref = await stageFile(tab, a.file);
    await human(); await tt(tab, "attachVideo", { file: ref });
    if (!(await until(async () => (await tt(tab, "uploadState")).editor, 60000, 1500))) throw new Error("upload form did not appear");
    await human(1500, 3000);
    // TikTok's Caption field keeps its own DraftJS value (submitted on Post) and ignores synthetic editor input.
    // Set it directly via the field's onChange with a state built from DraftJS's own classes (MAIN world).
    const norm = (x) => (x || "").replace(/\s+/g, " ").trim();
    const cf = await tt(tab, "captionField", { text: a.caption }, "MAIN"); await sleep(1200);
    const chk = await tt(tab, "captionField", {}, "MAIN");
    if (!cf.set || chk.fieldText !== a.caption) throw new Error("caption field not set: " + JSON.stringify(chk.fieldText || cf.error).slice(0, 200));
    const ready = await until(async () => { const u = await tt(tab, "uploadState"); trace(`upload ${u.percent}% uploaded=${u.uploaded} post=${JSON.stringify(u.post)}`);
      return u.uploaded && u.post && !u.post.disabled ? u : null; }, 240000, 3000);
    if (!ready) throw new Error("upload did not finish: " + JSON.stringify(await tt(tab, "uploadState")));
    const fin = await tt(tab, "captionField", {}, "MAIN");
    if (fin.fieldText !== a.caption) throw new Error("caption changed during upload: " + String(fin.fieldText).slice(0, 160));
    if (a.dry_run) return { dry_run: true, state: ready, checks: await tt(tab, "checks") };
    // let TikTok's content check finish first (up to wait_check_s), then post
    await until(async () => !(await tt(tab, "checks")).some((c) => /Checking in progress/i.test(c)), (a.wait_check_s ?? 120) * 1000, 10000);
    await human(); const r = await tt(tab, "clickPost");
    if (!r.clicked) throw new Error("Post button disabled");
    await sleep(2500);
    if ((await tt(tab, "dialogs")).some((d) => d.buttons.includes("Post now"))) await tt(tab, "clickText", { text: "Post now" }); // check still running
    const after = await until(async () => { const u = (await chrome.tabs.get(tab)).url; const d = await tt(tab, "dialogs").catch(() => []);
      return !/\/upload/.test(u) || d.length ? { url: u, dialogs: d } : null; }, 60000, 2000);
    await human(4000, 6000);
    const list = await TOOLS.tiktok_stats({ limit: 1, _tab: tab }); const latest = list.videos[0] || null;
    const norm2 = (x) => (x || "").replace(/\s+/g, " ").trim();
    const ok = latest && norm2(latest.title) === norm2(a.caption);
    return outcome({ posted: !!after, url: latest?.url || null, latest }, ok, latest ? { stored_caption_matches: !!ok, status: latest.status, visibility: latest.visibility } : "not in Studio list yet");
  },

  async tiktok_stats(a) { // per-video stats from TikTok Studio content list
    const tab = a._tab || await siteTab("https://www.tiktok.com/tiktokstudio/content");
    if (a._tab) await goto(tab, "https://www.tiktok.com/tiktokstudio/content");
    const rows = await until(async () => { const r = await tt(tab, "contentRows", {}).catch(() => null); return r && r.length ? r : null; }, 30000, 1500);
    return { videos: (rows || []).slice(0, a.limit || 20) };
  },

  async dev_stage_check(a) { // stage a file into an owned tab, hash it there (integrity test, no site side effects)
    const tab = await siteTab("https://chatgpt.com/", { navigate: false });
    const t0 = Date.now(); const ref = await stageFile(tab, a.file); const staged_ms = Date.now() - t0;
    const r = await exec(tab, async (f) => {
      const parts = window.__tp[f.ref].map((b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; });
      const file = new File(parts, f.name, { type: f.mime }); delete window.__tp[f.ref];
      const h = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      return { size: file.size, sha256: [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("") };
    }, [ref]);
    return { ...r, staged_ms };
  },

  async tiktok_video_stats(a) {
    const tab = await siteTab(`https://www.tiktok.com/tiktokstudio/analytics/${a.video_id}`);
    const r = await until(async () => { const x = await tt(tab, "videoAnalytics").catch(() => null); return x && x.metrics["Video views"] ? x : null; }, 30000, 1500);
    if (!r) throw new Error("analytics page did not load for video " + a.video_id);
    return r;
  },
  async tiktok_comments(a) {
    const tab = await siteTab("https://www.tiktok.com/tiktokstudio/comment");
    await human(3000, 5000);
    const r = await until(async () => { const x = await tt(tab, "comments").catch(() => null); return x && (x.empty || x.comments.length) ? x : null; }, 30000, 2000);
    return r ? { ...r, comments: r.comments.slice(0, a.limit || 30) } : { comments: [], error: "comments list did not load" };
  },

  async tiktok_dev_type(a) { // DEV: focus caption then trusted clear + type
    const tab = await siteTab(a.url, { navigate: false });
    await tt(tab, "captionFocusEnd", {});
    await cdpInput(tab, [{ key: "SelectAll" }, { key: "Backspace" }, ...typeSteps(a.text)]);
    await sleep(800); return tt(tab, "uploadState", {});
  },

  async tiktok_dev_op(a) { const tab = await siteTab(a.url || "https://www.tiktok.com/tiktokstudio/upload", { navigate: a.navigate !== false }); return tt(tab, a.op, a.args, a.world || "ISOLATED"); },

  async linkedin_dev_arm(a) { const tab = await liTab(a.url, a.navigate !== false); return exec(tab, armFileInput, [await normFiles(a.files)], "MAIN"); },
  async linkedin_dev_html(a) { return { html: docToHtml(markdownToDoc(a.markdown)) }; },
  async linkedin_dev_op(a) { const tab = await liTab(a.url, a.navigate !== false); return li(tab, a.op, a.args, a.world || "ISOLATED"); },
  async chatgpt_dev_op(a) { return withGpt(a.url, async (tab) => { await goto(tab, a.url || "https://chatgpt.com/"); await gptReady(tab); return gpt(tab, a.op, a.args); }); },
  async devto_setup() { const key = await devtoKey(true); const me = await devapi("GET", "/users/me"); return outcome({ username: me.username, name: me.name, key_stored_in_extension: true, key_suffix: key.slice(-4) }, !!me.username, { me: me.username }); },
  async devto_me() { const me = await devapi("GET", "/users/me"); return { username: me.username, name: me.name, id: me.id, joined_at: me.joined_at }; },
  async devto_my_articles(a) { const list = await devapi("GET", `/articles/me/${a.state || "all"}?per_page=${a.limit || 30}`); return { articles: list.map(devtoRow) }; },
  async devto_read_article(a) { const x = await devtoMine(a.id); return { ...devtoRow(x), body_markdown: x.body_markdown, description: x.description }; },
  async devto_create_article(a) { // always a draft; devto_publish makes it public
    if (!a.title || !a.body_markdown) throw new Error("title and body_markdown required");
    const art = { title: a.title, body_markdown: a.body_markdown, published: false, tags: (a.tags || []).slice(0, 4), ...(a.main_image ? { main_image: a.main_image } : {}), ...(a.description ? { description: a.description } : {}), ...(a.series ? { series: a.series } : {}), ...(a.canonical_url ? { canonical_url: a.canonical_url } : {}) };
    const r = await devapi("POST", "/articles", { article: art });
    const back = await devtoMine(r.id);
    return outcome({ ...devtoRow(back), edit_url: `https://dev.to/${back.path || ""}/edit`.replace("//edit", "/edit") }, back.title === a.title && back.published === false, { published: back.published, body_chars: (back.body_markdown || "").length });
  },
  async devto_update_article(a) {
    const cur = await devtoMine(a.id);
    if (cur.published) await gate("devto_update_article (article is public)", "publish");
    const art = {}; for (const k of ["title", "body_markdown", "main_image", "description", "series", "canonical_url"]) if (a[k] !== undefined) art[k] = a[k];
    if (a.tags) art.tags = a.tags.slice(0, 4);
    await devapi("PUT", `/articles/${a.id}`, { article: art });
    const back = await devtoMine(a.id);
    return outcome(devtoRow(back), (!a.title || back.title === a.title) && (!a.body_markdown || back.body_markdown.trim() === a.body_markdown.trim()), { title: back.title, body_chars: (back.body_markdown || "").length });
  },
  async devto_publish(a) {
    if (a.confirm !== true) throw new Error("devto_publish needs confirm=true");
    const cur = await devtoMine(a.id); if (!cur.tag_list?.length && !(cur.tags || []).length) throw new Error("add at least one tag first");
    await devapi("PUT", `/articles/${a.id}`, { article: { published: true } });
    const back = await devtoMine(a.id);
    const live = back.url ? (await fetch(back.url, { method: "GET" })).status : null;
    return outcome(devtoRow(back), back.published === true && live === 200, { published: back.published, http: live });
  },
  async devto_schedule(a) { // native dev.to scheduling: published=true + future published_at; verified on the draft first
    if (a.confirm !== true) throw new Error("devto_schedule needs confirm=true");
    const at = new Date(a.publish_at); if (isNaN(at) || at <= Date.now() + 5 * 60e3) throw new Error("publish_at must be an ISO time at least 5 min in the future");
    const cur = await devtoMine(a.id); if (cur.published && (!cur.published_at || new Date(cur.published_at) <= Date.now())) throw new Error("article is already public");
    if (!cur.tag_list?.length && !(cur.tags || []).length) throw new Error("add at least one tag first");
    const same = (x) => x && Math.abs(new Date(x) - at) < 60e3;
    if (!cur.published) { await devapi("PUT", `/articles/${a.id}`, { article: { published: false, published_at: at.toISOString() } });
      const probe = await devtoMine(a.id); if (!same(probe.published_at)) return outcome({ ...devtoRow(probe), scheduled: false, reason: "API did not store published_at on the draft; nothing published" }, false, {}); }
    await devapi("PUT", `/articles/${a.id}`, { article: { published: true, published_at: at.toISOString() } });
    const back = await devtoMine(a.id);
    const live = back.url ? (await fetch(back.url, { method: "GET" })).status : null;
    return outcome({ ...devtoRow(back), scheduled: same(back.published_at), http_now: live }, back.published === true && same(back.published_at), { published_at: back.published_at, http_now: live });
  },
  async devto_comment(a) { // public comment via the logged-in page session; verified through the public comments API
    if (a.confirm !== true) throw new Error("devto_comment needs confirm=true");
    if (!a.article_id || !a.body_markdown) throw new Error("article_id and body_markdown required");
    if (/[\u2013\u2014]/.test(a.body_markdown)) throw new Error("body contains an em/en dash");
    const tab = await siteTab("https://dev.to/", { navigate: false });
    const comment = { body_markdown: a.body_markdown, commentable_id: Number(a.article_id), commentable_type: "Article", ...(a.parent_id ? { parent_id: a.parent_id } : {}) };
    const r = await exec(tab, devtoFetchPage, ["POST", "/comments", { comment }, null], "MAIN");
    if (r.status >= 300) throw new Error(`comment POST ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    const me = await devapi("GET", "/users/me");
    const list = await (await fetch(`https://dev.to/api/comments?a_id=${a.article_id}`)).json();
    const flat = []; const walk = (xs) => xs.forEach((x) => { flat.push(x); walk(x.children || []); }); walk(list);
    const head = a.body_markdown.replace(/[*_`#>\[\]()"]/g, "").slice(0, 40); const strip = (h) => h.replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/["]/g, "");
    const mine = flat.filter((x) => x.user?.username === me.username && strip(x.body_html || "").includes(head.replace(/["]/g, ""))).pop();
    const url = mine ? `https://dev.to/${me.username}/comment/${mine.id_code}` : null;
    return outcome({ status: r.status, comment_url: url, id_code: mine?.id_code }, !!mine, { found_in_public_api: !!mine });
  },
  async devto_update_profile(a) { // only bio (summary) and website_url; same form the settings page submits
    if (a.confirm !== true) throw new Error("devto_update_profile needs confirm=true");
    if (a.summary === undefined && a.website_url === undefined) throw new Error("summary or website_url required");
    const tab = await siteTab("https://dev.to/", { navigate: false });
    const page = await exec(tab, devtoFetchPage, ["GET", "/settings", null, null], "MAIN");
    const pid = String(page.body).match(/action="\/profiles\/(\d+)"/)?.[1]; if (!pid) throw new Error("profile form not found");
    const form = { _method: "put" }; if (a.summary !== undefined) form["profile[summary]"] = a.summary; if (a.website_url !== undefined) form["profile[website_url]"] = a.website_url;
    const r = await exec(tab, devtoFetchPage, ["POST", `/profiles/${pid}`, null, form], "MAIN");
    const me = await devapi("GET", "/users/me");
    const pub = await (await fetch(`https://dev.to/api/users/by_username?url=${me.username}`)).json();
    const ok = (a.summary === undefined || pub.summary === a.summary) && (a.website_url === undefined || pub.website_url === a.website_url);
    return outcome({ status: r.status, summary: pub.summary, website_url: pub.website_url }, ok, { status: r.status });
  },
  async devto_delete_comment(a) { // own comment only: uses the page's delete_confirm form
    if (a.confirm !== true) throw new Error("devto_delete_comment needs confirm=true");
    const me = await devapi("GET", "/users/me");
    const tab = await siteTab("https://dev.to/", { navigate: false });
    const page = await exec(tab, devtoFetchPage, ["GET", `/${me.username}/comment/${a.id_code}/delete_confirm`, null, null], "MAIN");
    const cid = String(page.body).match(/action="\/comments\/(\d+)"/)?.[1]; if (!cid) throw new Error(`delete form not found (status ${page.status}); not your comment?`);
    const r = await exec(tab, devtoFetchPage, ["POST", `/comments/${cid}`, null, { _method: "delete" }], "MAIN");
    const gone = (await fetch(`https://dev.to/api/comments/${a.id_code}`)).status;
    return outcome({ status: r.status, api_status_after: gone }, gone === 404, { api_status_after: gone });
  },
  async devto_upload_image(a) {
    const f = (await normFiles([{ url: a.url, base64: a.base64, file_id: a.file_id, mime: a.mime, name: a.name || "image.png" }]))[0];
    const tab = await siteTab("https://dev.to/", { navigate: false });
    const r = await exec(tab, devtoUploadPage, [f.base64, f.mime || "image/png", f.name], "MAIN");
    if (r.status >= 400) throw new Error(`dev.to upload -> ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    const url = r.body?.links?.[0] || r.body?.image?.[0] || r.body?.url;
    if (!url) throw new Error("dev.to upload: no URL in response " + JSON.stringify(r.body).slice(0, 300));
    return { url, markdown: `![${a.alt || ""}](${url})` };
  },
  async devto_dev_get(a) { const tab = await siteTab("https://dev.to/", { navigate: false }); const r = await exec(tab, devtoFetchPage, ["GET", a.path, null, null], "MAIN");
    if (typeof r.body === "string") r.body = a.grep ? r.body.split("\n").filter((l) => l.includes(a.grep)).slice(0, 40).join("\n").slice(0, 6000) : r.body.slice(0, 3000); return r; },
  async debug_trace() { return TRACE; },

  // ---- dev inspection (read-only, fixed functions; no arbitrary code) ----
  async dev_outline(a) {
    const tab = await siteTab(a.url, { navigate: a.navigate !== false });
    return exec(tab, (sel, depth, max, vlen) => {
      const keep = (e) => [...e.attributes].filter((x) => /^(id|role|type|name|placeholder|contenteditable|href|aria-|data-test|data-view|data-id|data-urn|data-finite)/.test(x.name))
        .map((x) => `${x.name}=${x.value.slice(0, vlen)}`).join(" ");
      const out = []; const roots = [...document.querySelectorAll(sel)].slice(0, 3);
      const walk = (e, d) => { // compact: anonymous wrappers (no kept attrs, no own text, plain div/span) are skipped
        if (out.length >= max || d > depth) return;
        const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 80);
        const k = keep(e); const tag = e.tagName.toLowerCase();
        const anon = !k && !own && /^(div|span|svg|path|g|use)$/.test(tag);
        if (!anon) out.push("  ".repeat(d) + tag + (k ? ` [${k}]` : "") + (own ? ` "${own}"` : ""));
        if (tag === "svg") return;
        for (const c of e.children) walk(c, anon ? d : d + 1);
      };
      roots.forEach((r) => walk(r, 0));
      return { url: location.href, matched: document.querySelectorAll(sel).length, lines: out };
    }, [a.selector || "body", a.depth ?? 12, a.max ?? 300, a.vlen ?? 60]);
  },
  async dev_click(a) { // DEV: click the Nth element matching selector (and containing text), with pointer events for radix/base-ui menus
    const tab = await siteTab(a.url, { navigate: a.navigate === true });
    return exec(tab, (sel, text, idx) => { let all = [...document.querySelectorAll(sel)]; if (text) all = all.filter((e) => (e.textContent || "").includes(text) || (e.getAttribute("aria-label") || "").includes(text));
      const e = all.at(idx); if (!e) return { matched: all.length };
      for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) e.dispatchEvent(new (t.startsWith("pointer") ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, button: 0, pointerType: "mouse" }));
      return { matched: all.length, clicked: e.outerHTML.replace(/\s(class|style)="[^"]*"/g, "").slice(0, 300) }; }, [a.selector, a.text || "", a.index ?? 0]);
  },
  async dev_html(a) { // DEV: outerHTML (trimmed) of the Nth match, optionally lifted `up` ancestors
    const tab = await siteTab(a.url, { navigate: a.navigate !== false });
    return exec(tab, (sel, idx, up, max) => { const all = [...document.querySelectorAll(sel)]; let e = all.at(idx); if (!e) return { matched: all.length };
      for (let i = 0; i < up && e.parentElement; i++) e = e.parentElement;
      return { matched: all.length, html: e.outerHTML.replace(/\s(class|style)="[^"]*"/g, "").slice(0, max) }; }, [a.selector, a.index ?? -1, a.up ?? 0, a.max ?? 3000]);
  },
  async dev_resources(a) {
    const tab = await siteTab(a.url);
    return exec(tab, (filter) => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes(filter)).slice(-80), [a.filter || "/api/"]);
  },

  async close_tabs(a) { // only ChatGPT / Substack tabs, never the active one
    const closed = [];
    for (const id of a.ids || []) {
      try { const t = await chrome.tabs.get(id);
        if (!t.active && /^https:\/\/(chatgpt\.com|([\w-]+\.)?substack\.com)\//.test(t.url)) { await chrome.tabs.remove(id); closed.push(id); } } catch {}
    }
    return { closed };
  },

  async status() {
    const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://*.substack.com/*"] });
    return { version: VERSION, user_agent: navigator.userAgent, default_substack: (await cfg()).substackPub || null,
      owned_tabs: Object.keys(await owned()).map(Number), idle_minutes: (await chrome.storage.local.get({ idleMinutes: 5 })).idleMinutes,
      tabs: tabs.map((t) => ({ id: t.id, url: t.url, active: t.active, status: t.status, discarded: t.discarded, frozen: t.frozen, group: t.groupId })) };
  },

  async chatgpt_chat(a) {
    return withGpt(a.chat_url, async (tab) => {
      if (isLocalChat(a.chat_url)) throw new Error("chat_url is a temporary local-chatgpt URL; use the /c/<uuid> URL returned by chatgpt_get_result");
      const url = a.chat_url || a.project_url || "https://chatgpt.com/";
      await goto(tab, url); await gptReady(tab);
      const before = a.chat_url ? (await gptRead(tab, { waitS: 30, lastN: 2 })).turns.filter((t) => t.role === "assistant").length : 0;
      const settings = {};
      if (a.mode) settings.mode = (await gpt(tab, "setMode", { mode: a.mode })).mode;
      if (a.model || a.effort) { // the page script can come back empty when ChatGPT re-renders mid-call: retry until verified
        let st = null;
        for (let i = 0; i < 3 && !(st && (!a.model || st.model === a.model) && (!a.effort || st.effort === a.effort)); i++) {
          if (i) await sleep(1500);
          st = await gpt(tab, "setModel", { model: a.model, effort: a.effort }).catch((e) => { if (i === 2) throw e; return null; });
        }
        if (!st || (a.model && st.model !== a.model) || (a.effort && st.effort !== a.effort)) throw new Error(`model/effort not verified: ${JSON.stringify(st)}`);
        Object.assign(settings, st);
      }
      const files = await normFiles(a.attachments);
      // ChatGPT turns pastes over ~10k chars into an attachment chip (composer stays empty): send long prompts as a file
      if ((a.prompt || "").length > 9500) {
        const bytes = new TextEncoder().encode(a.prompt); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        files.push({ name: "brief.md", mime: "text/markdown", base64: btoa(bin) });
        a = { ...a, prompt: a.prompt.split("\n")[0] + "\n\nThe full brief is in the attached file brief.md. Read all of it and follow it exactly." };
      }
      if (a.dry_run) { // verify composer accepts prompt + attachments, then clear; nothing is sent
        await gpt(tab, "compose", { prompt: a.prompt, files });
        const c = await gpt(tab, "clear");
        return outcome({ dry_run: true, settings, attachments: files.map((f) => f.name), composer_cleared: c.cleared }, true, "composed and verified; not sent");
      }
      const known = a.chat_url ? null : ((await chatLinks(tab)) || []).map(([h]) => h);
      if (known) gptKnown.set(tab, known);
      const users0 = (await gpt(tab, "sent?")).users;
      let sent = false;
      for (let attempt = 0; attempt < 3 && !sent; attempt++) {
        await gpt(tab, "compose", { prompt: a.prompt, files });
        const end = Date.now() + 180000; let st; // attachments: Send stays disabled while ChatGPT processes the upload (slow in hidden tabs)
        while (Date.now() < end) { st = (await gpt(tab, "send")).state; if (st !== "wait") break; await sleep(1000); }
        trace("send state " + st);
        trace("gemini send state " + st); if (st !== "clicked") continue; // composer got wiped (late hydration) -> compose again
        for (let i = 0; i < 20 && !sent; i++) { await sleep(1000); const c = await gpt(tab, "sent?"); sent = c.generating || c.users > users0; }
      }
      if (!sent) throw new Error("message was not sent (composer kept resetting or send never enabled)");
      await sleep(3000); // let the stop button appear before the first poll
      const r = await gptRead(tab, { waitS: a.wait_seconds ?? 90, minAssistant: before + 1, images: a.images !== "none", imagesLastN: 1, lastN: 2 });
      const chat_url = a.chat_url && !isLocalChat(a.chat_url) ? a.chat_url : await realChatUrl(tab, 60, known);
      return outcome({ ...lastReply(r), chat_url: chat_url || null, tab_id: tab, settings, ...(chat_url ? {} : { warning: "conversation URL not assigned yet; call chatgpt_get_result with tab_id" }) }, sent, { sent, reply: r.status });
    });
  },

  async gemini_chat(a) {
    if (a.chat_url && !gemId(a.chat_url)) throw new Error("chat_url must be a gemini.google.com/app/<id> link");
    return withGem(a.chat_url, async (tab) => {
      await goto(tab, a.chat_url || "https://gemini.google.com/app"); await gemReady(tab);
      const beforeAll = a.chat_url ? (await gem(tab, "readAll")).turns.filter((t) => t.role === "assistant").length : 0;
      let settings = {};
      if (a.model === undefined && a.thinking === undefined) a = { ...a, model: "3.8 Flash", thinking: "Medium" }; // default: Flash + Medium (High is slow)
      if (a.model || a.thinking) {
        settings = await gem(tab, "setModel", { model: a.model, thinking: a.thinking });
        // the composer stops accepting sends after the mode menu was used: reload (the choice is account-wide and persists)
        await chrome.tabs.reload(tab); await sleep(500); await waitLoaded(tab); await gemReady(tab);
        if (a.model && !settings.model.toLowerCase().includes(a.model.toLowerCase())) throw new Error(`model not verified: ${JSON.stringify(settings)}`);
        if (a.thinking && (settings.thinking || "").toLowerCase() !== a.thinking.toLowerCase()) throw new Error(`thinking level not verified: ${JSON.stringify(settings)}`);
      } else settings = { model: (await gem(tab, "ready")).model };
      const files = await normFiles(a.attachments);
      const compose = (x) => gem(tab, "compose", x).catch((e) => { throw new Error(`${e.message} [tab ${tab}]`); });
      if (a.dry_run) { const c = await compose({ prompt: a.prompt, files }); const cl = await gem(tab, "clear");
        return outcome({ dry_run: true, settings, composed: c, composer_cleared: cl.cleared }, true, "composed and verified; not sent"); }
      const users0 = (await gem(tab, "sent?")).users; let sent = false;
      for (let attempt = 0; attempt < 3 && !sent; attempt++) {
        await compose({ prompt: a.prompt, files });
        const end = Date.now() + 120000; let st;
        while (Date.now() < end) { st = (await gem(tab, "send")).state; if (st !== "wait") break; await sleep(1000); }
        if (st !== "clicked") continue;
        for (let i = 0; i < 20 && !sent; i++) { await sleep(1000); const c = await gem(tab, "sent?"); sent = c.users > users0 || c.generating; }
      }
      if (!sent) throw new Error("Gemini message was not sent: " + JSON.stringify({ tab, ...(await gem(tab, "sent?").catch(() => ({}))), send: await gem(tab, "send").catch((e) => String(e)) }));
      await sleep(3000);
      const r = await gemRead(tab, { waitS: a.wait_seconds ?? 90, minAssistant: beforeAll + 1, lastN: 2 });
      let chat_url = null; for (let i = 0; i < 15 && !chat_url; i++) { chat_url = await gemChatUrl(tab); if (!chat_url) await sleep(1000); }
      return outcome({ ...gemReply(r), chat_url, tab_id: tab, settings }, sent, { sent, reply: r.status });
    });
  },
  async gemini_dev_op(a) { const t = await chrome.tabs.get(a.tab_id); if (!t.url.startsWith("https://gemini.google.com")) throw new Error("not a Gemini tab"); if (a.patch) await exec(a.tab_id, patchHiddenObservers, [], "MAIN"); const run = () => gem(a.tab_id, a.op, a.args || {}); return { url: t.url, r: a.frames ? await withFrames(a.tab_id, run) : await run() }; },
  async gemini_get_result(a) {
    if (a.tab_id) { // the job's own tab: exact conversation
      const t = await chrome.tabs.get(a.tab_id).catch(() => null);
      if (!t?.url?.startsWith("https://gemini.google.com") || !(await owned())[t.id]) throw new Error("tab_id is not an open tab-pilot Gemini tab");
      if (gemClaimed.has(t.id)) throw new Error("tab_id is busy with another job; retry shortly");
      gemClaimed.add(t.id);
      try { const r = await gemRead(t.id, { waitS: a.wait_seconds ?? 60, lastN: 2 }); return { ...gemReply(r), chat_url: await gemChatUrl(t.id), tab_id: t.id }; }
      finally { gemClaimed.delete(t.id); }
    }
    if (!gemId(a.chat_url)) throw new Error("tab_id or chat_url (gemini.google.com/app/<id>) required");
    return withGem(a.chat_url, async (tab) => {
      if (gemId((await chrome.tabs.get(tab)).url) !== gemId(a.chat_url)) await goto(tab, a.chat_url);
      await gemReady(tab);
      const r = await gemRead(tab, { waitS: a.wait_seconds ?? 60, lastN: 2 }); return { ...gemReply(r), chat_url: await gemChatUrl(tab), tab_id: tab };
    });
  },
  async gemini_read(a) {
    if (!gemId(a.url)) throw new Error("url must be a gemini.google.com/app/<id> link");
    return withGem(a.url, async (tab) => {
      if (gemId((await chrome.tabs.get(tab)).url) !== gemId(a.url)) await goto(tab, a.url);
      await gemReady(tab); const r = await gemRead(tab, { waitS: a.wait_seconds ?? 10, lastN: a.last_n });
      return { url: r.url, title: r.title, status: r.status, generating: r.generating, turns: r.turns };
    });
  },

  async chatgpt_get_result(a) {
    if (!a.chat_url && a.tab_id) { // chat whose URL is not assigned yet: read that exact tab, never navigate it
      const t = await chrome.tabs.get(a.tab_id).catch(() => null);
      if (!t?.url?.startsWith("https://chatgpt.com") || !(await owned())[t.id]) throw new Error("tab_id is not an open tab-pilot ChatGPT tab");
      if (gptClaimed.has(t.id)) throw new Error("tab_id is busy with another job; retry shortly");
      gptClaimed.add(t.id);
      try {
        const r = lastReply(await gptRead(t.id, { waitS: a.wait_seconds ?? 60, images: a.images !== "none", imagesLastN: 1, lastN: 2 }));
        return { ...r, chat_url: await realChatUrl(t.id, 5), tab_id: t.id };
      } finally { gptClaimed.delete(t.id); }
    }
    const url = a.chat_url;
    if (!chatId(url)) throw new Error("chat_url (a /c/<uuid> link) or tab_id from chatgpt_chat is required");
    return withGpt(url, async (tab) => {
      if (chatId((await chrome.tabs.get(tab)).url) !== chatId(url)) await goto(tab, url);
      await gptReady(tab);
      const r = lastReply(await gptRead(tab, { waitS: a.wait_seconds ?? 60, images: a.images !== "none", imagesLastN: 1, lastN: 2 }));
      return { ...r, chat_url: await realChatUrl(tab, 5) };
    });
  },

  async chatgpt_read(a) {
    return withGpt(a.url, async (tab) => {
      if (!/^https:\/\/chatgpt\.com\/(c|share|g)\//.test(a.url)) throw new Error("url must be a chatgpt.com /c/, /share/ or /g/.../c/ link");
      await goto(tab, a.url);
      const r = await gptRead(tab, { waitS: 60, images: a.images === "base64", imagesLastN: a.last_n, lastN: a.last_n, debug: a.debug });
      if (!r.turns.length) throw new Error("no conversation turns found (logged out, or link not accessible?)");
      if (a.last_n) r.turns = r.turns.slice(-a.last_n);
      return liftImages(r);
    });
  },

  async chatgpt_create_project(a) {
    return withGpt(null, async (tab) => {
      await goto(tab, "https://chatgpt.com/"); await gptReady(tab);
      const { project_url } = await gpt(tab, "createProject", { name: a.name });
      await waitLoaded(tab); await sleep(1500);
      const out = { project_url };
      if (a.instructions) out.instructions = await gpt(tab, "setInstructions", { text: a.instructions });
      if (a.files?.length) out.sources = await gpt(tab, "uploadSources", { files: await normFiles(a.files) });
      return out;
    });
  },

  async chatgpt_update_project(a) {
    return withGpt(a.project_url, async (tab) => {
      await goto(tab, a.project_url); await gptReady(tab);
      const out = { project_url: a.project_url };
      if (a.instructions) out.instructions = await gpt(tab, "setInstructions", { text: a.instructions });
      if (a.files?.length) out.sources = await gpt(tab, "uploadSources", { files: await normFiles(a.files) });
      return out;
    });
  },

  async substack_list_posts(a) {
    const host = await pubHost(a.publication); const type = a.type || "drafts";
    const order = type === "published" ? "post_date" : type === "scheduled" ? "trigger_at" : "draft_updated_at";
    const q = `offset=${a.offset || 0}&limit=${a.limit || 25}&order_by=${order}&order_direction=desc`;
    const r = await sapi(host, "GET", `/api/v1/post_management/${type}?${q}`);
    const posts = r.posts || r || [];
    return { publication: host, type, total: r.total ?? posts.length, posts: posts.map((p) => postOut(host, p)) };
  },

  async substack_get_post(a) {
    const host = await pubHost(a.publication);
    const p = await sapi(host, "GET", `/api/v1/drafts/${a.id}`);
    let doc = null; try { doc = typeof p.draft_body === "string" ? JSON.parse(p.draft_body) : p.draft_body; } catch {}
    return { ...postOut(host, p), body_markdown: doc ? docToMarkdown(doc) : null, body_doc: doc };
  },

  async substack_create_draft(a) {
    const host = await pubHost(a.publication);
    const uid = await selfId(host);
    const body = { type: "newsletter", audience: "everyone", section_chosen: false,
      draft_bylines: uid ? [{ id: uid, is_guest: false }] : [], draft_title: "", draft_subtitle: "",
      draft_body: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), ...(await draftFields(host, a)) };
    const created = postOut(host, await sapi(host, "POST", "/api/v1/drafts", body));
    const back = await sapi(host, "GET", `/api/v1/drafts/${created.id}`).catch(() => null);
    return outcome(created, back && back.draft_title === body.draft_title, back ? { title: back.draft_title } : "re-read failed");
  },

  async substack_update_draft(a) {
    const host = await pubHost(a.publication);
    const f = await draftFields(host, a);
    const upd = postOut(host, await sapi(host, "PUT", `/api/v1/drafts/${a.id}`, f));
    const back = await sapi(host, "GET", `/api/v1/drafts/${a.id}`).catch(() => null);
    const same = back && Object.entries(f).every(([k, v]) => k === "draft_body" ? back.draft_body === v || JSON.stringify(back.draft_body) === v : back[k] === v);
    return outcome(upd, same, back ? { fields_checked: Object.keys(f) } : "re-read failed");
  },

  // open the draft in Substack's editor and count what it actually renders
  async substack_render_check(a) {
    const host = await pubHost(a.publication); const tab = await pubTab(host);
    await goto(tab, `https://${host}/publish/post/${a.id}`);
    const probe = () => { const ed = document.querySelector(".ProseMirror"); if (!ed) return null;
      const q = (s) => ed.querySelectorAll(s).length;
      return { h2: q("h2"), h3: q("h3"), imgs: q("img"), imgsLoaded: [...ed.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth).length,
        ul: q("ul"), ol: q("ol"), blockquote: q("blockquote"), code: q("code"), chars: ed.innerText.length,
        title: document.querySelector("textarea, [data-testid=post-title]")?.value || null }; };
    let r = null;
    for (let i = 0; i < 20 && !(r && r.imgsLoaded === r.imgs && r.chars > 0); i++) { await sleep(1500); r = await exec(tab, probe, []); }
    return r || { error: "editor not found" };
  },

  async substack_delete_draft(a) { // unpublished drafts only
    const host = await pubHost(a.publication);
    const d = await sapi(host, "GET", `/api/v1/drafts/${a.id}`);
    if (d.is_published) throw new Error("refusing: post is published (delete it in the Substack UI if you really mean it)");
    await sapi(host, "DELETE", `/api/v1/drafts/${a.id}`);
    const gone = await sapi(host, "GET", `/api/v1/drafts/${a.id}`).then(() => false, () => true);
    return outcome({ deleted: a.id, title: d.draft_title }, gone, gone ? "draft no longer found" : "draft still exists");
  },

  async substack_stats(a) { // dashboard summary + per-post numbers (as Substack's own dashboard loads them)
    const host = await pubHost(a.publication); const days = a.range_days || 30;
    const summary = await sapi(host, "GET", `/api/v1/publish-dashboard/summary-v2?range=${days}`).catch((e) => ({ error: e.message }));
    const r = await sapi(host, "GET", `/api/v1/post_management/published?offset=0&limit=${a.posts || 10}&order_by=post_date&order_direction=desc`);
    const nums = (p) => Object.fromEntries(Object.entries(p).filter(([k, v]) => typeof v === "number" && !/(_id|^id)$/.test(k)));
    const KEY = ["sent", "delivered", "opened", "open_rate", "views", "clicks", "click_through_rate", "reaction_count", "likes", "comment_count", "restacks", "shares", "signups", "subscribes", "unsubscribes", "engagement_rate"];
    const posts = (r.posts || []).map((p) => { const all = { ...nums(p), ...(p.stats && typeof p.stats === "object" ? nums(p.stats) : {}) };
      return { ...postOut(host, p), numbers: a.all_numbers ? all : Object.fromEntries(KEY.filter((k) => k in all).map((k) => [k, all[k]])) }; });
    return { publication: host, range_days: days, summary, posts };
  },

  async substack_note(a) { // PUBLIC: a Substack Note (short post in the Notes feed), Markdown text + optional image URL
    const host = "substack.com";
    const doc = markdownToDoc(a.text_markdown);
    const bodyJson = { type: "doc", attrs: { schemaVersion: "v1" }, content: doc.content.filter((n) => n.type !== "captionedImage") };
    const body = { bodyJson, tabId: "for-you", surface: "feed", replyMinimumRole: "everyone" };
    if (a.image_url) { const up = await uploadImage(await pubHost(a.publication), { url: a.image_url }); body.attachmentIds = []; body.imageUrls = [up.url]; }
    const r = await sapi(host, "POST", "/api/v1/comment/feed", body);
    const id = r.id || r.comment?.id;
    return outcome({ id, url: id ? `https://substack.com/@me/note/c-${id}` : null, raw_keys: Object.keys(r || {}) }, !!id, id ? "Substack returned the new note id" : r);
  },

  async viblo_read_post(a) {
    const id = vibloId(a.id || a.url); const p = await vibloGet(id);
    const out = { ...vibloPost(p), author: p.user?.data?.username, contents_markdown: p.contents, reading_time: p.reading_time };
    if (a.comments !== false) out.comments = ((await vapi("GET", `/posts/${id}/comments`)).comments?.data || []).slice(0, a.limit || 100).map(vibloComment);
    return out;
  },
  async viblo_my_posts(a) {
    const me = (await vapi("GET", "/me")).data;
    const [pub, drafts] = await Promise.all([vapi("GET", `/users/${me.username}/posts?page=${a.page || 1}`), vapi("GET", `/me/contents/drafts?page=${a.page || 1}`)]);
    return { user: me.username, published: (pub.data || []).map(vibloPost), drafts: (drafts.data || []).map(vibloPost) };
  },
  async viblo_create_post(a) {
    if (!a.title || !a.contents_markdown) throw new Error("title and contents_markdown are required");
    const form = { title: a.title, contents: a.contents_markdown, tags: vibloTags(a.tags), slug: "", series_id: null, category_id: null, status: null,
      locale_code: a.locale || "vi", slide_url: "", organization_id: null, puzzle_hash_id: null };
    const created = (await vapi("POST", "/new-post", form)).data; const id = created.slug;
    if (a.visibility === "draft_public") await vapi("POST", `/posts/${id}/set-draft`, { is_public: true });
    const back = await vibloGet(id).catch(() => null);
    return outcome(vibloPost(back || created), back && back.title === a.title && back.contents === a.contents_markdown, back ? { status: back.status } : "re-read failed");
  },
  async viblo_update_post(a) {
    const id = vibloId(a.id || a.url); const p = await vibloMine(id);
    if (p.status === "public") await gate("viblo_update_post (post is public)", "publish");
    const form = { title: a.title ?? p.title, contents: a.contents_markdown ?? p.contents, tags: a.tags !== undefined ? vibloTags(a.tags) : (p.tags?.data || []).map((t) => t.name).join(","),
      slug: "", series_id: p.series_id ?? null, category_id: p.category_id ?? null, status: null, locale_code: p.locale_code || "vi",
      slide_url: p.slide_url || "", organization_id: p.organization_id ?? null, puzzle_hash_id: null };
    await vapi("POST", `/posts/${id}/incremental`, form);
    const back = await vibloGet(id);
    return outcome(vibloPost(back), back.title === form.title && back.contents === form.contents, { status: back.status, fields: Object.keys(a).filter((k) => ["title", "contents_markdown", "tags"].includes(k)) });
  },
  async viblo_publish(a) {
    if (a.confirm !== true) throw new Error("confirm must be true");
    const id = vibloId(a.id || a.url); await vibloMine(id);
    await vapi("POST", `/posts/${id}/publish`, { captcha_token: null, ...(a.share_summary ? { summary: a.share_summary } : {}) });
    const back = await vibloGet(id);
    return outcome(vibloPost(back), back.status === "public", { status: back.status });
  },
  async viblo_schedule(a) { // native Viblo scheduling (the editor's "Lên lịch"): POST /posts/:id/scheduled
    if (a.confirm !== true) throw new Error("confirm must be true");
    const m = String(a.publish_at || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/); if (!m) throw new Error("publish_at: local time 'YYYY-MM-DD HH:mm' in timezone (default Asia/Ho_Chi_Minh)");
    const id = vibloId(a.id || a.url); const p = await vibloMine(id);
    if (p.published_at) throw new Error("post is already published");
    const when = `${m[1]} ${m[2]}${m[3] || ":00"}`;
    await vapi("POST", `/posts/${id}/scheduled`, { scheduled_publish_at: when, timezone: a.timezone || "Asia/Ho_Chi_Minh", data: a.share_summary ? { summary: a.share_summary } : {}, captcha_token: null });
    const back = await vibloGet(id);
    // the post API does not expose the time; status flips to "scheduled" (time shows on /me/posts/scheduled)
    return outcome({ ...vibloPost(back), scheduled_for: `${when} ${a.timezone || "Asia/Ho_Chi_Minh"}` }, back.status === "scheduled", { status: back.status });
  },
  async viblo_delete_post(a) {
    if (a.confirm !== true) throw new Error("confirm must be true");
    const id = vibloId(a.id || a.url); const p = await vibloMine(id);
    if (p.status === "public") await gate("viblo_delete_post (post is public)", "publish");
    await vapi("DELETE", `/posts/${id}`);
    const gone = await vapi("GET", `/posts/${id}`).then(() => false, (e) => /-> (404|410)/.test(String(e.message)));
    return outcome({ id, deleted: true, was: p.status }, gone, gone ? "post now 404s" : "post still readable");
  },
  async viblo_comment(a) {
    if (!a.text) throw new Error("text is required");
    const id = vibloId(a.id || a.url);
    let ancestor;
    if (a.reply_to) { const all = (await vapi("GET", `/posts/${id}/comments`)).comments?.data || [];
      ancestor = all.find((c) => c.hash_id === a.reply_to || String(c.id) === String(a.reply_to)); if (!ancestor) throw new Error("reply_to comment not found on this post"); }
    const r = await vapi("POST", `/posts/${id}/comments`, { comment_contents: a.text, ...(ancestor ? { ancestor_id: ancestor.id } : {}) });
    const c = r.comment?.data || r.data || r;
    const list = (await vapi("GET", `/posts/${id}/comments`)).comments?.data || [];
    const found = list.find((x) => x.hash_id === c.hash_id || x.id === c.id);
    return outcome({ ...vibloComment(c), post_id: id, url: c.hash_id ? `https://viblo.asia/p/${id}#comment-${c.hash_id}` : null }, !!found, found ? "comment listed on the post" : "comment not found in re-read");
  },

  async viblo_scout(a) {
    const sort = a.sort || "views"; const metric = VIBLO_METRIC[sort];
    if (!metric && sort !== "relevance") throw new Error("sort: views | points | clips | comments | relevance");
    const since = a.since_days ? Date.now() - a.since_days * 864e5 : null;
    const maxPages = Math.min(a.max_pages || (since ? 10 : 3), 25); const limit = a.limit || 20;
    const slug = a.tag ? String(a.tag).trim().toLowerCase().replace(/\s+/g, "-") : null;
    let source, page = async () => [];
    if (a.query) { // full-text search (supports title:, body:, tag:, user: syntax). With a time window: walk newest-first, rank locally
      const q = a.query.trim(); const sp = since ? "created" : sort === "relevance" ? "score" : { views: "views", points: "rate", clips: "clip", comments: "comments" }[sort];
      source = `search "${q}" s=${sp}`;
      page = async (n) => (await exec(await siteTab("https://viblo.asia/", { navigate: false }), vibloFetchPage,
        ["GET", `/v2/search/posts?q=${encodeURIComponent(q)}&s=${sp}&o=desc&page=${n}`, null], "MAIN")).body?.data || [];
    } else if (slug) { // niche: Viblo ranks a tag's posts server-side (views/points/clips); window or comments -> newest-first + local rank
      const ts = !since && { views: "most_viewed", points: "most_voted", clips: "most_clipped" }[sort] || "newest_posts";
      source = `tag ${slug} sort=${ts}`;
      page = async (n) => { const b = await vapi("GET", `/tags/${encodeURIComponent(slug)}/posts?sort=${ts}&page=${n}`).catch((e) => {
        if (/-> 404/.test(e.message)) throw new Error(`tag '${slug}' not found — list niches with viblo_tags`); throw e; });
        return n > (b.meta?.pagination?.total_pages || 1) ? [] : b.data || []; };
    } else if (a.feed) {
      if (!["trending", "editors-choice", "newest"].includes(a.feed)) throw new Error("feed: trending | editors-choice | newest");
      source = `feed ${a.feed}`; page = async (n) => (await vapi("GET", `/posts/${a.feed}?page=${n}&limit=50`)).data || [];
    } else throw new Error("give query, tag, or feed (trending | editors-choice | newest)");
    const rows = []; let scanned = 0, stop = false;
    for (let n = 1; n <= maxPages && !stop; n++) {
      const batch = await page(n); if (!batch.length) { stop = true; break; } scanned += batch.length;
      for (const p of batch) { const r = vibloRow(p);
        if (since && Date.parse(r.published_at) < since) { if (/created|newest/.test(source) || a.feed === "newest") stop = true; continue; }
        rows.push(r); }
      await sleep(300);
    }
    if (metric) rows.sort((x, y) => y[metric] - x[metric] || y.views - x.views);
    const top = rows.slice(0, limit);
    const agg = (key) => { const m = new Map(); for (const r of rows) for (const k of [].concat(r[key] || [])) { const e = m.get(k) || { name: k, posts: 0, views: 0, points: 0 };
      e.posts++; e.views += r.views; e.points += r.points; m.set(k, e); } return [...m.values()].sort((x, y) => y.views - x.views).slice(0, 15)
      .map((e) => ({ ...e, avg_views: Math.round(e.views / e.posts) })); };
    const windowed = !!since && (/created|newest/.test(source) || a.feed === "newest");
    return { source, sort, window_days: a.since_days || null, ...(windowed ? { window_complete: stop,
      ...(stop ? {} : { hint: `scanned ${scanned} posts without reaching ${a.since_days} days back — raise max_pages for a complete ranking` }) } : {}),
      scanned, matched: rows.length, posts: top,
      summary: { top_tags: agg("tags"), top_authors: agg("author"), median_views: rows.length ? rows.map((r) => r.views).sort((x, y) => x - y)[Math.floor(rows.length / 2)] : 0 } };
  },
  async viblo_tags(a) { // niches: tag list by followers (default) or post count, or one tag's posts ranked server-side
    if (a.tag) {
      const sort = { views: "most_viewed", points: "most_voted", clips: "most_clipped", newest: "newest_posts" }[a.sort || "views"];
      if (!sort) throw new Error("sort (with tag): views | points | clips | newest");
      const info = await vapi("GET", `/tags/${encodeURIComponent(a.tag)}`).catch(() => null);
      const posts = []; for (let n = 1; n <= Math.min(a.max_pages || 1, 10); n++) { const b = await vapi("GET", `/tags/${encodeURIComponent(a.tag)}/posts?sort=${sort}&page=${n}`);
        posts.push(...(b.data || [])); if (n >= (b.meta?.pagination?.total_pages || 1)) break; await sleep(300); }
      const t = info?.tag?.data || info?.data || info;
      return { tag: a.tag, posts_count: t?.posts_count, followers: t?.followers_count, sort, posts: posts.map(vibloRow) };
    }
    const sort = a.sort === "posts" ? "posts" : "followers";
    const b = await vapi("GET", `/tags?sort=${sort}&page=${a.page || 1}`);
    return { sort, page: a.page || 1, total: b.meta?.pagination?.total, tags: (b.data || []).map((t) => ({ slug: t.slug, name: t.name, posts: t.posts_count, followers: t.followers_count, questions: t.questions_count })) };
  },

  async viblo_upload_image(a) {
    const [f] = await normFiles([{ name: a.name || "image.png", mime: a.mime, ...(a.base64 ? { base64: a.base64 } : {}), ...(a.url ? { url: a.url } : {}), ...(a.file_id ? { file_id: a.file_id } : {}) }]);
    if (!/^image\/(png|jpeg|gif)$/.test(f.mime)) throw new Error("Viblo accepts png, jpeg, gif (got " + f.mime + ")");
    const tab = await siteTab("https://viblo.asia/", { navigate: false });
    const r = await exec(tab, vibloUploadPage, [f.base64, f.mime, f.name], "MAIN");
    if (r.status >= 400) throw new Error(`Viblo upload -> ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    const img = r.body?.data || r.body; const url = img.path || img.url;
    return { url, markdown: `![${a.alt || img.name || ""}](${url})`, raw_keys: Object.keys(img || {}) };
  },
  async viblo_set_cover(a) { // feature image (thumbnail) of your post
    const id = vibloId(a.id || a.url); await vibloMine(id);
    await vapi("POST", `/posts/${id}/set-feature-image`, { thumbnail_url: a.image_url });
    const back = await vibloGet(id); return outcome({ id, thumbnail_url: back.thumbnail_url }, !!back.thumbnail_url, { thumbnail_url: back.thumbnail_url });
  },

  async viblo_delete_image(a) { // remove an image from your Viblo image library (CDN)
    if (!a.id) throw new Error("id required (see viblo_images)");
    await vapi("DELETE", `/me/images/${encodeURIComponent(a.id)}`);
    const left = ((await vapi("GET", "/me/images?page=1")).data || []).some((i) => i.id === a.id);
    return outcome({ id: a.id, deleted: true }, !left, left ? "still listed" : "no longer in your image library");
  },
  async viblo_images(a) { return { images: ((await vapi("GET", `/me/images?page=${a.page || 1}`)).data || []).map((i) => ({ id: i.id, name: i.name, url: i.path })) }; },

  async viblo_dev_get(a) { // DEV: GET-only passthrough to viblo.asia with the page session (exploration)
    if (!/^\/(api|_nuxt)?/.test(a.path)) throw new Error("path must start with /");
    const tab = await siteTab("https://viblo.asia/", { navigate: false });
    return exec(tab, vibloFetchPage, ["GET", a.path, null], "MAIN");
  },

  async substack_dev_get(a) { // DEV: GET-only passthrough to the publication API (exploration)
    if (!/^\/api\/v1\//.test(a.path)) throw new Error("path must start with /api/v1/");
    return sapi(await pubHost(a.publication), "GET", a.path);
  },

  async substack_upload_image(a) {
    if (!a.url && !a.base64) throw new Error("give url or base64");
    return uploadImage(await pubHost(a.publication), a);
  },

  async substack_publish(a) {
    if (a.confirm !== true) throw new Error("confirm must be true");
    const host = await pubHost(a.publication);
    const pre = await sapi(host, "GET", `/api/v1/drafts/${a.id}/prepublish`).catch((e) => ({ warning: e.message }));
    if (pre?.errors?.length) throw new Error("prepublish errors: " + JSON.stringify(pre.errors));
    const p = await sapi(host, "POST", `/api/v1/drafts/${a.id}/publish`, { send: !!a.send_email, share_automatically: false });
    const back = await sapi(host, "GET", `/api/v1/drafts/${a.id}`).catch(() => null);
    return outcome({ ...postOut(host, p), emailed: !!a.send_email }, back?.is_published, back ? { is_published: back.is_published, post_date: back.post_date } : "re-read failed");
  },
};

// expose for the fake-extension test harness / devtools
globalThis.__tabPilot = { TOOLS, markdownToDoc, imageNode };
