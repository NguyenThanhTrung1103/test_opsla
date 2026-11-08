---
name: drive-verify
description: "Independently verify a claimed done for tdrive: check out the build branch in a detached temporary worktree, run the discovered verify targets, then mutation probes that must make a gate fail for the expected reason. Prints TARGET, PROBE and RESULT lines verbatim; DEFERRED is never a pass."
user-invocable: true
when_to_use: "Invoke after a PHASE_DONE or any claimed completion to prove it on the committed build branch, or to re-verify after a fix."
category: workflow
keywords: [verify, worktree, mutation, probes, targets, done]
argument-hint: "--repo R [--ref SHA|BRANCH] [--engine E] [--targets a,b] [--target name=cmd]... [--probes FILE]... [--no-probes] [--keep]"
metadata:
  author: tony-drive
  version: "0.1.0"
---

# /drive-verify

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

`bash "$T" verify --repo R [--ref SHA|BRANCH] [--engine E] [--targets a,b] [--target name=cmd]... [--probes FILE]... [--no-probes] [--keep]`

| Flag | Meaning |
|---|---|
| `--ref` | sha or branch to verify (default `run.build_branch`) |
| `--targets a,b` | run only these discovered targets |
| `--target name=cmd` | explicit target commands, no discovery |
| `--probes FILE` | driver probe file (same schema as the builtin registry) |
| `--no-probes` | skip probes (the result is at best WEAK while `verify.require_probe` is true) |
| `--keep` | keep the worktree for inspection |

Target order: `--target` > `--targets` > `verify.targets` > every target the engine adapter discovers (Makefile, package scripts). SETUP runs first (`verify.setup`, else the adapter's).

## Probes

A probe plants a deliberate defect and runs a gate target. It PASSES only when the gate passed before planting, exits non-zero after planting (not a timeout), and the gate log matches the probe's `expect_regex` (the expected reason). Kinds: `generated-drift`, `arch-import`, `custom` (`plant_cmd` or `patch`).

Sources (`src=`):
- `src=builtin`: tdrive's registry; only `auto: true` entries run on their own.
- `src=driver`: `--probes FILE`; may override a builtin id's fields or add ids.
- `src=repo`: `<worktree>/.tdrive/probes.yaml`; may only ADD ids. A repo entry reusing a builtin or driver id is ignored, so the repo under test cannot weaken its own verification.

## Output consumed

```
VERIFY <repo> <sha7> worktree=<path>
SETUP <cmd> exit=<n>
TARGET <name> exit=<n> secs=<n> | <verbatim summary>
PROBE <id> src=<builtin|driver|repo> kind=<k> gate=<target> got=exit<n> match=<yes|no> <PASS|FAIL|SKIP> [reason=<r>]
RESULT <PASS|FAIL|WEAK|DEFERRED> targets=<p>/<n> probes=<p>/<n> skipped=<n> [reason=<r>]
```

- Quote TARGET, PROBE and RESULT lines verbatim in reports; never summarize them as "tests pass".
- PASS (exit 0) is the only verified state. FAIL or WEAK exit 1; WEAK (no probe ran, setup missing) is not verified.
- DEFERRED (exit 6, reason=disk) means not verified: retry after the disk floor recovers (drive-govern).
- Saved to `runs/<run>/verify/<sha>.txt`; `verify/last` holds the sha.
