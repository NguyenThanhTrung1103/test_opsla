# tab-pilot transport (Claude talks to the user's own ChatGPT / Gemini)

Used by `discuss-with-chatgpt` (and through it by `intent` for an optional sanity check). Claude writes the prompts and reads the replies; the user is never a relay. tab-pilot is optional: the Cookbook ships it in `tab-pilot/` (setup: `tab-pilot/START-HERE-COOKBOOK.md`).

## Config (optional)
`$INTENT_STUDIO_CONFIG` if set, else `~/.config/intent-studio/config.json`. Keys, all optional: `discuss_project_url` (ChatGPT Project link for these chats; `null` = asked, user said no; legacy `brainstorm_project_url` is read the same), `model`, `effort` (passed only when set). No file = new plain chats.

## Detect (first that works)
1. **MCP**: tools named `mcp__tab-pilot__*` exist (they may be deferred: load `chatgpt_chat`, `chatgpt_get_result`, `job_status`, `gemini_chat`, `gemini_get_result`, `status` via tool search). `status` must report the extension connected.
2. **CLI**: a `tp` script: `$TAB_PILOT_DIR/tp`, else `tp` on PATH, else `${CLAUDE_PLUGIN_ROOT}/../tab-pilot/tp` (bundled copy). `tp status` must print `"connected":true`. `tp` reads `TAB_PILOT_URL` + `TAB_PILOT_TOKEN` from the env or the `.env` next to it. Call a tool as `tp <tool> '<json args>'`.
Neither → unavailable; use the caller's fallback. Never print the token.

## ChatGPT
- New chat: `chatgpt_chat {prompt, async: true}` + `project_url: <discuss_project_url>` when set (+ `model`/`effort` if configured).
- Follow-up / correction: `chatgpt_chat {prompt, chat_url, async: true}`. Same discussion = same `chat_url`; never open a second chat for it.
- Async: the call returns `job_id`; poll `job_status {job_id, wait_seconds: 120}` until done. Result `status: running` → `chatgpt_get_result {chat_url or tab_id, wait_seconds: 120}` until finished. Keep `chat_url` from the result.
- CLI: same names and JSON args, e.g. `tp chatgpt_chat '{"prompt":"…","async":true}'`. Write long prompts to a temp file and build the JSON with `python3 -c`/`jq` so quoting cannot break.

## Gemini
`gemini_chat {prompt, chat_url?, async: true}` → `job_status`; `status: running` → `gemini_get_result {tab_id or chat_url, wait_seconds: 120}`. No project URL.

## Errors
Not connected / logged out → tell the user (open Chrome, check the tab-pilot extension shows connected, log in to ChatGPT) and use the fallback. Never retry a failing call more than twice.
