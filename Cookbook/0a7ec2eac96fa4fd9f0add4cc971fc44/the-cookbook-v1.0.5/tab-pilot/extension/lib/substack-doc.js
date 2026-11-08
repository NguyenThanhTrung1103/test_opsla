// Markdown <-> Substack ProseMirror doc. Covers what agents write: headings, paragraphs, inline marks,
// flat/nested lists, blockquotes, hr, fenced code, images (standalone line).

const IMG_ATTRS = { srcNoWatermark: null, fullscreen: null, imageSize: null, height: null, width: null, resizeWidth: null,
  bytes: null, title: null, type: null, href: null, belowTheFold: false, topImage: false, internalRedirect: null,
  isProcessing: false, align: null, offset: false };

export const imageNode = (src, alt = null) =>
  ({ type: "captionedImage", content: [{ type: "image2", attrs: { src, alt, ...IMG_ATTRS } }] });

// ---- inline ----
const INLINE = [
  [/^`([^`]+)`/, (m) => [{ type: "text", text: m[1], marks: [{ type: "code" }] }]],
  [/^\*\*([\s\S]+?)\*\*/, (m) => mark(m[1], { type: "strong" })],
  [/^__([\s\S]+?)__/, (m) => mark(m[1], { type: "strong" })],
  [/^~~([\s\S]+?)~~/, (m) => mark(m[1], { type: "strikethrough" })],
  [/^\*([^*\s][\s\S]*?)\*/, (m) => mark(m[1], { type: "em" })],
  [/^_([^_\s][\s\S]*?)_(?![A-Za-z0-9])/, (m) => mark(m[1], { type: "em" })],
  [/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/, (m) => mark(m[1], { type: "link", attrs: { href: m[2] } })],
  [/^<(https?:\/\/[^>\s]+)>/, (m) => [{ type: "text", text: m[1], marks: [{ type: "link", attrs: { href: m[1] } }] }]],
];
function mark(src, mk) {
  return inline(src).map((n) => (n.type === "text" ? { ...n, marks: [...(n.marks || []), mk] } : n));
}
export function inline(src) {
  const out = []; let buf = "";
  const flush = () => { if (buf) out.push({ type: "text", text: buf }); buf = ""; };
  for (let i = 0; i < src.length;) {
    if (src[i] === "\\" && i + 1 < src.length) { buf += src[i + 1]; i += 2; continue; }
    if (src[i] === "\n") { flush(); out.push({ type: "hard_break" }); i++; continue; }
    let hit = null;
    for (const [re, fn] of INLINE) { const m = re.exec(src.slice(i)); if (m) { hit = [m, fn]; break; } }
    if (hit) { flush(); out.push(...hit[1](hit[0])); i += hit[0][0].length; } else buf += src[i++];
  }
  flush();
  return out;
}
const para = (text) => { const c = inline(text.trim()); return c.length ? { type: "paragraph", content: c } : { type: "paragraph" }; };

// ---- blocks ----
const RE_LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RE_IMG = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;

export function markdownToDoc(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  return { type: "doc", content: blocks(lines) };
}

function blocks(lines) {
  const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^```(\S*)/.exec(l))) {
      const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push({ type: "code_block", attrs: { language: m[1] || null }, content: code.length ? [{ type: "text", text: code.join("\n") }] : [] });
    } else if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      out.push({ type: "heading", attrs: { level: m[1].length }, content: inline(m[2].replace(/\s#+\s*$/, "")) }); i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      out.push({ type: "horizontal_rule" }); i++;
    } else if ((m = RE_IMG.exec(l.trim()))) {
      out.push(imageNode(m[2], m[1] || null)); i++;
    } else if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ type: "blockquote", content: blocks(q) });
    } else if (RE_LIST.test(l)) {
      const [node, next] = list(lines, i); out.push(node); i = next;
    } else {
      const p = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|\s*>)/.test(lines[i]) && !RE_LIST.test(lines[i]) && !RE_IMG.test(lines[i].trim())) p.push(lines[i++]);
      out.push(para(p.join("\n").replace(/ {2,}\n/g, "\n").replace(/(?<!\n)\n(?!\n)/g, " ")));
    }
  }
  return out;
}

function list(lines, i) {
  const first = RE_LIST.exec(lines[i]); const indent = first[1].length; const ordered = /\d/.test(first[2]);
  const node = ordered ? { type: "ordered_list", attrs: { start: parseInt(first[2], 10) || 1 }, content: [] } : { type: "bullet_list", content: [] };
  while (i < lines.length) {
    const m = RE_LIST.exec(lines[i]);
    if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
    const body = [m[3]]; i++;
    while (i < lines.length && lines[i].trim() && !RE_LIST.test(lines[i]) && /^\s+/.test(lines[i])) body.push(lines[i++].trim());
    const item = { type: "list_item", content: [para(body.join(" "))] };
    if (i < lines.length && RE_LIST.test(lines[i]) && RE_LIST.exec(lines[i])[1].length > indent) {
      const [sub, next] = list(lines, i); item.content.push(sub); i = next;
    }
    node.content.push(item);
    if (i < lines.length && !lines[i].trim() && i + 1 < lines.length && (RE_LIST.exec(lines[i + 1]) || [])[1]?.length === indent) i++;
  }
  return [node, i];
}

// walk all image2 nodes (for upload rewriting)
export function images(doc, fn) {
  (function walk(n) { if (n.type === "image2") fn(n); (n.content || []).forEach(walk); })(doc);
}

// ---- doc -> markdown (for get_post, lossy for exotic nodes) ----
export function docToMarkdown(doc) {
  return (doc.content || []).map((n) => blockMd(n, "")).filter((s) => s !== null).join("\n\n");
}
function inlineMd(nodes = []) {
  return nodes.map((n) => {
    if (n.type === "hard_break") return "  \n";
    if (n.type !== "text") return "";
    let t = n.text;
    for (const m of n.marks || []) {
      if (m.type === "code") t = "`" + t + "`";
      else if (m.type === "strong") t = `**${t}**`;
      else if (m.type === "em") t = `*${t}*`;
      else if (m.type === "strikethrough") t = `~~${t}~~`;
      else if (m.type === "link") t = `[${t}](${m.attrs?.href})`;
    }
    return t;
  }).join("");
}
function blockMd(n, ind) {
  switch (n.type) {
    case "paragraph": return ind + inlineMd(n.content);
    case "heading": return "#".repeat(n.attrs?.level || 1) + " " + inlineMd(n.content);
    case "horizontal_rule": return "---";
    case "code_block": return "```" + (n.attrs?.language || "") + "\n" + inlineMd(n.content) + "\n```";
    case "blockquote": return (n.content || []).map((c) => blockMd(c, "")).join("\n\n").split("\n").map((l) => "> " + l).join("\n");
    case "bullet_list": case "ordered_list":
      return (n.content || []).map((li, k) => {
        const bullet = n.type === "ordered_list" ? `${(n.attrs?.start || 1) + k}. ` : "- ";
        return (li.content || []).map((c, j) => j === 0 ? ind + bullet + blockMd(c, "").trimStart() : blockMd(c, ind + "  ")).join("\n");
      }).join("\n");
    case "captionedImage": {
      const img = (n.content || []).find((c) => c.type === "image2");
      const cap = (n.content || []).find((c) => c.type === "caption");
      return img ? `![${img.attrs?.alt || (cap ? inlineMd(cap.content) : "")}](${img.attrs?.src})` : null;
    }
    default: return n.content ? (n.content || []).map((c) => blockMd(c, ind)).join("\n\n") : `<!-- ${n.type} -->`;
  }
}

// ---- doc -> HTML (for pasting rich text into editors such as LinkedIn articles) ----
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function inlineHtml(nodes = []) {
  return nodes.map((n) => {
    if (n.type === "hard_break") return "<br>";
    if (n.type !== "text") return "";
    let t = esc(n.text);
    for (const m of n.marks || []) {
      if (m.type === "code") t = `<code>${t}</code>`;
      else if (m.type === "strong") t = `<strong>${t}</strong>`;
      else if (m.type === "em") t = `<em>${t}</em>`;
      else if (m.type === "strikethrough") t = `<s>${t}</s>`;
      else if (m.type === "link") t = `<a href="${esc(m.attrs?.href || "")}">${t}</a>`;
    }
    return t;
  }).join("");
}
export function docToHtml(doc) {
  const block = (n) => {
    switch (n.type) {
      case "paragraph": return `<p>${inlineHtml(n.content)}</p>`;
      case "heading": return `<h${n.attrs?.level || 2}>${inlineHtml(n.content)}</h${n.attrs?.level || 2}>`;
      case "horizontal_rule": return "<hr>";
      case "code_block": return `<pre><code>${inlineHtml(n.content)}</code></pre>`;
      case "blockquote": return `<blockquote>${(n.content || []).map(block).join("")}</blockquote>`;
      case "bullet_list": return `<ul>${(n.content || []).map(block).join("")}</ul>`;
      case "ordered_list": return `<ol>${(n.content || []).map(block).join("")}</ol>`;
      case "list_item": return `<li>${(n.content || []).map((c) => (c.type === "paragraph" ? inlineHtml(c.content) : block(c))).join("")}</li>`;
      case "captionedImage": { const i = (n.content || []).find((c) => c.type === "image2"); return i ? `<img src="${esc(i.attrs.src)}" alt="${esc(i.attrs.alt || "")}">` : ""; }
      default: return (n.content || []).map(block).join("");
    }
  };
  return (doc.content || []).map(block).join("");
}
