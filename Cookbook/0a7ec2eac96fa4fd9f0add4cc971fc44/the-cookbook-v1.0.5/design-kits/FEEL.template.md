# FEEL.md — the LOOK for [project name]

*This is the project's LOOK, written ONCE and read on EVERY build so everything stays visually consistent. It's the "skin" — the FEED you pick: Claude reads it to make pages look intentional, not generic. Fill it from a reference site (extract the real tokens from its CSS) or by choosing a direction. This file is LAW — Claude obeys it; it does not re-decide the style per feature.*

*FEEL is the shared visual FEED. Both a landing (`CONTENT.md` + `BLOCKS.md`) and an app (`DESIGN.md`) read it. Motion lives in its sibling `MOTION.md`. A head may reference these tokens but must never redefine a color/font — a value that lives only here cannot drift.*

*Replace every [bracketed] prompt with your real value. Delete the guidance once filled.*

## The feeling (one line)

[One sentence that decides everything below — the mood and the two signature moves. State it as a feeling plus the mechanism that carries it: e.g. "Calm and editorial — serif headings on an off-white page, a single accent, generous whitespace."]

## Color tokens

```
--brand:      #______   /* primary accent — buttons, links, highlights */
--brand-deep: #______   /* darker shade for gradients / hover states */
--accent:     #______   /* secondary accent — CTAs, prices, dividers (reserve; never large fills) */
--bg:         #______   /* default page background */
--bg-2:       #______   /* alternating section background (for rhythm) */
--ink:        #______   /* body text / dark sections */
--ink-soft:   #______   /* secondary text */
--line:       #______   /* hairlines, borders */
--white:      #FFFFFF
```

**Usage rule:** [Common practice: pick ONE background as default and alternate two backgrounds between sections for rhythm; reserve the accent for CTAs / prices / dividers and never for large fills; make the brand color the interactive color. State your project's rule in one or two lines.]

## Type

```
--display: '______', serif|sans   /* all headings */
--body:    '______', sans          /* body, labels, buttons */
--accent-type: '______'            /* optional — eyebrows / kickers only */
```

- **Headings** = [font, size, weight — the display type is the whole visual signature; state it].
- **Body / UI / buttons** = [font + rule, e.g. "buttons uppercase, letter-spacing .12–.15em, ~13px"].
- **Type scale** = at least 4 distinct steps (display / heading / body / small). Do NOT keep it flat — size contrast is what reads as "designed."
- Load [the web fonts to include].

## Layout & composition

*(Mandatory — tokens can't rescue a flat, boxy page. This section is what decides "looks good" vs "looks generic." Common practice, adapt the numbers.)*

```
--max:        ____px   /* content max width (commonly ~1100–1280) */
--max-narrow: ____px   /* text-heavy blocks (commonly ~640–880) */
section padding: ____px 0   /* vertical rhythm — generous; don't crowd */
container padding: 0 ____px
```

- **Hero:** [Common practice: a full-bleed background image with the text anchored to one edge over a *directional* scrim — not centered text floating in a sea of photo. Scrim recipe, e.g. `linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.35) 45%, transparent 70%)`.]
- **Section rhythm:** [generous vertical space; alternate light/dark surfaces so the eye rests].
- **Density vs emptiness:** [pick per audience. Editorial-minimal reads as calm to some audiences and as "unfinished/expensive" to others — decide which you want and commit].
- **Avoid:** an image floating in a rounded bordered box with margin; three identical equal cards; a flat type scale; dead whitespace passed off as "design."

## Components

- **Buttons:** [shape (pill / square), padding, size, primary vs secondary — e.g. "pill; primary = accent fill; secondary = outline that fills on hover"].
- **Cards:** [border-radius, surface, shadow — e.g. "radius ~4–8px (not heavily rounded); soft, low-opacity shadow tinted with the brand color, never hard black"].
- **Shadows:** [always soft + low-opacity + tinted to the brand — not harsh black].
- **Dividers:** [e.g. "a thin accent rule, short, centered under headings"].
- **Images:** [e.g. "full-bleed hero; content images at a fixed ratio (4:3 / 16:9) with a caption bar"].

## Craft law — the awwwards bar (NON-NEGOTIABLE, applies to every build)

*This is what separates STRIKING from merely competent. "Nice photo + big serif headline + clean
sections" = competent = NOT good enough. Every build MUST hit these. The `craft-check.md` gate
verifies them; a page that fails ≥3 is not done. Grounded in award-winning hospitality/editorial
patterns — these are mechanics, not vibes.*

- **Type must be genuinely large.** Hero/statement display uses an **8–12vw coefficient**, not ~5vw: `clamp(3rem, 10vw, 12rem)`, line-height **0.95**, letter-spacing **-0.03em**. Small+caps labels go the OTHER way: `letter-spacing: 0.2em`, uppercase. The 0.95↔1.6 line-height contrast is a core premium signal.
- **Accent = italic serif, NOT a color word.** The emphasized headline word uses `font-style: italic` (the quiet-luxury idiom). Do NOT swap its color. (This is the #1 tell that betrays an AI-default page.)
- **Bottom-weighted hero scrim, never a flat wash.** `linear-gradient(to top, rgba(ink,.6) 0%, rgba(ink,.15) 35%, transparent 60%)` — keep the top ~40% of the photo clean. A full-image `rgba(0,0,0,.4)` overlay is the amateur tell.
- **A mono/caps micro-label layer.** Numbered, tracked eyebrows ("01 — [SECTION]", uppercase, `letter-spacing:.2em`, ~11–13px). This one layer instantly reads editorial.
- **Break the grid at least once.** Not every section centered/6-6. At least one asymmetric section (spans like `2/7` + `8/13`) or an off-grid image with its caption in the OPPOSITE column.
- **Generous space.** Section vertical padding `clamp(4rem, 10vw, 12rem)` (≥8rem desktop). Body text `max-width: 65ch` even in a wide container — decouple measure from container.
- **Tall, alive imagery.** Feature/room cards `aspect-ratio: 3/4` or `4/5` (portrait reads premium); hero photo gets a subtle scale `1.0→1.1` Ken Burns on scroll.
- **Show PEOPLE enjoying the mood — empty space reads cold/creepy.** A page of only empty rooms and unpeopled landscapes feels sterile or eerie. Include at least one or two images of a PERSON living the experience (a couple on the deck at dusk, someone at the window with coffee, hands at the breakfast table) — it sells the FEELING, not just the property.
  - **MOOD imagery → faces TURNED AWAY** (from behind / soft profile / silhouette / just hands). AI faces are often uncanny and *that* is what reads "creepy". Warmth comes from a candid moment (wrapped in a blanket, looking at the view), never a staged stock smile.
  - **PROOF / HOST / TEAM imagery → a real FACE is right here** (a testimonial or "về chủ nhà" needs a face to be trusted — faces-away would feel evasive). But keep it CANDID and natural (a genuine in-between moment, looking at each other or off toward the view, relaxed real smiles), NOT a stiff studio portrait staring at the camera — that's where AI faces go uncanny. Humble, warm, alive.
  - If a generated image feels off, it's usually the face — regenerate (faces-away for mood; candid-not-stiff for host/proof).
- **Flat surfaces.** No card drop-shadows. Separate with whitespace + 1px hairline rules; one purposeful elevation max. No glassmorphism.
- **Polish trio:** hero `height: 100svh` (not vh), a `prefers-reduced-motion` block, `poster` on any hero video.
- **Nav transparent → blur-solid on scroll** (IntersectionObserver sentinel at hero bottom), not a static solid bar over the hero.
- **Meaningful button hover — motion that reinforces the ACTION, not decoration.** A primary CTA hover should *say something about what happens next*, not just change color: an **arrow/chevron that slides in** (→ "go / next"), a **fill-sweep that wipes across** (left→right, reads as "commit / confirm"), a subtle **lift + shadow** (reads as "pressable"), or a **label micro-shift** making room for an icon. Pick ONE per button and keep it fast (`{--dur-fast}`, `{--ease}`). Match it to the verb: a "Reserve / Giữ chỗ" button committing → a fill-sweep or an arrow that lands; a "Xem / View" button → an arrow-out. The secondary/ghost button gets a quieter version (border→fill). Never a bouncy/springy hover (toy, not premium). Every interactive element (cards, links, chips) gets a deliberate hover state — no dead, unresponsive elements.
- **Hero text MUST clear the fixed nav — no overlap, ever.** The nav is `position:fixed` (~64–80px tall). The hero content must start BELOW it: give the hero a `padding-top` ≥ the nav height (e.g. `padding-top: clamp(6rem, 12vh, 9rem)`) OR anchor the copy to the lower half (`justify-content:flex-end`) with bottom padding. NEVER vertically-center a huge headline with no top clearance — at a short/wide viewport the top lines ride up UNDER the nav (a shipping bug). Test at 1440×720 AND 1280×800, not just 1440×900. The headline's own `line-height:0.95` means its ascenders sit high — leave headroom.
- **The eyebrow must clear the headline too — mind the tight line-height.** A big display headline with `line-height:.94` has ascenders that overshoot its text box UPWARD. A `margin-bottom` on the eyebrow alone is eaten by that overshoot. Give the eyebrow real separation: `margin-bottom: clamp(1.5rem, 3vh, 2.5rem)` AND the headline a small `padding-top` (≈`.1em`) so the tallest ascenders ("B", "l", "đ") never touch the eyebrow. This matters MOST for a MULTI-LINE hero headline (a `<br>` doubles the height and pushes the top line up into the eyebrow) and at short viewports (1440×720) where vertical space is tight. If the headline is two lines, budget extra top clearance and re-test at 1440×720.

*Premium hospitality palette default if the brief has none: ivory `#F4EFE7` · warm tan `#C9B79C` · gold `#B08D57` · near-black `#161412`. (Replace with the brand's own — but keep ONE accent.)*

## The signature moment (pick EXACTLY ONE — zero = forgettable, many = noisy)

The one memorable thing that makes the page "wow". Choose ONE and do it well:
- **Preloader that becomes content** (a 0→100 counter that hands off into the hero headline)
- **Velocity-coupled marquee** of room/section names (scroll speed drives the scroll speed)
- **Cursor magnet / custom cursor** that grows over images
- **Pinned horizontal-scroll gallery** (rooms scroll sideways as you scroll down)
- **Scroll reveal-mask** (`clip-path: inset(100% 0 0 0)→inset(0)` as a section enters)
- **Interactive property map** (SVG hotspots filter a gallery)
- **A dark/gradient full-bleed band** for the single most important section

State which ONE, and where it goes. Do not scatter multiple wow-moments — one, weight-bearing.

## How to re-skin (this is why FEEL is a FEED)

1. Change the color tokens + font names above. Same layout, new look.
2. Tell Claude: "Apply FEEL.md as the look." Claude reads the tokens and builds to them — you don't describe a style in prose.
3. This is how the same page becomes a different brand (spa, clinic, course) — swap the skin, keep the structure. Pick a different FEEL feed, keep your CONTENT + BLOCKS.
