---
name: drive
description: "Supervise a coding-agent engine (AgentKit now, Buildflow experimental) to a world-state Definition of Done while the operator is away: bootstrap the project, boot the orchestrator in tmux, run the event-driven drive loop (watch, independent verify with mutation probes, resource govern, stage reports), and handle each wake by its stop id. Never writes feature code and never signs halt-tier gates."
user-invocable: true
when_to_use: "Invoke to start, resume or check a tdrive run: /drive <engine> [dir] \"<brief>\", /drive resume <handoff|run>, /drive version, /drive help. Use the drive-* skills for single steps (boot, watch, verify, govern, report, amend, handoff)."
category: workflow
keywords: [drive, supervisor, orchestrator, tmux, verify, govern, report, afk]
argument-hint: "<agentkit|buildflow> [dir] \"<brief>\" [--preset P] [--method M] | resume <handoff|run> | version | help"
metadata:
  author: tony-drive
  version: "0.1.0"
---

# /drive

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

A project-local copy is used last, with a warning, so a driven repo can never supply its own tdrive.

## Forms

| Form | Do |
|---|---|
| `/drive version` | `bash "$T" version`, then print `path $T`. Nothing else runs. |
| `/drive help` | `bash "$T" help`, then list the forms above and the drive-* skills. |
| `/drive <engine> [dir] "<brief>" [--preset P] [--method M]` | start a run (below). |
| `/drive resume <handoff\|run>` | a handoff file: run its `RESUME` line. A run name: read `ENGINE` and `REPO` from `${TDRIVE_STATE_DIR:-$HOME/.tdrive}/runs/<run>/run.env`, then `bash "$T" --run <run> start <ENGINE> <REPO> --resume`. |

- Engine: `agentkit`, or `buildflow` (experimental: add the global flag `--experimental-buildflow`).
- Default dir: `${run.projects_dir}/<slug>`, slug = the brief's first words lower-cased, `[a-z0-9-]`, at most 30 chars, starting with a letter or digit. Read the configured value with the lib next to `$T`:
  `L="$(dirname "$T")/tdrive-lib"; [ -d "$L/core" ] || L="$(dirname "$T")/.."; python3 -E -s "$L/core/lib/config.py" get run.projects_dir` (expand a leading `~` to `$HOME`).
- Presets: `demo-run`, `pair-run`, `sleep-run`. Methods: e.g. `flowfirst`.

## Start and loop

1. `bash "$T" [--preset P] start <engine> <dir> "<brief>" [--method M]` in the background (run_shell capability, background mode) so its exit wakes you. It bootstraps, boots the tmux session (named after the dir), sends the plan, then becomes the drive loop. Exit 5 means a loop already owns the run: never run two; read its state instead.
2. When it exits, read the LAST stdout line: `WAKE <event|reason> stop=<id>`, `COMPLETE <session> phases=<d>/<t> stop=plan-complete` or `STOPPED <session> reason=stop-after-phases stop=stop-after-phases`. Earlier lines are `HANDLED ...`, `INCIDENT ...`, `LESSON ...`, stage reports, `ROI run=...` and `RETRO ...`.
3. Handle the stop id (table below), then `bash "$T" start <engine> <dir> --resume` in the background again.
4. After every wake, relay `${TDRIVE_STATE_DIR:-$HOME/.tdrive}/runs/<run>/reports/last.md` to the operator verbatim (the three blocks DONE / NEXT / HEADS-UP and the PROGRESS line).

The run name is `--run`, else the dir's registered run, else the session (dir basename). R below is the repo dir, S the session.

## Learning: trace, lessons, retro, decay

- Record every correction you make: `bash "$T" trace add --kind intervention --text "<what and why>" [--class <incident class>]` (`--kind answer` for an answer you typed, `--kind alert` for an alert). These are the `operator=` count of the ROI and incident evidence.
- `LESSON class=<c> seen=<n> path=<p> | <fix>` lines before a WAKE: read the fix first; the wake report's HEADS-UP repeats them as `seen before:`.
- At COMPLETE the final report ends with `ROI run=<r> value=<v> ... ratio=<n>`; before STOPPED the loop prints that line right before `RETRO <run> path=<p>`. Relay the ROI line and the retro path with the final report. `bash "$T" retro <run>` reruns it on demand.
- `DECAY ... action=off` lines mean the decay scan switched an optional feature off in `~/.tdrive/decay.yaml` (core and safety items never are). If a run needs it (for example `start` exits 2 with `buildflow is switched off`), re-enable it for the run with `bash "$T" --run <run> decide --repo R --decision "re-enable <x>" --options "keep off" --why "<need>" --key features.<x> --value true`, then resume. `re-enable suggested` in a DECAY line means it was asked for while off: name it in the report.
- `PROPOSAL id=<id> kind=<lesson|delete> path=<p>` files are suggestions for the operator. Relay their ids; never apply a proposal, never edit tdrive's own code, never delete files a deletion proposal names.

## Takeover

Taking over a session tdrive did not start: the first report is `bash "$T" --run <run> report --repo R --branch B --session S --verify-tip`. It verifies the build-branch head first unless a result for that head is saved (at the disk floor it says `verify deferred (disk)`), and its DONE is one `takeover baseline: <d>/<t> phases done (latest: <title>)` line with that verify result. Relay it; later reports list only the phases done since it.

## Stop ids

| stop id | Handle |
|---|---|
| `question` | `bash "$T" send --session S --peek`; decide from docs/BRIEF.md and policy (never block on the operator); log it: `bash "$T" decide --repo R --decision ... --options ... --why ... [--key K --value V]` (a TD row); answer with whitelisted keys `bash "$T" send --session S --keys "2"` (or `"Down Enter"`), or type free text into the dialog with `--force -- "<text>"`. Never pick blindly. |
| `panes` | the engine session holds too many panes (`count` > `watch.max_panes`) or a teammate split failed (`split_failed=yes`): finished agent-team teammates left as panes. Peek; ask the engine to shut its finished teammates down (`bash "$T" send --session S -- "<shut down every finished teammate (send each one a shutdown request) before spawning more; keep at most <cap> teammates alive>"`), log it with `tdrive decide`, then `start ... --resume`. Never kill panes, processes or the session yourself; if it repeats, report it. |
| `session-gone` | inspect (`bash "$T" send --session S --peek`, `tmux ls`, the run's `tdrive.log`); then `bash "$T" boot --session S --dir R` and `start ... --resume`. |
| `verify-failures` | read `runs/<run>/verify/<sha>.txt` (`verify/last` names the sha); send a fix directive (`bash "$T" send --session S -- "<directive>"`) or an amendment (drive-amend), or leave it for the operator in the report. |
| `testlock` | `gate.testlock` is on and `tdrive testlock check` failed for a newly done phase: the line has the `TESTLOCK … result=FAIL` line (`reason=red_missing`: no `test(phase-NN): red` commit) and up to 5 `VIOLATION file=… commit=… kind=…` lines. Re-run `bash "$T" testlock check --repo R --branch B --phase <id>` for all of them. Send a directive: revert the test edits in production commits, or have the test author redo them as `test(phase-NN): fix …` commits with a reason in the body (never rewrite history); log it with `tdrive decide`, then `start ... --resume`. A phase that is not test-first: log the decision and resume. |
| `stall`, `busy-stall` | peek; nudge with `bash "$T" send --session S -- "<nudge>"`; interrupt only with `bash "$T" send --session S --keys "Escape"`. Never type into tmux directly. |
| `time-budget` | `bash "$T" report --repo R --stage final`; relay it and stop. |
| `disk-alert-persisting` | review `bash "$T" govern clean --repo R --mode dry-run` and `govern attribute`; apply only through govern (`--mode apply`). Never delete anything outside govern. |
| `resource-critical-persisting` | peek; `bash "$T" govern check --repo R --session S` and `bash "$T" govern attribute --repo R --session S`; report the RESOURCE, TOP and DSTAT lines. Never kill or stop anything. Tell the orchestrator to reduce fan-out (`bash "$T" send --session S -- "<reduce fan-out to the cap; no new agents until the driver sends a resource resume message>"`); after `--resume` the loop sends `resource-resume` once the level drops below critical; other workloads (owner=other) are left to the operator, named in the report. |
| `trust-repeat` | peek; inspect why the trust dialog returned (wrong dir, new worktree); answer once with `--keys "Down Enter"` only when it is this run's dir, else leave it for the operator. |
| `limit` | peek; confirm the reset time; resume after it (`start ... --resume` waits for the reset). |
| `gate-needs-operator` | never sign on your own. Ask the operator in chat; only on their explicit approval run `bash "$T" --experimental-buildflow sign <gate> --repo R --chat-approval "<their words, verbatim>" --approved-at <UTC ISO they said it>` (any tier; logged as a decision + events; never invent or paraphrase the quote). Otherwise the gate stays in `runs/<run>/questions.md`; continue other work (`start ... --resume`). `signed=yes` in the line: the gate was raised again although signed (e.g. after an amendment); ask the operator. `ask=approval` (`WAKE GATE <g> … ask=approval`) or `WAKE ASK S kind=approval`: the engine asked for approval in prose without a `GATE:` line; peek, then the same rule (the named gate counts as raised for `--chat-approval`). |
| `handoff-clear` | the engine wrote `buildflow/HANDOFF.md` and asks for /clear, and tdrive did not send it (the line's `reason=` says why). Peek; if helpers still run, wait for them (or ask the engine to shut finished teammates down) and `start ... --resume`; once no helper runs and `bash buildflow/bin/handoff.sh status` (in R) prints `ready`, send `bash "$T" send --session S -- "/clear"`, then `bash "$T" send --session S -- "Start the next row from the handoff."`; log it with `tdrive decide`. Never clear while a helper runs. |
| `policy-violation` | never "fix" it by deleting tags or rewriting history; report the violation id to the operator and leave it in questions.md. |
| `plan-complete`, `stop-after-phases` | `bash "$T" report --repo R --stage final`; relay the final report. |

Signing tiers (buildflow, experimental): `authorized` signs only with a valid human-signed standing authorization; `auto-notify` signs and notifies; `halt` (frame, market, offer, wishlist, signal, launch-plan, launch, unknown gates) is never signed by tdrive or by you alone. Any tier the operator approved in chat: `sign --chat-approval` (quote + time required; `sign.sh --delegated`, provenance "operator approved in chat via driver").

## Hard rules

- Never write feature code. The orchestrator in the tmux session plans and builds; you supervise.
- Never sign a halt-tier gate without the operator's explicit chat approval relayed through `tdrive sign --chat-approval`; never run sign.sh yourself, never create or delete gate tags.
- Never run `tdrive sign --authorize` (it needs the human's terminal and key).
- Stop a loop with `kill <loop pid>` (SIGTERM); it stops its children and removes loop.pid. No `kill -9`.
- Never set `signing.*` keys (config files, env or `decide --key`).
- Never block on the operator: decide, log with `tdrive decide`, continue.
- Implementer prompts must forbid nested agents: total concurrent agents, including nested ones, stay at or below `run.max_implementers`.
- Never kill or stop processes, containers or volumes; govern only reports other workloads.
- One loop per run: never run two `start` processes for the same run.
- When your context runs high, `bash "$T" handoff driver --repo R --session S`, relay the RESUME line, and stop.
