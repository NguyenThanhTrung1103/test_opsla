# Tools

_Generated from `worker/src/tools.ts` by `node scripts/gen-tools-doc.mjs`._

Scopes: **read** = no side effects · **draft** = private changes (drafts, your ChatGPT, tabs) · **publish** = public / irreversible · **dev** = debugging.
Every tool also accepts `async: true` (returns a `job_id`; poll `job_status`).

## General

| tool | scope | what it does | arguments |
|---|---|---|---|
| `status` | read | Is the Chrome extension connected? Returns extension info + open controlled tabs. | — |
| `health_check` | read | Read-only probe of each site (logged in? selectors still valid?). Run before a session or when a tool fails. Returns per-site checks with timings. | sites, publication |
| `cleanup` | draft | Close all idle automated (tab-pilot group) tabs now. | — |
| `close_tabs` | draft | Close specific ChatGPT/Substack tabs by id (from status). Never closes the active tab. | **ids** |
| `job_status` | read | Result of a background job (started with async:true). Waits up to wait_seconds for it to finish. | **job_id**, wait_seconds |
| `jobs_list` | read | Recent background jobs (id, tool, state, started, finished). | — |
| `audit_log` | read | Recent write actions through this relay (who/token label, tool, args summary, ok, result summary). | limit, tool |

## ChatGPT

| tool | scope | what it does | arguments |
|---|---|---|---|
| `chatgpt_dev_op` | dev | DEV: run a raw chatgpt page op in its own tab. | url, **op**, args |
| `chatgpt_chat` | draft | Send a prompt to ChatGPT in its own background tab (one tab per call, so concurrent jobs never collide). New chat by default (in project_url if given) or continue chat_url. Waits up to wait_seconds; if still generating returns status=running + chat_url -> call chatgpt_get_result. | **prompt**, project_url, chat_url, attachments, model, effort, mode, dry_run, wait_seconds, images |
| `chatgpt_get_result` | read | Read the last assistant reply (text, code blocks, generated images) of chat_url (or tab_id returned by chatgpt_chat when no URL was assigned yet). Waits up to wait_seconds for generation to finish. | chat_url, tab_id, wait_seconds, images |
| `chatgpt_read` | read | Read an existing ChatGPT conversation (chatgpt.com/c/..., /share/..., or project /g/.../c/... link): every turn with role, text, code blocks, images. Opens it in its own background tab. | **url**, last_n, images, debug |
| `chatgpt_create_project` | draft | Create a ChatGPT project, optionally set its instructions and upload source files. Returns project_url. | **name**, instructions, files |
| `chatgpt_update_project` | draft | Replace instructions and/or add source files of an existing ChatGPT project. | **project_url**, instructions, files |

## Gemini

| tool | scope | what it does | arguments |
|---|---|---|---|
| `gemini_chat` | draft | Send a prompt to Gemini (new chat, or follow-up via chat_url) in its own background tab; waits up to wait_seconds. Returns {status, text, code_blocks, chat_url (from the job's own tab), tab_id, settings}. status=running -> gemini_get_result {tab_id}. | **prompt**, chat_url, model, thinking, attachments, wait_seconds, dry_run |
| `gemini_get_result` | read | Read the latest Gemini reply: tab_id (from gemini_chat, exact tab) or chat_url. Waits up to wait_seconds for completion. | tab_id, chat_url, wait_seconds |
| `gemini_dev_op` | dev | DEV: run a raw gemini page op on a tab. | **tab_id**, **op**, args, frames, patch |
| `gemini_read` | read | Read a Gemini conversation (turns + generating state). | **url**, last_n, wait_seconds |

## Substack

| tool | scope | what it does | arguments |
|---|---|---|---|
| `substack_dev_get` | dev | DEV: GET a publication API path (/api/v1/...) with the page session. | publication, **path** |
| `substack_list_posts` | read | List posts of a publication. | publication, type, limit, offset |
| `substack_get_post` | read | Get one post/draft incl. body as Markdown + raw doc. | publication, **id** |
| `substack_create_draft` | draft | Create a new draft post. Returns id + editor URL. | publication, **title**, subtitle, body_markdown, body_doc, audience, cover_image, section_id |
| `substack_update_draft` | draft | Update title/subtitle/body/audience of a draft (or the draft copy of a published post — call substack_publish afterwards to push changes live). | publication, **id**, title, subtitle, body_markdown, body_doc, audience, cover_image |
| `substack_render_check` | read | Open a draft in Substack's editor (background tab) and report what renders: headings, images loaded, lists, quotes, chars. | publication, **id** |
| `substack_delete_draft` | draft | Delete an UNPUBLISHED Substack draft (refuses published posts). | publication, **id** |
| `substack_stats` | read | Publication dashboard summary (subscribers, views, opens… as Substack's dashboard reports) + recent posts with their numbers. | publication, range_days, posts, all_numbers |
| `substack_note` | publish | PUBLIC: post a Substack Note (short feed post) from Markdown text, optional image. | **text_markdown**, image_url, publication |
| `substack_upload_image` | draft | Upload an image to Substack's CDN; returns its URL for use in posts. | publication, url, base64, mime |
| `substack_publish` | publish | PUBLISH a draft (or push edits of a published post). send_email=true emails all subscribers — irreversible. Requires confirm=true. | publication, **id**, send_email, **confirm** |

## LinkedIn

| tool | scope | what it does | arguments |
|---|---|---|---|
| `linkedin_dev_op` | dev | DEV: run a raw linkedin page op. | url, navigate, **op**, world, args |
| `linkedin_dev_arm` | dev | DEV: arm next file-input click on a linkedin page with files. | url, **files** |
| `linkedin_read_feed` | read | Read posts from the LinkedIn home feed (author, text, urn, permalink). | limit |
| `linkedin_search` | read | Search LinkedIn: posts (default), people, companies, jobs or all. Returns posts (author/text/url) or entities (name/url/headline lines). | **query**, type, limit |
| `linkedin_article_drafts` | read | List your unpublished LinkedIn article drafts (id, title, edit_url). Deleting drafts is manual in the LinkedIn UI. | — |
| `linkedin_stats` | read | Your LinkedIn creator analytics (last 7 days): impressions (+change), engagements, reactions, comments, reposts, saves, link clicks. | — |
| `linkedin_my_posts` | read | Your most recent LinkedIn posts (permalinks) from your activity page. | limit |
| `linkedin_post` | publish | Publish a LinkedIn feed post (public), optionally with images/video (files). dry_run=true fills + verifies then discards. | **text**, files, dry_run |
| `linkedin_post_article` | publish | Write and publish a LinkedIn article: title, Markdown body (headings/bold/lists/quotes), optional cover image file, optional share text for the feed post. publish=false leaves a saved draft. | title, body_markdown, cover, share_text, publish, draft_url |
| `linkedin_comment` | publish | Comment on a LinkedIn post (permalink /feed/update/urn:li:...). Verifies the comment appears. | **post_url**, **text** |

## TikTok

| tool | scope | what it does | arguments |
|---|---|---|---|
| `tiktok_dev_type` | dev | DEV: trusted (CDP) clear+type into tiktok caption. | **url**, **text** |
| `tiktok_dev_op` | dev | DEV: run a raw tiktok page op. | url, navigate, **op**, world, args |
| `tiktok_upload` | publish | Upload a video to TikTok with a caption (hashtags inline) and post it publicly. Large files must be given by url (the extension downloads it; e.g. a temporary http://127.0.0.1 server). dry_run=true stops before Post. | **file**, **caption**, dry_run |
| `tiktok_stats` | read | Per-video stats from TikTok Studio (title, status, visibility, views, likes, comments). | limit |
| `tiktok_video_stats` | read | Per-video analytics from TikTok Studio: views, total/average watch time, completion, new followers, counters. | **video_id** |
| `tiktok_comments` | read | Recent comments on your videos (TikTok Studio > Comments). | limit |

## Viblo

| tool | scope | what it does | arguments |
|---|---|---|---|
| `viblo_dev_get` | dev | DEV: GET a viblo.asia path with the page session. | **path** |
| `viblo_read_post` | read | Read a Viblo post (title, Markdown contents, tags, stats) and its comments. | id, url, comments, limit |
| `viblo_my_posts` | read | List your Viblo posts: published + drafts. | page |
| `viblo_create_post` | draft | Create a Viblo post as a DRAFT (not public). Call viblo_publish to make it public. | **title**, **contents_markdown**, tags, visibility, locale |
| `viblo_update_post` | draft | Update title/contents/tags of your Viblo post. Editing a PUBLIC post changes it live (needs Allow publishing). | id, url, title, contents_markdown, tags |
| `viblo_schedule` | publish | SCHEDULE your Viblo draft natively (editor's schedule): publish_at local 'YYYY-MM-DD HH:mm' in timezone (default Asia/Ho_Chi_Minh). Requires confirm=true. | **id**, **publish_at**, timezone, share_summary, **confirm** |
| `viblo_publish` | publish | PUBLISH your Viblo draft (public, shows in feeds). Requires confirm=true and at least one tag. | id, url, share_summary, **confirm** |
| `viblo_delete_post` | draft | Delete your Viblo post (draft, or public with Allow publishing). Irreversible. Requires confirm=true. | id, url, **confirm** |
| `viblo_comment` | publish | PUBLIC: comment on a Viblo post (Markdown), optionally as a reply. Verifies the comment is listed. | id, url, **text**, reply_to |
| `viblo_scout` | read | Find top-performing Viblo posts: general (feed), by niche (tag), or by keyword (query, supports title:/body:/tag:/user: syntax). Ranks by views/points/clips/comments, optional time window; returns posts + top tags/authors summary. | query, tag, feed, sort, since_days, limit, max_pages |
| `viblo_tags` | read | Viblo niches: list tags by followers or post count, or (with tag) that tag's all-time top posts ranked by Viblo. | tag, sort, page, max_pages |
| `viblo_upload_image` | draft | Upload an image (png/jpeg/gif, max 6 MB) to Viblo's CDN; returns url + Markdown to paste into a post. | url, base64, file_id, mime, name, alt |
| `viblo_set_cover` | draft | Set the cover (feature) image of your Viblo post from an uploaded image URL. | id, url, **image_url** |
| `viblo_images` | read | List images in your Viblo image library. | page |
| `viblo_delete_image` | draft | Delete an image from your Viblo image library (it stops loading anywhere it was used). | **id** |

## dev.to

| tool | scope | what it does | arguments |
|---|---|---|---|
| `devto_setup` | draft | Create (once) a dev.to API key via your logged-in session and store it inside the extension only. Returns your username. | — |
| `devto_me` | read | Your dev.to profile. | — |
| `devto_my_articles` | read | Your dev.to articles with stats (state: all \| published \| unpublished). | state, limit |
| `devto_read_article` | read | Read one of your dev.to articles (incl. drafts) with its Markdown body. | **id** |
| `devto_create_article` | draft | Create a dev.to article as a DRAFT (published=false). Call devto_publish to make it public. | **title**, **body_markdown**, tags, main_image, description, series, canonical_url |
| `devto_update_article` | draft | Update your dev.to article. Editing a PUBLISHED article changes it live (needs Allow publishing). | **id**, title, body_markdown, tags, main_image, description, series, canonical_url |
| `devto_schedule` | publish | SCHEDULE your dev.to draft with dev.to native scheduling (published_at in the future). Verifies the API stores published_at on the draft before setting published. Requires confirm=true. | **id**, **publish_at**, **confirm** |
| `devto_comment` | publish | POST a public comment on a dev.to article (optionally a reply via parent_id). Requires confirm=true. | **article_id**, **body_markdown**, parent_id, **confirm** |
| `devto_update_profile` | publish | Update your public dev.to profile bio (summary, max 200) and/or website_url. Requires confirm=true. | summary, website_url, **confirm** |
| `devto_delete_comment` | publish | DELETE one of your own dev.to comments by id_code. Requires confirm=true. | **id_code**, **confirm** |
| `devto_publish` | publish | PUBLISH your dev.to draft (public). Requires confirm=true. | **id**, **confirm** |
| `devto_upload_image` | draft | Upload an image to dev.to's own image host (via your session); returns url + Markdown. | url, base64, file_id, mime, name, alt |
| `devto_dev_get` | dev | DEV: GET a dev.to path with the page session (HTML trimmed; grep filters lines). | **path**, grep |

## Workflows

| tool | scope | what it does | arguments |
|---|---|---|---|
| `crosspost_prepare` | draft | Cross-post an essay, step 1 (drafts only, nothing public): Substack draft (or reuse substack_draft_id) + ChatGPT writes a short LinkedIn article, announcement and link comment + LinkedIn article draft. Returns a package id and review links. Takes several minutes: use async:true. | title, subtitle, essay_markdown, substack_draft_id, publication, cover, cover_url, chatgpt_chat_url, chatgpt_project_url, chatgpt_instructions, linkedin_words |
| `crosspost_publish` | publish | Cross-post step 2 (PUBLIC): publish the Substack post, publish the LinkedIn article with its announcement, then comment the Substack link under it. Resumable: re-run with the same id to finish remaining steps. | **id**, send_email |

## Developer (hidden unless enabled)

| tool | scope | what it does | arguments |
|---|---|---|---|
| `dev_outline` | dev | DEV: DOM outline (tags, aria/data attrs, short text) of a selector on a linkedin/chatgpt/substack URL (opened in an owned tab). | **url**, selector, depth, max |
| `dev_html` | dev | DEV: trimmed outerHTML of the Nth match of a selector (index -1 = last), lifted `up` ancestors. | **url**, navigate, **selector**, index, up, max |
| `dev_click` | dev | DEV: click the Nth element matching a selector (optionally containing text) in an owned tab (navigate default false). | **url**, navigate, **selector**, text, index |
| `dev_resources` | dev | DEV: API URLs the page has fetched (performance entries). | **url**, filter |
| `dev_stage_check` | dev | DEV: stage a file into a tab via the extension and return size + sha256 computed in the page. | **file** |
| `debug_trace` | dev | DEV: step trace of the most recent tool call. | — |
| `selectors_get` | read | Show site selectors (defaults + local overrides). Use when a site UI change breaks a tool. | site |
| `selectors_set` | dev | Hot-fix one site selector in this extension without a code update (value omitted/null = remove override). | **site**, **key**, value |
| `ext_reload` | dev | Reload the extension from disk (dev). | — |

**Bold** argument = required. `file` arguments: `{name, mime, text | base64 | file_id | url}` — use `file_id` (from `./tp-put`) for anything over ~700 KB.
