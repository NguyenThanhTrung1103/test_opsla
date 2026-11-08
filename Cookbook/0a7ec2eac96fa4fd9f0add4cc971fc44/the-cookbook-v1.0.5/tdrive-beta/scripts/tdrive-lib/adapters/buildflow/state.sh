#!/bin/bash
# Buildflow state adapter (experimental): state.sh <repo> <branch> [--signal]
# Everything is read from the branch head, never from the working tree:
# the ledger with git show, Buildflow's own state.sh in a temporary detached
# worktree (full mode only), and gate tags reachable from the branch.
#   --signal  SIGNAL plan=<buildflow/LEDGER.md|none> count=<done rows> head=<sha>,
#             then one VIOLATION <tag> reason=<r> per self-signed halt-tier tag
#             (signing.py tag-audit). Tags never count as progress.
#   full      ENGINE, STAGE, PLAN, DONE, TOTAL, PCT, IN_PROGRESS, NEXT, ETA,
#             one PHASE line per ledger row, then X_PHASE, X_NEXT_ACTION,
#             X_SIGNED, X_PENDING_GATES and X_VIOLATIONS.
# Exit: 0 ok, 2 usage or signing policy/config error, 3 repo, branch or git
# missing.
set -u
TD_CMD=state
case "${BASH_SOURCE[0]}" in */*) TD_ADIR=${BASH_SOURCE[0]%/*} ;; *) TD_ADIR=. ;; esac
. "$TD_ADIR/../../core/lib/common.sh"

STATE_TIMEOUT_S=60
FULL_MARK=@@tdrive-buildflow-full@@
# The repo argument is authoritative for every git call below.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

[ $# -ge 2 ] && [ $# -le 3 ] || td_die 2 "usage: state.sh <repo> <branch> [--signal]"
repo=$1 branch=$2 mode=state
if [ $# -eq 3 ]; then
  [ "$3" = --signal ] || td_die 2 "unknown argument: $3"
  mode=signal
fi
case "$branch" in ''|-*) td_die 2 "invalid branch: $branch" ;; esac
td_require git python3
[ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $repo"
head=$(git -C "$repo" rev-parse --verify --quiet "$(td_branch_ref "$repo" "$branch")^{commit}" 2>/dev/null) \
  || td_die 3 "branch not found in $repo: $branch"

audit=$(td_py signing tag-audit --repo "$repo" --branch "$head")
rc=$?
[ "$rc" -eq 0 ] || td_die "$rc" "tag audit failed for $repo $branch (exit $rc)"

# Buildflow's state.sh, run on the branch head in a temporary detached
# worktree so its STATE.md never lands in the repo working tree.
bf_phase="" bf_full=""
WT=""
cleanup() {
  [ -n "$WT" ] || return 0
  git -C "$repo" worktree remove --force "$WT" >/dev/null 2>&1
  case "$WT" in */tdrive-bfstate-*) [ -e "$WT" ] && rm -rf "$WT" ;; esac
  git -C "$repo" worktree prune >/dev/null 2>&1
  WT=""
  return 0
}

run_buildflow_state() {
  local tmp out src rc
  git -C "$repo" cat-file -e "$head:buildflow/bin/state.sh" 2>/dev/null || {
    td_log "no buildflow/bin/state.sh on $branch; stage unknown"
    return 0
  }
  tmp=${TMPDIR:-/tmp}
  WT="${tmp%/}/tdrive-bfstate-$$"
  trap cleanup EXIT
  [ -e "$WT" ] && cleanup && WT="${tmp%/}/tdrive-bfstate-$$"
  # No repo hooks run for this read-only checkout.
  if ! git -C "$repo" -c core.hooksPath=/dev/null worktree add --detach "$WT" "$head" >/dev/null 2>&1; then
    td_log "cannot add a temporary worktree at $WT; stage unknown"
    WT=""
    return 0
  fi
  src='"$1" buildflow/bin/state.sh --phase; printf "%s\n" "$2"; "$1" buildflow/bin/state.sh'
  out=$(cd "$WT" && td_bounded "$STATE_TIMEOUT_S" "${BASH:-/bin/bash}" -c "$src" tdrive-bfstate \
    "${BASH:-/bin/bash}" "$FULL_MARK" < /dev/null 2>/dev/null)
  rc=$?
  cleanup
  if [ "$rc" -eq 124 ]; then
    td_log "buildflow/bin/state.sh timed out after ${STATE_TIMEOUT_S}s; stage unknown"
    return 0
  fi
  [ "$rc" -eq 0 ] || td_log "buildflow/bin/state.sh exited $rc"
  case "$out" in
    *"$FULL_MARK"*)
      bf_phase=${out%%"$FULL_MARK"*}
      bf_full=${out#*"$FULL_MARK"} ;;
    *) bf_phase=$out ;;
  esac
  return 0
}

[ "$mode" = state ] && run_buildflow_state

python3 -E -s - "$TD_LIB_DIR" "$mode" "$repo" "$head" "$bf_phase" "$bf_full" "$audit" <<'PY'
import re
import sys

lib, mode, repo, head, bf_phase, bf_full, audit = sys.argv[1:8]
sys.dont_write_bytecode = True
sys.path.insert(0, lib)
import plan_table  # noqa: E402

LEDGER = "buildflow/LEDGER.md"
PROJECT = "buildflow/PROJECT.md"
STATUS = {"done": "done", "intent": "in_progress", "spec": "in_progress", "plan": "in_progress",
          "build": "in_progress", "review": "in_progress", "open": "pending", "parked": "pending"}
STAGE = {"SETUP": "planning", "START": "planning", "SHAPE": "planning",
         "BUILD": "cooking", "LAUNCH": "cooking", "GROW": "complete"}
START_GATES = ("market", "offer", "wishlist", "signal")
CORE_GATES = ("frame", "look", "mock")
LAUNCH_GATES = ("launch-plan", "launch")
NUM_RE = re.compile(r"[0-9]+")
PCT_RE = re.compile(r"^Progress:.*\(([0-9]+)%\)", re.M)
NEXT_RE = re.compile(r"^Next:[ \t]*(.*)$", re.M)
SUFFIX_RE = re.compile(r"-[0-9]+$")


def fail(code, msg):
    sys.stderr.write("state: %s\n" % msg)
    sys.exit(code)


def blob(path):
    try:
        return plan_table.blob(repo, head, path)
    except plan_table.PlanError as exc:
        fail(exc.code, str(exc))


def clean(s):
    return re.sub(r"[\t\r\n]+", " ", s.replace("*", "").replace("`", "")).strip()


def ledger_rows():
    """(plan path or None, [(id, raw status, name)]) from the ledger at head."""
    text = blob(LEDGER)
    if text is None:
        return None, []
    lines = text.replace("\r\n", "\n").split("\n")
    for header, rows in plan_table.find_tables(lines):
        keys = [plan_table.header_key(c) for c in header]
        if "status" not in keys:
            continue
        i_id = keys.index("nn") if "nn" in keys else 0
        i_st = keys.index("status")
        i_kind = keys.index("kind") if "kind" in keys else None
        i_title = keys.index("title") if "title" in keys else None
        out = []
        for cells in rows:
            rid = clean(plan_table.cell(cells, i_id))
            if not NUM_RE.fullmatch(rid):
                continue
            title = clean(plan_table.cell(cells, i_title)) or rid
            kind = clean(plan_table.cell(cells, i_kind)).lower()
            out.append((rid, clean(plan_table.cell(cells, i_st)).lower(),
                        "%s (%s)" % (title, kind) if kind else title))
        return LEDGER, out
    return LEDGER, []


def audit_lines():
    tags, viol = [], []
    for line in audit.splitlines():
        if line.startswith("TAG "):
            tags.append(line.split(" ")[1])
        elif line.startswith("VIOLATION "):
            viol.append(line)
    return tags, viol


def module_on(text, name):
    return re.search(r"^-[ \t]*%s:[ \t]*on\b" % re.escape(name), text, re.I | re.M) is not None


def system_value(text, key):
    m = re.search(r"^##[ \t]+system[ \t]*$(.*?)(?=^##[ \t]|\Z)", text, re.I | re.M | re.S)
    if not m:
        return None
    v = re.search(r"^-[ \t]*%s:[ \t]*(\S+)" % re.escape(key), m.group(1), re.I | re.M)
    return v.group(1).lower() if v else ""


def pending_gates(signed):
    """Module gates the project still needs, from PROJECT.md at head."""
    text = blob(PROJECT)
    if text is None:
        return []
    bases = set(SUFFIX_RE.sub("", t) for t in signed)
    has_system = system_value(text, "start") is not None
    audience = system_value(text, "audience") if has_system else None
    start = has_system and audience != "none" and system_value(text, "start") == "on"
    launch = has_system and audience != "none" and system_value(text, "launch") == "on"
    want = list(START_GATES) if start else []
    want += [g for g in CORE_GATES if module_on(text, g)] + ["build"]
    want += list(LAUNCH_GATES) if launch else []
    return [g for g in want if g not in bases]


plan, rows = ledger_rows()
done = [r for r in rows if STATUS.get(r[1]) == "done"]
out = sys.stdout
if mode == "signal":
    tags, viol = audit_lines()
    out.write("SIGNAL plan=%s count=%d head=%s\n" % (plan or "none", len(done), head))
    out.write("".join(v + "\n" for v in viol))
    sys.exit(0)

tags, viol = audit_lines()
phase = bf_phase.strip().split("\n")[0].strip() if bf_phase.strip() else ""
stage = STAGE.get(phase, "unknown")
total = len(rows)
m = PCT_RE.search(bf_full)
pct = int(m.group(1)) if m else (len(done) * 100 // total if total else 0)
in_prog = [r[0] for r in rows if STATUS.get(r[1]) == "in_progress"]
nxt = [r[0] for r in rows if r[1] == "open"][:1]
m = NEXT_RE.search(bf_full)
next_action = clean(m.group(1)) if m and m.group(1).strip() else "-"
viol_ids = [v.split(" ")[1] for v in viol]
lines = [
    "ENGINE buildflow",
    "STAGE %s" % stage,
    "PLAN %s" % (plan or "none"),
    "DONE %d" % len(done),
    "TOTAL %d" % total,
    "PCT %d" % pct,
    "IN_PROGRESS %s" % (",".join(in_prog) or "-"),
    "NEXT %s" % (",".join(nxt) or "-"),
    "ETA unknown AVG_MIN -",
]
for rid, raw, name in rows:
    lines.append("PHASE %s\t%s\t%s\t-" % (rid, STATUS.get(raw, "pending"), name))
lines += [
    "X_PHASE %s" % (phase if phase in STAGE else "-"),
    "X_NEXT_ACTION %s" % next_action,
    "X_SIGNED %d" % len(tags),
    "X_PENDING_GATES %s" % (",".join(pending_gates(tags)) or "-"),
    "X_VIOLATIONS %s" % (",".join(viol_ids) or "-"),
]
out.write("".join(ln + "\n" for ln in lines))
PY
