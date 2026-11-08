---
name: intent-to-build
description: Hand a checked INTENT.md to the builder (tdrive drive loop, AgentKit, or a generic AI-coder brief). Adds repo/run facts; never adds business decisions. Use on "build this intent", "hand off to agentkit", "drive this", "/intent-to-build".
argument-hint: "[INTENT.md] [--builder tdrive|buildflow|agentkit|generic] [--dir REPO]"
---

# /intent-to-build

Precondition: `intent-check` returned PASS on the file. If it hasn't been run, run it first.

## Pick the builder (the first one detected, unless `--builder` says otherwise)
1. buildflow (repo has `buildflow/` + `.claude/rules/06-cookbook.md`): apply `../intent/references/outputs/buildflow/ADAPTER.md`. Write the IDEA.md draft and the Blueprint lines; Buildflow's gates review them.
2. agentkit (repo has `.agentkit/` or `/ak:*` commands): apply `outputs/agentkit/ADAPTER.md`. Write `docs/BRIEF.md` and copy the named recipes into `docs/cookbook/`. Next step: `/ak:plan docs/BRIEF.md`.
3. generic: apply `outputs/generic-brief/ADAPTER.md` and write `./BRIEF.md`.

## Pick the runner
- tdrive (`${TDRIVE_BIN:-$HOME/.claude/scripts/tdrive}` exists, and the user wants it built unattended): also write a drive brief for the chosen engine with this shape: What this is (goal + precedence: intent > decisions > amendments > design > rest) · Method/Frame/Host (from the repo and machine: agent cap incl. nested, model table, locks, ports and paths off-limits, branches, upstream-drift policy, secrets by path) · Scope · Out of scope · Phases (deps, model, protected) · Mutations · DoD (command + output) · Open ("none blocking; invented value → stop, ask driver"). Copy INTENT Decisions in verbatim plus the PROFILE standing policy; Open values become owner keys with no default. Save it under `~/.tdrive/briefs/<slug>.md`, then offer `/drive <agentkit|buildflow> <dir> @<brief>`.
- manual (default): tell the user the builder's next command.

Optionally also apply `outputs/claude-md/ADAPTER.md` to append a `## Product intent` section to the repo's CLAUDE.md (ask first).

Never add a business requirement or value that is not in INTENT.md. A missing business value → stop and ask the user.
