---
name: publish-with-tab-pilot
description: >
  Publishes and manages the user's own content on LinkedIn, Substack, Viblo, dev.to and TikTok through tab-pilot (their
  logged-in Chrome), always draft first and only with the user's explicit yes. Also cross-posts an essay (Substack + a
  LinkedIn article that links to it), schedules posts, uploads images/videos, reads stats, comments, and scouts what
  performs. Use when the user wants to post, publish, schedule, cross-post, share, upload a video, check post stats or
  comments on those sites, even without naming tab-pilot. Trigger phrases: "đăng lên LinkedIn", "đăng bài Substack",
  "cross-post", "đăng chéo", "lên lịch bài Viblo", "đăng dev.to", "kết nối dev.to", "up video TikTok", "xem thống kê bài", "trả lời
  bình luận", "post this to LinkedIn", "publish on Substack", "schedule on Viblo", "upload to TikTok".
---

# Publish with tab-pilot (the user's own accounts)

These actions are real and public on the user's own accounts. The rules below are not optional.

## Rules
1. **Draft first.** Create a draft (or `dry_run`) and show the user: where, title, the text (or a short excerpt for long posts), images/video, schedule time, and what will become public. Ask "Đăng công khai luôn nhé?" and wait for an explicit yes in this conversation. A yes for one post never covers another.
2. **Public steps only after that yes.** Some tools also take `confirm: true` (`substack_publish`, `viblo_publish`, `viblo_schedule`, `devto_publish`, `devto_schedule`, `devto_comment`): pass it only after the yes. The rest go public as soon as you call them, so the yes is the only gate: `linkedin_post`, `linkedin_post_article`, `linkedin_comment`, `substack_note`, `viblo_comment`, `tiktok_upload`, `crosspost_publish`, and edits to already-public posts. Where a dry run exists, use it for rule 1: `linkedin_post` and `tiktok_upload` take `dry_run: true` (fills and verifies, then stops before posting).
3. **`send_email: true` on `substack_publish` or `crosspost_publish` emails every subscriber and cannot be undone.** Ask about email separately ("Gửi email cho subscriber không?"). Default: no email.
4. **Never write content the user didn't approve**, and never invent facts, numbers or testimonials. If the text needs writing, use the discussion skill (ChatGPT drafts, Claude checks) or draft it here, then rule 1.
5. **"Allow publishing" is the user's switch** in the tab-pilot extension options. If a public step is refused because it is off, say so and tell them where it is. Never ask them to leave it on; suggest turning it off again when they are done.
6. **Report with proof:** every write returns `verified` + `evidence`. Give the user the final URL (post, draft or editor link). If `verified` is false, say what failed. Don't claim it is live.
7. **Never use the raw `*_dev_*` tools** (`linkedin_dev_op`, `tiktok_dev_op`, `substack_dev_get`, …) to post, publish or work around a refused or missing tool. They skip the dry run, the publishing switch and verification. If the proper tool is missing or refused, say so and hand over the text to paste.
8. Deleting is irreversible (`viblo_delete_post`, `substack_delete_draft`, `devto_delete_comment`, `viblo_delete_image`): only on an explicit request naming the item.

## Before the first post on a site
- `health_check` → the site must show logged in. If not: "Mở <site> trong đúng Chrome có tab-pilot và đăng nhập".
- dev.to only: run `devto_setup` once (creates an API key inside the extension).
- Large files (video, PDF): upload to the relay first (`tab-pilot/tp-put <file>` → `file_id`), then pass the `file_id`.
- Long jobs (publishing, video upload): `async: true`, then poll `job_status`.

## Common jobs
- **LinkedIn post:** `linkedin_post` with `dry_run: true` → show → yes → `linkedin_post` again without dry_run (images/video via `files`). Article: `linkedin_post_article`.
- **Substack:** `substack_create_draft` → `substack_render_check` (headings/images render?) → show the editor URL → yes → `substack_publish` (rule 3). Short feed post: `substack_note`.
- **Cross-post an essay:** `crosspost_prepare` (Substack draft + ChatGPT-written LinkedIn article + announcement + link comment, all drafts) → give both draft links to read and edit → yes → `crosspost_publish` (re-run with the same `id` to resume if a step failed).
- **Viblo:** `viblo_create_post` (draft, needs at least one tag to publish) → yes → `viblo_publish`, or `viblo_schedule` (local time, default Asia/Ho_Chi_Minh). Ideas: `viblo_scout`, `viblo_tags`.
- **dev.to:** `devto_create_article` (draft) → yes → `devto_publish` or `devto_schedule`.
- **TikTok:** `tiktok_upload` with `dry_run: true` first (stops before Post) → show caption + file → yes → `tiktok_upload` again without dry_run. Large files: by `file_id` from `tp-put`, or a `url`.
- **Read only (no confirmation needed):** `linkedin_stats`, `linkedin_my_posts`, `substack_stats`, `substack_list_posts`, `tiktok_stats`, `tiktok_video_stats`, `tiktok_comments`, `viblo_my_posts`, `devto_my_articles`.

## When something breaks
- "not logged in" / "logged out" → log in to that site in the same Chrome profile, retry.
- A selector error right after a site changed its design → run `health_check`, tell the user which site and step failed, and suggest posting by hand this time and reporting it in Discord #cookbook. Don't retry in a loop.
- Without tab-pilot connected: say so in one line and give the finished text ready to paste.
