# INTENT.md schema: intent/v1.1 (v1 + Recipes)

The only interface between the chat and everything downstream (checker, output adapters). Use these headings exactly. Leave out a section the depth skips. Never write "N/A".

```
# Intent: {name}
schema: intent/v1.1 · depth: {D0|D1|D2} · product: {existing name | new} · words: {N}

## Need            who pays/benefits · why now · goal link · filter result (state any "no")
## Problem         symptom · who/when · alternatives → why each fails (≥2)
## Audience        (D2) beachhead · personas: pains / wants / tech / buys · not-for. Hypotheses marked "assumed, verify by …"
## Positioning     (D2) one line · price anchors with sources · pricing shape · never-say words
## Facts           decided values only
## Journey         numbered steps, each In / Later
## Scope           In: numbered · Out / non-goals: explicit
## Recipes         (when a recipe index was used) journey step → recipe id · gaps: steps with no recipe
## Decisions       B# or recipe:decision — choice — one-line why
## Done            numbered observable behaviours on the running thing
## Go-to-market    (D2) channels in yield order · activation metric · 30/60/90 · kill numbers
## Open            question — owner — what it blocks
```
Budget: D0 ≤ 300 · D1 ≤ 800 · D2 ≤ 1500 words.
