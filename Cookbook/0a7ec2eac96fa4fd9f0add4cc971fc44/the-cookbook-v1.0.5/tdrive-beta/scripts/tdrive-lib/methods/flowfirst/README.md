# flowfirst method pack

User-centric, contract-first delivery: jobs -> flows -> self-describing contract -> mock -> design system -> parallel API and UI lanes -> integration -> world-state acceptance.

## Use

- `tdrive start <engine> <dir> "<brief>" --method flowfirst`, or config `methods: [flowfirst]`.
- `start` appends `directives.md` under `### Method: flowfirst` in the orchestrator directives of the driven repo's `docs/BRIEF.md` (committed), so the rules survive context compaction.
- A pack named in `TDRIVE_METHODS_PATH` (`<dir>/flowfirst/directives.md`) overrides the shipped one.

## Files

| File | Purpose |
|---|---|
| `directives.md` | the injected rules: thesis, S1-S8 stage gates, job and flow format, self-describing contract and lints, UI lint rules, design system and Storybook gates, lanes and `final` change control, per-card Definition of Done, anti-patterns, planner checklist |
| `templates/jobs.md` | job catalog skeleton (`docs/product/jobs.md`) |
| `templates/flow.md` | flow spec skeleton (`docs/product/flows/J-xx.md`) |
| `templates/amendment.md` | amendment skeleton for flowfirst changes mid-run (`docs/amendments/Axx-*.md`, sent with `tdrive amend`) |

To give the orchestrator the templates as files, pass them as references: `--ref <tdrive root>/methods/flowfirst/templates/jobs.md --ref .../flow.md` (bootstrap copies them into `docs/reference/`).

## Rules for pack authors

- Plain markdown, no `{{` placeholders (the pack text is inserted as a value and never rendered).
- Headings start at `####`, so they nest under the method heading.
- No personal paths or names; `tdrive lint` checks `methods/`.
