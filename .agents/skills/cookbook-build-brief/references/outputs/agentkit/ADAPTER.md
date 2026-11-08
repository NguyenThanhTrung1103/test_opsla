# Output adapter: AgentKit

Input: INTENT.md (intent/v1.x). Output: docs/BRIEF.md in the repo, followed by one line for the user: `/ak:plan docs/BRIEF.md` (or `/ak:brainstorm` first if INTENT has blocking Open items).
Body = the generic-brief shape (slots/output/generic-brief/ADAPTER.md), plus:
- "Operator away" rule: decide routine choices yourself and log them in docs/decisions.md; Open business values stay keys, never guessed.
- The plan phase table must use `| # | Phase | Depends on | Status |`.
- Recipes: copy each named recipe into `docs/cookbook/<id>.workbook.md` and add to BRIEF: "Before /ak:plan, read each docs/cookbook workbook: its DETECT runs first, its §2b decisions go to the plan gate (answered in INTENT = decided; the rest = workbook default, confirm), its §2c/§9 traps become edge cases, its invariants become acceptance criteria, its §7 probes run in /ak:test." This is the same consumer contract as Buildflow rule 06.
