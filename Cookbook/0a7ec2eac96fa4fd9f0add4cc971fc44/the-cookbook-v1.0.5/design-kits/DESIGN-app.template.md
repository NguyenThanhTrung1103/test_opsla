# DESIGN.md — the app HEAD (behavior + app components) for [app name]

*The WEBAPP head. It reads the shared FEED — `FEEL.md` (look) + `MOTION.md` (movement) — and
adds what only an app needs: how editing feels, what words the user sees, what we never do, and
how the app's own components are composed. A landing page does not use this file (it uses
`CONTENT.md` + `BLOCKS.md` on the same feed).*

*The one rule: this file may REFERENCE the feed's tokens (`{--accent}`, `{--ease}`,
`{--dur-fast}`) but must NEVER redefine a color, font, or curve. Need a new primitive? Add it to
`FEEL.md` / `MOTION.md` — don't inline it here. A value that lives only in the feed cannot drift
between the app and the landing.*

*The rules below are common UX practices, not one app's specifics. Replace every [bracketed]
prompt with your app's real answer. Claude obeys this file; it does not re-decide behavior per feature.*

---

# A · UX PRINCIPLES (how the app behaves) — app-only, not in the feed

## North Star (one line)

[One sentence that decides everything — the trade-off your app resolves. A common one: "Simple for the everyday task, full power available but never in the way." State yours.]

## The user's mental model

- The user thinks in terms of **[their real-world object — e.g. a customer, a booking, an invoice]**, not in system/engine terms.
- Words the user should NEVER see (the implementation leaking through): [list yours — e.g. record, row, schema, endpoint, status enum, trigger]. If one lands in a button or label, that's a bug.
- Say the plain-language equivalent instead: [e.g. "send a reminder", not "fire notification action"].

## Interaction rules (the ones that override everything)

*Standard product-design principles; keep, drop, or add per your app.*

1. **Object-first, not feature-first.** The home of a thing IS the thing; tabs are lenses on the same object. The user never navigates "out" to reach something related to it.
2. **Defaults beat configuration.** A new item is usable in a handful of fields (~6). Anything more hides behind ONE "More options" disclosure. If a default fits ~80% of cases, ship it and demote the toggle.
3. **Plain language beats power syntax.** A human phrase ("4 days after it ends") beats a raw expression, code, or JSON in the everyday UI.
4. **Edit in place, don't navigate away.** The daily ~80% of edits happen where the value lives (inline); a separate edit screen exists only for the structural ~20% (rename, visibility, delete).
5. **[Any rule specific to this app.]**

## The edit-affordance ladder (pick the LIGHTEST rung the field allows)

*A common pattern for choosing HOW a field is edited — by the field's SHAPE, not where it sits. Count the inputs the user must touch to finish the edit.*

| Rung | Use when the field is… | Interaction | Typical examples |
|------|------------------------|-------------|------------------|
| **1 · Inline text** | one free-text value | click → input in place → save on blur / Enter | name, note, title |
| **2 · Inline control** | one value from a known set or format | click → the right native control in place (date picker, number stepper, select) → save on blur | date, quantity, status |
| **3 · Popover** | one value the user sees as one line, but composes from 2–4 related choices | click → small popover anchored to the field → "Done" writes back one line | a value with a type + detail (e.g. a choice plus its parameter), amount + currency |
| **4 · Modal** | a multi-field object, or a collection / list | click "+ Add" / "Edit" → dialog with all fields | a whole new record, a list of line items |

**Decision rule:** 1 free input → rung 1. 1 constrained input → rung 2. 1 *visible* value but 2–4 sub-choices → rung 3 (popover). A whole object or a list → rung 4 (modal). *A popover edits ONE display value and dims nothing; a modal edits an object/list and dims the page. When unsure: does finishing produce one chip on the page → popover, or a new row in a list → modal.*

**No dead-end fields.** An empty field renders as `+ Add {label}` that opens its own rung. Every value is fillable where it lives.

## Flow rules

*Common practice; adapt.*

- **Modal-first sub-actions:** small focused modals with ONE clear CTA (cancel, reschedule, remove). No multi-screen wizard for a single sub-action.
- **One screen shows less, not more.** The object's front door shows essentials; detail moves to specialized tabs/lenses.
- **Save inline; "Cancel" returns to where you came from.** No wizard to edit an existing thing.

## What to NEVER do (UX anti-patterns)

- Never expose implementation words ([your hidden vocab]) in user-facing text.
- Never show raw code / a template string / a JSON blob in the simple UI.
- Never use a multi-step wizard to EDIT an existing thing.
- Never leave a field a dead-end (no way to fill it where it lives).
- Never navigate the user "out" of an object to do something about that object.
- Never inline a color/font/curve — reference `FEEL.md` / `MOTION.md`, or add the primitive there.
- [Any anti-pattern specific to this app.]

---

# B · APP COMPONENTS (how the app's own parts are composed) — CITES the feed

*The look (color/type/layout tokens) lives in `FEEL.md`; the movement in `MOTION.md`. This half
only says how the APP-specific components — the ones a landing doesn't have — are assembled FROM
those tokens. Every value below is a reference, not a new definition.*

## App shell & layout

- **Shell:** [describe the frame — e.g. sidebar + topbar; an object-detail page commonly uses a compact metric strip + a few hero actions + lens tabs]. Widths/spacing come from `FEEL.md` (`{--max}`, section rhythm).
- **Forms:** 1 column, ≤ ~6 visible fields (more → one disclosure). [labels ~12px weight 500 in `{--fg-muted}`; inputs ~36–40px, 1px `{--border}`, focus ring in `{--accent}`; a sticky save bar while editing.]
- **Density:** enough to feel complete and trustworthy — but each screen shows less, not more.

## Components (compose from `FEEL.md`)

- **Buttons:** primary = `{--fg-base}` or `{--accent}` fill; secondary = `{--border}` outline; [shape + padding + size].
- **Cards:** radius + surface from `FEEL.md`; gradients only on hero surfaces, never on tables / forms / page backgrounds.
- **Tabs (lenses):** the active tab uses a 2px bottom border in `{--fg-base}`; tabs are lenses on the same object.
- **Shadows:** one purposeful elevation (the `FEEL.md` tint rule — soft, low-opacity, brand-tinted); don't stack shadows.

## Iconography

- Stroke line icons (Lucide / Heroicons style), `stroke-width: 1.6–2`, no fill.
- **No emojis. Anywhere. Ever.** Use SVGs.

## App motion (compose from `MOTION.md`)

- Feedback + state changes (hover, toggle, modal open, save) use `{--dur-fast}` + `{--ease}` — fast, mechanical, invisible-when-good.
- Do NOT import marketing motion (scroll-reveal, glow, marquee) into the app — that belongs on the landing (`BLOCKS.md`). Both surfaces share the same `{--ease}` so they feel like one brand.

## How to use / re-skin

1. Read the FEED (`FEEL.md` + `MOTION.md`) and this head BEFORE every build. All three are law.
2. Re-skin = swap the FEED (pick a different `FEEL.md` / `MOTION.md`). This head does not change — same behavior + component composition, new look. That is the whole point of the split.
3. Change behavior (part A) only deliberately — edit it here, once, with a dated note.
