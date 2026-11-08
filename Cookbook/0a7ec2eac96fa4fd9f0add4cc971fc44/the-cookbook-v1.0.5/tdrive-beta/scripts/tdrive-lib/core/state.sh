#!/bin/bash
# tdrive state: print plan progress for the engine's build branch.
set -u
TD_CMD=state
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/adapter.sh"

usage() {
  cat <<'EOF'
usage: tdrive state [--engine E] --repo R [--branch B] [--signal] [--json]

Prints the adapter's state for branch B of repo R (read from the branch,
never the working tree). B defaults to run.build_branch when that branch
exists, otherwise the current branch. E defaults to config `engine`.
Lines: ENGINE, STAGE <planning|cooking|complete|unknown>, PLAN <path|none>,
DONE <n>, TOTAL <n>, PCT <n>, IN_PROGRESS <ids|->, NEXT <ids|->,
ETA <iso|unknown> AVG_MIN <n|->, then PHASE <id>\t<status>\t<name>\t<file|->
per row and optional X_* lines.
--signal prints `SIGNAL plan=<path|none> count=<n> head=<sha>` and any
`VIOLATION <id> reason=<r>` lines instead. --json prints the same data as JSON.
Exit: 2 usage, config error or refused experimental adapter, 3 repo, git or
branch missing.
EOF
}

engine="" repo="" branch="" signal=0 json=0
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --engine|--repo|--branch)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --engine) engine=$2 ;;
        --repo) repo=$2 ;;
        --branch) branch=$2 ;;
      esac
      shift 2 ;;
    --signal) signal=1; shift ;;
    --json) json=1; shift ;;
    *) td_die 2 "unknown argument: $1 (see tdrive state --help)" ;;
  esac
done

[ -n "$repo" ] || td_die 2 "--repo is required"
[ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
td_require git python3
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $repo"

td_load_config --repo "$repo" || exit $?
[ -n "$engine" ] || engine=$TDC_ENGINE
[ -n "$branch" ] || branch=$(td_adapter_branch "$repo" "$TDC_RUN_BUILD_BRANCH") || exit $?
td_adapter_resolve "$engine" || exit $?

mode_args=()
[ "$signal" -eq 1 ] && mode_args=(--signal)
out=$(export TDRIVE_PLAN_PATH="$TDC_PLAN_PATH"; td_adapter_call "$engine" state.sh "$repo" "$branch" ${mode_args[@]+"${mode_args[@]}"})
rc=$?
[ "$rc" -eq 0 ] || td_die "$rc" "adapter $engine state.sh failed (exit $rc)"

if [ "$json" -eq 0 ]; then
  printf '%s\n' "$out"
  exit 0
fi

printf '%s\n' "$out" | python3 -E -s -c '
import json
import sys

ints = ("DONE", "TOTAL", "PCT")
data = {}
phases = []
violations = []
extra = {}


def ids(v):
    return [] if v == "-" else [x for x in v.split(",") if x]


def nul(v, *empty):
    return None if v in empty else v


for raw in sys.stdin.read().splitlines():
    if not raw.strip():
        continue
    key, _, rest = raw.partition(" ")
    if key == "SIGNAL":
        for field in rest.split(" "):
            k, _, v = field.partition("=")
            if k == "count":
                data[k] = int(v)
            elif k in ("plan", "head"):
                data[k] = nul(v, "none")
    elif key == "VIOLATION":
        vid, _, reason = rest.partition(" reason=")
        violations.append({"id": vid, "reason": reason})
    elif key == "PHASE":
        cols = (rest.split("\t") + ["", "", "", ""])[:4]
        phases.append({"id": cols[0], "status": cols[1], "name": cols[2], "file": nul(cols[3], "-")})
    elif key == "ETA":
        parts = rest.split(" ")
        data["eta"] = nul(parts[0], "unknown")
        avg = parts[2] if len(parts) > 2 else "-"
        data["avg_min"] = None if avg == "-" else int(avg)
    elif key in ints:
        data[key.lower()] = int(rest)
    elif key in ("IN_PROGRESS", "NEXT"):
        data[key.lower()] = ids(rest)
    elif key == "PLAN":
        data["plan"] = nul(rest, "none")
    elif key in ("ENGINE", "STAGE"):
        data[key.lower()] = rest
    elif key.startswith("X_"):
        extra[key] = rest
    else:
        sys.stderr.write("state: unexpected line: %s\n" % raw)
        sys.exit(3)
if "head" in data:
    data["violations"] = violations
else:
    data["phases"] = phases
    data["extra"] = extra
sys.stdout.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
' || td_die 3 "cannot convert the adapter output to JSON"
