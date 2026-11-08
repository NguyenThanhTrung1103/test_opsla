// LinkedIn page driver (2026 RSC UI: hashed classes -> rely on roles, aria-labels, data-testid, ids).
// Injected via chrome.scripting.executeScript (isolated world) — self-contained, single-shot ops;
// all waiting/polling happens in background.js (page timers are throttled in hidden tabs).
export function linkedinPage(op, a, sel) {
  try { return run(); } catch (e) { return { __error: String(e && e.message || e) }; } // executeScript drops thrown errors
  function run() {
  a = a || {}; const S = sel;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const PO = { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", isPrimary: true };
  const click = (e) => { e.dispatchEvent(new PointerEvent("pointerdown", PO)); e.dispatchEvent(new MouseEvent("mousedown", PO));
    e.dispatchEvent(new PointerEvent("pointerup", PO)); e.dispatchEvent(new MouseEvent("mouseup", PO)); e.click(); };
  const byText = (sel, re, root = document) => $$(sel, root).find((e) => re.test(e.textContent.trim()) || re.test(e.getAttribute("aria-label") || ""));
  const txt = (e) => (e ? e.innerText.replace(/\n{3,}/g, "\n\n").trim() : "");
  // comment editor: new RSC UI (tiptap) or legacy Ember (pulse/article pages)
  const commentEditor = () => $(S.commentEditor);
  const commentSubmit = (ed) => {
    const form = ed && (ed.closest("form") || ed.closest(".comments-comment-box, .comments-comment-texteditor")?.parentElement);
    const cands = [...$$(S.commentButtons), ...(form ? $$("button", form) : []), ...$$("button.comments-comment-box__submit-button, button[class*=submit-button]")];
    return cands.find((x) => /^(Comment|Post|Reply)$/.test(x.textContent.trim()));
  };
  const urnOf = (item) => {
    const c = $(S.commentary, item);
    const id = c ? c.id : "";
    // e.g. ContentUrnShareUrn(shareUrn=ShareUrn(shareId=123)) / ugcPostUrn=UgcPostUrn(ugcPostId=123)
    const m = /(share|ugcPost|activity|groupPost)Id=(\d+)/.exec(id);
    if (m) return `urn:li:${m[1]}:${m[2]}`;
    const link = $$("a[href*='/feed/update/urn:li:']", item)[0];
    return link ? decodeURIComponent(link.href.match(/urn:li:[a-zA-Z]+:\d+/)[0]) : null;
  };
  const postOf = (item) => {
    const authorA = $$("a[href*='/in/'], a[href*='/company/']", item).find((x) => $("[aria-label]", x) && x.innerText.trim());
    const meta = $$("p", item).map((p) => p.innerText.trim()).filter(Boolean);
    const urn = urnOf(item);
    return {
      urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : null,
      author: authorA ? authorA.innerText.split("\n")[0].trim() : null, author_url: authorA ? authorA.href.split("?")[0] : null,
      headline_and_time: meta.slice(0, 4).join(" | ").slice(0, 300),
      text: txt($(S.expandableText, item) || $(S.commentary, item)).replace(/\n?…\s*more$/, ""),
      social: (byText("button, span", /reactions?|comments?|reposts?/i, item) || {}).textContent?.trim() || null,
      has_media: !!$("video, img[src*='media.licdn.com/dms/image']", item),
    };
  };

  switch (op) {
    case "state":
      return { url: location.href, loggedIn: !!$("[data-testid=mainFeed], #global-nav, header nav") && !/\/(login|checkpoint|authwall)/.test(location.pathname),
        dialog: !!$("[role=dialog]"), challenge: /checkpoint|challenge/.test(location.pathname) };

    case "readFeed": { // posts currently rendered (home feed, activity pages, content search)
      const items = $$("[role=listitem]").filter((i) => $(S.commentary + ", " + S.expandableText, i))
        .filter((i, k, all) => !all.some((o) => o !== i && o.contains(i)));
      return { url: location.href, posts: items.map(postOf).filter((p) => p.text || p.urn) };
    }

    case "readResults": { // search results: posts -> postOf, entities -> name/url/lines
      const list = $("main [role=list]") || $("main");
      const items = $$(":scope > [role=listitem]", list).length ? $$(":scope > [role=listitem]", list) : $$("main [role=listitem]");
      return { url: location.href, results: items.map((i) => {
        if ($(S.commentary + ", " + S.expandableText, i)) return { kind: "post", ...postOf(i) };
        const a0 = $("a[href*='linkedin.com/']", i);
        const lines = $$("p", i).map((p) => p.innerText.trim()).filter(Boolean);
        return { kind: "entity", name: lines[0] ? lines[0].split("\n")[0].replace(/\s*•.*$/, "") : null, url: a0 ? a0.href.split("?")[0] : null,
          degree: (lines[0] || "").match(/•\s*(\S+)/)?.[1] || null, lines: lines.slice(1, 4) };
      }).filter((r) => r.url || r.text) };
    }

    case "scroll": window.scrollBy(0, a.by || 2500); return { y: scrollY };

    case "composer": { // state of the post composer dialog
      const d = $("dialog[data-testid=dialog]") || $("[data-testid=dialog]");
      const ed = d && $(S.textbox, d);
      const post = d && $$("button", d).find((b) => b.textContent.trim() === "Post");
      return { open: !!d, editor: !!ed, text: ed ? ed.innerText : "", postEnabled: !!post && !post.disabled && post.getAttribute("aria-disabled") !== "true",
        media: d ? $$("img, video", d).filter((m) => !m.closest("[role=button]")).length : 0, files: d ? $$("input[type=file]", d).length : 0, url: location.href };
    }

    case "insertText": { // into composer / comment box: paste first (keeps line breaks), execCommand fallback
      const root = a.scope ? $(a.scope) : document;
      const ed = $$(S.textbox, root).filter((e) => (!a.within || e.closest(a.within)) && (!a.label || e.getAttribute("aria-label") === a.label))[a.index || 0];
      if (!ed) throw new Error("editor not found");
      ed.focus();
      const dt = new DataTransfer(); dt.setData("text/plain", a.text);
      ed.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      if (!ed.innerText.trim()) document.execCommand("insertText", false, a.text);
      return { len: ed.innerText.trim().length, head: ed.innerText.slice(0, 80) };
    }

    case "clickLabel": { // click a button by aria-label or exact text, optionally inside a scope
      const root = a.scope ? $(a.scope) : document;
      const b = $$("button, [role=button], a, [role=menuitem], [role=option], label", root).find((e) =>
        (e.getAttribute("aria-label") || "") === a.label || e.textContent.trim() === a.label);
      if (!b) throw new Error(`'${a.label}' not found`);
      if (b.disabled || b.getAttribute("aria-disabled") === "true") return { clicked: false, disabled: true };
      click(b); return { clicked: true };
    }

    case "dropFiles": { // synthetic drag&drop onto a drop zone (LinkedIn creates no persistent file input)
      const zone = $(a.selector); if (!zone) throw new Error("drop zone not found: " + a.selector);
      const dt = new DataTransfer();
      for (const f of a.files) { const bin = atob(f.base64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        dt.items.add(new File([u], f.name, { type: f.mime })); }
      for (const type of ["dragenter", "dragover", "drop"]) zone.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
      return { dropped: dt.files.length };
    }

    case "dialogs": // summary of open dialogs (header text, buttons) for flow control
      return $$("dialog[data-testid=dialog], [role=dialog]:not([aria-hidden=true])").map((d) => ({
        header: ($("header h2, h2", d) || {}).textContent?.trim() || null,
        buttons: $$("button", d).map((b) => (b.getAttribute("aria-label") || b.textContent.trim()) + (b.disabled || b.getAttribute("aria-disabled") === "true" ? " (disabled)" : "")).filter(Boolean).slice(0, 20),
        imgs: $$("img", d).filter((i) => i.naturalWidth > 200).length }));

    case "articleState": {
      const t = $(S.articleTitle), b = $(S.articleBody);
      const next = $$("button").find((x) => x.textContent.trim() === "Next");
      return { url: location.href, title: t ? t.value : null, bodyChars: b ? b.innerText.trim().length : null,
        h2: b ? $$("h2", b).length : 0, h3: b ? $$("h3", b).length : 0, lists: b ? $$("ul, ol", b).length : 0, bold: b ? $$("strong, b", b).length : 0,
        cover: !!$$("main img").find((i) => i.naturalWidth > 400), nextEnabled: !!next && !next.disabled, status: ($$("span").find((x) => /^(Draft|Saving|Saved)/.test(x.textContent.trim())) || {}).textContent?.trim() || null };
    }

    case "articleFill": { // {title, html, text} — execCommand goes through the real editing pipeline (beforeinput/input)
      const out = {};
      const t = $(S.articleTitle); if (!t) throw new Error("article title field not found");
      if (a.title !== undefined) {
        t.focus(); t.select(); document.execCommand("insertText", false, a.title);
        if (t.value !== a.title) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, a.title); t.dispatchEvent(new Event("input", { bubbles: true })); }
        out.title = t.value;
      }
      if (a.html) {
        const b = $(S.articleBody); if (!b) throw new Error("article body editor not found");
        b.focus(); const r = document.createRange(); r.selectNodeContents(b); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        const dt = new DataTransfer(); dt.setData("text/html", a.html); dt.setData("text/plain", a.text || "");
        b.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        out.via = "paste";
        if (b.innerText.trim().length < 20) { document.execCommand("insertHTML", false, a.html); out.via = "insertHTML"; }
        out.bodyChars = b.innerText.trim().length;
      }
      return out;
    }

    case "commentBox": { // {text?, clear?} state + submit button of the main comment editor on a post page
      const ed = commentEditor(); if (!ed) return { found: false };
      if (a.clear) { ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); document.execCommand("delete"); }
      const sb = commentSubmit(ed);
      return { found: true, text: ed.innerText.trim(), label: ed.getAttribute("aria-label"), submit: sb ? { text: sb.textContent.trim(), disabled: !!sb.disabled } : null };
    }

    case "contentAnalytics": { // /analytics/creator/content/: numbers sit next to their labels
      const L = $$("main p, main span, main label").filter((e) => e.childElementCount === 0).map((e) => e.textContent.trim()).filter(Boolean);
      const before = (label) => { const i = L.indexOf(label); return i > 0 ? L[i - 1] : null; };
      const after = (label) => { const i = L.indexOf(label); return i >= 0 ? L[i + 1] : null; };
      const n = (v) => (v == null ? null : Number(String(v).replace(/[,%]/g, "")) || (v === "0" ? 0 : v));
      return { range: L.find((t) => /^\d+ days$/.test(t)) || null, impressions: n(before("Impressions")),
        impressions_change: L[L.indexOf("vs. prior 7 days") - 1] || null, social_engagements: n(before("Social engagements")),
        reactions: n(after("Reactions")), comments: n(after("Comments")), reposts: n(after("Reposts")), saves: n(after("Saves")),
        sends: n(after("Sends on LinkedIn")), link_engagements: n(before("Link engagements")) };
    }

    case "articleDrafts": // /article/manage/drafts/ modal: [{id, title, modified}]
      return $$("[role=dialog] li").map((li) => { const a0 = $("a[href*='/article/edit/']", li); if (!a0) return null;
        return { id: (a0.getAttribute("href").match(/edit\/(\d+)/) || [])[1], title: a0.textContent.trim(), modified: ($$("div", li).find((d) => /Last modified/.test(d.textContent) && !d.childElementCount) || {}).textContent?.trim() || null }; }).filter(Boolean);

    case "myArticles":
      return $$("main a[href*='/pulse/']").map((x) => ({ url: x.href.split("?")[0], title: ($("p", x) || x).innerText.trim(),
        has_cover: !!$("img", x) })).filter((x, i, all) => all.findIndex((y) => y.url === x.url) === i);

    case "submitComment": {
      const b = commentSubmit(commentEditor());
      if (!b) throw new Error("comment submit button not found"); if (b.disabled) return { clicked: false };
      click(b); return { clicked: true };
    }

    case "commentsByMe": { // texts of comments by the given profile url on this page
      const norm = (u) => u.split("?")[0].replace(/\/$/, "");
      const items = [...$$(S.commentItem), ...$$("article").filter((x) => $("[id^='translation-container']", x))];
      return items.filter((c) => $$("a", c).some((x) => norm(x.href) === norm(a.profile)))
        .map((c) => ({ id: (c.id || c.getAttribute("data-id") || "").replace("replaceableComment_", ""), text: txt($("[id^='translatable-commentary-'], [id^='translation-container']", c) || c) }));
    }

    case "me": { const x = $$("a[href*='/in/']").find((e) => /\/in\/[^/]+\/?$/.test(e.href) && e.closest("#shareboxProfilePictureComponentRef, [aria-label=Sidebar], header")); return { profile: x ? x.href.split("?")[0] : null }; }

    case "openComposer": {
      const b = $(S.startPost); if (!b) throw new Error("'Start a post' not found");
      click(b.closest("[role=button]") || b); return { ok: true };
    }
  }
  throw new Error("unknown op " + op);
  }
}
