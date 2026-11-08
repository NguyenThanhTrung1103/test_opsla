---
name: intent
description: Turn a business or app idea into INTENT.md (a one-page build plan) using the intent-studio method and the active profile. Use on "brainstorm this idea", "turn this idea into a plan", "lên kế hoạch cho ý tưởng app", "biến ý tưởng thành bản ý định", "intent for X", "/intent".
argument-hint: "\"<idea>\" [--transport native|paste] [--profile PATH]"
---

# /intent

Method: `references/METHOD.md` (follow it exactly), with `references/PROFILE.md`, `references/CHECKLIST.md` and `references/INTENT-SCHEMA.md`. A `--profile PATH` or a `./PROFILE.md` replaces the bundled profile.

## Where it runs (pick one; say which in one line)
1. **native** (default): run METHOD yourself in this conversation. One stage per turn, ≤ 3 questions with recommended answers. When the user wants questions in a picker, use the ask tool.
2. **ChatGPT Project / paste** (the user prefers to chat in ChatGPT): they chat with their own Intent Studio ChatGPT Project directly (setup: `intent-studio/chatgpt-project/INSTALL.md` in the Cookbook folder), or you print METHOD plus the source files as one block for any chat UI. Ask them to paste the final INTENT.md back here.
Never relay: do not send the user's answers into a ChatGPT chat or pass ChatGPT's questions to the user.

## Optional: business sanity check by ChatGPT
After INTENT.md is drafted (native), you may offer once: "Want ChatGPT to sanity-check the business side?" On yes, use the `discuss-with-chatgpt` skill (kind `brainstorm`): brief = the INTENT's goal, buyer, offer, price and Decisions as facts; ask for the top risks, gaps and pricing/market concerns, with no invented numbers. Check the reply by its rules. Never write its suggestions into INTENT.md yourself: each one that changes a business decision becomes a question to the user (≤ 3, with your recommendation); patch only what the user answers.

## End
Save INTENT.md in the current dir (or `--out`). Then run the `intent-check` skill on it. On PASS, offer `intent-to-build`.
