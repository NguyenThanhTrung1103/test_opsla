// Gemini page driver (gemini.google.com). Injected via chrome.scripting.executeScript (isolated world): self-contained, DOM events only.
export async function geminiPage(op, a) {
  try { return await geminiOp(op, a || {}); } catch (e) { return { __error: String(e?.message || e) }; }

async function geminiOp(op, a) {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => setTimeout(r, ms); c.port2.postMessage(0); });
  const until = async (fn, ms = 15000, step = 300) => { const t = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } };
  const PO = { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", isPrimary: true };
  const pd = (e) => { for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) e.dispatchEvent(new (t.startsWith("pointer") ? PointerEvent : MouseEvent)(t, PO)); e.click(); };
  const esc = () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
  const EDITOR = "rich-textarea [contenteditable=true][role=textbox]";
  const modeBtn = () => $("button[data-test-id=bard-mode-menu-button]");
  const stopBtn = () => $$("button").find((b) => /^stop/i.test(b.getAttribute("aria-label") || "") && b.offsetParent !== null);
  const sendBtn = () => $$("button").find((b) => /^send/i.test(b.getAttribute("aria-label") || ""));
  const chips = () => $$("uploader-file-preview");
  const toFiles = (files) => { const dt = new DataTransfer();
    for (const f of files) { const bin = atob(f.base64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      dt.items.add(new File([u], f.name, { type: f.mime || "application/octet-stream" })); } return dt; };
  // text from DOM structure (textContent), not layout: hidden tabs freeze Gemini's reveal animation, so innerText reads empty
  const liveText = (el, drop) => { if (!el) return ""; const c = el.cloneNode(true); c.querySelectorAll(drop).forEach((x) => x.remove());
    c.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
    c.querySelectorAll("li").forEach((b) => b.prepend("- "));
    c.querySelectorAll("td, th").forEach((b) => b.append(" | "));
    c.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, tr, code-block, table, div[dir]").forEach((b) => { b.prepend("\n"); b.append("\n"); });
    return c.textContent.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(); };
  const turnText = (el) => (el?.innerText || "").replace(/\n{3,}/g, "\n\n").trim();

  switch (op) {
    case "ready": {
      const signIn = $$("a, button").some((b) => /^sign in$/i.test(b.textContent.trim()));
      return { url: location.href, composer: !!$(EDITOR), loggedOut: signIn && !$(EDITOR), model: (modeBtn()?.getAttribute("aria-label") || "").replace(/^.*currently\s*/i, "") };
    }
    case "setModel": { // {model?: substring of the menu label e.g. "Pro" | "Argon", thinking?: Low|Medium|High}
      const openMenu = async () => { esc(); await sleep(200); const b = await until(modeBtn, 10000); if (!b) throw new Error("mode picker not found"); pd(b);
        return until(() => $("gem-menu[data-test-id=gem-mode-menu]"), 5000); };
      const label = (it) => (it.querySelector("span")?.textContent || "").trim();
      if (a.model) {
        const m = await openMenu(); if (!m) throw new Error("mode menu did not open");
        const items = $$("gem-menu-item[data-test-id^=bard-mode-option]", m);
        const it = items.find((x) => label(x).toLowerCase() === a.model.toLowerCase()) || items.find((x) => label(x).toLowerCase().includes(a.model.toLowerCase()));
        if (!it) { esc(); throw new Error(`model "${a.model}" not offered: ${items.map(label).join(", ")}`); }
        pd(it); await sleep(800);
      }
      if (a.thinking) {
        const m = await openMenu(); if (!m) throw new Error("mode menu did not open");
        const sub = $$("gem-menu-item", m).find((x) => /thinking level/i.test(x.textContent)); if (!sub) { esc(); throw new Error("no Thinking level option for this model"); }
        pd(sub); const opt = await until(() => $$("gem-menu-item").find((x) => label(x).toLowerCase() === a.thinking.toLowerCase()), 4000);
        if (!opt) { esc(); throw new Error(`thinking level "${a.thinking}" not offered`); }
        pd(opt); await sleep(800);
      }
      esc(); await sleep(300);
      // read back: model from the picker label, thinking from the selected sub-item (open once)
      const picker = (modeBtn()?.getAttribute("aria-label") || "").replace(/^.*currently\s*/i, "");
      let thinking = null, model = picker;
      const m = await openMenu();
      if (m) { const selM = $$("gem-menu-item[data-test-id^=bard-mode-option]", m).find((x) => x.querySelector("gem-icon[aria-label=Selected]")); if (selM) model = label(selM);
        const sub = $$("gem-menu-item", m).find((x) => /thinking level/i.test(x.textContent));
        if (sub) { pd(sub); await until(() => $$("gem-menu-item").some((x) => /^(low|medium|high)$/i.test(label(x))), 3000);
          const sel = $$("gem-menu-item").find((x) => /^(low|medium|high)$/i.test(label(x)) && x.querySelector("gem-icon[aria-label=Selected]")); thinking = sel ? label(sel) : null; } }
      esc(); await sleep(200); esc();
      return { model, picker, thinking, offered: m ? $$("gem-menu-item[data-test-id^=bard-mode-option]").map(label) : [] };
    }
    case "compose": { // {prompt, files?}
      const ed = await until(() => $(EDITOR)); if (!ed) throw new Error("composer not found (logged out?)");
      ed.focus(); document.execCommand("selectAll"); document.execCommand("delete"); await sleep(200);
      for (const x of $$("uploader-file-preview button, uploader-file-preview [role=button]").filter((b) => /remove|close|delete/i.test((b.getAttribute("aria-label") || "") + b.textContent))) pd(x); // stale chips
      if ($$("uploader-file-preview").length) await until(() => !$$("uploader-file-preview").length, 5000);
      if (a.files?.length) {
        const b = $$("button").find((x) => /^upload/i.test(x.getAttribute("aria-label") || "")); if (!b) throw new Error("Upload & tools button not found");
        let inp = null; // the menu sometimes ignores the first click or toggles shut: retry the open
        for (let i = 0; i < 3 && !inp; i++) { if (!$("images-files-uploader input[type=file]")) { if (i) { esc(); await sleep(400); } pd(b); }
          inp = await until(() => $("images-files-uploader input[type=file]"), 4000); }
        if (!inp) throw new Error("uploader file input not found (Upload & tools menu did not open)");
        inp.files = toFiles(a.files).files; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(800); esc();
        if (!(await until(() => $$("uploader-file-preview").length >= a.files.length, 20000))) throw new Error("attachment chip did not appear");
        // uploads finish when the chips' progress indicators are gone
        await until(() => !$$("uploader-file-preview mat-progress-spinner, uploader-file-preview [role=progressbar], uploader-file-preview .loading").length, 120000, 1000);
      }
      ed.focus();
      const dt = new DataTransfer(); dt.setData("text/plain", a.prompt);
      ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(500);
      if (!ed.innerText.trim()) document.execCommand("insertText", false, a.prompt);
      const got = await until(() => ed.innerText.replace(/\s+/g, "").length >= Math.min(a.prompt.replace(/\s+/g, "").length, 50) ? ed.innerText : null, 5000);
      if (!got) throw new Error(`prompt did not land in composer (${ed.innerText.length} chars)`);
      return { chars: ed.innerText.length, files: chips().length };
    }
    case "send": { const b = sendBtn(); if (!b) return { state: "wait" };
      if (b.disabled || b.getAttribute("aria-disabled") === "true") return { state: "wait" }; pd(b); return { state: "clicked" }; }
    case "clear": { const ed = $(EDITOR); if (ed) { ed.focus(); document.execCommand("selectAll"); document.execCommand("delete"); }
      for (const x of $$("button").filter((b) => /^remove file/i.test(b.getAttribute("aria-label") || ""))) pd(x); await sleep(300);
      return { cleared: !(ed?.innerText.trim()) && !chips().length }; }
    case "readAll": {
      const nodes = $$("user-query, model-response");
      const turns = nodes.map((n) => {
        if (n.tagName.toLowerCase() === "user-query") { // drop the hidden "You said …" heading and the copy/edit buttons
          const c = n.querySelector("[id^=user-query-content]") || n;
          return { role: "user", text: liveText(c, "h5, button, gem-icon-button"), code_blocks: [] }; }
        const md = n.querySelector("message-content .markdown") || n.querySelector("message-content") || n;

        const code_blocks = $$("code-block", md).map((c) => ({ lang: (c.querySelector(".code-block-decoration span, .code-block-decoration")?.textContent || "").trim().split(/\s/)[0], code: (c.querySelector("pre code, code, pre")?.textContent || "").replace(/\n$/, "") }));
        return { role: "assistant", text: liveText(md, ".hide-from-message-actions, follow-up, elicitations, sources-list, button, .code-block-decoration, mat-icon"), code_blocks, done_actions: !!n.querySelector("message-actions button, .response-footer button") };
      });
      const lastN = a.lastN ? turns.slice(-a.lastN) : turns;
      return { url: location.href, title: document.title, generating: !!stopBtn(), turns: lastN, total_turns: turns.length, assistant_total: turns.filter((t) => t.role === "assistant").length };
    }
    case "sent?": { const ed = $(EDITOR); return { users: $$("user-query").length, generating: !!stopBtn(), composerEmpty: !(ed?.innerText.trim()) }; }
    case "editor": { const ed = $(EDITOR); return { text: ed?.innerText, html: ed?.innerHTML.slice(0, 400) }; }
    case "notices": return { snack: $$("simple-snack-bar, mat-snack-bar-container, [role=alert], [role=status], aside[role=region]").map((x) => x.innerText.slice(0, 200)).filter(Boolean), dialogs: $$("[role=dialog], mat-dialog-container").map((x) => x.innerText.slice(0, 300)), hidden: document.hidden, vis: document.visibilityState, focus: document.hasFocus() };
    case "tryFiles": { // DEV: attach without the menu. a.how = paste | drop:<selector>
      const n0 = chips().length; const dt = toFiles(a.files); const ed = $(EDITOR);
      if (a.how === "paste") { ed.focus(); ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }
      else { const t = $(a.how.slice(5)) || document.body; for (const ev of ["dragenter", "dragover", "drop"]) { t.dispatchEvent(new DragEvent(ev, { bubbles: true, cancelable: true, dataTransfer: dt })); await sleep(150); } }
      await sleep(4000); return { before: n0, after: chips().length, editorText: ed.innerText.slice(0, 80) };
    }
    case "uploadProbe": { const b = $$("button").find((x) => /^upload/i.test(x.getAttribute("aria-label") || "")); esc(); await sleep(300); pd(b);
      const out = []; for (let i = 0; i < 6; i++) { await sleep(1000); const p = $$(".cdk-overlay-pane").at(-1);
        out.push({ t: i, expanded: b.getAttribute("aria-expanded"), panes: $$(".cdk-overlay-pane").length, text: p ? p.innerText.replace(/\s+/g, " ").slice(0, 120) : null, tags: p ? [...new Set([...p.querySelectorAll("*")].map((x) => x.tagName.toLowerCase()).filter((t) => t.includes("-")))].join(" ") : null, input: !!$("images-files-uploader input[type=file]") }); }
      esc(); return out; }
    case "overlay": return { menus: $$("gem-menu, [role=menu]").length, backdrops: $$(".cdk-overlay-backdrop").length, panes: $$(".cdk-overlay-pane").map((p) => p.innerText.slice(0, 60)), active: document.activeElement?.tagName + "." + (document.activeElement?.getAttribute("aria-label") || "") };
    case "buttons": return $$("button").map((b) => [b.getAttribute("aria-label"), b.className.split(" ").slice(0, 3).join("."), b.disabled, b.offsetParent !== null]).filter(([l]) => l && (!a.re || new RegExp(a.re, "i").test(l)));
    case "probe": { // DEV: trimmed markup of the last user-query and model-response
      const strip = (e) => e ? e.outerHTML.replace(/\s(class|style|jslog|_ngcontent[-\w]*|_nghost[-\w]*|data-ved)="[^"]*"/g, "").replace(/<!---->/g, "").slice(0, a.max || 6000) : null;
      const cls = (e) => e ? [...e.querySelectorAll("*")].map((x) => x.tagName.toLowerCase() + (x.className && typeof x.className === "string" ? "." + x.className.trim().split(/\s+/).slice(0, 3).join(".") : "")).slice(0, 200) : null;
      return { user: strip($$("user-query").at(-1)), model_tags: cls($$("model-response").at(-1)) };
    }
    default: throw new Error("unknown gemini op " + op);
  }
}
}
