#!/bin/bash
# run-probe.sh W JSON [LOGDIR] : run one planned mutation probe (a JSON line
# from `probes.py plan`) in the verify worktree W and print one line:
#   PROBE <id> src=<s> kind=<k> gate=<target|-> got=<exit<n>|-> match=<yes|no|-> <PASS|FAIL|SKIP> [reason=<r>]
# Steps: reset W; baseline gate (unless the plan says it already passed);
# reset; plant; the tree must change, staged or not (else plant-noop); stage
# the planted paths; optional compile_cmd (else plant-broken); bounded gate; PASS iff the gate exit is not 0 or 124
# and its log matches expect_regex (else wrong-reason, plain FAIL on exit 0,
# or timeout); reset W.
# W must be a linked git worktree named tdrive-verify-*; the reset uses
# `git reset --hard` and `git clean -fd` (no -x, so ignored deps survive).
# Gate logs go to LOGDIR (default: a temp dir that is removed afterwards).
# Exit: 0 a PROBE line was printed, 2 usage or bad probe, 3 git or W missing,
# 5 refused (W is not a verify worktree).
set -u
TD_CMD=probe
case "${BASH_SOURCE[0]}" in */*) TD_PDIR=${BASH_SOURCE[0]%/*} ;; *) TD_PDIR=. ;; esac
. "$TD_PDIR/../lib/common.sh"

[ $# -ge 2 ] && [ $# -le 3 ] || td_die 2 "usage: run-probe.sh W JSON [LOGDIR]"
wt=$1 json=$2 logdir=${3:-}
td_require git python3
[ -d "$wt" ] || td_die 3 "worktree not found: $wt"
wt=$(cd -P "$wt" && pwd) || td_die 3 "cannot enter worktree: $wt"
case "${wt##*/}" in
  tdrive-verify-*) ;;
  *) td_die 5 "refusing to reset $wt: not a tdrive-verify-* worktree" ;;
esac
[ -f "$wt/.git" ] || td_die 5 "refusing to reset $wt: not a linked git worktree"
if [ "${TDRIVE_TEST:-}" = 1 ]; then
  case "$wt/" in
    "${TDRIVE_TEST_ROOT:-/nonexistent}"/*) ;;
    *) td_die 5 "refusing $wt: outside the test root" ;;
  esac
fi

id="" src="" kind="" gate_name="-" gate_cmd="" expect_regex="" compile_cmd="" skip=""
baseline_passed=false timeout_s=1200 action_type="" plant_cmd=""
flds=$(td_py probes fields "$json") || exit $?
while IFS=$'\t' read -r k v; do
  case "$k" in
    id|src|kind|gate_name|gate_cmd|expect_regex|compile_cmd|skip|baseline_passed|timeout_s|action_type|plant_cmd)
      printf -v "$k" '%s' "$v" ;;
  esac
done <<EOF
$flds
EOF
case "$timeout_s" in ''|*[!0-9]*|0) td_die 2 "probe $id: timeout_s must be a positive integer" ;; esac

probe_line() {
  printf 'PROBE %s src=%s kind=%s gate=%s got=%s match=%s %s%s\n' \
    "$id" "$src" "$kind" "${gate_name:--}" "$1" "$2" "$3" "${4:+ reason=$4}"
}

if [ -n "$skip" ]; then
  probe_line - - SKIP "$skip"
  exit 0
fi
[ -n "$gate_cmd" ] || td_die 2 "probe $id: no gate command"

own_logdir=0
if [ -z "$logdir" ]; then
  logdir=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-probe.XXXXXX") || td_die 3 "cannot create a log dir"
  own_logdir=1
fi
mkdir -p "$logdir" || td_die 3 "cannot create log dir: $logdir"

# Bounded commands run in the background so a TERM/INT reaches them at once:
# run_bounded forwards the signal to the command's process group.
TD_CHILD=""
on_exit() {
  local rc=$?
  trap - EXIT INT TERM
  if [ -n "$TD_CHILD" ]; then
    kill -TERM "$TD_CHILD" 2>/dev/null
    wait "$TD_CHILD" 2>/dev/null
  fi
  reset_wt
  [ "$own_logdir" -eq 1 ] && rm -rf "$logdir"
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# in_wt SECS CMD : run the shell command CMD in W, bounded; returns its exit.
in_wt() {
  local rc
  (cd "$wt" && exec python3 -E -s "$TD_LIB_DIR/run_bounded.py" --timeout "$1" -- "${BASH:-/bin/bash}" -c "$2") &
  TD_CHILD=$!
  wait "$TD_CHILD"
  rc=$?
  TD_CHILD=""
  return "$rc"
}

reset_wt() {
  git -C "$wt" reset -q --hard >/dev/null 2>&1 && git -C "$wt" clean -q -fd >/dev/null 2>&1
}

finish() {
  probe_line "$@"
  exit 0
}

reset_wt || td_die 3 "cannot reset worktree $wt"
if [ "$baseline_passed" != true ]; then
  in_wt "$timeout_s" "$gate_cmd" > "$logdir/probe-$id-baseline.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || finish "exit$rc" no SKIP baseline-failed
  reset_wt || td_die 3 "cannot reset worktree $wt"
fi

if [ "$action_type" = cmd ]; then
  in_wt "$timeout_s" "$plant_cmd" > "$logdir/probe-$id-plant.log" 2>&1
  rc=$?
else
  td_py probes plant --worktree "$wt" --json "$json" > "$logdir/probe-$id-plant.log" 2>&1
  rc=$?
  [ "$rc" -eq 2 ] && { cat "$logdir/probe-$id-plant.log" >&2; td_die 2 "probe $id: invalid plant action"; }
fi
[ "$rc" -eq 0 ] || finish - no FAIL plant-broken

st=$(git -C "$wt" status --porcelain) || td_die 3 "git status failed in $wt"
[ -n "$st" ] || finish - no FAIL plant-noop
# Stage the plant: a gate that regenerates files first and then diffs the
# worktree against the index would otherwise overwrite an unstaged plant and
# pass. W was reset clean before planting, so every change here is planted.
git -C "$wt" add -A >/dev/null 2>&1 || td_die 3 "cannot stage the plant in $wt"

if [ -n "$compile_cmd" ]; then
  in_wt "$timeout_s" "$compile_cmd" > "$logdir/probe-$id-compile.log" 2>&1
  [ $? -eq 0 ] || finish - no FAIL plant-broken
fi

glog="$logdir/probe-$id.log"
in_wt "$timeout_s" "$gate_cmd" > "$glog" 2>&1
rc=$?
td_py probes match --json "$json" --log "$glog"
case $? in
  0) m=yes ;;
  1) m=no ;;
  *) td_die 2 "probe $id: cannot match the gate log" ;;
esac

if [ "$rc" -eq 124 ]; then
  finish "exit$rc" "$m" FAIL timeout
elif [ "$rc" -eq 0 ]; then
  finish "exit$rc" "$m" FAIL
elif [ "$m" = yes ]; then
  finish "exit$rc" "$m" PASS
else
  finish "exit$rc" "$m" FAIL wrong-reason
fi
