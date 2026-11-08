#!/bin/bash
# tdrive verify: independently verify a ref in a temporary detached worktree
# (targets, then mutation probes), report pass counts verbatim, then remove
# the worktree.
set -u
TD_CMD=verify
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/adapter.sh"

usage() {
  cat <<'EOF'
usage: tdrive verify --repo R [--ref SHA|BRANCH] [--engine E] [--targets a,b]
                     [--target name=cmd]... [--probes FILE]... [--no-probes] [--keep]

Checks out the ref (default run.build_branch) as a detached worktree under
$TMPDIR, runs the verify targets and the mutation probes there, and prints:
  VERIFY <repo> <sha7> worktree=<path>
  SETUP <cmd> exit=<n>
  TARGET <name> exit=<n> secs=<n> | <verbatim summary>
  TARGET <name> SKIP reason=<setup-missing|setup-failed>
  PROBE <id> src=<builtin|driver|repo> kind=<k> gate=<target> got=exit<n> match=<yes|no> <PASS|FAIL|SKIP> [reason=<r>]
  RESULT <PASS|FAIL|WEAK|DEFERRED> targets=<p>/<n> probes=<p>/<n> skipped=<n> [reason=<no-probe-ran|setup-missing|disk>]
Targets: --target (explicit commands, no discovery) > --targets (names) >
verify.targets > all targets the engine adapter's verify-targets.sh finds.
SETUP: verify.setup > the adapter's SETUP line; an adapter NEEDS_SETUP with
no verify.setup skips every target (RESULT at best WEAK reason=setup-missing).
SETUP and each target are bounded by verify.target_timeout_min.
The disk floor (disk.py level on govern.disk_path, else R) is checked before
the worktree is created and between steps; pause or alert stops with
RESULT DEFERRED reason=disk. WEAK also when no probe ran and
verify.require_probe is true. Stdout is saved to runs/<run>/verify/<sha>.txt,
the sha to verify/last, logs to verify/<sha>.d/. Live worktrees are listed in
verify/worktrees.tsv until removed; --keep leaves the worktree and its line.
Exit: 0 PASS, 1 FAIL or WEAK, 2 usage or config error, 3 repo, ref, git or
df missing, 6 DEFERRED (disk).
EOF
}

repo="" ref="" engine="" targets_arg="" no_probes=0 keep=0
x_names=() x_cmds=() probe_files=()
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --repo|--ref|--engine|--targets|--target|--probes)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --repo) repo=$2 ;;
        --ref) ref=$2 ;;
        --engine) engine=$2 ;;
        --targets) targets_arg=$2 ;;
        --target)
          case "$2" in
            *=*) ;;
            *) td_die 2 "--target needs name=cmd: $2" ;;
          esac
          x_names+=("${2%%=*}")
          x_cmds+=("${2#*=}") ;;
        --probes)
          [ -f "$2" ] || td_die 2 "probes file not found: $2"
          probe_files+=("$(cd -P "$(dirname "$2")" && pwd)/$(basename "$2")") ;;
      esac
      shift 2 ;;
    --no-probes) no_probes=1; shift ;;
    --keep) keep=1; shift ;;
    *) td_die 2 "unknown argument: $1 (see tdrive verify --help)" ;;
  esac
done

i=0
while [ "$i" -lt ${#x_names[@]} ]; do
  td_valid_target "${x_names[i]}" "${x_cmds[i]}" || exit 2
  i=$((i + 1))
done

[ -n "$repo" ] || td_die 2 "--repo is required"
case "$ref" in -*) td_die 2 "invalid --ref: $ref" ;; esac
[ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
td_require git python3
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $repo"

run=$(td_run --repo "$repo") || td_die 2 "cannot resolve run; pass --run"
rd=$(td_state_dir "$run") || exit $?
TD_RUNDIR=$rd
td_load_config --repo "$repo" --rundir "$rd" || exit $?
engine=${engine:-$TDC_ENGINE}
td_adapter_resolve "$engine" || exit $?
if [ ${#x_names[@]} -eq 0 ] && ! td_adapter_has "$engine" verify-targets.sh; then
  td_die 2 "adapter $engine has no verify-targets.sh; pass --target name=cmd"
fi

ref=${ref:-$TDC_RUN_BUILD_BRANCH}
sha=$(git -C "$repo" rev-parse --verify --quiet "$(td_branch_ref "$repo" "$ref")^{commit}" 2>/dev/null) \
  || td_die 3 "ref does not resolve in $repo: $ref"
sha7=${sha:0:7}

timeout_s=$((TDC_VERIFY_TARGET_TIMEOUT_MIN * 60))
# The test sandbox may shorten the bound below the one-minute config minimum.
if [ "${TDRIVE_TEST:-}" = 1 ] && [ -n "${TDRIVE_TEST_VERIFY_TIMEOUT_S:-}" ]; then
  case "$TDRIVE_TEST_VERIFY_TIMEOUT_S" in
    *[!0-9]*|0) td_die 2 "TDRIVE_TEST_VERIFY_TIMEOUT_S must be a positive integer" ;;
  esac
  timeout_s=$TDRIVE_TEST_VERIFY_TIMEOUT_S
fi

tmp=${TMPDIR:-/tmp}
[ -d "$tmp" ] || td_die 3 "temp dir not found: $tmp"
tmp=$(cd -P "$tmp" && pwd) || td_die 3 "cannot enter temp dir: $tmp"
wt="$tmp/tdrive-verify-$run-$sha7-$$"
if [ "${TDRIVE_TEST:-}" = 1 ]; then
  case "$wt" in
    "${TDRIVE_TEST_ROOT:-/nonexistent}"/*) ;;
    *) td_die 5 "refusing worktree $wt: outside the test root" ;;
  esac
fi
dpath=${TDC_GOVERN_DISK_PATH:-$repo}

if td_dry; then
  td_dry "verify repo=$repo ref=$ref sha=$sha7 run=$run"
  td_dry "disk check path=$dpath"
  td_dry "git worktree add --detach $wt $sha7"
  if [ ${#x_names[@]} -gt 0 ]; then
    td_dry "targets ${x_names[*]}"
  else
    td_dry "targets ${targets_arg:-${TDC_VERIFY_TARGETS:-discover via adapters/$engine/verify-targets.sh}}"
  fi
  [ -n "$TDC_VERIFY_SETUP" ] && td_dry "setup $TDC_VERIFY_SETUP"
  if [ "$no_probes" -eq 1 ]; then td_dry "probes off"; else td_dry "probes on"; fi
  [ "$keep" -eq 1 ] || td_dry "git worktree remove --force $wt"
  exit 0
fi

vdir="$rd/verify"
ldir="$vdir/$sha.d"
(umask 077 && mkdir -p "$ldir/probes") || td_die 3 "cannot create $ldir"
outtmp="$vdir/.$sha.txt.$$"
: > "$outtmp" || td_die 3 "cannot write $outtmp"

# emit LINE : a machine line to stdout and to the state copy.
emit() {
  printf '%s\n' "$1"
  printf '%s\n' "$1" >> "$outtmp"
}

# disk_blocked : 0 when the disk level is pause or alert.
disk_blocked() {
  local out lvl
  out=$(td_py disk level --path "$dpath" --repo "$repo" --rundir "$rd") || td_die $? "disk check failed for $dpath"
  lvl=${out#level=}
  lvl=${lvl%% *}
  case "$lvl" in
    pause|alert) td_log "disk level $lvl at $dpath; verify deferred"; return 0 ;;
  esac
  return 1
}

# wt_record add|remove : keep runs/<run>/verify/worktrees.tsv in step with
# the live worktree (`<path>\t<repo>\t<pid>\t<started epoch>`).
wt_record() {
  python3 -E -s - "$1" "$vdir/worktrees.tsv" "$wt" "$repo" "$$" "$started" <<'PY'
import fcntl
import os
import sys

op, path, wt, repo, pid, started = sys.argv[1:7]
fd = os.open(path + ".lock", os.O_RDWR | os.O_CREAT, 0o600)
try:
    fcntl.flock(fd, fcntl.LOCK_EX)
    lines = []
    if os.path.exists(path):
        with open(path) as fh:
            lines = [ln.rstrip("\n") for ln in fh if ln.strip()]
    if op == "add":
        lines.append("\t".join((wt, repo, pid, started)))
    else:
        lines = [ln for ln in lines if ln.split("\t", 1)[0] != wt]
    tmp = "%s.tmp.%d" % (path, os.getpid())
    with open(tmp, "w") as fh:
        fh.write("".join(ln + "\n" for ln in lines))
    os.replace(tmp, path)
finally:
    os.close(fd)
PY
}

# finish RESULT COUNTS [REASON] : print RESULT, save the state files and exit.
# A FAIL's trace event also lists the git-ignored test files of the source
# tree (a pass there may hold only in that dirty tree).
finish() {
  local res=$1 rc ign=()
  emit "RESULT $res targets=$tp/$tn probes=$pp/$pn skipped=$skipped${2:+ reason=$2}"
  mv -f "$outtmp" "$vdir/$sha.txt" || td_die 3 "cannot save $vdir/$sha.txt"
  printf '%s\n' "$sha" > "$vdir/.last.$$" && mv -f "$vdir/.last.$$" "$vdir/last" \
    || td_die 3 "cannot save $vdir/last"
  td_log "verify $sha7 RESULT $res${2:+ reason=$2}"
  [ "$res" = FAIL ] && ign=(--ignored-tests "$repo")
  td_trace verify verify "sha=$sha" "result=$res" ${2:+"reason=$2"} --verify-file "$vdir/$sha.txt" \
    ${ign[@]+"${ign[@]}"}
  case "$res" in
    PASS) rc=0 ;;
    DEFERRED) rc=6 ;;
    *) rc=1 ;;
  esac
  exit "$rc"
}

tp=0 tn=0 pp=0 pn=0 skipped=0
if disk_blocked; then
  finish DEFERRED disk
fi

TD_CHILD="" wt_created=0
started=$(td_now) || td_die 3 "cannot read the clock"
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [ -n "$TD_CHILD" ]; then
    kill -TERM "$TD_CHILD" 2>/dev/null
    wait "$TD_CHILD" 2>/dev/null
  fi
  rm -f "$outtmp"
  if [ "$wt_created" -eq 1 ] && [ "$keep" -eq 0 ]; then
    git -C "$repo" worktree remove --force "$wt" >/dev/null 2>&1 \
      || td_log "git worktree remove failed for $wt"
    if [ -d "$wt" ]; then
      case "$wt" in
        "$tmp"/tdrive-verify-*) rm -rf "$wt" ;;
      esac
    fi
    git -C "$repo" worktree prune >/dev/null 2>&1 || td_log "git worktree prune failed in $repo"
    wt_record remove || td_log "cannot update $vdir/worktrees.tsv"
  fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wt_created=1
wt_record add || td_die 3 "cannot write $vdir/worktrees.tsv"
git -C "$repo" worktree add --detach "$wt" "$sha" >/dev/null 2>"$ldir/worktree.log" \
  || { cat "$ldir/worktree.log" >&2; td_die 3 "git worktree add failed for $sha7"; }
emit "VERIFY $repo $sha7 worktree=$wt"

# in_wt SECS CMD : run the shell command CMD in the worktree, bounded, in the
# background so a TERM/INT reaches it at once (run_bounded forwards it).
in_wt() {
  local rc
  (cd "$wt" && exec python3 -E -s "$TD_LIB_DIR/run_bounded.py" --timeout "$1" -- "${BASH:-/bin/bash}" -c "$2") &
  TD_CHILD=$!
  wait "$TD_CHILD"
  rc=$?
  TD_CHILD=""
  return "$rc"
}

# Target selection.
t_names=() t_cmds=() disc_setup="" needs_setup=""
if [ ${#x_names[@]} -gt 0 ]; then
  t_names=("${x_names[@]}")
  t_cmds=("${x_cmds[@]}")
else
  # Shared with `tdrive testlock run` (core/lib/adapter.sh).
  td_verify_targets "$engine" "$wt" "${targets_arg:-$TDC_VERIFY_TARGETS}" || exit $?
  t_names=(${TV_NAMES[@]+"${TV_NAMES[@]}"})
  t_cmds=(${TV_CMDS[@]+"${TV_CMDS[@]}"})
  disc_setup=$TV_SETUP
  needs_setup=$TV_NEEDS_SETUP
fi

setup_cmd=${TDC_VERIFY_SETUP:-$disc_setup}
setup_missing=0 setup_failed=0 any_fail=0 deferred=0 ran=0
[ -n "$needs_setup" ] && [ -z "$TDC_VERIFY_SETUP" ] && setup_missing=1
if [ "$setup_missing" -eq 1 ]; then
  td_log "$needs_setup dependencies need setup; set verify.setup to run these targets"
elif [ -n "$setup_cmd" ]; then
  in_wt "$timeout_s" "$setup_cmd" > "$ldir/_setup.log" 2>&1
  rc=$?
  ran=1
  emit "SETUP $setup_cmd exit=$rc"
  [ "$rc" -eq 0 ] || { setup_failed=1; any_fail=1; }
fi

targets_file="$ldir/targets.tsv"
: > "$targets_file" || td_die 3 "cannot write $targets_file"
i=0
while [ "$i" -lt ${#t_names[@]} ]; do
  name=${t_names[i]} cmd=${t_cmds[i]}
  i=$((i + 1))
  if [ "$setup_missing" -eq 1 ] || [ "$setup_failed" -eq 1 ]; then
    reason=setup-missing
    [ "$setup_failed" -eq 1 ] && reason=setup-failed
    emit "TARGET $name SKIP reason=$reason"
    skipped=$((skipped + 1))
    continue
  fi
  if [ "$ran" -eq 1 ] && disk_blocked; then
    deferred=1
    break
  fi
  t0=$SECONDS
  in_wt "$timeout_s" "$cmd" > "$ldir/$name.log" 2>&1
  rc=$?
  secs=$((SECONDS - t0))
  ran=1
  tn=$((tn + 1))
  if [ "$rc" -eq 0 ]; then
    tp=$((tp + 1))
    status=passed
  else
    any_fail=1
    status=failed
  fi
  printf '%s\t%s\t%s\n' "$name" "$cmd" "$status" >> "$targets_file"
  summary=$(td_py verify_summary "$ldir/$name.log") || summary="-"
  emit "TARGET $name exit=$rc secs=$secs | $summary"
done

if [ "$deferred" -eq 0 ] && [ "$no_probes" -eq 0 ] && [ "$setup_failed" -eq 0 ]; then
  plan_args=()
  for f in ${probe_files[@]+"${probe_files[@]}"}; do
    plan_args+=(--driver-probes "$f")
  done
  plan=$(td_py probes plan --worktree "$wt" --targets-file "$targets_file" --timeout-s "$timeout_s" \
    --log "$rd/tdrive.log" ${plan_args[@]+"${plan_args[@]}"}) || td_die $? "probe planning failed"
  pout="$ldir/probes/.out.$$"
  while IFS= read -r pj; do
    [ -n "$pj" ] || continue
    if [ "$ran" -eq 1 ] && disk_blocked; then
      deferred=1
      break
    fi
    "${BASH:-/bin/bash}" "$TD_ROOT_DIR/core/probes/run-probe.sh" "$wt" "$pj" "$ldir/probes" > "$pout" &
    TD_CHILD=$!
    wait "$TD_CHILD"
    rc=$?
    TD_CHILD=""
    line=$(command grep -E '^PROBE ' "$pout" | tail -n 1)
    if [ "$rc" -ne 0 ] || [ -z "$line" ]; then
      [ "$rc" -ne 0 ] || rc=3
      td_die "$rc" "run-probe failed (exit $rc) for: $pj"
    fi
    ran=1
    emit "$line"
    st=${line% reason=*}
    case "${st##* }" in
      PASS) pp=$((pp + 1)); pn=$((pn + 1)) ;;
      FAIL) pn=$((pn + 1)); any_fail=1 ;;
      *) skipped=$((skipped + 1)) ;;
    esac
  done <<EOF
$plan
EOF
  rm -f "$pout"
fi

if [ "$any_fail" -eq 1 ]; then
  finish FAIL
elif [ "$deferred" -eq 1 ]; then
  finish DEFERRED disk
elif [ "$setup_missing" -eq 1 ]; then
  finish WEAK setup-missing
elif [ "$pn" -eq 0 ] && [ "$TDC_VERIFY_REQUIRE_PROBE" = true ]; then
  finish WEAK no-probe-ran
fi
finish PASS
