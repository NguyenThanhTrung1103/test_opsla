---
name: drive-amend
description: "Amend a running tdrive plan mid-run: write docs/amendments/Axx-<slug>.md in the driven repo, send the orchestrator a one-line pointer (read, commit, amend the plan, do not disturb in-flight phases) and confirm receipt from a plan commit that mentions Axx."
user-invocable: true
when_to_use: "Invoke when the operator or a verify failure requires a change of plan or rules while the orchestrator keeps working."
category: workflow
keywords: [amend, amendment, plan, change, confirm]
argument-hint: "--repo R --session S --title TEXT (--file F | --body TEXT) [--branch B] [--confirm-min N] [--no-wait]"
metadata:
  author: tony-drive
  version: "0.1.0"
---

# /drive-amend

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

`bash "$T" amend --repo R --session S --title TEXT (--file F | --body TEXT) [--branch B] [--confirm-min N] [--no-wait]`

| Flag | Meaning |
|---|---|
| `--title` | amendment title (slugged into the file name) |
| `--file F` / `--body TEXT` | amendment body (a method pack may offer a template, e.g. flowfirst `templates/amendment.md`) |
| `--branch B` | branch to confirm on (default the run's BRANCH) |
| `--confirm-min N` | poll for the confirming commit (default `watch.backstop_min`) |
| `--no-wait` | send without waiting for confirmation |

Run it in the background when waiting (run_shell capability, background mode).

## Output consumed

- `AMEND_WRITTEN <Axx> path=<p>`
- `AMEND_SENT <Axx> session=<s>`
- `AMEND_CONFIRMED <Axx> commit=<sha7>` (exit 0) or `AMEND_UNCONFIRMED <Axx> after_min=<n>` (exit 1: peek the session and resend the pointer once, then report).

Exit 2 usage, 3 repo, git or session missing, 5 send refused (the pane is in a dialog; handle it first).
