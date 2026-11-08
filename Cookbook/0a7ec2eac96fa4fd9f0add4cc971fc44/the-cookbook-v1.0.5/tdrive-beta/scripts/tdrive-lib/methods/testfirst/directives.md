Testfirst method: judge the tests once, before the code exists; lock them; let a cheaper model make them pass; verify mechanically. Per phase: RED, then GREEN, then GATE.

#### Phase shape (planner)
- Every phase file names its tests, the guarded lines and (money, auth, security phases) the mutations, under `## RED`, `## GREEN` and `## GATE`.
- Model column: `RED opus-high / GREEN sonnet-medium`. GATE is a script, not a model.

#### RED (test author, strongest model)
- Write the tests plus compile-only stubs (signatures, `panic("not implemented")` or zero values; no logic). Production logic in the red commit is a smell (`WARN red_production`).
- Every new test fails for the right reason; save the run as `reports/phase-NN-red.log`.
- Judge the tests once against this checklist, recorded PASS/FIX in `reports/phase-NN-red.md`:
  1. Asserts behaviour, not implementation.
  2. Covers failure and fail-closed paths.
  3. Money invariants hold over several inputs (debit = credit, allocation sum = pool).
  4. No sleeps, no timing flakiness.
  5. No brittle golden strings without a reason.
- Commit as `test(phase-NN): red <what>` (one commit; record its sha in the phase file).

#### GREEN (implementer, cheaper model)
- Input: the red sha and the phase file. Output: production code only.
- Test files and testdata are read-only: `*_test.go`, `**/testdata/**`, `*.spec.ts(x)`, `*.test.ts(x)`, `tests/**` (the project's `gate.test_globs`).
- A test that looks wrong: stop and report it; do not edit it. Never add test-shaped branches to production code.
- At most 2 attempts until the gate passes; more means RED under-specified the work: report it.

#### Test fix (test author only)
- The only way a locked test changes after RED: a separate commit `test(phase-NN): fix <what>` whose body states the reason (trailers do not count).
- At most 2 fix commits per phase; each is counted in the experiment metrics.

#### GATE (scripted, once)
- `tdrive testlock run --repo <repo> --branch <branch> --phase NN`: the test diff since the red commit must be empty apart from reasoned fix commits, then build, vet and test once (`gate.commands`).
- Then a diff skim of the production change: no test-shaped branches, no scope creep (note it in `reports/phase-NN-gate.log`).
- Mutations only for protected (money, auth, security) phases, from the phase file's list.
- Mark the phase Done only after the gate passes; paste the TESTLOCK and GATE lines in the gate log.

#### Commit subjects testlock relies on
| Subject | Meaning |
|---|---|
| `test(phase-NN): red …` | the lock point (newest one reachable from head wins) |
| `test(phase-NN): fix …` + body reason | an allowed test change after RED |
| `test(phase-MM): …` (another phase) | skipped for phase NN |
| anything else touching a test file | a violation |
Phase ids are zero-pad aware (`phase-6` = `phase-06`); use the plan's two-digit form.

#### Metrics (one row per phase in `reports/tdd-experiment.md`)
red wall · green wall · gate wall · tests · test-fix commits (reasons) · test-diff empty · GREEN attempts · mutations killed/total · notes.
