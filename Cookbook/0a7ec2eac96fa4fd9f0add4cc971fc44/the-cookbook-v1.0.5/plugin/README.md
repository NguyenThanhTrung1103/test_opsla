# extension: "work like me, use my tools" (Claude Code plugin, L2)

Skills (users never type their names; Claude picks them from plain words): `intent` (idea → INTENT.md) → `intent-check` (gate) → `intent-to-build` (hand off to a builder) · `discuss-with-chatgpt` (Claude briefs your own ChatGPT/Gemini by rules, checks the reply, pushes back in the same chat, returns the result + your decisions) · `chatgpt-project-setup` (creates the Intent Studio ChatGPT Project via tab-pilot `chatgpt_create_project`; saves `intent_project_url` in `~/.config/intent-studio/config.json`; no tab-pilot → prints the 4 manual steps) · `publish-with-tab-pilot` (posts the user's own content on LinkedIn, Substack, Viblo, dev.to, TikTok and cross-posts; always draft first, public only after an explicit yes; `confirm:true` only after that yes; subscriber email asked separately; reports the verified link). Each skill works alone.

Say it plainly, e.g. "Bàn với ChatGPT giúp mình: nên bán theo tháng hay một lần?" · "Nhờ ChatGPT viết 3 câu mở đầu bài Facebook giới thiệu app" · "Hỏi Gemini về giá đối thủ" · "Turn this idea into a plan: a booking app for hair salons". Each tool is detected at run time and has a fallback, so the plugin is plug-and-play on any machine.

| Slot | Options (detect order) | Detect | Fallback |
|---|---|---|---|
| intent runs | native → ChatGPT Project / paste | default native | the user chats in their own Intent Studio ChatGPT Project, or pastes the composed bundle in any chat UI; no relay |
| discussion transport | tab-pilot → Claude itself | tab-pilot MCP tools (`mcp__tab-pilot__*`) or `tp status` → connected:true (see `skills/intent/references/TAB-PILOT.md`); optional `discuss_project_url` in `~/.config/intent-studio/config.json` | Claude does the brainstorm/draft itself, or prints a ready-to-paste brief |
| builder | buildflow → agentkit → generic | repo has `buildflow/` + rule 06 · repo has `.agentkit/` or `/ak:*` | generic BRIEF.md |
| runner | tdrive (unattended) → manual | `${TDRIVE_BIN:-~/.claude/scripts/tdrive}` exists AND the user wants an unattended run | manual: the user runs the builder |
| domain | cookbook recipes | `references/DOMAIN.md` (built by compose `--domain`) | generic checklist only |
| profile | `--profile <path>` → `./PROFILE.md` → bundled default | file exists | `_blank` |
| learning loop | tdrive trace | `~/.tdrive/runs/<run>/trace.jsonl` | skip |

Profile and core files are copied into `skills/intent/references/` by `build/compose.py --host claude-code-plugin`; the other skills read `../intent/references/`.
No tool path is required. A missing tool means the next option, never an error.
