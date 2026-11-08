#!/bin/bash
# tdrive report: write a drive report (DONE / NEXT / HEADS-UP / PROGRESS) for
# a phase or a start stage, save it with a snapshot and optionally notify.
set -u
TD_CMD=report
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/tmux.sh"
. "$TD_HERE/lib/adapter.sh"

STAGES="phase bootstrapped booted plan-sent plan-committed cook-sent wake handoff final"

usage() {
  cat <<'EOF'
usage: tdrive report [--engine E] --repo R [--branch B] [--session S]
                     [--stage <phase|bootstrapped|booted|plan-sent|plan-committed|cook-sent|wake|handoff|final>]
                     [--heads-up TEXT]... [--no-save] [--verify-tip]

Prints:
  REPORT <run> <iso> stage=<stage>
  DONE — <title>, so <why it matters> (verify <result>)
         <title>, so <why it matters>
         +<k> more: <titles>, then <d>/<t> phases done (<pct>%)
  NEXT — <next phases>, for <plan title>, then <what follows>
  HEADS-UP — <items joined by " · "> | none detected
  PROGRESS <d>/<t> (<pct>%) · ETA <local time|unknown>
DONE has one line per phase completed since the saved report snapshot, the
latest 3 in phase order, then +<k> more for the rest; the progress ends the
last line. With no snapshot (a takeover) it is one line:
  DONE — takeover baseline: <d>/<t> phases done (latest: <title>), so <why> (verify <result>)
Else DONE names the stage (default phase), or says nothing completed.
<result> is `<PASS|FAIL|WEAK> targets <p>/<n> probes <p>/<n>`, `deferred
(<reason>)` or `none`.
--verify-tip: when runs/<run>/verify/ has no PASS, FAIL or WEAK result for
the head of B, run `tdrive verify --repo R --ref <head>` first (with
--probes runs/<run>/probes.yaml when it exists); the report then shows the
head's result (a disk deferral shows as `verify deferred (disk)`).
The session is S, else the run's SESSION, else the run's only watched
session (runs/<run>/watch/<session>.base); its pane gives the running
agents and our processes.
HEADS-UP, in order: verify FAIL/WEAK/DEFERRED and skipped probes; disk level,
paused dispatch and resource pressure (with the top 3 consumers we do not
own); cleanup freed; open questions; events since the last report (LIMIT,
QUESTION, TRUST, SESSION_GONE, SIGNED, PLAN_CHANGED, DONE_REGRESSED,
POLICY_VIOLATION); decisions logged; --heads-up texts.
Secrets (URL credentials, token/secret/password/api key/authorization
values, *KEY/*TOKEN/*SECRET/*PASSWORD assignments, bearer tokens, sk-,
sk_live_/rk_test_, gh*_, xox*-, AKIA ids, JWTs and PEM private keys) are
masked in everything printed or saved.
Unless --no-save: writes runs/<run>/reports/<stamp>.md and reports/last.md,
rewrites report.snapshot and, when report.notify_env names a set env var,
runs that command (bounded 30 s) with the report path as $1; a failing or
missing notify is logged, never fatal.
B defaults to the run's BRANCH, then run.build_branch when it exists, then
the current branch. E defaults to the run's ENGINE, then config `engine`.
Exit: 2 usage or config error, 3 repo, git, branch or state missing.
EOF
}

engine="" repo="" branch="" session="" stage=phase no_save=0 verify_tip=0
hu_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --engine|--repo|--branch|--session|--stage|--heads-up)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --engine) engine=$2 ;;
        --repo) repo=$2 ;;
        --branch) branch=$2 ;;
        --session) session=$2 ;;
        --stage) stage=$2 ;;
        --heads-up) hu_args+=(--heads-up "$2") ;;
      esac
      shift 2 ;;
    --no-save) no_save=1; shift ;;
    --verify-tip) verify_tip=1; shift ;;
    *) td_die 2 "unknown argument: $1 (see tdrive report --help)" ;;
  esac
done

case " $STAGES " in
  *" $stage "*) ;;
  *) td_die 2 "unknown stage: $stage (one of: $STAGES)" ;;
esac
[ -n "$repo" ] || td_die 2 "--repo is required"
if [ -n "$session" ]; then
  td_tmux_valid_session "$session" || td_die 2 "invalid session name: $session"
fi
[ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
td_require git python3
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $repo"

if [ -n "$session" ]; then
  run=$(td_run --repo "$repo" --session "$session") || exit 2
else
  run=$(td_run --repo "$repo") || exit 2
fi
rd=$(td_state_dir "$run") || exit $?
TD_RUNDIR=$rd
export TDRIVE_RUN=$run
td_load_config --repo "$repo" --rundir "$rd" || exit $?

# Session: --session, else the run's SESSION, else the run's only watched
# session (a takeover run has no run.env; watch --ack wrote its baseline).
[ -n "$session" ] || session=$(td_runenv_get "$run" SESSION 2>/dev/null) || session=""
if [ -z "$session" ]; then
  watched="" n_watched=0
  for f in "$rd"/watch/*.base; do
    [ -f "$f" ] || continue
    w=${f##*/}
    w=${w%.base}
    td_tmux_valid_session "$w" || continue
    watched=$w
    n_watched=$((n_watched + 1))
  done
  if [ "$n_watched" -eq 1 ]; then
    session=$watched
    td_log "session $session from the run's watch baseline"
  elif [ "$n_watched" -gt 1 ]; then
    td_log "$n_watched watched sessions and no run SESSION; pass --session to count agents"
  fi
fi

[ -n "$engine" ] || engine=$(td_runenv_get "$run" ENGINE) || engine=""
[ -n "$engine" ] || engine=$TDC_ENGINE
if [ -z "$branch" ]; then
  branch=$(td_runenv_get "$run" BRANCH) || branch=""
  if [ -n "$branch" ] && ! git -C "$repo" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
    td_log "run branch $branch not found in $repo; falling back"
    branch=""
  fi
  [ -n "$branch" ] || branch=$(td_adapter_branch "$repo" "$TDC_RUN_BUILD_BRANCH") || exit $?
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-report.XXXXXX") || td_die 3 "cannot create a temp dir"
trap 'rm -rf "$work"' EXIT

# Verify the head of the branch unless a real result for it is saved. A
# deferred result is retried; a failing verify run is reported, never fatal.
vsha=""
if [ "$verify_tip" -eq 1 ]; then
  vsha=$(git -C "$repo" rev-parse --verify --quiet "refs/heads/$branch^{commit}") \
    || td_die 3 "cannot resolve the head of $branch in $repo"
  vfile="$rd/verify/$vsha.txt"
  if [ -f "$vfile" ] && command grep -E -q '^RESULT (PASS|FAIL|WEAK) ' "$vfile"; then
    td_log "verify of ${vsha:0:7} already saved; reused"
  else
    probe_args=()
    [ -f "$rd/probes.yaml" ] && probe_args=(--probes "$rd/probes.yaml")
    if ! td_dry "tdrive verify --repo $repo --ref $vsha ${probe_args[*]-}"; then
      "${BASH:-/bin/bash}" "$TD_HERE/verify.sh" --repo "$repo" --ref "$vsha" --engine "$engine" \
        ${probe_args[@]+"${probe_args[@]}"} > /dev/null
      rc=$?
      case "$rc" in
        0|1) ;;
        6) td_log "verify of ${vsha:0:7} deferred (disk)" ;;
        *) td_log "verify of ${vsha:0:7} failed (exit $rc)"
           hu_args+=(--heads-up "verify of the tip ${vsha:0:7} could not run (exit $rc)") ;;
      esac
    fi
  fi
fi

"${BASH:-/bin/bash}" "$TD_HERE/state.sh" --engine "$engine" --repo "$repo" --branch "$branch" > "$work/state"
rc=$?
[ "$rc" -eq 0 ] || td_die "$rc" "state failed for $repo $branch (exit $rc)"

# Fresh disk and resource lines; on failure the latest govern.jsonl rows are used.
if ! "${BASH:-/bin/bash}" "$TD_HERE/govern.sh" check --repo "$repo" ${session:+--session "$session"} > "$work/check"; then
  td_log "govern check failed; using the latest govern.jsonl rows"
  : > "$work/check"
fi
: > "$work/top"
if command grep -E -q '^RESOURCE .* level=(high|critical) ' "$work/check"; then
  pane_pid=""
  if [ -n "$session" ] && command -v tmux >/dev/null 2>&1 && td_tmux_has "$session"; then
    pane_pid=$(td_tmux_pid "$session") || pane_pid=""
    case "$pane_pid" in ''|*[!0-9]*) pane_pid="" ;; esac
  fi
  if ! td_py resources top ${pane_pid:+--pane-pid "$pane_pid"} > "$work/top"; then
    td_log "process table unavailable; using the latest govern.jsonl TOP rows"
    : > "$work/top"
  fi
fi

stamp=""
if [ "$no_save" -eq 0 ]; then
  stamp=$(td_stamp) || td_die 3 "cannot create a stamp"
fi
td_py report render --run "$run" --rundir "$rd" --repo "$repo" --branch "$branch" --stage "$stage" \
  --state "$work/state" --check "$work/check" --top "$work/top" \
  ${hu_args[@]+"${hu_args[@]}"} ${stamp:+--save-stamp "$stamp"} ${vsha:+--verify-sha "$vsha"}
rc=$?
[ "$rc" -eq 0 ] || td_die "$rc" "cannot render the report (exit $rc)"
[ "$no_save" -eq 1 ] && exit 0
path="$rd/reports/$stamp.md"
td_log "report stage=$stage saved to $path"
td_trace report report --report-file "$path"

# ---- notify -----------------------------------------------------------------
name=$TDC_REPORT_NOTIFY_ENV
[ -n "$name" ] || exit 0
case "$name" in
  [A-Za-z_]*) ;;
  *) td_log "report.notify_env is not an env var name: $name; notify skipped"; exit 0 ;;
esac
case "$name" in
  *[!A-Za-z0-9_]*) td_log "report.notify_env is not an env var name: $name; notify skipped"; exit 0 ;;
esac
cmd=${!name-}
if [ -z "$cmd" ]; then
  td_log "report.notify_env names $name, which is unset or empty; notify skipped"
  exit 0
fi
if td_dry "notify via \$$name $path"; then
  exit 0
fi
# The command is the operator's own env value; the report path is its $1.
td_bounded 30 /bin/sh -c "$cmd \"\$1\"" tdrive-notify "$path" >&2
rc=$?
if [ "$rc" -eq 0 ]; then
  td_log "notified via \$$name"
else
  td_log "notify via \$$name failed (exit $rc); report kept at $path"
fi
exit 0
