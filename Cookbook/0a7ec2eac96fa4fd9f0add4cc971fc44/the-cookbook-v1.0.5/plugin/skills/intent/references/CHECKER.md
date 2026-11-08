# Checker (paste an INTENT.md after this prompt)

Check the INTENT.md below against schema intent/v1.1 before an AI builds from it. Do not rewrite it. Reply with exactly:

```
RESULT PASS | GAPS
1. <section> — <gap> — <question to send back to the builder>
...
```
Report a gap when any of these hold:
- A heading is missing for the depth, or a heading is not in the schema.
- A Done item cannot be observed on the running thing ("tests pass", "works well", or a result that depends on motivation).
- A business value (price, rate, threshold, legal text) has a guessed number instead of being in Facts (decided) or Open (with an owner).
- A CHECKLIST item for the depth appears neither in Decisions nor in Open.
- A Journey step is not marked In or Later, or the Scope In/Out could be read two ways.
- The depth is too shallow for the stakes: money, legal, personal data or a new audience at D0.
- Recipes is present but an In journey step is neither mapped to a recipe nor listed as a gap, or a mapped recipe's user/owner-facing decision is in neither Decisions nor Open.
- Over the word budget.
- A Facts or Positioning line has no source and is not marked "assumed".
At most 10 gaps, most blocking first. If none, `RESULT PASS`.
