# Output adapter: Buildflow

Input: INTENT.md (intent/v1.x). Output: the Frame files Buildflow's flow-frame step expects, pre-filled so the human only reviews:
- `IDEA.md` (IDEA.template.md headings): The app in one line ← Need · Who ← Audience/Need · The story ← Journey (In steps as one real case) · What hurts today ← Problem · Must never happen ← Decisions on owner-only, money and data paths · The outside world ← vendors named in Facts/Decisions · Not now ← Scope Out + Journey Later · Unsure ← Open · Material ← sources cited in INTENT.
- Each Recipes row → the feature's INTENT gets `Blueprint: buildflow/cookbook/<id>.workbook.md` (Buildflow rule 06). Recipe decisions already answered in INTENT go to the SPEC gate as "decided in IDEA: <choice>", and the human confirms once instead of being re-asked. Unanswered ones keep the workbook default for the gate.
- Recipe gaps → the route line says "no workbook on the shelf for this".
- Start-stage overlap: when INTENT is D2 with Positioning and Go-to-market, Buildflow Start treats market, offer and price as drafted, and its gates review them instead of re-deriving them. Gates are never skipped.
Never add a value that is not in INTENT.
