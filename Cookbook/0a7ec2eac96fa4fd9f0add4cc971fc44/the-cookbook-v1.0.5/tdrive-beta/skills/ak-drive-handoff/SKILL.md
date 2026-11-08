---
name: drive-handoff
description: "Hand off a tdrive run: write a driver handoff brief (scope, stop conditions, sessions, in-flight work, last verify, fresh report, open questions, resume command), or ask the orchestrator for its own handoff brief and optionally restart its session with a resume message."
user-invocable: true
when_to_use: "Invoke when the driver's context runs high, before switching sessions or machines, or when the orchestrator's context must be refreshed."
category: workflow
keywords: [handoff, resume, context, restart, brief]
argument-hint: "driver [--repo R] [--session S] [--branch B] [--engine E] | orchestrator --repo R --session S [--wait-min N] [--restart]"
metadata:
  author: tony-drive
  version: "0.1.0"
---

# /drive-handoff

Resolve the tdrive CLI first. Shell state does not persist between run_shell capability calls, so start every call with this block, then run `bash "$T" <command> ...` (never rely on the exec bit).

```bash
T="${TDRIVE_BIN:-}"
[ -f "$T" ] || T="$HOME/.claude/scripts/tdrive"
[ -f "$T" ] || T="$(command -v tdrive 2>/dev/null || true)"
if [ ! -f "$T" ] && [ -f "$PWD/.claude/scripts/tdrive" ]; then
  echo "warning: using project-local tdrive at $PWD/.claude/scripts/tdrive" >&2
  T="$PWD/.claude/scripts/tdrive"
fi
[ -f "$T" ] || { echo "tdrive not found; set TDRIVE_BIN" >&2; exit 3; }
T="$(cd -P "$(dirname "$T")" && pwd)/$(basename "$T")"
```

## Usage

- Driver: `bash "$T" handoff driver [--repo R] [--session S] [--branch B] [--engine E]`
- Orchestrator: `bash "$T" handoff orchestrator --repo R --session S [--branch B] [--engine E] [--wait-min N] [--restart]`

Both first write a report with `--stage handoff`. R, S, E and B default to the run's REPO, SESSION, ENGINE and BRANCH.

## Output consumed

- `HANDOFF driver path=<p>` and `RESUME tdrive start <engine> <R> --resume --run <run>`: relay both to the operator; the next driver runs `/drive resume <p>`.
- `HANDOFF orchestrator path=<p> status=<requested|received|timeout>`: the orchestrator writes `docs/handoff/HANDOFF-<stamp>.md`, commits it and replies HANDOFF-READY.
- `RESTARTED <session>` (with `--restart`, after receipt, once the pane is idle): the session was rebooted with `run.effort` and sent the resume message. `REFUSED <S> state=<STATE> reason=not-idle` means it stayed busy; retry later.

Exit 2 usage or config error, 3 repo, git or session missing, 4 timeout, 5 refused.
