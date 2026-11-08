// node scripts/gen-tools-doc.mjs  -> docs/TOOLS.md (generated from worker/src/tools.ts; do not edit by hand)
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
const out = join(mkdtempSync(join(tmpdir(), "tp-")), "tools.mjs");
execFileSync("npx", ["--yes", "esbuild", "worker/src/tools.ts", "--format=esm", "--outfile=" + out], { stdio: "ignore" });
const { TOOLS, scopeOf } = await import(out);
const site = (n) => (n.split("_")[0] in { chatgpt: 1, gemini: 1, substack: 1, linkedin: 1, tiktok: 1, viblo: 1, devto: 1, crosspost: 1 } ? n.split("_")[0] : /^(dev|debug|ext|selectors)/.test(n) || /_dev_/.test(n) ? "dev" : "general");
const order = ["general", "chatgpt", "gemini", "substack", "linkedin", "tiktok", "viblo", "devto", "crosspost", "dev"];
const titles = { general: "General", chatgpt: "ChatGPT", gemini: "Gemini", viblo: "Viblo", devto: "dev.to", substack: "Substack", linkedin: "LinkedIn", tiktok: "TikTok", crosspost: "Workflows", dev: "Developer (hidden unless enabled)" };
let md = "# Tools\n\n_Generated from `worker/src/tools.ts` by `node scripts/gen-tools-doc.mjs`._\n\nScopes: **read** = no side effects · **draft** = private changes (drafts, your ChatGPT, tabs) · **publish** = public / irreversible · **dev** = debugging.\nEvery tool also accepts `async: true` (returns a `job_id`; poll `job_status`).\n";
for (const g of order) {
  const ts = TOOLS.filter((t) => site(t.name) === g); if (!ts.length) continue;
  md += `\n## ${titles[g]}\n\n| tool | scope | what it does | arguments |\n|---|---|---|---|\n`;
  for (const t of ts) {
    const props = Object.entries(t.inputSchema.properties || {}).filter(([k]) => k !== "async");
    const req = new Set(t.inputSchema.required || []);
    const args = props.map(([k]) => (req.has(k) ? `**${k}**` : k)).join(", ") || "—";
    md += `| \`${t.name}\` | ${scopeOf(t.name)} | ${t.description.replace(/\|/g, "\\|")} | ${args} |\n`;
  }
}
md += "\n**Bold** argument = required. `file` arguments: `{name, mime, text | base64 | file_id | url}` — use `file_id` (from `./tp-put`) for anything over ~700 KB.\n";
writeFileSync("docs/TOOLS.md", md);
console.log("docs/TOOLS.md:", TOOLS.length, "tools");
