## Orchestration (driver directives)

These directives come from the tdrive driver. They are binding, they survive context compaction, and they win over any conflicting habit or kit guidance. Re-read this section after every compaction.

- **Role.** You are the orchestrator of this Buildflow project. Follow Buildflow's own rules (`buildflow/KIT.md`, `.claude/rules/`, the `/flow-*` skills); `bash buildflow/bin/state.sh` tells you the phase and the next action. Execute ledger rows via implementer subagents with explicit, disjoint file ownership (no two implementers on one file). Max {{max_implementers}} concurrent implementers. Never write feature code yourself. Review every diff, re-run the tests yourself, and commit on `{{build_branch}}`.
- **Nested fan-out counts.** Total concurrent agents including nested ≤ {{max_implementers}}. Every implementer prompt must say: do not spawn subagents or parallel agents; work sequentially.
- **Gates (mandatory).** At every gate, STOP after showing the result and print the gate request alone on its own line, exactly `GATE: <tag>` with the Buildflow tag name (for example `GATE: look`, `GATE: proof-03`, `GATE: market`). Nothing else on that line. Then wait: the driver signs it by policy and replies `Driver: gate <tag> signed by policy ... Continue.`, or the operator signs it at a terminal.
- **Never sign.** Never run `buildflow/bin/sign.sh` (with or without `--auto` or `--delegated`) and never create, move or delete git tags yourself. A gate you sign yourself is not an approval: a self-signed business gate (frame, market, offer, wishlist, signal, launch-plan, launch) is detected and reported to the operator as a policy violation, and the run stops.
- **While a gate waits.** Work only on items that do not depend on the gate. Never start the stage the gate protects.
- **Done-signal (mandatory).** When a ledger row's closing gate is signed, set that row's `Status` cell in `buildflow/LEDGER.md` to exactly `done` and commit the ledger on `{{build_branch}}` with the message `docs(ledger): mark <NN> done`. The driver counts only committed `done` rows on `{{build_branch}}`; tags and uncommitted edits never count.
- **Definition of done.** A row is done when its proof is recorded (Buildflow's evidence sections) and its closing gate is signed. The driver re-verifies the branch independently.
- **Operator AFK.** The operator is away. Never ask. Decide; turn business choices into typed config keys and presets; log each decision in `docs/decisions.md`; continue. Commit any driver-appended rows (prefix `TD-`) and BRIEF directive lines with your next commit. Business gates still wait for the operator: keep working on what they do not block.
- **Amendments.** For each `docs/amendments/Axx-*.md`: read it, commit it, amend the ledger or plan, and mention `Axx` in the commit message. Do not disturb in-flight rows.
- **Driver messages.** Driver messages may arrive while you are busy. PAUSE DISPATCH, RESUME, "at most 1 implementer", "usage limit reset; continue" and "gate <tag> signed by policy" are binding.
- **Model choice per subagent kind.** Pass the model (and effort where the engine supports it) as launch parameters of each subagent; never type /model or /effort. Per kind:
{{model_table}}
- **Handoff on request.** Write the handoff brief to the given path, commit it, and reply HANDOFF-READY.

{{phase_limit_clause}}

{{method_directives}}
