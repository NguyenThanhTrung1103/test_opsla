# MOTION.md — how it MOVES for [project name]

*The shared motion FEED, written ONCE and read on every build. Sibling of `FEEL.md` (look).
This file owns only the movement PRIMITIVES — the curve, the timing, the accessibility policy,
the temperament. The actual animations live in the heads: app feedback in `DESIGN.md`,
marketing reveal/glow in `BLOCKS.md`. Both cite the SAME curve + timing here, which is what
keeps a landing and an app feeling like one brand.*

*A head may reference `{easing}` / `{duration.*}` but must never invent a new curve or duration.
Replace every [bracketed] prompt with your real value. Delete the guidance once filled.*

## The movement adjective (one line)

[ONE phrase for how this brand moves — everything on every surface inherits it. Keep it calm:
soft fades, no bouncy motion, unless the brand is deliberately playful. e.g. "calm and editorial —
gentle fades, nothing bounces" OR "springy and playful — quick overshoot on entrance."]

## Timing & easing tokens

```
--ease:          [cubic-bezier(0.2, 0, 0, 1)]   /* the one brand curve — everything uses it */
--dur-fast:      [150ms]   /* feedback / state change — the app leans here */
--dur-slow:      [400ms]   /* reveal / entrance — the landing leans here */
```

- Heads pick FROM this scale. They never write a raw `300ms` or a new curve inline.
- App feedback (hover, toggle, modal open) → `--dur-fast` + `--ease`.
- Marketing reveal (scroll-in, stagger, hero entrance) → `--dur-slow` + `--ease`.

## The interactions a VISITOR touches (landing motion, carried by BLOCKS.md)

*(These are the few motions that make a landing feel like a real tool, not a static page. Kept
here as the shared recipe; BLOCKS.md says which unit uses which. Keep them calm — soft fades.)*

- [Common pattern: opening a document/preview in a centered modal / lightbox rather than a raw download — scrim over the page, panel centered, close on ✕ / scrim / Esc, lock body scroll, fade ~150ms.]
- [Common pattern: filter tabs or a search that re-render in place instantly (no page reload); the active tab takes the accent.]
- [Common pattern: a sticky header that gains a solid background / shrinks after ~40px of scroll so it stays legible over both hero and content.]
- [Common practice: smooth-scroll for in-page anchors; optional gentle reveal-on-scroll.]

## Parallax — TRUE layered depth (the awwwards kind), ONE moment

*Parallax means DIFFERENT DEPTH LAYERS moving at DIFFERENT SPEEDS as you scroll — near things
slide past faster than far things — so the scene feels 3D. Moving one flat photo as a block at
0.6× the text is NOT parallax; it's a scroll offset and it reads flat. Do the real thing, on ONE
moment (the hero), or don't claim parallax.*

- **A flat single photo CANNOT parallax.** You need the scene as SEPARATE DEPTH LAYERS. Two ways:
  - **Layered images (best):** the hero scene generated/cut as 3 stacked layers — `background` (far mountains + mist + sky), `midground` (the subject: cabin / building, transparent PNG), `foreground` (near trees / grass framing the edges, transparent PNG). Stack them absolutely, all `inset:0`, `object-fit:cover`.
  - **Layered composition:** if you only have a flat photo, layer the TEXT and a couple of decorative elements (an SVG tree line, a fog gradient) at different speeds over it — weaker, but still real speed-differential.
- **Speed ladder (the whole point):** on scroll, translate each layer by a DIFFERENT factor of scrollY:
  `background * 0.15` (barely moves — it's far), `midground * 0.35`, `headline/text * 1.0` (moves with the page), `foreground * 0.55` (near, moves noticeably but the text still outruns it). The GAPS between these factors are what create depth. Keep max translate ≤120px per layer so no edge gap (oversize each layer `top:-12%; height:124%`).
- **Drive it:** ONE rAF-throttled scroll listener writes `--scroll`; each layer reads it with its own factor. Or GSAP ScrollTrigger `scrub` with per-layer `y`.
- **Where — the HERO.** It must be PERCEPTIBLE on the first scroll: the near trees should visibly slide past the far mountains. If you scroll and the layers move together, it failed.
- **Ken Burns can ride on the midground** (its slow scale) — combine, don't compete.
- **Collapse under `prefers-reduced-motion`:** all layers static, `transform:none`.
- **Ban:** moving one flat photo as a block and calling it parallax; parallax on multiple sections; deltas that reveal edge gaps; `background-attachment:fixed` on mobile.

### Mouse-move depth (the diorama effect) — depth felt WITHOUT scrolling
*On a full-bleed layered hero, let the layers shift subtly with the cursor so the scene has depth even before you scroll — like looking into a diorama.*
- On `mousemove`, offset each layer by a fraction of the cursor's distance from center: near/foreground layer moves MOST, far/background LEAST — `translate(calc(mx * K_layer), calc(my * K_layer))` where K_bg≈4px, K_mid≈9px, K_fg≈16px at the frame edges (keep max ≤~18px so it's a subtle sway, not a slide). Lerp toward the target each frame for smoothness (`cur += (target-cur)*0.08`).
- **Combine with scroll parallax** (they add): scroll moves layers vertically at their scroll factors; mouse adds the small x/y sway. The hero uses BOTH.
- **Disabled on touch** (`(pointer:coarse)` → skip) and under `prefers-reduced-motion`. Mouse depth is a desktop nicety, never required.

## Image reveal — the AWWWARDS MASK-SLIDE (a panel slides off the image)

*The premium reveal is NOT a plain fade, and NOT just a clip growing. It's a SOLID MASK PANEL that
SLIDES ACROSS and off the image to uncover it — like a curtain pulling back — while the image
underneath slides/scales the OTHER way (counter-motion = depth). Two layers moving is the signature.*
- **Structure:** each image sits in an `overflow:hidden` wrapper. Inside: the `<img>` + a sibling
  **mask panel** (`::after` or a div) that fully covers it — a solid color (the surface/accent/ink)
  or the section's dark tone.
- **The slide (on enter-view, once via IntersectionObserver):**
  1. **Mask panel** starts covering (`transform: translateX(0)` / `scaleX(1)` from `transform-origin:left`), then slides OFF: `translateX(101%)` (slides to the right) or `scaleX(0)` from `transform-origin:right` — uncovering the image left→right. `~0.7–0.9s`, `{--ease}`.
  2. **Image underneath** starts slightly offset + scaled (`scale(1.12)` and/or `translateX(-6%)`), and settles to `scale(1) translateX(0)` over a slightly longer beat (`~1.0–1.2s`) — so as the mask pulls off, the image drifts INTO place behind it. The counter-motion is what makes it feel expensive.
  - Optional two-tone: the mask can be TWO stacked panels in accent + ink that slide in sequence (a beat apart) for the classic fashion-editorial double-wipe.
- **Stagger a grid** (rooms/gallery): `~90–130ms` per card so the panels peel off in a cascade.
- **Direction:** left→right or bottom→top; pick one and keep it consistent across the page.
- **Collapse under `prefers-reduced-motion`:** image fully visible, mask hidden, no transforms.
- Pairs with (doesn't replace) the hover-scale — reveal is the enter-view curtain, hover is the interaction. Ensure the reveal transform on the img is cleared/compatible so hover-scale still works after.

## Pinned horizontal-scroll gallery (Framer-style) — page-scroll drives sideways

*The premium gallery does NOT ask the user to drag ("kéo ngang"). Instead the section PINS, and as
the user scrolls the page DOWN normally, the gallery track moves SIDEWAYS automatically. One natural
scroll gesture; the content translates horizontally. This is the awwwards signature (S5).*
- **Structure:** a tall spacer section (`height: e.g. 250–320vh` depending on track width) wraps a
  `position:sticky; top:0; height:100vh` viewport containing the horizontal `.track` (a flex row of slides).
- **Mechanic:** compute the section's scroll progress 0→1 (sticky wrapper rect). Translate the track
  `transform: translateX(calc(progress * -(trackScrollWidth - viewportWidth)))` — at progress 0 the
  first slide is in view, at progress 1 the last slide is. Drive from ONE rAF scroll listener; lerp
  for buttery motion. Scroll down = pan right; scroll up = pan left (reversible).
- **Kill the drag hint.** Remove "kéo ngang / drag" copy — the whole point is the user just scrolls
  normally. Optionally a subtle progress indicator (dots / a thin bar) shows position in the set.
- **Mobile / touch / reduced-motion:** DON'T pin/scroll-jack on touch — fall back to a normal
  native horizontal `overflow-x:auto; scroll-snap` rail (swipeable) OR a simple stacked column.
  Feature-detect `(pointer:coarse)`/reduced-motion and downgrade. (Pinned horizontal scroll-jacking
  on a phone is miserable.)
- **Restraint:** one pinned horizontal section per page (it competes with the pinned hero for the
  "pin" budget — a page with two pinned scroll-jacks feels gimmicky; the hero is the primary pin, a
  gallery can be the secondary if the page is long enough to earn it).

## Staggered-gallery / offset-grid parallax — extend the depth language into the body

*The hero has depth; the body shouldn't go flat right after. For an OFFSET gallery or a staggered
grid of images (a few photos at different vertical positions), let each image drift at a slightly
different scroll speed — they slide past each other = magazine depth. This makes parallax the
site's SIGNATURE, not a one-off hero trick.*
- **Where:** a gallery/grid of a FEW images that are already vertically staggered (e.g. a 3-photo
  cluster where the middle sits higher). NOT every card on the page — a purposeful few.
- **Mechanic:** as the section scrolls through view, translateY each image by a small per-item
  factor — e.g. `img-1 * -0.06`, `img-2 * +0.04`, `img-3 * -0.10` of the section's scroll progress
  (or map each to a data-speed attribute). **Keep offsets SUBTLE: ±30–50px max.** They should drift
  past each other, never leap.
- **Same easing family** as the hero (`{--ease}`), driven by the same rAF scroll loop.
- **Restraint (the anti-gimmick line):** subtle amounts, a few elements, one section or two — NOT
  every card everywhere. "Parallax on everything" is the #1 way to cheapen a site. A staggered
  gallery + the hero is the right dose.
- **Collapse under `prefers-reduced-motion`** and on very small screens (offsets → 0).

## SVG line-draw (route / map / connector tracing)

*A stylized SVG map, a route between two points, a timeline connector, an underline — animate it
DRAWING ITSELF when it scrolls into view. Tasteful, purposeful, one element. Reinforces meaning
(the route from A to B literally traces the journey).*
- **Prefer SCROLL-SCRUBBED over fire-once.** A one-shot draw (IntersectionObserver, plays once) is fine but flat. Better: tie the draw to SCROLL PROGRESS so it draws as you scroll DOWN through the section and UN-draws as you scroll back UP — the line is bound to scroll position, reversible. Same feel as the pinned hero. This is the premium version.
- **Scroll-scrub mechanic:** compute the section's scroll progress 0→1 (`progress = clamp((viewportBottom - sectionTop) / (viewportH + sectionH), 0, 1)`, or use the sticky-wrapper rect like the hero). Map progress → the draw amount: `stroke-dashoffset = length * (1 - progress)` (or the clip-rect width = `progress * fullWidth`). Drive it from ONE rAF-throttled scroll listener. Scroll forward → draws; scroll back → erases. The destination pin's pop can be tied to progress crossing ~0.8 (and un-pops below it).
- **One-shot fallback:** if scroll-scrub is overkill for a tiny element (an underline), fire-once via IntersectionObserver is acceptable — but for a map/route/hero-scale line, scrub it.
- **Timing:** the scrub IS the timing (scroll speed drives it). For a one-shot, `1.2–2.5s`, `{--ease}`. For a route/map, the dashed road draws pin-to-pin as you scroll; the destination pin pops as the line reaches it.
- **Restraint:** one traced element per section. A map draws its route; don't also animate ten other lines. Pairs with (doesn't replace) the section's ONE signature move.
- **Collapse under `prefers-reduced-motion`:** the path renders fully drawn (dashoffset 0) instantly, no animation.

## Pinned scroll-stage hero (scrollytelling entrance) — give the hero room to PERFORM

*A one-screen hero is glanced-past; all that layered-parallax craft never gets felt. Instead, PIN
the hero and make it a ~2–3 screen scroll sequence the visitor scrolls THROUGH — the depth
performs. This is the awwwards cinematic entrance.*
- **Mechanic:** wrap the hero in a tall spacer (`height: 300–400vh` for a 3-act sequence — give it room to breathe; a cramped pin feels rushed); inside it a `position:sticky; top:0; height:100vh` stage that stays pinned while the spacer scrolls past. Map the spacer's scroll progress (0→1) to a **3-act timeline** (2 acts feels thin — build to a climax):
  - **Act 1 (0→~30%):** headline holds, then eases up/out. Layers begin traveling (bg drifts, fg starts to sweep).
  - **Act 2 (~30→65%):** a second beat (sub-line / location line / quote) fades in as the headline releases; the camera continues pushing in (midground dolly scale up).
  - **Act 3 (~65→100%) — the CLIMAX:** the camera pushes ALL the way in (max dolly, mid scales to its largest, fg sweeps fully past the edges), the scene RESOLVES (e.g. the cabin lamp glows warmer, fog settles, a final vignette) — the emotional peak — before the pin releases into the page. Optionally the second beat holds or a final micro-line/CTA lands here.
  - at progress 1 the pin releases and the page continues into section 02.
  - **Each act needs scroll room** — with a 3.5–4 screen spacer, no act is glanced-past. If it feels too fast, lengthen the spacer, don't cram the acts.
- **Drive it:** GSAP ScrollTrigger `pin:true, scrub:true, end:'+=200%'`, OR a rAF scroll listener reading the sticky wrapper's progress. Keep it BUTTERY — `scrub` (tied to scroll position), never time-based autoplay.
- **Restraint:** ONE pinned stage (the hero). Don't pin every section. The travel should feel like a slow cinematic push, not a jump.
- **Mobile + reduced-motion:** collapse to a normal 100svh static hero (no pin, no long scroll) — pinned scroll-jacking is bad on touch. Feature-detect and downgrade gracefully.
- **Why it's worth it:** it converts "1 screen you skim" into "a 2–3 screen entrance you feel" — the payoff that justifies the layered-parallax effort.
- **Keep it subtle:** translate deltas ≤120px total, or gaps appear at section edges. A 3-plane version (sky slowest → mid photo → headline fastest) reads richest — but still ONE section.
- **How:** a rAF-throttled scroll listener writing `--scroll`, or a ScrollTrigger `scrub:true`. NOT `background-attachment:fixed` (janky on mobile — disable there).
- **Collapse under `prefers-reduced-motion`:** no parallax at all, static.
- **Ban:** parallax on multiple sections, deltas that create visible edge gaps, `background-attachment:fixed` on mobile, parallax so strong it detaches the text from its image.

## Reduced motion (identical on every surface — a11y is not per-surface)

- All motion collapses under `prefers-reduced-motion` — reveals become instant, no parallax/marquee.
- This policy is the SAME for the app and the landing. Never make one surface honor it and not the other.
