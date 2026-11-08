// Tool catalogue exposed over MCP / RPC. Execution happens in the Chrome extension (extension/background.js).
type Schema = Record<string, unknown>;
export interface Tool { name: string; description: string; inputSchema: Schema; timeoutMs?: number }

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const bool = (description: string) => ({ type: "boolean", description });
const obj = (properties: Record<string, unknown>, required: string[] = []): Schema =>
  ({ type: "object", properties, required, additionalProperties: false });

const file = {
  type: "object",
  description: "File to attach/upload. Give exactly one of text | base64 (small, <700 KB) | file_id (any size: PUT the bytes to <relay>/files first) | url.",
  properties: { name: str("file name incl. extension"), mime: str("MIME type, e.g. text/markdown"),
    text: str("UTF-8 contents"), base64: str("base64 contents"), url: str("URL the extension downloads"),
    file_id: str("id from PUT <relay>/files?name=&mime= (Bearer token); large files: POST /files/mpu multipart") },
  required: ["name"],
};
const files = { type: "array", items: file };
const pub = str("Publication host, e.g. yourname.substack.com or custom domain. Omit = default set in extension options.");
const body = {
  body_markdown: str("Post body as Markdown (headings, **bold**, *em*, `code`, [links](u), lists, > quotes, ---, ```code```, ![alt](imageUrl)). Non-Substack image URLs / data: URIs are uploaded to Substack automatically."),
  body_doc: { type: "object", description: "Raw Substack ProseMirror doc ({type:'doc',content:[...]}); overrides body_markdown." },
};

export const TOOLS: Tool[] = [
  { name: "status", description: "Is the Chrome extension connected? Returns extension info + open controlled tabs.",
    inputSchema: obj({}), timeoutMs: 10_000 },
  { name: "health_check", description: "Read-only probe of each site (logged in? selectors still valid?). Run before a session or when a tool fails. Returns per-site checks with timings.",
    inputSchema: obj({ sites: { type: "array", items: { type: "string" }, description: "subset of chatgpt, gemini, substack, linkedin, tiktok, viblo (default all)" }, publication: pub }), timeoutMs: 290_000 },
  { name: "cleanup", description: "Close all idle automated (tab-pilot group) tabs now.", inputSchema: obj({}), timeoutMs: 20_000 },
  { name: "close_tabs", description: "Close specific ChatGPT/Substack tabs by id (from status). Never closes the active tab.",
    inputSchema: obj({ ids: { type: "array", items: { type: "integer" } } }, ["ids"]), timeoutMs: 20_000 },
  { name: "dev_outline", description: "DEV: DOM outline (tags, aria/data attrs, short text) of a selector on a linkedin/chatgpt/substack URL (opened in an owned tab).",
    inputSchema: obj({ url: str("page URL"), selector: str("CSS selector, default body"), depth: int("default 6"), max: int("max lines, default 300") }, ["url"]), timeoutMs: 90_000 },
  { name: "dev_html", description: "DEV: trimmed outerHTML of the Nth match of a selector (index -1 = last), lifted `up` ancestors.",
    inputSchema: obj({ url: str("page URL"), navigate: bool("default true"), selector: str("CSS selector"), index: int("default -1"), up: int("ancestors to lift"), max: int("chars") }, ["url", "selector"]), timeoutMs: 60_000 },
  { name: "dev_click", description: "DEV: click the Nth element matching a selector (optionally containing text) in an owned tab (navigate default false).", inputSchema: obj({ url: str("page URL"), navigate: bool("default false"), selector: str("CSS selector"), text: str("text/aria-label filter"), index: int("default 0") }, ["url", "selector"]), timeoutMs: 60_000 },
  { name: "dev_resources", description: "DEV: API URLs the page has fetched (performance entries).", inputSchema: obj({ url: str("page URL"), filter: str("substring, default /api/") }, ["url"]), timeoutMs: 90_000 },
  // ---- Gemini (gemini.google.com in your Chrome; DOM only; one tab per job) ----
  { name: "gemini_chat", description: "Send a prompt to Gemini (new chat, or follow-up via chat_url) in its own background tab; waits up to wait_seconds. Returns {status, text, code_blocks, chat_url (from the job's own tab), tab_id, settings}. status=running -> gemini_get_result {tab_id}.",
    inputSchema: obj({ prompt: str("prompt text"), chat_url: str("gemini.google.com/app/<id> for a follow-up"), model: str("menu label or part of it, e.g. 'Pro', 'Argon', '3.8 Flash' (default 3.8 Flash)"), thinking: str("Low | Medium | High (default Medium)"), attachments: files, wait_seconds: int("default 90"), dry_run: bool("compose + verify, do not send"), async: bool("run as background job") }, ["prompt"]), timeoutMs: 290_000 },
  { name: "gemini_get_result", description: "Read the latest Gemini reply: tab_id (from gemini_chat, exact tab) or chat_url. Waits up to wait_seconds for completion.", inputSchema: obj({ tab_id: int("tab id from gemini_chat"), chat_url: str("gemini.google.com/app/<id>"), wait_seconds: int("default 60") }), timeoutMs: 290_000 },
  { name: "gemini_dev_op", description: "DEV: run a raw gemini page op on a tab.", inputSchema: obj({ tab_id: int("tab"), op: str("op"), args: { type: "object" }, frames: bool("run under a CDP screencast (frames for hidden tabs)"), patch: bool("install the hidden-tab IntersectionObserver shim first") }, ["tab_id", "op"]), timeoutMs: 120_000 },
  { name: "gemini_read", description: "Read a Gemini conversation (turns + generating state).", inputSchema: obj({ url: str("gemini.google.com/app/<id>"), last_n: int("last N turns"), wait_seconds: int("default 10") }, ["url"]), timeoutMs: 120_000 },
  // ---- dev.to (official API; key stays in the extension) ----
  { name: "devto_setup", description: "Create (once) a dev.to API key via your logged-in session and store it inside the extension only. Returns your username.", inputSchema: obj({}), timeoutMs: 90_000 },
  { name: "devto_me", description: "Your dev.to profile.", inputSchema: obj({}), timeoutMs: 30_000 },
  { name: "devto_my_articles", description: "Your dev.to articles with stats (state: all | published | unpublished).", inputSchema: obj({ state: str("all (default) | published | unpublished"), limit: int("default 30") }), timeoutMs: 30_000 },
  { name: "devto_read_article", description: "Read one of your dev.to articles (incl. drafts) with its Markdown body.", inputSchema: obj({ id: str("article id") }, ["id"]), timeoutMs: 60_000 },
  { name: "devto_create_article", description: "Create a dev.to article as a DRAFT (published=false). Call devto_publish to make it public.", inputSchema: obj({ title: str("title"), body_markdown: str("Markdown body"), tags: { type: "array", items: { type: "string" }, description: "up to 4 tags, lowercase" }, main_image: str("cover image URL (use devto_upload_image)"), description: str("meta description"), series: str("series name"), canonical_url: str("canonical URL") }, ["title", "body_markdown"]), timeoutMs: 90_000 },
  { name: "devto_update_article", description: "Update your dev.to article. Editing a PUBLISHED article changes it live (needs Allow publishing).", inputSchema: obj({ id: str("article id"), title: str("title"), body_markdown: str("Markdown body (replaces)"), tags: { type: "array", items: { type: "string" } }, main_image: str("cover URL"), description: str("meta description"), series: str("series"), canonical_url: str("canonical URL") }, ["id"]), timeoutMs: 90_000 },
  { name: "devto_schedule", description: "SCHEDULE your dev.to draft with dev.to native scheduling (published_at in the future). Verifies the API stores published_at on the draft before setting published. Requires confirm=true.", inputSchema: obj({ id: str("article id"), publish_at: str("ISO 8601 time, e.g. 2026-10-28T14:00:00Z"), confirm: bool("must be true") }, ["id", "publish_at", "confirm"]), timeoutMs: 90_000 },
  { name: "devto_comment", description: "POST a public comment on a dev.to article (optionally a reply via parent_id). Requires confirm=true.", inputSchema: obj({ article_id: str("article id (numeric)"), body_markdown: str("comment markdown"), parent_id: str("parent comment id for a reply"), confirm: bool("must be true") }, ["article_id", "body_markdown", "confirm"]), timeoutMs: 90_000 },
  { name: "devto_update_profile", description: "Update your public dev.to profile bio (summary, max 200) and/or website_url. Requires confirm=true.", inputSchema: obj({ summary: str("bio"), website_url: str("website URL"), confirm: bool("must be true") }, ["confirm"]), timeoutMs: 90_000 },
  { name: "devto_delete_comment", description: "DELETE one of your own dev.to comments by id_code. Requires confirm=true.", inputSchema: obj({ id_code: str("comment id_code, e.g. 3iohe"), confirm: bool("must be true") }, ["id_code", "confirm"]), timeoutMs: 90_000 },
  { name: "devto_publish", description: "PUBLISH your dev.to draft (public). Requires confirm=true.", inputSchema: obj({ id: str("article id"), confirm: bool("must be true") }, ["id", "confirm"]), timeoutMs: 90_000 },
  { name: "devto_upload_image", description: "Upload an image to dev.to's own image host (via your session); returns url + Markdown.", inputSchema: obj({ url: str("image URL"), base64: str("base64 image"), file_id: str("relay file id"), mime: str("image/png etc."), name: str("file name"), alt: str("alt text") }), timeoutMs: 120_000 },
  { name: "devto_dev_get", description: "DEV: GET a dev.to path with the page session (HTML trimmed; grep filters lines).", inputSchema: obj({ path: str("/settings/extensions"), grep: str("substring filter for HTML lines") }, ["path"]), timeoutMs: 60_000 },
  { name: "chatgpt_dev_op", description: "DEV: run a raw chatgpt page op in its own tab.", inputSchema: obj({ url: str("page, default https://chatgpt.com/"), op: str("op"), args: { type: "object" } }, ["op"]), timeoutMs: 120_000 },
  { name: "linkedin_dev_op", description: "DEV: run a raw linkedin page op.", inputSchema: obj({ url: str("page"), navigate: bool("default true"), op: str("op"), world: str("ISOLATED|MAIN"), args: { type: "object" } }, ["op"]), timeoutMs: 60_000 },
  { name: "linkedin_dev_arm", description: "DEV: arm next file-input click on a linkedin page with files.", inputSchema: obj({ url: str("page"), files }, ["files"]), timeoutMs: 60_000 },
  { name: "dev_stage_check", description: "DEV: stage a file into a tab via the extension and return size + sha256 computed in the page.", inputSchema: obj({ file }, ["file"]), timeoutMs: 290_000 },
  { name: "tiktok_dev_type", description: "DEV: trusted (CDP) clear+type into tiktok caption.", inputSchema: obj({ url: str("page"), text: str("text") }, ["url", "text"]), timeoutMs: 60_000 },
  { name: "tiktok_dev_op", description: "DEV: run a raw tiktok page op.", inputSchema: obj({ url: str("page"), navigate: bool("default true"), op: str("op"), world: str("ISOLATED|MAIN"), args: { type: "object" } }, ["op"]), timeoutMs: 120_000 },
  { name: "viblo_dev_get", description: "DEV: GET a viblo.asia path with the page session.", inputSchema: obj({ path: str("/api/...") }, ["path"]), timeoutMs: 60_000 },
  { name: "substack_dev_get", description: "DEV: GET a publication API path (/api/v1/...) with the page session.", inputSchema: obj({ publication: pub, path: str("/api/v1/...") }, ["path"]), timeoutMs: 60_000 },
  { name: "debug_trace", description: "DEV: step trace of the most recent tool call.", inputSchema: obj({}), timeoutMs: 10_000 },
  { name: "selectors_get", description: "Show site selectors (defaults + local overrides). Use when a site UI change breaks a tool.",
    inputSchema: obj({ site: str("chatgpt | linkedin | tiktok") }), timeoutMs: 10_000 },
  { name: "selectors_set", description: "Hot-fix one site selector in this extension without a code update (value omitted/null = remove override).",
    inputSchema: obj({ site: str("chatgpt | linkedin | tiktok"), key: str("selector key from selectors_get"), value: str("CSS selector") }, ["site", "key"]), timeoutMs: 10_000 },
  { name: "job_status", description: "Result of a background job (started with async:true). Waits up to wait_seconds for it to finish.",
    inputSchema: obj({ job_id: str("job id"), wait_seconds: int("default 0, max 280") }, ["job_id"]), timeoutMs: 290_000 },
  { name: "jobs_list", description: "Recent background jobs (id, tool, state, started, finished).", inputSchema: obj({}), timeoutMs: 10_000 },
  { name: "audit_log", description: "Recent write actions through this relay (who/token label, tool, args summary, ok, result summary).",
    inputSchema: obj({ limit: int("default 30, max 200"), tool: str("filter by tool name") }), timeoutMs: 10_000 },
  { name: "ext_reload", description: "Reload the extension from disk (dev).", inputSchema: obj({}), timeoutMs: 10_000 },

  // ---- ChatGPT (DOM only, focus-free) ----
  { name: "chatgpt_chat",
    description: "Send a prompt to ChatGPT in its own background tab (one tab per call, so concurrent jobs never collide). New chat by default (in project_url if given) or continue chat_url. Waits up to wait_seconds; if still generating returns status=running + chat_url -> call chatgpt_get_result.",
    inputSchema: obj({
      prompt: str("message text"),
      project_url: str("https://chatgpt.com/g/g-p-.../project — start the new chat inside this project"),
      chat_url: str("https://chatgpt.com/c/... — continue this conversation"),
      attachments: files,
      model: str("model row label to select, e.g. GPT-6 (omit = keep current)"),
      effort: str("Instant | Medium | High (omit = keep current)"),
      mode: str("chat | work — enforce the composer mode before sending (omit = keep current)"),
      dry_run: bool("set mode/model, compose prompt + attachments, verify, then clear — nothing is sent"),
      wait_seconds: int("max seconds to wait for the reply, default 90, max 280"),
      images: str("base64 (default) | none — return generated images inline"),
    }, ["prompt"]), timeoutMs: 300_000 },
  { name: "chatgpt_get_result",
    description: "Read the last assistant reply (text, code blocks, generated images) of chat_url (or tab_id returned by chatgpt_chat when no URL was assigned yet). Waits up to wait_seconds for generation to finish.",
    inputSchema: obj({ chat_url: str("conversation URL"), tab_id: int("tab_id from chatgpt_chat"), wait_seconds: int("default 60, max 280"),
      images: str("base64 (default) | none") }), timeoutMs: 300_000 },
  { name: "chatgpt_read",
    description: "Read an existing ChatGPT conversation (chatgpt.com/c/..., /share/..., or project /g/.../c/... link): every turn with role, text, code blocks, images. Opens it in its own background tab.",
    inputSchema: obj({ url: str("conversation or share link"), last_n: int("only the last N turns"),
      images: str("none (default) | base64 — inline images"), debug: bool("include raw img list") }, ["url"]), timeoutMs: 200_000 },
  { name: "chatgpt_create_project",
    description: "Create a ChatGPT project, optionally set its instructions and upload source files. Returns project_url.",
    inputSchema: obj({ name: str("project name"), instructions: str("project instructions"), files }, ["name"]),
    timeoutMs: 240_000 },
  { name: "chatgpt_update_project",
    description: "Replace instructions and/or add source files of an existing ChatGPT project.",
    inputSchema: obj({ project_url: str("https://chatgpt.com/g/g-p-.../project"), instructions: str("new instructions (replaces)"), files },
      ["project_url"]), timeoutMs: 240_000 },

  // ---- LinkedIn (DOM, human pacing) ----
  { name: "linkedin_read_feed", description: "Read posts from the LinkedIn home feed (author, text, urn, permalink).",
    inputSchema: obj({ limit: int("posts to return, default 10, max 40") }), timeoutMs: 120_000 },
  { name: "linkedin_search", description: "Search LinkedIn: posts (default), people, companies, jobs or all. Returns posts (author/text/url) or entities (name/url/headline lines).",
    inputSchema: obj({ query: str("keywords"), type: str("posts | people | companies | jobs | all"), limit: int("default 10, max 30") }, ["query"]), timeoutMs: 120_000 },
  { name: "linkedin_article_drafts", description: "List your unpublished LinkedIn article drafts (id, title, edit_url). Deleting drafts is manual in the LinkedIn UI.",
    inputSchema: obj({}), timeoutMs: 90_000 },
  { name: "linkedin_stats", description: "Your LinkedIn creator analytics (last 7 days): impressions (+change), engagements, reactions, comments, reposts, saves, link clicks.",
    inputSchema: obj({}), timeoutMs: 90_000 },
  { name: "linkedin_my_posts", description: "Your most recent LinkedIn posts (permalinks) from your activity page.",
    inputSchema: obj({ limit: int("default 5") }), timeoutMs: 90_000 },
  { name: "linkedin_post", description: "Publish a LinkedIn feed post (public), optionally with images/video (files). dry_run=true fills + verifies then discards.",
    inputSchema: obj({ text: str("post text (line breaks kept)"), files, dry_run: bool("verify without posting") }, ["text"]), timeoutMs: 240_000 },
  { name: "linkedin_post_article", description: "Write and publish a LinkedIn article: title, Markdown body (headings/bold/lists/quotes), optional cover image file, optional share text for the feed post. publish=false leaves a saved draft.",
    inputSchema: obj({ title: str("article title"), body_markdown: str("article body (no title line)"), cover: file, share_text: str("text of the feed post announcing the article"),
      publish: bool("default true"), draft_url: str("publish this existing filled draft instead (/article/edit/<id>/); title/body ignored") }, []), timeoutMs: 290_000 },
  { name: "linkedin_comment", description: "Comment on a LinkedIn post (permalink /feed/update/urn:li:...). Verifies the comment appears.",
    inputSchema: obj({ post_url: str("post permalink"), text: str("comment text") }, ["post_url", "text"]), timeoutMs: 120_000 },

  // ---- TikTok (TikTok Studio, DOM) ----
  { name: "tiktok_upload", description: "Upload a video to TikTok with a caption (hashtags inline) and post it publicly. Large files must be given by url (the extension downloads it; e.g. a temporary http://127.0.0.1 server). dry_run=true stops before Post.",
    inputSchema: obj({ file, caption: str("caption incl. #hashtags"), dry_run: bool("stop before posting") }, ["file", "caption"]), timeoutMs: 295_000 },

  { name: "tiktok_stats", description: "Per-video stats from TikTok Studio (title, status, visibility, views, likes, comments).",
    inputSchema: obj({ limit: int("default 20") }), timeoutMs: 90_000 },

  // ---- workflows ----
  { name: "crosspost_prepare", description: "Cross-post an essay, step 1 (drafts only, nothing public): Substack draft (or reuse substack_draft_id) + ChatGPT writes a short LinkedIn article, announcement and link comment + LinkedIn article draft. Returns a package id and review links. Takes several minutes: use async:true.",
    inputSchema: obj({ title: str("essay title"), subtitle: str("essay subtitle"), essay_markdown: str("essay body (Markdown)"), substack_draft_id: int("reuse an existing Substack draft instead"),
      publication: pub, cover: file, cover_url: str("Substack cover image URL"), chatgpt_chat_url: str("continue this chat (keeps context/voice)"), chatgpt_project_url: str("or start in this project"),
      chatgpt_instructions: str("extra guidance for the rewrite"), linkedin_words: str("length, default 500-700") }), timeoutMs: 290_000 },
  { name: "crosspost_publish", description: "Cross-post step 2 (PUBLIC): publish the Substack post, publish the LinkedIn article with its announcement, then comment the Substack link under it. Resumable: re-run with the same id to finish remaining steps.",
    inputSchema: obj({ id: str("package id from crosspost_prepare"), send_email: bool("email Substack subscribers (default false)") }, ["id"]), timeoutMs: 290_000 },

  { name: "tiktok_video_stats", description: "Per-video analytics from TikTok Studio: views, total/average watch time, completion, new followers, counters.",
    inputSchema: obj({ video_id: str("TikTok video id (from tiktok_stats)") }, ["video_id"]), timeoutMs: 90_000 },
  { name: "tiktok_comments", description: "Recent comments on your videos (TikTok Studio > Comments).",
    inputSchema: obj({ limit: int("default 30") }), timeoutMs: 90_000 },

  // ---- Substack (page-session JSON API) ----
  { name: "substack_list_posts", description: "List posts of a publication.",
    inputSchema: obj({ publication: pub, type: str("drafts (default) | published | scheduled"),
      limit: int("default 25"), offset: int("default 0") }) },
  { name: "substack_get_post", description: "Get one post/draft incl. body as Markdown + raw doc.",
    inputSchema: obj({ publication: pub, id: int("post id") }, ["id"]) },
  { name: "substack_create_draft", description: "Create a new draft post. Returns id + editor URL.",
    inputSchema: obj({ publication: pub, title: str("title"), subtitle: str("subtitle"), ...body,
      audience: str("everyone (default) | only_paid | founding | only_free"),
      cover_image: str("cover image URL (uploaded to Substack if external)"),
      section_id: int("section id") }, ["title"]), timeoutMs: 180_000 },
  { name: "substack_update_draft",
    description: "Update title/subtitle/body/audience of a draft (or the draft copy of a published post — call substack_publish afterwards to push changes live).",
    inputSchema: obj({ publication: pub, id: int("post id"), title: str("title"), subtitle: str("subtitle"), ...body,
      audience: str("everyone | only_paid | founding | only_free"), cover_image: str("cover image URL") }, ["id"]),
    timeoutMs: 180_000 },
  { name: "substack_render_check", description: "Open a draft in Substack's editor (background tab) and report what renders: headings, images loaded, lists, quotes, chars.",
    inputSchema: obj({ publication: pub, id: int("post id") }, ["id"]), timeoutMs: 90_000 },
  { name: "substack_delete_draft", description: "Delete an UNPUBLISHED Substack draft (refuses published posts).",
    inputSchema: obj({ publication: pub, id: int("draft id") }, ["id"]), timeoutMs: 60_000 },
  { name: "substack_stats", description: "Publication dashboard summary (subscribers, views, opens… as Substack's dashboard reports) + recent posts with their numbers.",
    inputSchema: obj({ publication: pub, range_days: int("default 30"), posts: int("recent posts, default 10"), all_numbers: bool("every numeric field Substack returns") }), timeoutMs: 90_000 },
  { name: "substack_note", description: "PUBLIC: post a Substack Note (short feed post) from Markdown text, optional image.",
    inputSchema: obj({ text_markdown: str("note text (Markdown inline marks ok)"), image_url: str("optional image URL"), publication: pub }, ["text_markdown"]), timeoutMs: 90_000 },
  { name: "substack_upload_image", description: "Upload an image to Substack's CDN; returns its URL for use in posts.",
    inputSchema: obj({ publication: pub, url: str("image URL to fetch"), base64: str("base64 image"), mime: str("image/png etc. (with base64)") }),
    timeoutMs: 120_000 },
  { name: "viblo_read_post", description: "Read a Viblo post (title, Markdown contents, tags, stats) and its comments.",
    inputSchema: obj({ id: str("post id (hash, e.g. bNVQGpQbJvR) or its viblo.asia URL"), url: str("post URL (alternative to id)"), comments: bool("include comments (default true)"), limit: int("max comments, default 100") }), timeoutMs: 60_000 },
  { name: "viblo_my_posts", description: "List your Viblo posts: published + drafts.", inputSchema: obj({ page: int("page, default 1") }), timeoutMs: 60_000 },
  { name: "viblo_create_post", description: "Create a Viblo post as a DRAFT (not public). Call viblo_publish to make it public.",
    inputSchema: obj({ title: str("title"), contents_markdown: str("body in Markdown (Viblo renders Markdown natively)"), tags: { type: "array", items: { type: "string" }, description: "up to 5 tags (needed to publish)" },
      visibility: str("draft (only you, default) | draft_public (anyone with the link)"), locale: str("vi (default) | en | ja") }, ["title", "contents_markdown"]), timeoutMs: 90_000 },
  { name: "viblo_update_post", description: "Update title/contents/tags of your Viblo post. Editing a PUBLIC post changes it live (needs Allow publishing).",
    inputSchema: obj({ id: str("post id (hash, e.g. bNVQGpQbJvR) or its viblo.asia URL"), url: str("post URL"), title: str("new title"), contents_markdown: str("new Markdown body (replaces)"), tags: { type: "array", items: { type: "string" } } }), timeoutMs: 90_000 },
  { name: "viblo_schedule", description: "SCHEDULE your Viblo draft natively (editor's schedule): publish_at local 'YYYY-MM-DD HH:mm' in timezone (default Asia/Ho_Chi_Minh). Requires confirm=true.", inputSchema: obj({ id: str("post id or url"), publish_at: str("YYYY-MM-DD HH:mm"), timezone: str("IANA tz, default Asia/Ho_Chi_Minh"), share_summary: str("optional social share summary"), confirm: bool("must be true") }, ["id", "publish_at", "confirm"]), timeoutMs: 90_000 },
  { name: "viblo_publish", description: "PUBLISH your Viblo draft (public, shows in feeds). Requires confirm=true and at least one tag.",
    inputSchema: obj({ id: str("post id (hash, e.g. bNVQGpQbJvR) or its viblo.asia URL"), url: str("post URL"), share_summary: str("optional social-share summary"), confirm: bool("must be true") }, ["confirm"]), timeoutMs: 90_000 },
  { name: "viblo_delete_post", description: "Delete your Viblo post (draft, or public with Allow publishing). Irreversible. Requires confirm=true.",
    inputSchema: obj({ id: str("post id (hash, e.g. bNVQGpQbJvR) or its viblo.asia URL"), url: str("post URL"), confirm: bool("must be true") }, ["confirm"]), timeoutMs: 60_000 },
  { name: "viblo_comment", description: "PUBLIC: comment on a Viblo post (Markdown), optionally as a reply. Verifies the comment is listed.",
    inputSchema: obj({ id: str("post id (hash, e.g. bNVQGpQbJvR) or its viblo.asia URL"), url: str("post URL"), text: str("comment, Markdown"), reply_to: str("comment hash_id or id to reply to") }, ["text"]), timeoutMs: 60_000 },
  { name: "viblo_scout", description: "Find top-performing Viblo posts: general (feed), by niche (tag), or by keyword (query, supports title:/body:/tag:/user: syntax). Ranks by views/points/clips/comments, optional time window; returns posts + top tags/authors summary.",
    inputSchema: obj({ query: str("keywords, e.g. 'claude code' or 'title:docker'"), tag: str("niche tag name or slug, e.g. docker, ai, claude-code (see viblo_tags)"), feed: str("trending | editors-choice | newest (when no query/tag)"),
      sort: str("views (default) | points | clips | comments | relevance"), since_days: int("only posts published in the last N days (ranked locally)"),
      limit: int("posts to return, default 20"), max_pages: int("pages to scan (20-50 posts each), default 3, or 10 with since_days; max 25") }), timeoutMs: 180_000 },
  { name: "viblo_tags", description: "Viblo niches: list tags by followers or post count, or (with tag) that tag's all-time top posts ranked by Viblo.",
    inputSchema: obj({ tag: str("tag slug, e.g. docker"), sort: str("tag list: followers (default) | posts · with tag: views (default) | points | clips | newest"),
      page: int("tag list page (20/page)"), max_pages: int("with tag: pages of posts, default 1") }), timeoutMs: 120_000 },
  { name: "viblo_upload_image", description: "Upload an image (png/jpeg/gif, max 6 MB) to Viblo's CDN; returns url + Markdown to paste into a post.",
    inputSchema: obj({ url: str("image URL"), base64: str("base64 image"), file_id: str("relay file id (tp-put)"), mime: str("image/png etc."), name: str("file name"), alt: str("alt text") }), timeoutMs: 120_000 },
  { name: "viblo_set_cover", description: "Set the cover (feature) image of your Viblo post from an uploaded image URL.",
    inputSchema: obj({ id: str("post id or URL"), url: str("post URL"), image_url: str("image URL (use viblo_upload_image first)") }, ["image_url"]), timeoutMs: 60_000 },
  { name: "viblo_images", description: "List images in your Viblo image library.", inputSchema: obj({ page: int("page") }), timeoutMs: 60_000 },
  { name: "viblo_delete_image", description: "Delete an image from your Viblo image library (it stops loading anywhere it was used).", inputSchema: obj({ id: str("image id from viblo_images") }, ["id"]), timeoutMs: 60_000 },
  { name: "substack_publish",
    description: "PUBLISH a draft (or push edits of a published post). send_email=true emails all subscribers — irreversible. Requires confirm=true.",
    inputSchema: obj({ publication: pub, id: int("post id"), send_email: bool("email subscribers (default false)"),
      confirm: bool("must be true") }, ["id", "confirm"]) },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// ---- permissions ----
// read: no side effects · draft: changes only private state (drafts, your ChatGPT, tabs) · publish: public/irreversible · dev: debugging/hot-fix
export type Scope = "read" | "draft" | "publish" | "dev";
const PUBLISH = new Set(["substack_publish", "linkedin_post", "linkedin_post_article", "linkedin_comment", "tiktok_upload", "tiktok_comment_reply", "substack_note", "crosspost_publish", "viblo_publish", "viblo_schedule", "viblo_comment", "devto_publish", "devto_schedule", "devto_comment", "devto_update_profile", "devto_delete_comment"]);
const DRAFT = new Set(["substack_delete_draft", "substack_create_draft", "substack_update_draft", "substack_upload_image", "chatgpt_chat", "chatgpt_create_project",
  "chatgpt_update_project", "gemini_chat", "viblo_create_post", "viblo_update_post", "viblo_delete_post", "viblo_upload_image", "viblo_set_cover", "viblo_delete_image", "devto_setup", "devto_create_article", "devto_update_article", "devto_upload_image", "cleanup", "close_tabs", "crosspost_prepare"]);
export function scopeOf(name: string): Scope {
  if (/^dev_|_dev_|^debug_|^ext_reload$|^selectors_set$/.test(name)) return "dev";
  if (PUBLISH.has(name)) return "publish";
  if (DRAFT.has(name)) return "draft";
  return "read";
}
// every tool accepts async:true -> returns {job_id} immediately; poll job_status
for (const t of TOOLS) (t.inputSchema.properties as Record<string, unknown>).async =
  { type: "boolean", description: "Run in background: returns {job_id} at once; then call job_status." };
