# craft-check.md — the STRIKING gate (fails "competent", not just slop)

*Run this AFTER taste-check, as the last gate before a page is done. taste-check catches slop
("is it bad?"). craft-check catches the harder bar: "is it STRIKING, or merely competent?" A
premium kit sells impressive output — a page that only clears taste-check but fails craft-check
is NOT done. Each item is pass/fail; you must SCREENSHOT the built page and check with your eyes,
not assume. If ≥3 fail, the page is competent-not-striking — fix and re-render until it passes.*

## How to run
1. Render the page (headless Chrome) at a real fold (1440×900) AND full-page. Look at both.
2. Walk the 15 checks. Mark each PASS / FAIL with the evidence you saw.
3. Any FAIL → fix the cause in the FEED/BLOCKS (not a one-off patch), rebuild, re-render, re-check.
4. Report the scorecard. "Passed craft-check" requires ≥16/18 and ZERO fails in the starred (★) load-bearing checks (1, 4, 6, 7, 10, 16, 17). Check 16 (every section clears the bar) and check 17 (hero doesn't overlap the nav — test at 1440×720 AND 1280×800) are the two most often missed.

## The 15 checks

★1. **Scrim is bottom-weighted, not flat.** No full-image `rgba(0,0,0,.4)` wash. Top ~40% of the hero photo stays clean; darkness gradients up under the text only. FAIL = flat overlay (the #1 template tell).

2. **Section padding is generous.** Vertical padding reads ≥8rem on desktop (`clamp(4rem,10vw,12rem)`). FAIL = cramped 60–96px sections.

3. **Body text measure ≤65ch.** Running text never spans the full wide container. FAIL = full-width paragraphs.

★4. **Display type is genuinely large.** Hero/statement headline uses an 8–12vw coefficient (`clamp(3rem,10vw,12rem)`) with line-height ~0.95. FAIL = ~5vw templated size, loose line-height.

5. **Mono/caps micro-label layer present.** Numbered/tracked eyebrows ("01 — LƯU TRÚ", `letter-spacing:.2em` uppercase) somewhere. FAIL = only serif + sans, no label layer.

★6. **The grid is broken at least once.** At least one section is asymmetric (spans like 2/7 + 8/13) or has an off-grid image with its caption in the opposite column. FAIL = every section centered/6-6.

★7. **Exactly ONE signature move.** One memorable moment (preloader→content · velocity-coupled marquee · cursor magnet · pinned horizontal gallery · scroll reveal-mask · interactive map). FAIL = zero (forgettable) OR three+ (noisy).

8. **Text reveals are masked + staggered + directional.** Line-by-line or block reveals `y:24–100→0`, stagger ~0.08, not uniform opacity fade-everything. FAIL = AOS-style fade-up on everything.

9. **One expo-out easing everywhere.** Reveals use `cubic-bezier(0.16,1,0.3,1)` (or power4/expo out); hovers 0.3–0.4s. FAIL = mixed/default/bounce easing.

★10. **Accent is italic serif, not a color word.** The emphasized headline word uses `font-style:italic`, not a swapped color. FAIL = colored accent word (the AI-default move).

11. **Nav transparent → blur-solid on scroll.** Starts transparent over hero, gains `backdrop-filter:blur` + solid bg after scroll (IntersectionObserver sentinel). FAIL = static solid bar over hero.

12. **Imagery is tall + alive.** Room/feature cards use `3:4`/`4:5` portrait; hero photo has a subtle scale 1.0→1.1 Ken Burns on scroll. FAIL = flat landscape cards, static photos.

13. **One alignment system.** Everything aligns to one grid; no random center/left switching. FAIL = mixed alignment.

14. **Surfaces are flat.** No card drop-shadows; separation by whitespace + 1px hairline rules (one purposeful elevation max). FAIL = shadow noise / glassmorphism everywhere.

15. **Polish trio present.** `100svh` (not vh) on the hero, a `prefers-reduced-motion` block that collapses motion, and `poster` on any hero video. FAIL = any missing.

★16. **EVERY section clears the bar — not just the hero.** Screenshot the WHOLE page, not only the fold. The weakest section must still have: a numbered mono eyebrow, an intentional composition (not a bare form, not a symmetric 50/50 box-and-box, not an empty panel), and real type hierarchy. A striking hero attached to a flat booking form / plain FAQ / two-boxes contact = FAIL. The booking/close section especially — it's the conversion moment — must be as composed as the hero (ideally full-bleed imagery with the form floating on it, or a deliberate editorial band; NEVER a form-in-a-box beside an empty dark panel). If any section looks like it came from a lesser page, the whole page fails.

★17. **Hero text clears the nav AND the eyebrow clears the headline — no overlap at any viewport.** Screenshot at 1440×720 AND 1280×800 (short/wide), not just 1440×900. Two collisions to check: (a) headline vs the fixed nav, (b) the numbered eyebrow vs the top of the headline (a tight `line-height:.94` headline overshoots upward into the eyebrow — worse when the headline is TWO lines via `<br>`). FAIL = any overlap of eyebrow/headline/wordmark/nav-links. Fix: real eyebrow `margin-bottom` + a small headline `padding-top`, and budget extra clearance for multi-line headlines.

18. **Parallax is TRUE layered depth on the hero.** Different depth LAYERS move at DIFFERENT speeds — the near foreground (trees/grass) visibly slides past the far background (mountains/mist) as you scroll the first screen. To verify: screenshot at scroll 0 and scroll 150px; the near layer must have moved MORE than the far layer (measure the gap between a foreground element and a background element — it must change). FAIL = one flat photo moving as a block (that's a scroll offset, not parallax), parallax buried on a deep band, or layers moving together. (Collapses under reduced-motion — expected, not a fail.)

19. **Two-column splits: no dead gap — short media column is sticky.** In any 2-column section where one side is a fixed-height media (image/map/photo) and the other is a longer content column, the media must be `position:sticky` so it stays in view while the long column scrolls. FAIL = the short column ends and leaves an empty gap beside the still-scrolling content (screenshot the section scrolled to where the short column would run out).

## The one-line verdict
> A striking page has a bottom-weighted hero, huge italic-accented type, one broken grid, one
> signature move, staggered masked reveals on one expo-out curve, tall alive imagery, flat
> surfaces, and the polish trio. A competent page has none of these — it has a nice photo and a
> big headline. Sell the first; reject the second.

## Component-fit checks (catch the amateur tells the homestay build hit)
- **Card CTA fits its button** — short label on cards (`Giữ phòng` / `Đặt`), full label on the big CTA bands (`Giữ phòng cuối tuần`). A wrapping/colliding card button = FAIL. (The rule is one CTA *intent*, fit to context — NOT one literal string everywhere.)
- **No text collides with adjacent elements** at any breakpoint you screenshot.
