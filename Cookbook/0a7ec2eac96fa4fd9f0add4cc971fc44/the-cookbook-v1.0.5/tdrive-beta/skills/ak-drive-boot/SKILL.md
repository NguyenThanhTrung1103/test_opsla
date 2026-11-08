---
name: drive-boot
description: "Boot a coding-agent engine session in tmux for tdrive (fixed 220x60 size, effort only via the launch flag), accept the trust and bypass dialogs, and wait until the prompt is ready. Prints READY or BOOT_TIMEOUT."
user-invocable: true
when_to_use: "Invoke to (re)start the orchestrator session of a tdrive run by hand, for example after SESSION_GONE, without starting the drive loop."
category: workflow
keywords: [boot, tmux, session, engine, orchestrator]
argument-hint: "--session S --dir D [--effort E] [--cmd CMD] [--reuse] [--timeout SECONDS]"
metadata:
  author: tony-drive
  version: "0.1.0"
---

# /drive-boot

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

`bash "$T" boot --session S --dir D [--effort E] [--cmd CMD] [--reuse] [--timeout SECONDS]`

| Flag | Meaning |
|---|---|
| `--session S` | tmux session name (exact target `=S`) |
| `--dir D` | working dir of the session (the driven repo) |
| `--effort E` | rendered into `boot.engine_cmd` (default `run.effort`); never change effort interactively |
| `--cmd CMD` | override `boot.engine_cmd` |
| `--reuse` | attach to an existing session instead of refusing |
| `--timeout N` | override `boot.timeout_s` (0 = check once) |

Global flags: `--dry-run`, `--preset P`, `--config F`, `--run R`.

## Output consumed

- `READY <session> pid=<pane_pid>`: exit 0. Then `bash "$T" govern awake --session S` keeps the machine awake while it lives.
- `BOOT_TIMEOUT <session> state=<STATE>`: exit 4. Peek with `bash "$T" send --session S --peek` and report.
- Exit 3: tmux missing, dir missing or session gone. Exit 5: the session already exists (use `--reuse`, never kill it).
