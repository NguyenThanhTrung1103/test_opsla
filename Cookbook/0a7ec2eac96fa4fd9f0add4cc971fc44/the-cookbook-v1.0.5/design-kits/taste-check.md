# taste-check.md — "is it slop, or is it good?"

*Run this against the page Claude built, BEFORE you say it's done. This is the QA hat — the same "demand proof" move you use for features, applied to how the page looks. Any box you can't tick = the page isn't done. Hand the failing box back to Claude ("fix this: …") — you don't fix it yourself.*

*You don't need to read code. Most of these you check by LOOKING at the page. A few, you ask Claude to confirm ("did you use any em-dashes? any Inter font?") — and you make it prove it, not just say yes.*

---

## Fast pass: make Claude self-audit FIRST, then you spot-check
Don't run all 12 boxes by hand from cold. Make Claude grade its own build against this list first — WITH proof, not claims — so you only verify. Paste this:

> "Run `taste-check.md` against the page you just built. Go box by box; for each, say PASS or FAIL and SHOW the proof, don't just claim it:
> - em-dashes: `grep -n '—'` the visible text and paste the result (must be empty).
> - display font: name the exact headline font-family from the CSS.
> - CTA label: list every button's text — they must all be identical.
> - hero image: confirm a real `<img>`/photo in the hero, not a gradient.
> - accent: list every accent color used — must be one.
> Then screenshot the page (desktop + mobile) and check the LOOK boxes against the screenshot. Report the failing boxes; fix each; re-run until all pass. Then hand me the result + the screenshots."

You then LOOK at the screenshots and confirm the judgment calls (does it match my reference? real contrast? Vietnamese renders?). **Claude's self-audit narrows it; your eyes make the call.** Never accept "all pass" without seeing the proof + the screenshot — that's the box agents fake most.

---

## The two that fail more pages than anything else
- [ ] **Not the "AI default" look** — is it cream/beige background + a gold/brown accent + a serif
headline? If yes, that's THE most over-produced AI page. It should look like YOUR reference, not that. → reject, "match my reference, not the default cream look."
- [ ] **Real display font, not Inter/Arial** — ask Claude what font the headlines use. Inter, Roboto,
Arial, or "system font" for the big text = the generic tell. → reject.

## The structure (CRO)
- [ ] **All 8 CRO sections present, in order** — count them against `CONTENT.md` (HERO → PROBLEM → WHAT WE OFFER → WHY US → PROOF → CTA BAND → FAQ → FINAL CTA). A thin hero+CTA-only page fails this box; a missing core section means the page is not done.

## The look
- [ ] **It matches my reference** — put the reference and the page side by side. Same *system* (layout,
spacing, how images are used)? Or did Claude invent its own thing? → if invented, reject.
- [ ] **ONE accent color**, used the same in every section. A surprise second accent color late on the
page = tell.
- [ ] **The hero has a real image** (a photo / real visual), not just text on a gradient or a color
blob. Text-plus-gradient hero = the #1 empty look.
- [ ] **No 3 identical cards in a row** as the main feature section (the AI-default "three boxes"). One
is fine; three matching ones centered = tell.
- [ ] **Not everything the same size** — is there a big headline vs small labels (real contrast), or is
it all one medium size (flat)?

## The words
- [ ] **No benefit-soup** — no "nâng tầm", "đột phá", "đẳng cấp", "trải nghiệm hoàn hảo", "unlock",
"seamless". Real, plain words that say what the spa actually is.
- [ ] **ONE button intent** — every call-to-action says the SAME thing (all "Giữ chỗ", not a mix of
"Đăng ký" / "Bắt đầu" / "Giữ chỗ"). Pick one, everywhere.
- [ ] **No em-dashes (—)** in the visible text. Make Claude grep for them and show you a clean result,
not just claim it. (This is the tell agents fake-pass most.)

## The proof (not the look)
- [ ] **The button actually works** — you clicked it, entered an email, saw the confirmation. "Looks
right" and "works" are two different claims; you only trust the second.
- [ ] **The Vietnamese renders** — every diacritic shows correctly (á à ả ã ạ â ê ô ơ ư đ). Look at
"Dịch vụ · giờ mở cửa · kỹ thuật viên" on the real page.

---

**How to read the result:** all boxes tick → ship it. Any box fails → it's not done. Tell Claude the specific failing box ("the hero is just text on a gradient — put a real photo there") and let it fix, then re-check. You are the judge; the page passes when the proof is on your screen, not when Claude says it's finished.
