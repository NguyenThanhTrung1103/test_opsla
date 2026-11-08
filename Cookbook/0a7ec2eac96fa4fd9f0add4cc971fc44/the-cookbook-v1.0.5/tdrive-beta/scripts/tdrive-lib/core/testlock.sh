#!/bin/bash
# tdrive testlock: the deterministic GATE of a test-first phase. `check`
# proves the phase's tests stayed locked since its red commit; `run` adds the
# project's gate commands, run once in a temporary worktree at head.
set -u
TD_CMD=testlock
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/adapter.sh"

usage() {
  cat <<'EOF'
usage: tdrive testlock check --repo R [--branch B] --phase ID [--red SHA] [--head SHA]
       tdrive testlock run   --repo R [--branch B] --phase ID [--red SHA] [--head SHA] [--engine E]

check (read-only): the red commit is the newest `test(phase-ID): red ...`
commit reachable from head (6, 06 and 006 are one phase), or --red. Every
commit in red..head that touches a test file (gate.test_globs) must be a
`test(phase-ID): fix ...` commit with a reason in its body; anything else is
a violation. `test(phase-OTHER): ...` commits belong to another phase and
are skipped (other_phase=). A merge counts only for the files it changed
against every parent. Head defaults to the tip of B (default
run.build_branch). Lines:
  FIX commit=<sha7> files=<n> | <reason>
  VIOLATION file=<path> commit=<sha7> kind=<not-fix|fix-no-reason|merge> | <subject>
  WARN red_production files=<n> max_lines=<m> paths=<p,...>
  TESTLOCK phase=<id> red=<sha7|-> head=<sha7> changed=<n> allowed_fix=<n> violations=<n> other_phase=<n> result=<PASS|FAIL> [reason=red_missing]
WARN red_production (report only): non-test, non-doc files of the red
commit with more than gate.stub_max_lines added lines (stubs stay below).

run: check, then (when it passes) the gate commands once in a detached
worktree at head under $TMPDIR, removed afterwards. Commands: gate.commands,
else the verify targets exactly as `tdrive verify` resolves them
(verify.targets, adapter discovery; verify.setup or the adapter's SETUP).
Each step is bounded by verify.target_timeout_min. Never runs mutation
probes or docker. Lines after the check lines:
  SETUP <cmd> exit=<n>
  TARGET <name> exit=<n> secs=<n> | <verbatim summary>
  TARGET <name> SKIP reason=<setup-missing|setup-failed>
  GATE phase=<id> head=<sha7> targets=<p>/<n> result=<PASS|FAIL> [reason=<testlock|setup-missing|setup-failed|no-targets>]
Logs: runs/<run>/gate/<sha>.d/ when the repo has a run, else a
tdrive-gate-logs-* dir under $TMPDIR (named in the log).
Exit: 0 PASS, 1 FAIL, 2 usage or config error, 3 repo, ref or git error.
EOF
}

sub=${1:-}
case "$sub" in
  --help|-h|help) usage; exit 0 ;;
  check|run) shift ;;
  '') usage >&2; exit 2 ;;
  *) td_die 2 "unknown subcommand: $sub (see tdrive testlock --help)" ;;
esac

repo="" branch="" phase="" red="" head="" engine=""
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --repo|--branch|--phase|--red|--head|--engine)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --repo) repo=$2 ;;
        --branch) branch=$2 ;;
        --phase) phase=$2 ;;
        --red) red=$2 ;;
        --head) head=$2 ;;
        --engine) engine=$2 ;;
      esac
      shift 2 ;;
    *) td_die 2 "unknown argument: $1 (see tdrive testlock --help)" ;;
  esac
done

[ -n "$repo" ] || td_die 2 "--repo is required"
[ -n "$phase" ] || td_die 2 "--phase is required"
case "$phase" in *[!A-Za-z0-9._-]*) td_die 2 "invalid phase id: $phase" ;; esac
case "$red$head$branch" in -*) td_die 2 "invalid --red, --head or --branch" ;; esac
[ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
td_require git python3
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $repo"

# The run (if any) only adds its decided.yaml layer and the log dir; the
# check never creates run state.
run=$(td_run --repo "$repo" 2>/dev/null) || run=""
rd=""
if [ -n "$run" ] && [ -d "$(td_state_base)/runs/$run" ]; then
  rd="$(td_state_base)/runs/$run"
fi
cfg_args=(--repo "$repo")
[ -n "$rd" ] && cfg_args+=(--rundir "$rd")
td_load_config "${cfg_args[@]}" || exit $?

if [ -z "$head" ]; then
  [ -n "$branch" ] || branch=$(td_adapter_branch "$repo" "$TDC_RUN_BUILD_BRANCH") || exit $?
  head=$(td_branch_ref "$repo" "$branch")
fi
sha=$(git -C "$repo" rev-parse --verify --quiet "$head^{commit}" 2>/dev/null) \
  || td_die 3 "ref does not resolve in $repo: $head"
sha7=${sha:0:7}

ck_args=(check --head "$sha" --phase "$phase")
[ -n "$red" ] && ck_args+=(--red "$red")

if [ "$sub" = check ]; then
  td_py testlock "${cfg_args[@]}" "${ck_args[@]}"
  exit $?
fi

# ---- run --------------------------------------------------------------------------
engine=${engine:-$TDC_ENGINE}
gate_cmds=$(td_py testlock "${cfg_args[@]}" commands) || exit $?
if [ -z "$gate_cmds" ]; then
  td_adapter_resolve "$engine" || exit $?
  td_adapter_has "$engine" verify-targets.sh \
    || td_die 2 "gate.commands is empty and adapter $engine has no verify-targets.sh"
fi

tmp=${TMPDIR:-/tmp}
[ -d "$tmp" ] || td_die 3 "temp dir not found: $tmp"
tmp=$(cd -P "$tmp" && pwd) || td_die 3 "cannot enter temp dir: $tmp"
pid_tag=$(printf '%s' "$phase" | tr -c 'A-Za-z0-9._-' '-')
wt="$tmp/tdrive-gate-$pid_tag-$sha7-$$"
if [ "${TDRIVE_TEST:-}" = 1 ]; then
  case "$wt" in
    "${TDRIVE_TEST_ROOT:-/nonexistent}"/*) ;;
    *) td_die 5 "refusing worktree $wt: outside the test root" ;;
  esac
fi

if td_dry; then
  td_dry "testlock check repo=$repo phase=$phase head=$sha7"
  td_dry "git worktree add --detach $wt $sha7"
  if [ -n "$gate_cmds" ]; then
    while IFS= read -r c; do td_dry "gate command $c"; done <<EOF
$gate_cmds
EOF
  else
    td_dry "gate targets ${TDC_VERIFY_TARGETS:-discover via adapters/$engine/verify-targets.sh}"
  fi
  td_dry "git worktree remove --force $wt"
  exit 0
fi

ck_out=$(td_py testlock "${cfg_args[@]}" "${ck_args[@]}")
ck_rc=$?
[ -n "$ck_out" ] && printf '%s\n' "$ck_out"
[ "$ck_rc" -le 1 ] || exit "$ck_rc"
disp=$(printf '%s\n' "$ck_out" | sed -n 's/^TESTLOCK phase=\([^ ]*\) .*/\1/p' | tail -n 1)
[ -n "$disp" ] || disp=$phase

tp=0 tn=0
gate() {
  printf 'GATE phase=%s head=%s targets=%s/%s result=%s%s\n' "$disp" "$sha7" "$tp" "$tn" "$1" "${2:+ reason=$2}"
  td_log "gate phase=$disp head=$sha7 result=$1${2:+ reason=$2}"
  [ "$1" = PASS ] && exit 0
  exit 1
}
[ "$ck_rc" -eq 0 ] || gate FAIL testlock

if [ -n "$rd" ]; then
  ldir="$rd/gate/$sha.d"
else
  ldir=$(mktemp -d "$tmp/tdrive-gate-logs-$sha7.XXXXXX") || td_die 3 "cannot create a log dir under $tmp"
fi
(umask 077 && mkdir -p "$ldir") || td_die 3 "cannot create $ldir"
td_log "gate logs: $ldir"

timeout_s=$((TDC_VERIFY_TARGET_TIMEOUT_MIN * 60))
if [ "${TDRIVE_TEST:-}" = 1 ] && [ -n "${TDRIVE_TEST_VERIFY_TIMEOUT_S:-}" ]; then
  case "$TDRIVE_TEST_VERIFY_TIMEOUT_S" in
    *[!0-9]*|0) td_die 2 "TDRIVE_TEST_VERIFY_TIMEOUT_S must be a positive integer" ;;
  esac
  timeout_s=$TDRIVE_TEST_VERIFY_TIMEOUT_S
fi

TD_CHILD="" wt_created=0
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [ -n "$TD_CHILD" ]; then
    kill -TERM "$TD_CHILD" 2>/dev/null
    wait "$TD_CHILD" 2>/dev/null
  fi
  if [ "$wt_created" -eq 1 ]; then
    git -C "$repo" worktree remove --force "$wt" >/dev/null 2>&1 \
      || td_log "git worktree remove failed for $wt"
    if [ -d "$wt" ]; then
      case "$wt" in
        "$tmp"/tdrive-gate-*) rm -rf "$wt" ;;
      esac
    fi
    git -C "$repo" worktree prune >/dev/null 2>&1 || td_log "git worktree prune failed in $repo"
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wt_created=1
git -C "$repo" worktree add --detach "$wt" "$sha" >/dev/null 2>"$ldir/worktree.log" \
  || { cat "$ldir/worktree.log" >&2; td_die 3 "git worktree add failed for $sha7"; }

# in_wt SECS CMD : CMD in the worktree, bounded, in the background so a
# TERM/INT reaches it at once (run_bounded forwards it).
in_wt() {
  local rc
  (cd "$wt" && exec python3 -E -s "$TD_LIB_DIR/run_bounded.py" --timeout "$1" -- "${BASH:-/bin/bash}" -c "$2") &
  TD_CHILD=$!
  wait "$TD_CHILD"
  rc=$?
  TD_CHILD=""
  return "$rc"
}

t_names=() t_cmds=() disc_setup="" needs_setup=""
if [ -n "$gate_cmds" ]; then
  seen=" "
  while IFS= read -r c; do
    [ -n "$c" ] || continue
    # Name: the first two words of the command (go test ./... -> go-test).
    set -f
    # shellcheck disable=SC2086
    set -- $c
    set +f
    n=$(printf '%s-%s' "${1:-cmd}" "${2:-}" | tr -c 'A-Za-z0-9_.-' '-' | sed 's/--*/-/g; s/^[-.]*//; s/-*$//')
    [ -n "$n" ] || n=cmd
    base=$n k=2
    while case "$seen" in *" $n "*) true ;; *) false ;; esac; do
      n="$base-$k"
      k=$((k + 1))
    done
    seen="$seen$n "
    td_valid_target "$n" "$c" || exit 2
    t_names+=("$n")
    t_cmds+=("$c")
  done <<EOF
$gate_cmds
EOF
else
  td_verify_targets "$engine" "$wt" "$TDC_VERIFY_TARGETS" || exit $?
  t_names=(${TV_NAMES[@]+"${TV_NAMES[@]}"})
  t_cmds=(${TV_CMDS[@]+"${TV_CMDS[@]}"})
  disc_setup=$TV_SETUP
  needs_setup=$TV_NEEDS_SETUP
fi

setup_cmd=${TDC_VERIFY_SETUP:-$disc_setup}
reason=""
if [ -n "$needs_setup" ] && [ -z "$TDC_VERIFY_SETUP" ]; then
  td_log "$needs_setup dependencies need setup; set verify.setup to run these targets"
  reason=setup-missing
elif [ -n "$setup_cmd" ]; then
  in_wt "$timeout_s" "$setup_cmd" > "$ldir/_setup.log" 2>&1
  rc=$?
  printf 'SETUP %s exit=%s\n' "$setup_cmd" "$rc"
  [ "$rc" -eq 0 ] || reason=setup-failed
fi

any_fail=0
i=0
while [ "$i" -lt ${#t_names[@]} ]; do
  name=${t_names[i]} cmd=${t_cmds[i]}
  i=$((i + 1))
  if [ -n "$reason" ]; then
    printf 'TARGET %s SKIP reason=%s\n' "$name" "$reason"
    continue
  fi
  t0=$SECONDS
  in_wt "$timeout_s" "$cmd" > "$ldir/$name.log" 2>&1
  rc=$?
  secs=$((SECONDS - t0))
  tn=$((tn + 1))
  if [ "$rc" -eq 0 ]; then tp=$((tp + 1)); else any_fail=1; fi
  summary=$(td_py verify_summary "$ldir/$name.log") || summary="-"
  printf 'TARGET %s exit=%s secs=%s | %s\n' "$name" "$rc" "$secs" "$summary"
done

[ -n "$reason" ] && gate FAIL "$reason"
[ "$tn" -gt 0 ] || gate FAIL no-targets
[ "$any_fail" -eq 0 ] || gate FAIL
gate PASS
