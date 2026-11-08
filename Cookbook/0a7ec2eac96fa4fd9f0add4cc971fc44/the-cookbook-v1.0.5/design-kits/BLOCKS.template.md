# BLOCKS.md — the SHAPE of your page's repeating pieces

*The third file, between `CONTENT.md` (what each section SAYS) and the FEED (`FEEL.md` = how it
looks, `MOTION.md` = how it moves). BLOCKS.md says how the RECURRING PIECES are put together —
the card that repeats, the hero, the CTA band — so the AI builds the SAME shape every time
instead of inventing a new one per section. That sameness is what makes a page look like ONE
site, not five pages glued together. This is also where the landing's MOTION lives (reveal,
glow, sticky header) — drawn from `MOTION.md`, never a new curve.*

*You do NOT fill this from a blank either: the `STOREFRONT-BRIEF` prompt has Claude DERIVE these
blocks from your `CONTENT.md` sections + the FEED. This file is the SHAPE Claude writes to, and
the yardstick you judge the built page against.*

**Why blocks matter:** the #1 reason an AI page looks "generic" isn't the colors — it's that the
testimonial card in section 5 looks nothing like the offer card in section 3, and the buttons
change shape down the page. Fix the *piece*, and every section inherits the fix. A block is a
piece you'd recognize on any page of the site.

**Two rules that keep it consistent** (tell Claude these):
1. **One piece, one shape — everywhere.** A testimonial card has the SAME parts in the SAME order
   in every place it appears. Same for buttons, cards, section headers.
2. **Every value comes from the FEED.** A block never picks its own color, font, radius, or motion
   curve — it uses `{--accent}`, `{--ease}`, `{--dur-slow}` from `FEEL.md` / `MOTION.md`. Change the
   feed, every block re-skins for free.

---

## The blocks (derived from your CONTENT.md sections)

For each recurring piece, say: its PARTS (in order), the RULE (what's always where), how it
REPEATS, and its MOTION (from `MOTION.md`). Claude fills these from your CONTENT + FEED; you
check the built page matches.

| Block | Parts (in order) | The rule | Motion (from MOTION.md) |
|---|---|---|---|
| **Hero** | mono/caps eyebrow ("01 — [loc/est]") · HUGE display headline (italic-serif accent word) · sub ≤65ch · trust line · TWO CTAs · full-bleed image/video | pick ONE hero pattern (below); `height:100svh`; bottom-weighted scrim (top 40% clean); text anchored bottom-left, NOT centered; display 8–12vw / lh 0.95 | staggered masked line reveal on load (`y:24→0`, stagger .08, `{--ease}`); Ken Burns scale 1.0→1.1 on the photo |
| **Button** | label only | ONE INTENT everywhere, label FITS CONTEXT: short on cards (`Giữ chỗ`/`Đặt`), full on CTA bands (`Giữ chỗ cuối tuần`). Never let a card button wrap/collide with price. primary = `{--accent}` fill; secondary = 1px outline | hover fill, `{--dur-fast}` `{--ease}` |
| **Feature / room card** | image (**3:4 or 4:5 portrait**) · mono label · title · one line · price · SHORT CTA | identical anatomy across all; ONE elevated "featured" card; **flat + 1px hairline, NO drop shadow**; price and button never collide (stack price above button, or full-width button) | reveal on scroll `{--dur-slow}`; hover lift + subtle image scale |
| **Testimonial** | [avatar] · quote (italic serif) · name · [result] | quote first; a REAL face/number or SKIP (never fake); sits right before a button | reveal on scroll |
| **CTA band / signature** | one-line outcome · CTA (full label) | the ONE signature moment (from FEEL) lives here or the hero — dark/gradient full-bleed, used ONCE | subtle; a rest point |
| **Booking / conversion band** | numbered eyebrow · big headline (italic accent) · a SINGLE refined form column · a secondary contact path (Zalo) as a text link or small ghost | the emotional CLOSE — must be as composed as the hero. Prefer **full-bleed imagery (e.g. the dusk photo) with the form floating on it** over a directional scrim, OR a deliberate editorial band. NEVER a bare form-in-a-box beside an empty dark panel. No empty panels, no bald 50/50 boxes. | form fields reveal staggered; the band gets a slow entrance |
| **Section header** | mono/caps numbered eyebrow ("02 — [section]") · title · [hairline] | same rhythm above every section; the numbered label layer is mandatory | reveal on scroll |
| **Sticky header** | logo · nav · SHORT CTA pill | starts TRANSPARENT over hero → `backdrop-filter:blur(12px)` + solid bg after scroll (IntersectionObserver sentinel at hero bottom); nav links hide < 760px, pill stays | bg/color fade `.4s ease` |

### Pick ONE hero composition pattern (don't default to centered-text)
- **Full-bleed video/image + bottom-anchored copy** — muted loop w/ `poster`; copy bottom-left; bottom-weighted scrim.
- **Oversized headline with edge-bleed** — `overflow:hidden` hero, one word runs past the edge; huge italic-accented type.
- **Corner-anchored metadata frame** — logo TL, nav TR, headline+CTA BL, rotating metadata BR (coords/est.); reads bespoke.
- **Split / asymmetric 60/40** — image 60%, editorial text panel 40% on warm ground; optional `clip-path` reveal on load.
- **Layered-depth parallax hero** — the scene as 3 stacked layers (background far-mountains/sky · midground subject transparent-PNG · foreground near-trees transparent-PNG), each translating at a DIFFERENT scroll factor (0.15 / 0.35 / 0.55) with the headline at 1.0 — near slides past far = real 3D depth. The premium signature. (See MOTION.md "TRUE layered depth". Needs layered images — generate them as separate depth planes if you only have a flat photo.) ADD: subtle mouse-move sway (diorama) so depth is felt on hover too, and consider making it a PINNED scroll-stage (below) so the depth has room to perform.
- **Pinned scroll-stage hero (cinematic entrance)** — the layered-parallax hero PINNED for ~2–3 screens (sticky stage in a 250–300vh spacer): as you scroll through it, the layers travel far (camera pushes toward the subject), the headline holds then releases, a second beat fades in, then it hands off to the page. This is what makes the hero FELT, not skimmed — the payoff for the layered craft. (See MOTION.md "Pinned scroll-stage hero". Collapses to a static 100svh hero on mobile/reduced-motion.)

*(Add or drop rows to match YOUR CONTENT.md sections. A block only exists if a piece repeats or
carries the brand — don't over-specify one-off decorations. But the hero, the numbered label
layer, and the ONE signature move are mandatory — they're what make it striking, not competent.)*

### Two-column split sections: STICKY the short column
When a section is a 2-column split where one side is a fixed-height MEDIA element (an image, a map,
a photo) and the other is a LONGER content column (a list, a story, multiple items), the media
column MUST be `position:sticky; top:<nav-height + gap>` so it stays pinned in view while the
longer column scrolls past it. Otherwise the short column ends early and leaves a dead empty gap
beside the scrolling content — the amateur tell. Applies to: location(map)+nearby-list,
host(photo)+story, any image-beside-a-long-list. On mobile (stacked) sticky is off — it's a
desktop two-column behavior. (The sticky column's own height must be ≤ viewport so it fully shows.)

---

## The landing's motion (the visitor-facing interactions, from MOTION.md)

These are the few motions a VISITOR touches — pulled from `MOTION.md`, assigned to the blocks
above. Keep them calm (soft fades, no bounce) unless your movement adjective says otherwise:

- **Reveal on scroll** — cards/sections fade+rise in as they enter view, `{--dur-slow}` `{--ease}`.
  Always collapses under `prefers-reduced-motion` (the `MOTION.md` policy).
- **Sticky header** — solid background / slight shrink after ~40px, `{--dur-fast}`.
- **Modal / lightbox** — open a preview centered over a scrim; close on ✕ / scrim / Esc; fade ~150ms.
- **Filter tabs** — re-render in place instantly; the active tab takes `{--accent}`.

*(No glow/marquee unless your brand's movement adjective calls for it — restraint reads as
premium. Marketing motion lives here; it must NEVER leak into an app's `DESIGN.md`.)*

---

## How to CREATE this file (direct Claude — you don't write it)

Same move as CONTENT.md and the FEED. You judge; Claude drafts.

1. Paste to Claude:
   > "Create a BLOCKS.md for my landing page. Derive the blocks from my `CONTENT.md` sections and
   > the FEED (`FEEL.md` + `MOTION.md`). Give each block its parts, the one rule, and its motion —
   > every value referencing the feed tokens, never a new color or curve. Show me the draft."
2. Claude drafts the block table + the motion list. **You read it as the owner:** does the
   testimonial card look like it belongs to the same site as the offer card? Is there ONE button
   shape? Is any block inventing a color/curve instead of citing the feed? Fix it, tell Claude.
3. Save as `BLOCKS.md`.

## How the files work together (after the FEEL/MOTION split)

- **CONTENT.md** = what the page says + section order.
- **FEEL.md** = how it looks (the FEED — pick / fork one).
- **MOTION.md** = how it moves (the FEED — the shared curve + timing).
- **BLOCKS.md** = how the repeating pieces are composed from all three (this file).
- Build prompt: **"Build my landing page. Use CONTENT.md for sections + copy, FEEL.md + MOTION.md
  for look + movement, and BLOCKS.md for how the pieces are built. Show me your plan first."**
  Then run `taste-check.md`.

*(The full pro version of this method is the vault `ship` skill.)*
