import assert from "node:assert/strict";
import { markdownToDoc, docToMarkdown } from "../extension/lib/substack-doc.js";
const md = `# Title

Hello **bold** and *em* with [link](https://x.y) and \`code\`.
Second line same para.

![a cat](https://example.com/cat.png)

- one
- two
  - nested
1. first
2. second

> quoted **text**

---

\`\`\`js
const a = 1;
\`\`\``;
const doc = markdownToDoc(md);
const types = doc.content.map((n) => n.type);
assert.deepEqual(types, ["heading", "paragraph", "captionedImage", "bullet_list", "ordered_list", "blockquote", "horizontal_rule", "code_block"]);
assert.equal(doc.content[1].content[1].marks[0].type, "strong");
assert.equal(doc.content[1].content.find((n) => n.marks?.[0]?.type === "link").marks[0].attrs.href, "https://x.y");
assert.equal(doc.content[2].content[0].attrs.src, "https://example.com/cat.png");
assert.equal(doc.content[3].content[1].content[1].type, "bullet_list");
const back = docToMarkdown(doc);
assert.deepEqual(markdownToDoc(back), doc, "roundtrip md->doc->md->doc stable");
console.log("doc tests OK\n" + back);
