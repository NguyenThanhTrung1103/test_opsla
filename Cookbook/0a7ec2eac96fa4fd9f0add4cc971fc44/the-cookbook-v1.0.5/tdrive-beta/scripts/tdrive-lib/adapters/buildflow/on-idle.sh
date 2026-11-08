#!/bin/bash
# Buildflow idle hook (experimental): on-idle.sh <repo> <session> <run>
# Called by the drive loop on IDLE (and on a GATE watch event) before the
# default handling. A gate request is a `GATE: <tag>` line on its own
# (tolerating Claude's leading `⏺ `, spaces and **bold**) that ends the
# agent's turn: it is in the last transcript block above the input box and no
# spinner runs (core/lib/gates.py). A gate named in narration with more work
# after it is not a request. Each request occurrence (gates.py fingerprint)
# is recorded in R/gates.seen; an unsigned gate is passed to
# `tdrive sign <tag>` under the signing policy.
# A gate-like ask (gates.py: a turn that ends asking for approval without a
# GATE: line, or the handoff's "type /clear") is never signed; it wakes:
#   WAKE GATE <tag> tier=<T> ask=approval stop=gate-needs-operator
#                                     the ask names a gate (recorded in
#                                     gates.seen, so a chat approval can sign it)
#   WAKE ASK <session> kind=approval stop=gate-needs-operator   no gate named
#   HANDLED IDLE action=send:clear    handoff /clear sent (below)
#   WAKE ASK <session> kind=handoff reason=<r> panes=<n> agents=<n> status=<s> stop=handoff-clear
# Handoff (Buildflow 3.4 law 10): with buildflow.auto_clear (default true),
# one pane in the engine session (no agent-team teammate pane), no running
# agent row on screen and `buildflow/bin/handoff.sh status` = ready (run in
# the repo, bounded 20 s; `wait` means a helper still runs), tdrive sends
# /clear, waits until the request left the screen, then sends the
# handoff-resume message; events.log gets `CLEARED <session> handoff=ready
# panes=1 agents=0`. Otherwise it wakes with reason auto-clear-off,
# helpers-running, no-handoff-script, handoff-<status>, send-refused or
# clear-not-confirmed. tdrive never kills a pane or a process.
# Prints nothing (no gate request, or a signed gate's occurrence already
# handled), or exactly one line:
#   HANDLED IDLE action=sign:<tag>                       signed; gate-signed sent
#   WAKE GATE <tag> tier=<T> stop=gate-needs-operator    sign refused (10/11/12)
#   WAKE GATE <tag> tier=<T> signed=yes stop=gate-needs-operator
#                                                        a new request for a gate
#                                                        whose tag exists (raised
#                                                        again after an amendment)
# Exit: 0 (also for the lines above), 2 usage, 3 environment, otherwise the
# exit of tdrive sign when it failed without a refusal (the loop then falls
# back to its default handling).
set -u
TD_CMD=on-idle
case "${BASH_SOURCE[0]}" in */*) TD_ADIR=${BASH_SOURCE[0]%/*} ;; *) TD_ADIR=. ;; esac
. "$TD_ADIR/../../core/lib/common.sh"
. "$TD_ADIR/../../core/lib/tmux.sh"
TD_ADIR=$(cd "$TD_ADIR" && pwd)
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR

[ $# -eq 3 ] || td_die 2 "usage: on-idle.sh <repo> <session> <run>"
repo=$1 session=$2 run=$3
td_tmux_valid_session "$session" || td_die 2 "invalid session name: $session"
case "$run" in ''|.*|*/*|*[!A-Za-z0-9._-]*) td_die 2 "invalid run name: $run" ;; esac
td_require git python3 tmux
[ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $repo"
rd="$(td_state_base)/runs/$run"
[ -d "$rd" ] && TD_RUNDIR=$rd
td_load_config --repo "$repo" ${TD_RUNDIR:+--rundir "$TD_RUNDIR"} || exit $?

work=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-onidle.XXXXXX") || td_die 3 "cannot create a temp dir"
trap 'rm -rf "$work"' EXIT
if ! td_tmux_capture "$session" plain "$work/pane"; then
  td_log "cannot capture the pane of $session; nothing to do"
  exit 0
fi

# The gate request that ends the turn; the tag matches the Buildflow gate
# grammar (signing.py), so it is safe to use as an argument.
scan=$(td_py gates scan --pane "$work/pane" ${TD_RUNDIR:+--run "$run"}) || td_die 3 "cannot scan the pane of $session"
[ -n "$scan" ] || exit 0
gate="" fp="" ended="" seen="" kind=""
for w in $scan; do
  case "$w" in
    kind=*) kind=${w#kind=} ;;
    tag=*) gate=${w#tag=} ;;
    fp=*) fp=${w#fp=} ;;
    turn_end=*) ended=${w#turn_end=} ;;
    seen=*) seen=${w#seen=} ;;
  esac
done
[ -n "$gate" ] && [ -n "$fp" ] || td_die 3 "unexpected gate scan output: $scan"
if [ "$ended" != yes ]; then
  td_log "gate $gate shown but the turn has not ended; nothing to do"
  exit 0
fi
# remember OUTCOME : record this request occurrence (run state only).
remember() {
  [ -n "${TD_RUNDIR:-}" ] || return 0
  td_py gates record --run "$run" --tag "$gate" --fp "$fp" --outcome "$1" || td_log "cannot record gate $gate in gates.seen"
}
# gate_tier : the signing tier of $gate (halt when unknown).
gate_tier() {
  local t
  t=$(td_py signing tier "$gate" 2>/dev/null) || t=""
  t=${t##* tier=}
  t=${t%% *}
  case "$t" in authorized|auto-notify|halt) ;; *) t=halt ;; esac
  printf '%s\n' "$t"
}

# handoff_wake REASON : wake the driver on the handoff's /clear request.
handoff_wake() {
  remember "handoff-$1"
  td_log "pane of $session ends on the handoff's /clear request; not cleared ($1); waking the driver"
  printf 'WAKE ASK %s kind=handoff reason=%s panes=%s agents=%s status=%s stop=handoff-clear\n' \
    "$session" "$1" "$h_panes" "$h_agents" "$h_status"
  exit 0
}

# clear_gone : 0 when the pane no longer ends its turn on the /clear request.
clear_gone() {
  td_tmux_capture "$session" plain "$work/after" || return 1
  case "$(td_py gates scan --pane "$work/after" 2>/dev/null)" in
    "ASK kind=handoff "*) return 1 ;;
  esac
  return 0
}

# handoff_clear : send /clear + the resume line when no helper runs and the
# handoff is ready; otherwise wake.
handoff_clear() {
  local lines out rc n msg
  h_panes=$(td_tmux_pane_count "$session") || h_panes=-
  lines=$(td_classify "$session") || lines=""
  h_agents=$(td_classify_field "$lines" AGENTS) || h_agents=0
  case "$h_agents" in ''|*[!0-9]*) h_agents=0 ;; esac
  h_status=-
  if [ -f "$repo/buildflow/bin/handoff.sh" ]; then
    h_status=$(cd "$repo" && td_bounded 20 "${BASH:-/bin/bash}" buildflow/bin/handoff.sh status 2>/dev/null | tail -n 1) || h_status=""
    case "$h_status" in ''|*[!a-z]*) h_status=unknown ;; esac
  fi
  [ "$TDC_BUILDFLOW_AUTO_CLEAR" = true ] || handoff_wake auto-clear-off
  [ "$h_panes" = 1 ] && [ "$h_agents" -eq 0 ] || handoff_wake helpers-running
  case "$h_status" in
    ready) ;;
    -) handoff_wake no-handoff-script ;;
    wait) handoff_wake helpers-running ;;
    *) handoff_wake "handoff-$h_status" ;;
  esac
  td_log "pane of $session asks for /clear; handoff ready, no helper running; sending /clear"
  out=$(TDRIVE_TRACE_TEMPLATE=clear "${BASH:-/bin/bash}" "$TD_ROOT_DIR/core/send.sh" --session "$session" -- "/clear")
  rc=$?
  [ -n "$out" ] && printf '%s\n' "$out" >&2
  [ "$rc" -eq 0 ] || handoff_wake send-refused
  n=0
  until clear_gone; do
    n=$((n + 1))
    [ "$n" -ge 30 ] && handoff_wake clear-not-confirmed
    [ "${TDRIVE_TICK:-}" = 0 ] || sleep 1
  done
  printf '%s CLEARED %s handoff=ready panes=%s agents=%s\n' "$(td_iso)" "$session" "$h_panes" "$h_agents" \
    >> "$TD_RUNDIR/events.log" 2>/dev/null || td_log "cannot append to events.log"
  remember cleared
  msg=$(td_py render "$TD_ADIR/templates/messages/handoff-resume.txt" --single-line) || td_die 2 "cannot render handoff-resume"
  msg=${msg%"${msg##*[! ]}"}
  out=$(TDRIVE_TRACE_TEMPLATE=handoff-resume "${BASH:-/bin/bash}" "$TD_ROOT_DIR/core/send.sh" --session "$session" -- "$msg")
  rc=$?
  [ -n "$out" ] && printf '%s\n' "$out" >&2
  [ "$rc" -eq 0 ] || td_log "handoff-resume not sent to $session (send exit $rc); the next IDLE nudges"
  printf 'HANDLED IDLE action=send:clear\n'
  exit 0
}

# A gate-like ask: never signed; the driver decides.
case "$scan" in
  "ASK "*)
    case "$kind" in
      approval)
        if [ "$gate" != - ]; then
          remember ask-approval
          td_log "pane of $session asks to approve gate $gate (no GATE: line); waking the driver"
          printf 'WAKE GATE %s tier=%s ask=approval stop=gate-needs-operator\n' "$gate" "$(gate_tier)"
        else
          gate=ask-approval
          remember ask-approval
          td_log "pane of $session asks for the operator's approval (no gate named); waking the driver"
          printf 'WAKE ASK %s kind=approval stop=gate-needs-operator\n' "$session"
        fi ;;
      handoff)
        gate=ask-handoff
        handoff_clear ;;
      *) td_die 3 "unexpected gate scan output: $scan" ;;
    esac
    exit 0 ;;
esac

if git -C "$repo" rev-parse --verify --quiet "refs/tags/$gate" >/dev/null 2>&1; then
  # Without run state there is no occurrence memory: treat the line as stale.
  if [ "$seen" = yes ] || [ -z "${TD_RUNDIR:-}" ]; then
    td_log "gate $gate is already signed; nothing to do"
    exit 0
  fi
  remember signed-reraised
  tier=$(gate_tier)
  td_log "gate $gate raised again although its tag exists; waking the driver"
  printf 'WAKE GATE %s tier=%s signed=yes stop=gate-needs-operator\n' "$gate" "$tier"
  exit 0
fi

td_log "pane of $session requests gate $gate; asking tdrive sign"
out=$(TDRIVE_RUN=$run "${BASH:-/bin/bash}" "$TD_ROOT_DIR/core/sign.sh" "$gate" --repo "$repo")
src=$?
td_log "tdrive sign $gate: ${out:-no output} (exit $src)"
tier=""
for w in $out; do
  case "$w" in tier=*) tier=${w#tier=} ;; esac
done
case "$tier" in
  authorized|auto-notify|halt) ;;
  *) tier=$(gate_tier) ;;
esac

case "$src" in
  0)
    remember signed
    msg=$(td_py render "$TD_ADIR/templates/messages/gate-signed.txt" --single-line \
      --var "gate=$gate" --var "tier=$tier") || td_die 2 "cannot render gate-signed"
    msg=${msg%"${msg##*[! ]}"}
    sent=$("${BASH:-/bin/bash}" "$TD_ROOT_DIR/core/send.sh" --session "$session" -- "$msg")
    rc=$?
    [ -n "$sent" ] && printf '%s\n' "$sent" >&2
    [ "$rc" -eq 0 ] || td_log "gate-signed not sent to $session (send exit $rc); the gate is signed"
    printf 'HANDLED IDLE action=sign:%s\n' "$gate" ;;
  10|11|12)
    remember "refused-$src"
    printf 'WAKE GATE %s tier=%s stop=gate-needs-operator\n' "$gate" "$tier" ;;
  *)
    td_log "tdrive sign $gate failed without a refusal (exit $src); default idle handling"
    exit "$src" ;;
esac
exit 0
