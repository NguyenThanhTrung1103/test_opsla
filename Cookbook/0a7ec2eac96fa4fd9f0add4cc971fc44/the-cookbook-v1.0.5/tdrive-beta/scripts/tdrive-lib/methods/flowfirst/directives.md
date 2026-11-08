Flowfirst method: user-centric, contract-first, parallel API and UI lanes, design system proven in Storybook. These rules bind the plan and every phase. Stack-neutral; examples name OpenAPI, React, Storybook, MSW and Playwright.

#### Thesis
- Jobs are the source of truth. The contract and the UI are both derived from user flows. Never derive the UI from the contract: that yields CRUD-per-table screens that lose the job.
- The API describes itself (meaning, labels, formats, allowed actions). The UI reads the schema and trusts it; it never guesses field names, types, labels or permissions.
- Freeze the contract per flow, mock from the contract, run the UI lane and the backend lane in parallel; contract tests make the swap from mock to real a non-event.
- Components are a product: domain-neutral, themeable, proven in Storybook, versioned and reusable across projects.

#### Pipeline (stage, artifact, blocking gate)
| # | Stage | Artifact | Gate (blocking) |
|---|---|---|---|
| S1 | Job catalog | `docs/product/jobs.md`: per actor, "When <situation>, I want <motivation>, so I <outcome>" + Given/When/Then acceptance + verification tier | every actor in the brief has at least one job; every job has a world-state check |
| S2 | Flow specs | `docs/product/flows/J-xx.md` per job (format below) | every step has SEE / DO / STATES and a mockup reference per screen |
| S3 | Flow-driven contract | ops annotated with the flow steps they serve (`x-<app>-flows: [J-xx.step]`); status `final` per flow, not per module | coverage lint and self-describing lint green |
| S4 | Mock | generated mock server from contract examples with realistic locale data | the mock serves every `final` op; examples validate against the schema |
| S5 | Design system | tokens, then primitives, then schema-driven components, then patterns, each in Storybook | a story per component x state x locale x viewport; a11y, interaction and visual regression green |
| S6 | Parallel build | backend lane implements ops; UI lane builds per flow on the mock | backend: contract tests; UI: UI lint + flow E2E on the mock |
| S7 | Integration | UI pointed at the real backend (staging) | the same flow E2E on real; link crawl; unaided end-user pass |
| S8 | Acceptance | world-state Definition of Done per job on a deployed environment | evidence pasted (URLs, command output), never just "tests pass" |

Order: S1 to S3 come before any UI page. A page phase starts only after the components it uses have approved stories (tokens, then components, then pages). Add these stages as plan phases (jobs + flows; contract freeze + mock; design system + Storybook) and slice UI phases per flow (vertical slice), not per resource.

#### Job and flow format
- Job (in `docs/product/jobs.md`): `J-xx` id, actor, "When / I want / so I", Given/When/Then acceptance, verification tier (1 = world-state check on the running app).
- Flow (one file per job, `docs/product/flows/J-xx.md`): actor, frequency, stakes; Trigger (what happens in the world); Outcome (observable end state); numbered Steps, each naming the screen (mockup reference), SEE (facts the user needs to decide, as `op.field`), DO (action, op and required inputs), STATES (loading, empty with copy, error code to copy, denied with the `_actions` reason, success and the next step); edge cases; acceptance and the E2E script name.
- If a step needs a fact no op returns, fix the contract (S3). Never compute it client-side.

#### Self-describing contract
- Property: `description`, `x-ui.label` per locale, optional `x-ui.help`, semantic `format` (money-<currency>-minor, bps, percent, date, date-time, phone-<country>, email, url, id-redacted).
- Enum: `x-enum-labels` per locale and `x-enum-tone` (positive, warning, negative, neutral).
- List op: `x-list.sortable[]`, `x-list.filterable[]`, `x-list.searchable`, cursor pagination.
- Resource: `_actions[{id, enabled, reason_code, reason}]`. The server decides permission and state, so every client (web, mobile, MCP) shows the same answer.
- Errors: problem+json with a stable `code` and `errors[].pointer`, so forms bind field errors automatically.
- Op: the flows it serves, or an explicit usage (`integration`, `mcp-only`, `ops`); schema status `draft` or `final`.
- Self-describing lint (custom rules, each with failing test data): missing label or description; money as number or float; enum without labels or tone; list without `x-list`; resource without `_actions`; error not problem+json; op without flows or usage.
- Coverage lint: every flow step maps to ops that exist and are `final`; every op has at least one flow or an explicit usage; every field a flow step uses exists in the op response.
- Generated, never hand-written: types, validators, field-meta map (labels, formats, enum labels, list capabilities), typed client, mock handlers, schema endpoint (`GET /meta/schema`). Drift gate: regenerate in CI and fail on any diff.

#### UI lint rules (enforced by lint, not review)
- Forbidden: hand-typed API interfaces; raw `fetch`; property access on API data outside generated types; local enum-to-label maps; local money or date formatting; client-side permission logic (use `_actions`).
- Forms come from the schema (validators + `x-ui`), tables from `x-list`, status badges from `x-enum-*`, money from its `format`.
- A screen exists only as part of a flow; no orphan CRUD pages. Navigation follows object types; one page per object; related entities in tabs; an item opens a side panel.
- Every promised surface is reachable in the served build, not only in tests; every edit surface is tested, not just rendered.

#### Design system and Storybook gates
- Packages: a tokens package (themes are token sets; the brand is one theme) and a domain-neutral UI package. Domain composites stay in the apps.
- Layers: tokens; primitives (button, input, select, tabs, drawer or side panel, card, table, badge, toast, empty state, skeleton, number strip); schema-driven components (money, bps value, enum badge, schema field and form, data table, action bar, problem alert); patterns (object page, leaderboard, content card).
- Story matrix per component: default, loading, empty, error, disabled, long text, each locale, 390 and 1440 viewports, dark and light themes.
- CI gates, all blocking: a11y (axe), interaction (play functions via the test runner), visual regression (screenshots against a baseline).
- Spacing comes from the scale, never ad-hoc pixels; audit it through the DOM.
- Distribution: versioned packages (changesets) and a static Storybook build per environment for review.

#### Lanes and change control
- Lanes: the backend lane implements `final` ops with contract tests; the UI lane builds per flow against the mock. Lanes never raise the cap: total concurrent agents including nested stay within the implementer cap stated above, with disjoint file ownership per card.
- Changing a `final` op is ONE change: contract, regenerated clients, backend and UI, merged together. `draft` ops may change freely.
- Contract tests: backend integration tests validate every `final` response against the schema; mock examples validate too, so both sides prove the same contract.
- Swap mock to real per flow and rerun the same flow E2E unchanged.

#### Definition of done per UI card
Flow E2E green on the mock AND on the real backend; UI lint clean; its components have approved stories; a11y clean; 390 and 1440 checked; an unaided end-user pass on the running app (SUCCEEDED or STUCK-AT-<step>); no stub screens; evidence is a URL plus command output.

#### Anti-patterns
- Contract-first without jobs gives CRUD UI. Flow-first without a contract freeze lets the UI invent fields.
- "Renders" is not "works"; a green curl is not a working UI; per-card PASS is not integrated green.
- Mock-only verification checks the implementation against itself; rerun on real.
- Components built inside pages; brand baked into primitives; one-off pixel spacing.
- The client recomputing server facts (totals, permissions, status); move them into the contract.
- Machine resources (memory, disk), not agent count, bound parallelism; when the driver reports pressure, reduce fan-out first.

#### Planner checklist
- [ ] jobs.md covers every actor; a flow exists for every job
- [ ] ops tagged with flows; coverage lint and self-describing lint green
- [ ] mock generated; examples validate
- [ ] stories approved for the components of the next page
- [ ] lanes dispatched with disjoint files; contract tests in the backend lane
- [ ] flow E2E on real before closing a flow; world-state evidence pasted
