---
name: chatgpt-project-setup
description: >
  Creates the user's Intent Studio ChatGPT Project for them through tab-pilot: project instructions plus the source files
  from The Cookbook folder, so they never copy or upload anything by hand. Use when the user wants Intent Studio in
  ChatGPT, wants to brainstorm their app idea inside ChatGPT, or asks to set up / create / install the ChatGPT Project.
  Trigger phrases: "tạo Intent Studio trên ChatGPT", "cài Intent Studio vào ChatGPT", "tạo project ChatGPT", "mình muốn
  bàn ý tưởng trên ChatGPT", "set up Intent Studio in ChatGPT", "create the ChatGPT project". Without tab-pilot it prints
  the 4 manual steps instead.
---

# Create the Intent Studio ChatGPT Project

## 1. Find the Cookbook folder
The folder that holds `intent-studio/chatgpt-project/`. Check in order: the `the-cookbook` path in `claude plugin marketplace list`, the current directory, `~/the-cookbook*`, `~/Downloads/the-cookbook*`. If none, ask for the path once.

Read `intent-studio/chatgpt-project/INSTRUCTIONS.md` (the project instructions) and every file in `intent-studio/chatgpt-project/sources/` (upload each as a source file, unchanged).

## 2. Check what exists
Read `~/.config/intent-studio/config.json`. If `intent_project_url` is set, give the link and ask whether to make a new one. Don't create a duplicate silently.

## 3. Create it (tab-pilot connected)
Call the tab-pilot tool `chatgpt_create_project` with:
- `name`: `Intent Studio`
- `instructions`: the full text of INSTRUCTIONS.md
- `files`: one entry per source file, `{ name, mime: "text/markdown", text }`
- `async: true`, then poll `job_status` until done.

Save the returned `project_url` as `intent_project_url` in the config (create the file if missing, keep other keys). Then tell the user, in their language:
- the project link;
- open it and start a chat with their idea; Intent Studio asks the questions and writes the one-page intent;
- paste the finished INTENT.md back to Claude Code (or say "kiểm tra bản ý định") to check it and build from it.

If the tool fails (not logged in to ChatGPT, UI changed): say what failed in one line, then fall back to step 4.

## 4. No tab-pilot (or it failed)
Say: "(ChatGPT not connected, so here are the 4 steps by hand; or just keep going here, Intent Studio also runs in Claude Code)". Then print:
1. In ChatGPT, create a new Project named Intent Studio.
2. Open the project settings and paste the content of `intent-studio/chatgpt-project/INSTRUCTIONS.md` into Instructions.
3. Upload every file in `intent-studio/chatgpt-project/sources/` to the project files.
4. Start a chat in the project with your app idea.

Offer to open the folder (`open <path>/intent-studio/chatgpt-project`) so the files are one drag away.
