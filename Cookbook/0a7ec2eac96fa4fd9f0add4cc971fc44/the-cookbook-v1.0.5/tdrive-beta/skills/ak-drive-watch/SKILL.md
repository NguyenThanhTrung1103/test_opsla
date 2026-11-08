---
name: drive-watch
description: "Wait for the next tdrive event on one or more engine sessions: phase done, plan changed, done regressed, policy violation, question, trust, limit, idle, disk low, resource high, session gone or backstop. Prints exactly one event line; --ack advances the acknowledged baseline."
user-invocable: true
when_to_use: "Invoke to watch an engine session outside the drive loop (for example a manually started orchestrator), or to acknowledge the current progress signal after handling an event."
category: workflow
keywords: [watch, events, tmux, baseline, ack, backstop]
argument-hint: "--spec session:repo[:branch] [--spec ...] [--engine E] [--max-min N] [--suppress EV,EV] [--disk-path P] | --ack --spec ..."
metadata:
  author: tony-drive
  version: "0.1.0"
---

# /drive-watch

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

- Wait: `bash "$T" watch --spec S:R[:B] [--spec ...] [--engine E] [--max-min N] [--suppress IDLE,LIMIT] [--disk-path P]` in the background (run_shell capability, background mode); its exit is the event.
- Acknowledge: `bash "$T" watch --ack --spec S:R[:B]` prints `ACKED <s> plan=<p> count=<n> head=<sha>`. Ack only after the event is handled (for PHASE_DONE: after verify and report). The baseline never advances on emit; without an ack the same event fires again.

| Flag | Meaning |
|---|---|
| `--spec session:repo[:branch]` | one watched session; repeat for several |
| `--engine E` | adapter for the progress signal (default config `engine`) |
| `--max-min N` | BACKSTOP after N minutes (default `watch.backstop_min`) |
| `--suppress EV,EV` | only IDLE, LIMIT, TRUST, QUESTION, DISK_LOW, RESOURCE_HIGH, PANES |
| `--disk-path P` | disk floor path (default `govern.disk_path`, else the first repo) |
| `--ack` | record the current signal and violation ids as the baseline |

## Output consumed (one line, exit 0), by priority

- `SESSION_GONE <s>`
- `POLICY_VIOLATION <s> <id> reason=<r>`
- `PLAN_CHANGED <s> <old|none>-><new>` (never a completion)
- `DONE_REGRESSED <s> <old>-><new>` (never a completion)
- `PHASE_DONE <s> <old>-><new>`: verify it (drive-verify), report, then ack
- `DISK_LOW - level=<one-implementer|pause|alert> free_gb=<n.n> path=<dir>`
- `RESOURCE_HIGH - level=<high|critical> mem_free_pct=<n> load_per_cpu=<n.nn> agents=<n>`
- `PANES <s> count=<n> max=<m> split_failed=<yes|no>`: too many panes in the engine session (finished agent-team teammates) or a failed teammate split; once per episode. Ask the engine to shut finished teammates down; never kill panes or processes
- `TRUST <s>`, `QUESTION <s>`, `LIMIT <s> resets=<iso|unknown>`, `IDLE <s>`
- `BACKSTOP - after_min=<n>`

SESSION_GONE, POLICY_VIOLATION, PLAN_CHANGED, DONE_REGRESSED and PHASE_DONE cannot be suppressed. Exit 2 usage or config error, 3 tmux, git, repo or df missing.
