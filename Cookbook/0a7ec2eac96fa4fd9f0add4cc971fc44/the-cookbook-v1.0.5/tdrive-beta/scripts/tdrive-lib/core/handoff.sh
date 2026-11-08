#!/bin/bash
# tdrive handoff: write a driver handoff brief, or ask the orchestrator for
# one (and optionally restart it from that brief). A fresh report comes first.
set -u
TD_CMD=handoff
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/tmux.sh"
. "$TD_HERE/lib/adapter.sh"

usage() {
  cat <<'EOF'
usage: tdrive handoff driver [--repo R] [--session S] [--branch B] [--engine E]
       tdrive handoff orchestrator --repo R --session S [--branch B] [--engine E]
                                   [--wait-min N] [--restart]

Both first run `tdrive report --stage handoff`.
driver        writes runs/<run>/handoff/HANDOFF-<stamp>.md with 8 sections
              (scope with run.env and changed config, stop conditions,
              sessions and watch spec with the classified pane, in flight and
              next, last verify, the fresh report, open questions, resume).
              report.notify_env appears as the env var name only.
              Prints: HANDOFF driver path=<p>
                      RESUME tdrive start <engine> <R> --resume --run <run>
orchestrator  sends a request to write docs/handoff/HANDOFF-<stamp>.md,
              commit it on B and reply HANDOFF-READY, then polls B for the
              file until --wait-min (default watch.backstop_min; 0 = do not
              wait). Prints: HANDOFF orchestrator path=<p> status=<requested|received|timeout>
              --restart (after receipt, once the pane is IDLE or READY):
              kills the session, boots it again in the run's repo with
              run.effort, sends the resume message and prints RESTARTED <S>.
              A pane that stays busy prints REFUSED <S> state=<STATE> reason=not-idle.
R, S, E and B default to the run's REPO, SESSION, ENGINE and BRANCH.
Exit: 2 usage or config error, 3 repo, git or session missing, 4 timeout,
      5 refused (pane not idle, send refused).
EOF
}

mode=${1:-}
[ $# -gt 0 ] && shift
case "$mode" in
  --help|-h|help) usage; exit 0 ;;
  driver|orchestrator) ;;
  '') usage >&2; exit 2 ;;
  *) td_die 2 "unknown handoff target: $mode (driver or orchestrator)" ;;
esac

repo="" session="" branch="" engine="" wait_min="" restart=0
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --repo|--session|--branch|--engine|--wait-min)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --repo) repo=$2 ;;
        --session) session=$2 ;;
        --branch) branch=$2 ;;
        --engine) engine=$2 ;;
        --wait-min)
          [ "$mode" = orchestrator ] || td_die 2 "--wait-min is only valid for orchestrator"
          wait_min=$2 ;;
      esac
      shift 2 ;;
    --restart)
      [ "$mode" = orchestrator ] || td_die 2 "--restart is only valid for orchestrator"
      restart=1; shift ;;
    *) td_die 2 "unknown argument: $1 (see tdrive handoff --help)" ;;
  esac
done

case "$wait_min" in
  '') ;;
  *[!0-9]*) td_die 2 "--wait-min must be a non-negative integer: $wait_min" ;;
esac
if [ "$mode" = orchestrator ]; then
  [ -n "$repo" ] || td_die 2 "--repo is required"
  [ -n "$session" ] || td_die 2 "--session is required"
fi
if [ -n "$session" ]; then
  td_tmux_valid_session "$session" || td_die 2 "invalid session name: $session"
fi
td_require git python3
if [ -n "$repo" ]; then
  [ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
  repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
fi

run=$(td_run ${repo:+--repo "$repo"} ${session:+--session "$session"}) || exit 2
rd=$(td_state_dir "$run") || exit $?
TD_RUNDIR=$rd
export TDRIVE_RUN=$run

if [ -z "$repo" ]; then
  repo=$(td_runenv_get "$run" REPO) || repo=""
  [ -n "$repo" ] || td_die 2 "--repo is required (run $run has no REPO)"
  [ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
fi
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $repo"
[ -n "$session" ] || session=$(td_runenv_get "$run" SESSION) || session=""
# The run's preset decides run.effort for a restart.
if [ -z "${TDRIVE_PRESET:-}" ]; then
  preset=$(td_runenv_get "$run" PRESET) || preset=""
  [ -n "$preset" ] && export TDRIVE_PRESET=$preset
fi
td_load_config --repo "$repo" --rundir "$rd" || exit $?
[ -n "$engine" ] || engine=$(td_runenv_get "$run" ENGINE) || engine=""
[ -n "$engine" ] || engine=$TDC_ENGINE
if [ -z "$branch" ]; then
  branch=$(td_runenv_get "$run" BRANCH) || branch=""
  if [ -n "$branch" ] && ! git -C "$repo" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
    branch=""
  fi
  [ -n "$branch" ] || branch=$(td_adapter_branch "$repo" "$TDC_RUN_BUILD_BRANCH") || exit $?
fi
[ -n "$wait_min" ] || wait_min=$TDC_WATCH_BACKSTOP_MIN
if [ "$restart" -eq 1 ] && [ "$wait_min" -eq 0 ]; then
  td_die 2 "--restart needs the brief to be received; use --wait-min > 0"
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-handoff.XXXXXX") || td_die 3 "cannot create a temp dir"
trap 'rm -rf "$work"' EXIT

"${BASH:-/bin/bash}" "$TD_HERE/report.sh" --engine "$engine" --repo "$repo" --branch "$branch" \
  ${session:+--session "$session"} --stage handoff > "$work/report"
rc=$?
[ "$rc" -eq 0 ] || td_die "$rc" "the handoff report failed (exit $rc)"

# classify_state : print the pane STATE of $session (SESSION_GONE when absent).
classify_state() {
  local lines
  if ! command -v tmux >/dev/null 2>&1 || ! td_tmux_has "$session"; then
    printf 'SESSION_GONE\n'
    return 0
  fi
  lines=$(td_classify "$session") || return 3
  td_classify_field "$lines" STATE
}

# send_msg TEMPLATE PATH : render a message template and send it to $session.
send_msg() {
  local msg rc
  msg=$(td_py render "$TD_ROOT_DIR/core/templates/messages/$1" --single-line \
    --var "path=$2" --var "branch=$branch") || td_die 2 "cannot render $1"
  "${BASH:-/bin/bash}" "$TD_HERE/send.sh" --session "$session" -- "$msg" >&2
  rc=$?
  [ "$rc" -eq 0 ] || td_die "$rc" "$1 not sent to $session (send exit $rc)"
  td_log "sent $1 to $session"
}

# ---- driver -------------------------------------------------------------------
if [ "$mode" = driver ]; then
  if [ -n "$session" ] && command -v tmux >/dev/null 2>&1 && td_tmux_has "$session"; then
    td_classify "$session" > "$work/classify" || : > "$work/classify"
  elif [ -n "$session" ]; then
    printf 'STATE SESSION_GONE\n' > "$work/classify"
  else
    : > "$work/classify"
  fi
  "${BASH:-/bin/bash}" "$TD_HERE/state.sh" --engine "$engine" --repo "$repo" --branch "$branch" > "$work/state"
  rc=$?
  [ "$rc" -eq 0 ] || td_die "$rc" "state failed for $repo $branch (exit $rc)"
  stamp=$(td_stamp) || td_die 3 "cannot create a stamp"
  path="$rd/handoff/HANDOFF-$stamp.md"
  td_py report brief --run "$run" --rundir "$rd" --repo "$repo" --branch "$branch" --engine "$engine" \
    --state "$work/state" --report "$work/report" --classify "$work/classify" --out "$path" \
    ${session:+--session "$session"} || td_die $? "cannot write the handoff brief"
  printf 'HANDOFF driver path=%s\n' "$path"
  printf 'RESUME tdrive start %s %s --resume --run %s\n' "$engine" "$repo" "$run"
  td_log "driver handoff brief written to $path"
  exit 0
fi

# ---- orchestrator ---------------------------------------------------------------
stamp=$(td_stamp) || td_die 3 "cannot create a stamp"
rel="docs/handoff/HANDOFF-$stamp.md"
if td_dry; then
  td_dry "send $session handoff-request path=$rel"
  [ "$restart" -eq 1 ] && td_dry "restart $session after $rel is received"
  exit 0
fi
send_msg handoff-request.txt "$rel"
if [ "$wait_min" -eq 0 ]; then
  printf 'HANDOFF orchestrator path=%s status=requested\n' "$rel"
  exit 0
fi

tick=${TDRIVE_TICK:-$TDC_WATCH_TICK_S}
case "$tick" in ''|*[!0-9.]*) td_die 2 "TDRIVE_TICK must be a number of seconds: $tick" ;; esac
max_s=$((wait_min * 60))
nominal=0
# pause : sleep one tick and advance the nominal clock.
pause() {
  case "$tick" in *[1-9]*) sleep "$tick" ;; esac
  nominal=$((nominal + TDC_WATCH_TICK_S))
}

received=0
while :; do
  if git -C "$repo" cat-file -e "$(td_branch_ref "$repo" "$branch"):$rel" 2>/dev/null; then
    received=1
    break
  fi
  [ "$nominal" -ge "$max_s" ] && break
  pause
done
if [ "$received" -ne 1 ]; then
  printf 'HANDOFF orchestrator path=%s status=timeout\n' "$rel"
  td_log "no $rel on $branch after $wait_min min"
  exit 4
fi
printf 'HANDOFF orchestrator path=%s status=received\n' "$rel"
td_log "orchestrator brief received: $branch:$rel"
[ "$restart" -eq 1 ] || exit 0

# Restarting kills the orchestrator's subagents: only from an idle pane.
while :; do
  state=$(classify_state) || td_die 3 "cannot classify the pane of $session"
  case "$state" in
    IDLE|READY) break ;;
    SESSION_GONE) td_die 3 "session $session is gone" ;;
  esac
  if [ "$nominal" -ge "$max_s" ]; then
    printf 'REFUSED %s state=%s reason=not-idle\n' "$session" "$state"
    td_die 5 "restart refused: $session is $state"
  fi
  pause
done

dir=$(td_runenv_get "$run" REPO) || dir=""
[ -n "$dir" ] && [ -d "$dir" ] || dir=$repo
tmux kill-session -t "=$session" || td_die 3 "cannot kill tmux session $session"
td_log "killed $session for restart"
"${BASH:-/bin/bash}" "$TD_HERE/boot.sh" --session "$session" --dir "$dir" --effort "$TDC_RUN_EFFORT" >&2
rc=$?
[ "$rc" -eq 0 ] || td_die "$rc" "boot after restart failed (exit $rc)"
send_msg handoff-resume.txt "$rel"
printf 'RESTARTED %s\n' "$session"
exit 0
