// TikTok Studio page driver (isolated world, single-shot ops; waiting lives in background.js).
export function tiktokPage(op, a, sel) {
  try { return run(); } catch (e) { return { __error: String(e && e.message || e) }; }
  function run() {
  a = a || {}; const S = sel;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const PO = { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", isPrimary: true };
  const click = (e) => { e.dispatchEvent(new PointerEvent("pointerdown", PO)); e.dispatchEvent(new MouseEvent("mousedown", PO));
    e.dispatchEvent(new PointerEvent("pointerup", PO)); e.dispatchEvent(new MouseEvent("mouseup", PO)); e.click(); };
  const fileFromRef = (f) => {
    const parts = (window.__tp || {})[f.ref]; if (!parts) throw new Error("staged file missing: " + f.ref);
    return new File(parts.map((b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }), f.name, { type: f.mime });
  };
  const btnByText = (re) => $$("button, [role=button]").find((b) => re.test(b.textContent.trim()) || re.test(b.getAttribute("aria-label") || ""));
  const captionEditor = () => $(S.caption) || $("[contenteditable=true]");

  switch (op) {
    case "state":
      return { url: location.href, loggedIn: !/\/login/.test(location.pathname) && !btnByText(/^Log in$/),
        fileInput: !!$("input[type=file]"), editor: !!captionEditor() };

    case "attachVideo": { // {file: staged ref}
      const inp = $(S.fileInput); if (!inp) throw new Error("upload input not found");
      const dt = new DataTransfer(); dt.items.add(fileFromRef(a.file));
      inp.files = dt.files; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
      delete window.__tp[a.file.ref];
      return { attached: dt.files[0].size };
    }

    case "uploadState": { // progress + post button state
      const body = document.body.innerText;
      const post = $(S.postButton) || $$("button").find((b) => b.textContent.trim() === "Post");
      const pct = (body.match(/(\d{1,3})%/) || [])[1];
      return { uploaded: /Uploaded|Đã tải lên/.test(body), percent: pct ? +pct : null, editor: !!captionEditor(),
        caption: captionEditor() ? captionEditor().innerText : null,
        post: post ? { disabled: post.disabled || post.getAttribute("aria-disabled") === "true" || post.getAttribute("data-disabled") === "true" } : null,
        errors: $$("[role=alert], .TUXTopToast-content").map((e) => e.innerText.trim()).filter(Boolean).slice(0, 3) };
    }

    case "setCaption": { // DraftJS-safe: never mutate DOM; select all content via range, then ONE paste (model replaces selection)
      const ed = captionEditor(); if (!ed) throw new Error("caption editor not found");
      ed.focus();
      const texts = $$("[data-text=true]", ed); const blocks = $$("[data-block=true]", ed);
      const r = document.createRange();
      if (texts.length) { r.setStart(texts[0].firstChild || texts[0], 0); const last = texts[texts.length - 1]; const ln = last.firstChild || last; r.setEnd(ln, (ln.textContent || "").length); }
      else r.selectNodeContents(blocks[0] || ed);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
      // React onSelect (DraftJS reads DOM selection into its model) fires on mouseup/keyup/select
      for (const t of ["mouseup", "keyup", "select"]) ed.dispatchEvent(new (t === "keyup" ? KeyboardEvent : t === "mouseup" ? MouseEvent : Event)(t, { bubbles: true }));
      const dt = new DataTransfer(); dt.setData("text/plain", a.text);
      ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      return { caption: ed.innerText, blocks: $$("[data-block=true]", ed).length };
    }

    case "captionClear": { // DraftJS: selectAll + delete via the editing pipeline
      const ed = captionEditor(); if (!ed) throw new Error("caption editor not found");
      ed.focus(); document.execCommand("selectAll"); document.execCommand("delete");
      return { caption: ed.innerText };
    }
    case "captionType": { // {text} insertText at caret (no newlines)
      const ed = captionEditor(); ed.focus(); document.execCommand("insertText", false, a.text); return { caption: ed.innerText };
    }
    case "captionEnter": {
      const ed = captionEditor(); ed.focus();
      // Chrome ignores keyCode in KeyboardEvent init; DraftJS needs keyCode 13 to split the block
      const ev = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true });
      Object.defineProperty(ev, "keyCode", { get: () => 13 }); Object.defineProperty(ev, "which", { get: () => 13 });
      ed.dispatchEvent(ev);
      return { caption: ed.innerText };
    }
    case "captionPaste": { // {text} single paste at caret
      const ed = captionEditor(); ed.focus();
      const dt = new DataTransfer(); dt.setData("text/plain", a.text);
      if (a.html) dt.setData("text/html", a.text.split("\n").map((l) => `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;") || "<br>"}</p>`).join(""));
      ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      return { caption: ed.innerText };
    }
    case "captionTextInput": { // DraftJS-native: legacy TextEvent 'textInput' -> React onBeforeInput -> model insert
      const ed = captionEditor(); ed.focus();
      const ev = document.createEvent("TextEvent"); ev.initTextEvent("textInput", true, true, window, a.text);
      ed.dispatchEvent(ev);
      return { caption: ed.innerText };
    }
    case "captionBlur": { const ed = captionEditor(); ed.dispatchEvent(new FocusEvent("blur", { bubbles: false })); ed.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); ed.blur(); return { ok: true }; }
    case "captionFocusEnd": { const ed = captionEditor(); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return { focused: document.activeElement === ed }; }
    case "reactProbe": { // MAIN world only: walk fibers up from the editor, report text-ish props/state
      const ed = captionEditor(); const fk = Object.keys(ed).find((k) => k.startsWith("__reactFiber$")); if (!fk) return { error: "no fiber (run in MAIN world)" };
      let f = ed[fk]; const out = [];
      const plain = (v) => { try { if (v && typeof v.getCurrentContent === "function") return "ES:" + v.getCurrentContent().getPlainText().slice(0, 80); } catch {} return null; };
      for (let i = 0; f && i < 80; i++, f = f.return) {
        const name = typeof f.type === "string" ? f.type : (f.type && (f.type.displayName || f.type.name)) || "?";
        const props = f.memoizedProps || {}; const hits = [];
        for (const [k, v] of Object.entries(props)) { const p = plain(v); if (p) hits.push(k + "=" + p); else if (typeof v === "string" && /caption|desc|title|text|value/i.test(k)) hits.push(k + "=" + v.slice(0, 60)); }
        let st = f.memoizedState, j = 0; while (st && j < 15) { const p = plain(st.memoizedState); if (p) hits.push("state" + j + "=" + p); else if (typeof st.memoizedState === "string" && st.memoizedState.length > 3) hits.push("state" + j + "=" + st.memoizedState.slice(0, 60)); st = st.next; j++; }
        if (hits.length) out.push(i + " " + name + ": " + hits.join(" | "));
      }
      return out.slice(0, 25);
    }
    case "captionField": { // MAIN: find Caption field fiber; {apply:true} -> call its onChange with the editor's editorState
      const ed = captionEditor(); const fk = Object.keys(ed).find((k) => k.startsWith("__reactFiber$")); if (!fk) return { error: "run in MAIN world" };
      let f = ed[fk], editorFiber = null, field = null;
      for (let i = 0; f && i < 80; i++, f = f.return) {
        const p = f.memoizedProps || {};
        if (!editorFiber && p.editorState && typeof p.editorState.getCurrentContent === "function") editorFiber = f;
        if (p.title === S.captionFieldTitle && p.value && typeof p.value.getCurrentContent === "function") { field = f; break; }
      }
      if (!field) return { error: "caption field not found" };
      const fp = field.memoizedProps;
      const info = { keys: Object.keys(fp), fieldText: fp.value.getCurrentContent().getPlainText(), editorText: editorFiber && editorFiber.memoizedProps.editorState.getCurrentContent().getPlainText() };
      if (a.text !== undefined) { // build state from DraftJS's own classes and set the field value directly
        const es = fp.value; const ES = es.constructor, CS = es.getCurrentContent().constructor;
        const next = ES.moveSelectionToEnd(ES.push(es, CS.createFromText(a.text), "insert-characters"));
        fp.onChange(next); info.set = true;
      }
      if (a.apply) {
        const fn = fp.onChange || fp.onValueChange || fp.setValue; if (typeof fn !== "function") return { ...info, error: "no onChange" };
        fn(editorFiber.memoizedProps.editorState); info.applied = true;
      }
      return info;
    }
    case "buttonHtml": { const b = $$("button").find((x) => x.textContent.trim() === a.text); return b ? b.outerHTML.slice(0, 600) : null; }
    case "buttons": return $$("button").filter((b) => b.offsetParent).map((b) => b.textContent.trim()).filter((t) => t && t.length < 30);
    case "rowAction": { // {videoId, testid} click an icon (Pen/ChartRise/Comments) in that post's row
      const link = $(`a[href*='/video/${a.videoId}']`); if (!link) throw new Error("row not found");
      let row = link; while (row && !row.querySelector(`[data-testid=${a.testid}]`)) row = row.parentElement;
      const icon = row && row.querySelector(`[data-testid=${a.testid}]`); if (!icon) throw new Error("icon not found");
      click(icon.closest("button, a, [role=button], div") || icon); return { clicked: true };
    }
    case "contentRows": { // TikTok Studio > Posts table: title link, duration, date/status, visibility, views, likes, comments
      const num = (t) => { const m = /^([\d.,]+)\s*([KMB])?$/i.exec(t.trim()); if (!m) return null; const n = parseFloat(m[1].replace(/,/g, "")); return Math.round(n * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] || 1)); };
      return $$("a[href*='/video/']").filter((x) => /\/@[^/]+\/video\/\d+/.test(x.getAttribute("href"))).map((link) => {
        let row = link; for (let i = 0; i < 8 && row.parentElement; i++) { row = row.parentElement; if ($$("span", row).filter((s) => num(s.textContent) !== null && s.children.length === 0).length >= 3) break; }
        const leaf = $$("span, div", row).filter((e) => e.children.length === 0 || e.tagName === "DIV" && e.childElementCount === 0).map((e) => e.textContent.trim()).filter(Boolean);
        const nums = $$("span", row).filter((e) => e.children.length === 0 && num(e.textContent) !== null && !/:/.test(e.textContent)).map((e) => num(e.textContent));
        const href = link.getAttribute("href"); const id = href.match(/video\/(\d+)/)[1];
        return { id, url: "https://www.tiktok.com" + href, title: link.textContent.trim(),
          duration: leaf.find((t) => /^\d{1,2}:\d{2}$/.test(t)) || null,
          status: leaf.find((t) => /under review|Posted|Private|Failed|Scheduled|^\w{3} \d{1,2},/.test(t)) || null,
          visibility: leaf.find((t) => /^(Everyone|Only me|Friends)$/.test(t)) || null,
          views: nums.slice(-3)[0] ?? null, likes: nums.slice(-3)[1] ?? null, comments: nums.slice(-3)[2] ?? null };
      }).filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i);
    }
    case "videoAnalytics": { // /tiktokstudio/analytics/<id>: label -> value pairs (+ headline counters)
      const leaves = $$("div, span").filter((e) => e.childElementCount === 0 && e.textContent.trim());
      const LABELS = ["Video views", "Total play time", "Average watch time", "Watched full video", "New followers", "Reached audience"]; // (Likes/Comments/… collide with sidebar labels; they are in counters)
      const out = {};
      leaves.forEach((e, i) => { const t = e.textContent.trim(); if (LABELS.includes(t) && leaves[i + 1]) out[t] = leaves[i + 1].textContent.trim(); });
      const posted = leaves.findIndex((e) => /^Posted on /.test(e.textContent.trim()));
      if (posted >= 0) out.counters = leaves.slice(posted + 1, posted + 6).map((e) => e.textContent.trim());
      const notes = leaves.map((e) => e.textContent.trim()).filter((t) => /Data will show|being processed|Most viewers stopped/.test(t));
      return { url: location.href, metrics: out, notes };
    }
    case "comments": { // Studio > Comments list (best effort: account had no comments when this was written)
      const body = document.body.innerText;
      if (/No comments yet/.test(body)) return { comments: [], empty: true };
      const rows = $$("a[href^='/@']").map((a0) => { let r = a0; for (let i = 0; i < 6 && r.parentElement; i++) { r = r.parentElement; if (r.innerText.length > 40) break; }
        return { user: a0.textContent.trim(), user_url: "https://www.tiktok.com" + a0.getAttribute("href"), text: r.innerText.replace(a0.textContent, "").trim().slice(0, 500) }; });
      return { comments: rows.filter((r, i, all) => r.text && all.findIndex((x) => x.text === r.text) === i), empty: false, unverified_parser: true };
    }
    case "checks": { // visible content-check status lines
      const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
      return $$("span, div").filter((e) => e.children.length === 0 && vis(e) && /Checking in progress|No issues found|issues? found|check limit|Couldn.t check|not eligible|Restricted/i.test(e.textContent))
        .map((e) => e.textContent.trim().slice(0, 140));
    }
    case "editorHtml": { const ed = captionEditor(); return { html: ed.outerHTML.slice(0, 1500), parent: ed.parentElement.outerHTML.slice(0, 300) }; }
    case "captionBackspace": { // {n} DraftJS key command 'backspace' (model-level), n times
      const ed = captionEditor(); ed.focus();
      for (let i = 0; i < (a.n || 1); i++) {
        const ev = new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", bubbles: true, cancelable: true });
        Object.defineProperty(ev, "keyCode", { get: () => 8 }); Object.defineProperty(ev, "which", { get: () => 8 });
        ed.dispatchEvent(ev);
      }
      return { caption: ed.innerText };
    }
    case "captionKey": { // {key} e.g. Escape to close hashtag popup
      const ed = captionEditor(); ed.dispatchEvent(new KeyboardEvent("keydown", { key: a.key, code: a.key, bubbles: true, cancelable: true })); return { caption: ed.innerText };
    }

    case "clickPost": {
      const post = $(S.postButton) || $$("button").find((b) => b.textContent.trim() === "Post");
      if (!post) throw new Error("Post button not found");
      if (post.disabled || post.getAttribute("aria-disabled") === "true" || post.getAttribute("data-disabled") === "true") return { clicked: false };
      click(post); return { clicked: true };
    }

    case "clickText": { const b = btnByText(new RegExp("^" + a.text + "$", "i")); if (!b) throw new Error(`'${a.text}' not found`); click(b); return { clicked: true }; }

    case "dialogs":
      return $$("[role=dialog], .TUXModal, [class*=modal]").filter((d) => d.offsetParent).map((d) => ({ text: d.innerText.slice(0, 300),
        buttons: $$("button", d).map((b) => b.textContent.trim()).filter(Boolean) }));
  }
  throw new Error("unknown op " + op);
  }
}
