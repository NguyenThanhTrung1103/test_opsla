---
name: discuss-with-chatgpt
description: >
  Claude discusses a business question or a writing job with the user's own ChatGPT (or Gemini) on their behalf, by rules:
  Claude writes the brief from known facts, ChatGPT brainstorms or writes, Claude checks the reply and pushes back in the
  same chat, then returns the result and only the decisions that are the user's. Use whenever the user wants to brainstorm
  or sanity-check a business model, pricing, offer, finance, market, competitors, positioning or risks, or wants content
  written (Vietnamese copy, Facebook/LinkedIn post, landing text, email, video script, product intro), even without naming
  ChatGPT. Trigger phrases: "bàn với ChatGPT", "hỏi ChatGPT", "nhờ ChatGPT viết", "hỏi Gemini", "bàn với Gemini",
  "brainstorm mô hình kinh doanh", "nên bán theo tháng hay một lần", "định giá", "giá đối thủ", "viết bài giới thiệu",
  "viết bài Facebook", "viết caption", "viết kịch bản video", "ask ChatGPT", "discuss with ChatGPT", "brainstorm pricing",
  "write a post about my app". Falls back to Claude doing it when tab-pilot is not connected.
---

# Discuss with ChatGPT (by rules, not a relay)

Roles: **Claude = facts, rules, brief, check, build. ChatGPT = fresh business view or the writer.** The user is not a go-between: never pass ChatGPT's questions to the user to answer; answer them from the facts, or state them as unknown and tell ChatGPT to proceed with that marked.

## 0. Kind and slug
- `brainstorm` (business model, pricing, finance, market, competitors, positioning, risks) → save to `brainstorm/<slug>.md`.
- `content` (copy, post, script, email, intro) → save to `content/<slug>.md`.
- `<slug>` = 3–5 word kebab-case of the job. "Gemini" in the request → Gemini; else ChatGPT.

## 1. Brief (write it yourself; ChatGPT sees only this)
Gather facts first: `./INTENT.md`, `./PROFILE.md` or `../intent/references/PROFILE.md`, the repo README, and what the user said in this conversation. Use only what you found. Write the brief in the user's language; first line `Phiên này: <slug>` (becomes the chat title):
```
Phiên này: <slug>
Goal: <one or two sentences: what decision or text this is for, who reads it>
Facts we know: <bullets, each from the sources above; no guesses>
Unknown: <what we do not know yet (prices, numbers, audience size …)>
Rules:
- Do not invent numbers, prices, statistics, customers or testimonials. If a number matters, say what it depends on or how to find it cheaply.
- Say plainly what is unknown or assumed.
- <brainstorm> Compare the real options with trade-offs, give your recommendation and why, top 3 risks + a cheap way to test each.
- <content> Write in <language/voice: e.g. tiếng Việt, giọng thân thiện, xưng mình–bạn>, natural for <audience>, no hype, no promises the facts do not support. Give <N options / length / format>, plus your own pick and why.
- Do not ask me questions back; if something is missing, mark it as an assumption and continue.
Return: <exact shape: sections or numbered options; plain text>
```
Keep it short and loose: goal + facts + rules + return. No word quotas or pattern lists. Never send an English draft for ChatGPT to translate.

## 2. Send
Transport and calls: `../intent/references/TAB-PILOT.md`. New chat (inside `discuss_project_url` when set in the config), `async: true`, then poll until done. Keep `chat_url`.

## 3. Check, then push back in the same chat (max 3 rounds)
Check the reply against the brief:
- every number, price, name or claim exists in the facts, or is clearly marked as an assumption/estimate;
- it answers the goal and follows the return shape (count, length, format);
- content: the language and voice asked for, no invented customers/results, no over-promise, nothing the product does not do;
- brainstorm: real trade-offs and a recommendation, not a generic list.
A rule broken or the goal missed → send a short correction into the same `chat_url`: quote the exact lines that break it and the rule, ask for a fixed version. Stop when the reply passes or after 3 correction rounds (then report what still fails). Allowed edits by Claude: cutting lines or picking options. Never rewrite the Vietnamese copy yourself; send it back instead.

## 4. Return
Show the final text (verbatim from ChatGPT, cut-only), then 2–4 lines:
```
Checked: <what you checked>
Changed: <correction rounds and why, or "none">
Open: <decisions that are the user's (price, offer, positioning choice) or facts still unknown>
```
Ask the user only about the Open decisions (≤ 3, each with your recommendation). Save `brainstorm/<slug>.md` or `content/<slug>.md` in the current dir: title, chat URL, the brief sent, final reply, the check lines, and the correction prompts you sent.

## No tab-pilot
Say so in one line: `(ChatGPT not connected: Claude did this itself)`. Then do steps 1, 3, 4 yourself with the same brief and rules. If the user wants ChatGPT anyway, print the brief as one block ready to paste into any chat, and offer to check the reply they paste back.

## Default project (optional, asked once)
The config may hold `discuss_project_url` (a ChatGPT Project link `https://chatgpt.com/g/g-p-…`) so these chats stay in one project. Read the config first:
- key present (a link **or `null`**) → never ask; `null` means the user already said no.
- no config file, or the key is missing → ask once, after the first result: "Keep these chats in one of your ChatGPT Projects? Paste its link, or say no." Save the link, or `null` for no, keeping other keys. Never block the first run on it.
