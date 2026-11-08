# Changelog
## 1.0.5 · plugin 0.5.0 (2026-11-04)
- Posting with tab-pilot is now part of The Cookbook: Claude posts and manages your own content on LinkedIn, Substack, Viblo, dev.to and TikTok, schedules posts, reads stats and comments, and cross-posts an essay (Substack + LinkedIn). Just say it ("Đăng bài này lên LinkedIn").
- New plugin skill `publish-with-tab-pilot`: always a draft first, public only after your yes for that post; emailing Substack subscribers is asked separately; every result comes back verified with its link.
- `setup-tab-pilot.sh` now ends with which sites are logged in. The install page has a posting section and troubleshooting rows.

## 1.0.4 (2026-11-03)
- Recipes are automatic: the guide no longer asks you to list or pick recipes. Intent Studio maps your journey to recipes and Claude attaches them at handoff (Lesson 5 explains how, and how to see or change them).
- Each part works alone: tdrive drives any approved brief or existing project, with or without The Cookbook; a recipe works alone in an existing app; Intent Studio works without recipes.
- No command names to remember anywhere in the guide: just say "Kiểm tra bản ý định này", "Chuyển bản ý định sang build".

## 1.0.3 (2026-11-03)
- One install page: `INSTALL.md` here = https://arealisticdreamer.com/cookbook/install (guide lesson 3). What you need, one-prompt setup, MCP sign-in, tdrive, tab-pilot, ChatGPT Project, one troubleshooting table, updates. Lessons 7 and 8 now point to it instead of repeating install steps.

## 1.0.2 (2026-11-03)
- tab-pilot in one command: `bash setup-tab-pilot.sh` checks Chrome/Node.js/Claude Code, logs in to your free Cloudflare account, deploys your private relay (works even when R2 is off on a new account), opens Chrome + Finder for the extension, puts the Relay URL and Token on your clipboard one at a time, waits for the connection, connects Claude Code and checks ChatGPT. Stops with the exact fix when something is missing; safe to re-run. `--new-token` replaces a leaked token.
- Fixed: plain `npm install` failed on a peer-dependency conflict in the relay; the script uses `--legacy-peer-deps`.
- Guide: the tab-pilot section now has a full troubleshooting table.

## 1.0.1 · plugin 0.4.0 (2026-11-03)
- One-step setup: `bash setup.sh` (or ask Claude Code to set up The Cookbook) installs the plugin, adds the MCP and installs tdrive when the Mac is ready, then prints a short report of the few clicks left (MCP sign-in; optional tab-pilot).
- Claude creates your Intent Studio ChatGPT Project for you when tab-pilot is connected (instructions + source files), so there is nothing to copy or upload. Without tab-pilot it prints the 4 steps.
- tab-pilot is now an advanced, optional add-on; the default path doesn't need it.

## plugin 0.3.0 (2026-11-01)
- Claude discusses with your own ChatGPT (or Gemini) by rules: it writes the brief from known facts, ChatGPT brainstorms or writes, Claude checks the reply and pushes back in the same chat (max 3 rounds), then returns the result, what it checked/changed, and only the decisions that are yours. Saved to `brainstorm/` or `content/`.
- No skill names to remember: say it in plain words ("bàn với ChatGPT về giá", "nhờ ChatGPT viết bài giới thiệu", "hỏi Gemini").
- Removed: `/brainstorm` (replaced by the discussion skill), `/intent-setup` (an optional default ChatGPT Project is asked once), and the `/intent` relay (Intent Studio runs here in Claude Code, or directly in your ChatGPT Project).

## 1.0.0 (2026-11-02)
- 6 recipes: documents (proven); auth-roles, booking, payments, email, crm (stable)
- Intent Studio (Claude Code skill, ChatGPT/Claude Project bundles), plan check, plugin
- DESIGN/FEEL kits
- tdrive beta (macOS only) with a preflight check
- tab-pilot (optional): Claude discusses business questions and content with your own ChatGPT or Gemini, by rules
Next to prove: booking (second real build)
