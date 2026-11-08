---
name: intent-check
description: Check an INTENT.md against the intent/v1 schema before building (gaps, guessed values, unobservable done). Use on "check this intent", "is this plan ready to build", "/intent-check".
argument-hint: "[INTENT.md path]"
---

# /intent-check

Apply `../intent/references/CHECKER.md` to the file (default `./INTENT.md`). Output its exact RESULT block.
- GAPS: never fill a business gap yourself. Ask the user (≤ 3 at a time, with recommendations), patch only what they answer, then re-check. If the user works in their own Intent Studio ChatGPT Project, also give the numbered gaps as one block they can paste there.
- PASS: say so and offer `intent-to-build`.
