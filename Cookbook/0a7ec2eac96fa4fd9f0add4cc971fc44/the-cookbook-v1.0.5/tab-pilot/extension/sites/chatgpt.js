// ChatGPT page driver. Injected via chrome.scripting.executeScript (isolated world) — must stay self-contained.
// DOM events only (no focus, no backend API).
export async function chatgptPage(op, a, sel) {
  // errors thrown inside an injected function come back as a null result: return them instead
  try { return await chatgptOp(op, a || {}, sel); } catch (e) { return { __error: String(e?.message || e) }; }

async function chatgptOp(op, a, sel) {
  const S = sel; // selectors: sites/selectors.js (+ overrides via selectors_set)

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // timer scheduled from a MessageChannel task -> breaks the timer chain, so hidden-tab intensive
  // throttling (1 wake-up/min after 5 min hidden) doesn't apply; only the normal 1s clamp does
  const sleep = (ms) => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => setTimeout(r, ms); c.port2.postMessage(0); });
  const until = async (fn, ms = 15000, step = 300) => { const t = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } };
  const PO = { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", isPrimary: true };
  const pd = (e) => { e.dispatchEvent(new PointerEvent("pointerdown", PO)); e.dispatchEvent(new PointerEvent("pointerup", PO)); e.dispatchEvent(new MouseEvent("click", PO)); };
  const esc = () => { const m = $("[role=menu]"); if (m) m.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })); };
  const btnText = (t, root = document) => $$("button, [role=tab], [role=menuitem]", root).find((b) => b.textContent.trim() === t);
  const setVal = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const toFiles = (files) => {
    const dt = new DataTransfer();
    for (const f of files) {
      const bin = atob(f.base64); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      dt.items.add(new File([u], f.name, { type: f.mime || "application/octet-stream" }));
    }
    return dt.files;
  };
  // clear the composer: ProseMirror must see the selection (selectionchange, ~300 ms) before Backspace acts on it
  const clearEditor = async (ed) => {
    for (let k = 0; k < 3 && ed.innerText.trim(); k++) {
      ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.dispatchEvent(new Event("selectionchange")); await sleep(300);
      ed.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", bubbles: true, cancelable: true })); await sleep(300);
      if (ed.innerText.trim()) { document.execCommand("delete"); await sleep(300); }
    }
    return !ed.innerText.trim();
  };
  const removeBtns = () => $$("form button").filter((b) => (b.getAttribute("aria-label") || "").startsWith("Remove "));

  const BLK = "p,li,h1,h2,h3,h4,h5,h6,blockquote,pre";
  // code block (2026 markup or classic <pre>) -> {language, text}
  const codeOf = (el) => {
    if (el.matches(S.codeBlock)) { const hdr = el.querySelector(S.copyExclude); const lang = hdr ? [...hdr.querySelectorAll("div")].map((d) => d.childElementCount ? "" : d.textContent.trim()).find(Boolean) : null;
      return { language: lang ? lang.toLowerCase() : null, text: (el.querySelector(S.codeSource) || el.querySelector("code") || el).textContent }; }
    const c = el.querySelector("code"); return { language: (c?.className.match(/language-(\S+)/) || [])[1] || null, text: (c || el).textContent };
  };
  const codeBlocksIn = (root) => [...root.querySelectorAll(S.codeBlock + ", pre")].filter((e) => !(e.tagName === "PRE" && e.closest(S.codeBlock))).map(codeOf);
  // DOM -> Markdown (headings, lists, quotes, code, tables, inline marks); falls back to plain text
  const md = (n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1 || n.classList.contains("sr-only") || /^(BUTTON|svg|STYLE|SCRIPT)$/i.test(n.tagName) || n.matches(S.copyExclude)) return "";
    if (n.matches(S.codeBlock)) { const b = codeOf(n); return "\n\n```" + (b.language || "") + "\n" + b.text.replace(/\n$/, "") + "\n```\n\n"; }
    const kids = () => [...n.childNodes].map(md).join("");
    switch (n.tagName) {
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": return `\n\n${"#".repeat(+n.tagName[1])} ${kids().trim()}\n\n`;
      case "P": return `\n\n${kids().trim()}\n\n`;
      case "BR": return "  \n";
      case "HR": return "\n\n---\n\n";
      case "STRONG": case "B": { const t = kids(); return t.trim() ? `**${t.trim()}**` : t; }
      case "EM": case "I": { const t = kids(); return t.trim() ? `*${t.trim()}*` : t; }
      case "CODE": return n.closest("pre") ? n.textContent : "`" + n.textContent + "`";
      case "PRE": { const c = n.querySelector("code"); const lang = (c?.className.match(/language-(\S+)/) || [])[1] || "";
        return "\n\n```" + lang + "\n" + (c || n).textContent.replace(/\n$/, "") + "\n```\n\n"; }
      case "A": { const t = kids().trim(); const h = n.getAttribute("href"); return h && !h.startsWith("#") && t ? `[${t}](${h})` : t; }
      case "BLOCKQUOTE": return "\n\n" + kids().trim().split("\n").map((l) => "> " + l).join("\n") + "\n\n";
      case "UL": case "OL": {
        const depth = (() => { let d = 0, c = n.parentElement; while (c) { if (/^(UL|OL)$/.test(c.tagName)) d++; c = c.parentElement; } return d; })();
        const items = [...n.children].filter((c) => c.tagName === "LI").map((li, k) => {
          const body = [...li.childNodes].map(md).join("").replace(/\n{3,}/g, "\n\n").trim().replace(/\n\n(?![ ]*([-*]|\d+\.) )/g, "\n");
          return "  ".repeat(depth) + (n.tagName === "OL" ? `${(+n.getAttribute("start") || 1) + k}. ` : "- ") + body;
        });
        return "\n\n" + items.join("\n") + "\n\n";
      }
      case "TABLE": {
        const rows = [...n.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => c.innerText.trim().replace(/\|/g, "\\|").replace(/\n/g, " ")));
        if (!rows.length) return "";
        return "\n\n" + [rows[0], rows[0].map(() => "---"), ...rows.slice(1)].map((r) => "| " + r.join(" | ") + " |").join("\n") + "\n\n";
      }
      case "IMG": return "";
      default: return kids();
    }
  };
  const textOf = (root) => {
    const out = md(root).replace(/[ \t]+\n/g, (m) => (m.endsWith("  \n") ? m : "\n")).replace(/\n{3,}/g, "\n\n").trim();
    return (out || root.innerText.trim() || root.textContent.trim()).replace(/^(#+ )?(You said:|ChatGPT said:)\s*/, "").replace(/^Writing\s*\n+/, "");
  };
  const imgsOf = (root) => $$("img", root).filter((i) => i.complete && i.naturalWidth >= 200 && i.naturalHeight >= 200);

  switch (op) {
    case "ready": {
      const challenge = /just a moment/i.test(document.title);
      return { url: location.href, composer: !!$(S.editor), challenge, loggedOut: !!btnText("Log in") && !$(S.editor) };
    }

    case "setMode": { // {mode: "chat"} — Chat vs Work toggle above the composer
      const chatBtn = $$("button").find((b) => b.textContent.trim() === S.modeChatText && b.hasAttribute("aria-pressed"));
      const isWork = () => $$("button").some((b) => b.textContent.trim() === S.workMarkerText);
      if (a.mode === "chat") {
        if (chatBtn && chatBtn.getAttribute("aria-pressed") !== "true") { chatBtn.click(); await sleep(1500); }
        if (isWork()) throw new Error("still in Work mode after switching to Chat");
        return { mode: "chat" };
      }
      if (a.mode === "work") { const other = chatBtn && chatBtn.parentElement && [...chatBtn.parentElement.querySelectorAll("button[aria-pressed]")].find((b) => b !== chatBtn);
        if (other && other.getAttribute("aria-pressed") !== "true") { other.click(); await sleep(1500); } return { mode: isWork() ? "work" : "unknown" }; }
      return { mode: isWork() ? "work" : "chat" };
    }

    case "clear": { // remove draft attachments + text from the composer
      for (let k = 0; k < 12 && removeBtns().length; k++) { removeBtns()[0].click(); await sleep(500); }
      const ed = $(S.editor); if (!ed) return { cleared: false };
      return { cleared: (await clearEditor(ed)) && !removeBtns().length };
    }

    case "setModel": { // {model?, effort?}
      const openPicker = async () => { esc(); await sleep(400); const b = $(S.modelBtn); if (!b) return false; pd(b); return !!(await until(() => $("[role=menu]"), 4000)); };
      const cur = () => { const r = $$(S.modelRow).find((e) => e.getAttribute("aria-checked") === "true"); return r ? r.innerText.trim().split("\n")[0] : null; };
      if (!(await openPicker())) throw new Error("model picker did not open");
      const offered = $$(S.modelRow).map((e) => e.innerText.trim().split("\n")[0]);
      if (a.model && cur() !== a.model) {
        const r = $$(S.modelRow).find((e) => e.innerText.trim().split("\n")[0] === a.model);
        if (!r) { esc(); throw new Error(`model '${a.model}' not offered: ${offered.join(" | ")}`); }
        pd(r); await sleep(1200);
        if (!(await openPicker())) throw new Error("model picker did not reopen");
      }
      if (a.effort) {
        const want = { Instant: 1, Medium: 2, High: 3 }[a.effort] || 0;
        for (let k = 0; k < 6; k++) {
          const st = ($(S.effortStatus) || {}).textContent || "";
          if (st.split(",")[0] === a.effort) break;
          const n = parseInt((/, (\d+) of/.exec(st) || [])[1] || "0", 10);
          const key = n > want ? "ArrowLeft" : "ArrowRight";
          const s = $(S.effortSlider); if (!s) break;
          s.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true })); await sleep(700);
        }
      }
      const state = { model: cur(), effort: (($(S.effortStatus) || {}).textContent || "").split(",")[0] || null, offered };
      esc(); await sleep(400);
      if (a.model && state.model !== a.model) throw new Error(`model verify failed: ${state.model}`);
      if (a.effort && state.effort !== a.effort) throw new Error(`effort verify failed: ${state.effort}`);
      return state;
    }

    case "compose": { // {prompt, files?}
      const ed = await until(() => $(S.editor)); if (!ed) throw new Error("composer not found (logged out?)");
      for (let k = 0; k < 8 && removeBtns().length; k++) { removeBtns()[0].click(); await sleep(500); }
      if (!(await clearEditor(ed))) throw new Error("could not clear composer draft");
      if (a.files?.length) {
        const inp = $(S.fileInput); if (!inp) throw new Error("composer file input not found");
        inp.files = toFiles(a.files); inp.dispatchEvent(new Event("change", { bubbles: true }));
        const form = () => ($("form") || { innerText: "" }).innerText;
        if (!(await until(() => a.files.every((f) => form().includes(f.name)), 30000))) throw new Error("attachment chips not visible");
      }
      const dt = new DataTransfer(); dt.setData("text/plain", a.prompt);
      ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(300);
      const head = a.prompt.trim().slice(0, 30).replace(/\s+/g, " ");
      if (!ed.innerText.trim().replace(/\s+/g, " ").startsWith(head)) throw new Error("prompt paste failed");
      return { ok: true };
    }

    case "send": { // single shot: empty | wait | clicked
      const ed = $(S.editor);
      if (!ed || !ed.innerText.trim()) return { state: "empty" };
      const b = $(S.send);
      if (!b || b.disabled || b.getAttribute("aria-disabled") === "true") return { state: "wait" };
      b.click();
      return { state: "clicked" };
    }

    case "sent?": { // after click: composer cleared + generating or new user turn
      const ed = $(S.editor);
      const users = $$(S.userUnit).length;
      return { cleared: !!ed && !ed.innerText.trim(), generating: !!$(S.stop), users };
    }

    case "readAll": { // {images?: base64 for the last `imagesLastN` turns, debug?} — whole conversation, oldest first
      // turn container [data-talvt-turn-state] holds units [data-content-search-unit-key="…:<role>"];
      // image-gen output sits outside units in [data-testid=generated-image-gallery] (blob: src -> same-origin canvas)
      const shot = (i) => { try { const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight;
        c.getContext("2d").drawImage(i, 0, 0); return c.toDataURL("image/png").split(",")[1]; } catch { return null; } };
      const info = (i) => ({ src: i.currentSrc || i.src, alt: i.alt || null, width: i.naturalWidth, height: i.naturalHeight, _el: i });
      const turns = []; let unfilled = false;
      const containers = $$(S.turn);
      for (const t of containers.length ? containers : [($("main") || document.body)]) {
        const n0 = turns.length;
        for (const u of $$(S.unit, t)) turns.push({
          role: (u.getAttribute(S.unitAttr).match(/:(\w+)$/) || [])[1] || null,
          text: textOf(u).replace(/^Writing\s*\n+/, ""), code_blocks: codeBlocksIn(u),
          images: imgsOf(u).map(info), _u: u });
        const own = imgsOf(t).filter((i) => !i.closest(S.unit));
        if (own.length) {
          const last = turns[turns.length - 1];
          if (last && last.role === "assistant" && t.contains(last._u)) last.images.push(...own.map(info));
          else turns.push({ role: "assistant", text: "", code_blocks: [], images: own.map(info) });
        }
        // assistant heading rendered but nothing captured yet, or gallery image still decoding
        if ($(S.assistantHeading, t) && !turns.slice(n0).some((x) => x.role === "assistant")) unfilled = true;
        if ($$(S.gallery + " img", t).some((i) => !i.complete || !i.naturalWidth)) unfilled = true;
      }
      const n = a.imagesLastN ?? (a.images ? turns.length : 0);
      turns.forEach((t, k) => t.images.forEach((im) => { if (a.images && k >= turns.length - n) { const d = shot(im._el); if (d) { im.mime = "image/png"; im.data = d; } } delete im._el; }));
      turns.forEach((t) => delete t._u);
      // long chats render lazily: only the last `lastN` turns must be filled
      const tail = a.lastN ? turns.slice(-a.lastN) : turns;
      const pending = (a.lastN ? false : unfilled) || tail.some((t) => t.role === "assistant" && !t.text && !t.images.length)
        || $$(S.turn).some((t) => t.getAttribute(S.turnAttr) !== "complete");
      const debug = a.debug ? $$(S.turn).map((t) => ({ state: t.getAttribute(S.turnAttr),
        galleryPending: $$(S.gallery + " img", t).map((i) => [i.complete, i.naturalWidth]),
        dataEls: $$("*", t).filter((e) => [...e.attributes].some((x) => x.name.startsWith("data-") && !x.name.startsWith("data-state"))).slice(0, 40)
          .map((e) => e.tagName + [...e.attributes].filter((x) => x.name.startsWith("data-")).map((x) => `[${x.name}=${x.value.slice(0, 40)}]`).join("")),
        imgs: $$("img", t).map((i) => [i.naturalWidth, i.naturalHeight, i.complete, (i.currentSrc || i.src).slice(0, 100)]),
        text: t.innerText.slice(0, 300) })) : undefined;
      return { url: location.href, title: document.title, generating: !!$(S.stop), pending, turns, debug };
    }

    case "listProjects": { // expand the sidebar Projects section if collapsed (restored after); list project links
      const sec = await until(() => $("section[data-app-action-sidebar-section-heading=Projects]"), 15000);
      const tog = sec && $("[data-app-action-sidebar-section-toggle]", sec);
      const was = tog?.getAttribute("aria-expanded");
      if (tog && was === "false") { pd(tog); await sleep(1500); }
      const more = sec && $$("a, button", sec).find((x) => /^(see more|show more|xem thêm)/i.test(x.textContent.trim())); if (more) { pd(more); await sleep(1500); }
      const seen = new Map();
      for (const l of $$('a[href*="/g/g-p-"]', sec || document)) { const m = l.getAttribute("href").match(/\/g\/(g-p-[0-9a-f]{32})/); if (m && !seen.has(m[1])) seen.set(m[1], (l.textContent.trim() || l.getAttribute("aria-label") || "").slice(0, 80)); }
      const dbg = a.debug ? { was, now: tog?.getAttribute("aria-expanded"), collapsed: sec?.getAttribute("data-app-action-sidebar-section-collapsed"), hrefs: $$("a", sec).map((x) => x.getAttribute("href")).slice(0, 30), text: sec?.innerText.slice(0, 400) } : undefined;
      if (tog && was === "false") { pd(tog); await sleep(500); }
      return { projects: [...seen].map(([id, name]) => ({ id, name })), section: !!sec, dbg };
    }

    case "openProject": { // {name, index?}: click the Nth sidebar project with this name; return where it lands
      const sec = await until(() => $("section[data-app-action-sidebar-section-heading=Projects]"), 15000); if (!sec) throw new Error("Projects section not found");
      const tog = $("[data-app-action-sidebar-section-toggle]", sec); if (tog?.getAttribute("aria-expanded") === "false") { pd(tog); await sleep(1500); }
      const more = $$("a, button, div[role=button]", sec).find((x) => /^show more$/i.test(x.textContent.trim())); if (more) { pd(more); await sleep(1500); }
      const items = $$("*", sec).filter((e) => e.children.length === 0 && e.textContent.trim() === a.name);
      const el = items[a.index || 0]; if (!el) return { found: items.length, url: location.href };
      const target = el.closest("a, button, [role=button], [role=link], [role=listitem], li") || el;
      const html = target.outerHTML.replace(/<svg.*?<\/svg>/gs, "").slice(0, 500);
      pd(target); await until(() => /\/g\//.test(location.pathname), 8000);
      return { found: items.length, url: location.href, target: html };
    }

    case "probeProjectDialog": { // DEV: open the create-project dialog, describe it, close it (creates nothing)
      const add = await until(() => $(S.addProject), 10000); if (!add) throw new Error("'Add new project' not found");
      const url0 = location.href; pd(add); await sleep(2000);
      const d = $("[role=dialog]");
      const out = { url_before: url0, url_after: location.href, dialog: !!d,
        inputs: d ? $$("input, textarea, [contenteditable=true]", d).map((e) => ({ tag: e.tagName, type: e.type, name: e.name, ph: e.placeholder, aria: e.getAttribute("aria-label") })) : [],
        buttons: d ? $$("button", d).map((b) => (b.textContent.trim() || b.getAttribute("aria-label") || "").slice(0, 40)) : [],
        text: d ? d.innerText.slice(0, 600) : document.body.innerText.slice(0, 300) };
      if (d) { const c = $$("button", d).find((b) => /cancel|close|hủy|đóng/i.test(b.textContent + (b.getAttribute("aria-label") || ""))); if (c) c.click(); else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }
      return out;
    }

    // ---- projects (flow from chatgpt-studio/references/create-project.md) ----
    case "createProject": { // {name}
      // ChatGPT no longer navigates to the new project; the sidebar row carries its id (data-app-action-sidebar-project-id)
      const ids = () => $$("[data-app-action-sidebar-project-id]").map((e) => e.getAttribute("data-app-action-sidebar-project-id"));
      await until(() => $("section[data-app-action-sidebar-section-heading=Projects]"), 15000);
      const before = new Set(ids());
      const add = await until(() => $(S.addProject), 10000); if (!add) throw new Error("'Add new project' not found");
      pd(add);
      const inp = await until(() => $("[role=dialog] input[name=project-name], [role=dialog] input"), 8000); if (!inp) throw new Error("create-project dialog not found");
      setVal(inp, a.name); await sleep(300);
      const go = await until(() => { const b = btnText("Create project", $("[role=dialog]")); return b && !b.disabled ? b : null; }, 5000);
      if (!go) throw new Error("'Create project' button not enabled");
      go.click();
      const id = await until(() => { const m = location.pathname.match(/\/g\/(g-p-[0-9a-f]{32})/); if (m && !before.has(m[1])) return m[1];
        return ids().find((x) => !before.has(x)); }, 20000);
      if (!id) throw new Error("project created? no new project id appeared within 20s (check the sidebar before retrying)");
      return { project_url: `${location.origin}/g/${id}/project`, id };
    }

    case "deleteProject": { // {id}: delete an (empty) project via its sidebar row menu
      const row = await until(() => $(`[data-app-action-sidebar-project-id="${a.id}"]`), 10000); if (!row) throw new Error("project row not found: " + a.id);
      row.dispatchEvent(new PointerEvent("pointerover", PO)); row.dispatchEvent(new MouseEvent("mouseover", PO)); await sleep(400);
      const opt = $$("button[aria-haspopup=menu]", row)[0]; if (!opt) throw new Error("row menu button not found");
      pd(opt);
      const item = await until(() => $$("[role=menuitem]").find((m) => /delete project/i.test(m.textContent)), 5000);
      if (!item) { esc(); throw new Error("'Delete project' menu item not found: " + $$("[role=menuitem]").map((m) => m.textContent.trim()).join(" | ")); }
      pd(item);
      const conf = await until(() => { const d = $("[role=dialog], [role=alertdialog]"); return d && $$("button", d).find((b) => /^delete/i.test(b.textContent.trim())); }, 5000);
      if (!conf) throw new Error("delete confirm button not found");
      conf.click();
      const gone = await until(() => !$(`[data-app-action-sidebar-project-id="${a.id}"]`), 10000);
      return { deleted: !!gone, id: a.id };
    }

    case "setInstructions": { // {text}
      const act = await until(() => $(S.projectActions), 10000); if (!act) throw new Error("'Project actions' not found");
      pd(act);
      const item = await until(() => $$("[role=menuitem]").find((m) => /project settings/i.test(m.textContent)), 5000);
      if (!item) throw new Error("'Project settings' menu item not found");
      pd(item); item.click();
      const ta = await until(() => $("[role=dialog] textarea"), 8000); if (!ta) throw new Error("instructions textarea not found");
      setVal(ta, a.text); await sleep(400);
      const save = btnText("Save", $("[role=dialog]")); if (!save) throw new Error("'Save' not found");
      save.click(); await sleep(1500);
      return { ok: true, chars: a.text.length };
    }

    case "uploadSources": { // {files}
      const tab = await until(() => btnText("Sources"), 8000); if (tab) pd(tab);
      await sleep(1200);
      // source-upload inputs: multiple, no accept, outside the composer form (indices drift; pick by shape)
      const inp = await until(() => { const c = $$("input[type=file]").filter((i) => i.multiple && !i.accept && !i.closest("form")); return c[0]; }, 8000);
      if (!inp) throw new Error("source upload input not found");
      inp.files = toFiles(a.files); inp.dispatchEvent(new Event("change", { bubbles: true }));
      const main = () => ($("main") || document.body).innerText;
      const ok = await until(() => a.files.every((f) => main().includes(f.name)), 60000, 1000);
      const close = $(S.closeDialog); if (close) close.click();
      if (!ok) throw new Error("not all sources appeared: " + a.files.filter((f) => !main().includes(f.name)).map((f) => f.name).join(", "));
      return { ok: true, uploaded: a.files.map((f) => f.name) };
    }
  }
  throw new Error("unknown op " + op);
}
}
