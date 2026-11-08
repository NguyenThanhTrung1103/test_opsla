# tab-pilot in The Cookbook (optional)

**What it does here:** Claude discusses with *your own* ChatGPT (or Gemini) in your Chrome, on your behalf, by rules. Claude writes a brief from what it knows (your plan, profile, repo) plus rules (no invented numbers or testimonials, say what is unknown, your voice); ChatGPT brainstorms (business model, pricing, market, positioning) or writes (Vietnamese copy, posts, scripts); Claude checks the reply and pushes back in the same chat; you get the result, what Claude checked or changed, and only the decisions that are yours. You don't relay anything. Without tab-pilot it still works: Claude does it itself.

**Setup (~10 min, once).** From the Cookbook folder run `bash setup-tab-pilot.sh` (or ask Claude Code: "cài tab-pilot giúp mình"). It checks Chrome/Node.js, logs you in to your free Cloudflare account, puts your private relay on it (works even if R2 is off on a new account), opens Chrome and Finder for the extension, puts the Relay URL and Token on your clipboard one at a time, waits until the extension connects, connects Claude Code, and checks ChatGPT. Safe to re-run: it skips what is done and stops with the exact fix when something is missing.

Your clicks: Cloudflare login (browser), load the extension (Developer mode → Load unpacked → `tab-pilot/extension`), paste 2 values in its options → Save & connect, be logged in to ChatGPT in that Chrome. Keep Chrome open while Claude uses ChatGPT.

Manual route (same steps by hand): `README.md` here, sections *Cài đặt* and *Kết nối agent*; use `npm install --legacy-peer-deps` in `worker/` if npm reports a peer-dependency conflict.

**Then in Claude Code, just say it** (no commands to remember):
- "Bàn với ChatGPT giúp mình: app đặt lịch cho tiệm tóc nên bán theo tháng hay một lần? Đừng bịa số liệu."
- "Nhờ ChatGPT viết 3 câu mở đầu bài Facebook giới thiệu app đặt lịch tiệm tóc, giọng thân thiện."
- "Hỏi Gemini về giá của các app đặt lịch đối thủ."
Results are saved in `brainstorm/` or `content/` with the chat link. The first time, Claude may ask once whether to keep these chats in one of your ChatGPT Projects (optional).

**Posting (sold as part of The Cookbook).** Claude also posts and manages your own content: LinkedIn (posts, articles, comments, stats), Substack (drafts, publish, Notes, stats), Viblo and dev.to (drafts, publish, native scheduling), TikTok (video upload, stats), and cross-posting an essay to Substack + LinkedIn. Just say it ("Đăng bài này lên LinkedIn", "Cross-post bài này sang Substack và LinkedIn"). Claude always shows a draft and waits for your yes; emailing Substack subscribers is asked separately. Log in to each site in the same Chrome first (`setup-tab-pilot.sh` lists which are logged in); dev.to: say "kết nối dev.to" once.

**Safety.** The agent acts on your real, logged-in accounts. Public actions (posting, publishing, commenting, uploading) are refused unless you tick **Allow publishing** in the extension options: turn it on when you want to post, off again after. Discussing with ChatGPT never needs it. Treat the token in `.env` like a password: never share or commit it.
