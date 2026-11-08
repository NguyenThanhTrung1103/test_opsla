---
name: drive-report
description: "Write a tdrive stage report for the operator: DONE, NEXT and HEADS-UP blocks with plan progress and ETA, verify results, resource and disk pressure, open questions and decisions, secrets masked. Saves reports/last.md and runs the optional notify command."
user-invocable: true
when_to_use: "Invoke at every stage change or wake of a tdrive run, or when the operator asks for status."
category: workflow
keywords: [report, status, progress, eta, heads-up]
argument-hint: "--repo R [--engine E] [--branch B] [--session S] [--stage <stage>] [--heads-up TEXT]... [--no-save] [--verify-tip]"
metadata:
  author: tony-drive
  version: "0.1.0"
---

# /drive-report

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

`bash "$T" report --repo R [--engine E] [--branch B] [--session S] [--stage <stage>] [--heads-up TEXT]... [--no-save] [--verify-tip]`

- Stages: `phase` (default), `bootstrapped`, `booted`, `plan-sent`, `plan-committed`, `cook-sent`, `wake`, `handoff`, `final`.
- `--heads-up TEXT` adds your own items (decisions you made, a stop id you handled).
- `--no-save` prints only.
- `--verify-tip` (always on a takeover): verifies the build-branch head first unless a PASS/FAIL/WEAK result for it is saved, with the run's `probes.yaml` when present; the report shows that head's result (`verify deferred (disk)` at the disk floor).
- S defaults to the run's SESSION, else its only watched session; the pane gives the running agent count.

## Output consumed

```
REPORT <run> <iso> stage=<stage>
DONE — <title>, so <why it matters> (verify <result>)
       <title>, so <why it matters>
       +<k> more: <titles>, then <d>/<t> phases done (<pct>%)
NEXT — <next phases>, for <plan title>, then <what follows>
HEADS-UP — <items joined by " · "> | none detected
PROGRESS <d>/<t> (<pct>%) · ETA <local time|unknown>
```

DONE lists only the phases done since the last saved report: one line each for the latest 3, then `+<k> more`. The first report of a takeover (no saved report) is one line: `DONE — takeover baseline: <d>/<t> phases done (latest: <title>), so <why> (verify <result>)`.

Relay the saved `runs/<run>/reports/last.md` to the operator verbatim. HEADS-UP already includes verify FAIL/WEAK/DEFERRED, disk and resource pressure (with the top consumers we do not own), cleanup freed, open questions, events since the last report and logged decisions. `report.notify_env` names an env var holding a notify command; a failing notify is logged, never fatal.
