#!/bin/bash
# tdrive loop: the mechanical drive loop of one run. It waits for watch
# events and handles each one deterministically (verify, report, ack, send a
# template, answer a trust dialog, govern, wait) until a stop condition from
# policies/stop-conditions.yaml ends it with one terminal line.
set -u
TD_CMD=loop
# Trace attribution of the sends and stages this loop runs.
export TDRIVE_CALLER=loop
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/tmux.sh"
. "$TD_HERE/lib/adapter.sh"
TD_HERE=$(cd "$TD_HERE" && pwd)
# Event and state words are split on purpose; no pathname expansion.
set -f

usage() {
  cat <<'EOF'
usage: core/loop.sh --run R      (internal; `tdrive start` follows into it)

Reads run.env of run R (ENGINE REPO BRANCH SESSION ...), refuses when a live
loop already owns the run (exit 5), validates policies/stop-conditions.yaml
(an action outside `allowed` exits 2), writes R/loop.pid, keeps the machine
awake and first drains VERIFY_PENDING (verify that sha, report, ack). Then,
per watch event:
  PHASE_DONE        VERIFY_PENDING, verify, report (verify-failed or pause
                    first), ack, clear; with gate.testlock `tdrive testlock
                    check` per newly done phase (HANDLED PHASE_DONE
                    action=testlock:<pass|fail|error>:<id>; a FAIL wakes
                    stop=testlock); then plan complete or stop-after
  PLAN_CHANGED      report (plan-committed or heads-up), ack
  DONE_REGRESSED    report with heads-up, ack
  POLICY_VIOLATION  question + wake report, ack, WAKE
  IDLE              adapter on-idle.sh, resume after a pause, limit-resume,
                    plan stage, plan nudge, cook stage, cook nudge, complete
  GATE              adapter on-idle.sh only (sign or WAKE); never a nudge
  TRUST             Down Enter (a second TRUST in a row wakes)
  LIMIT             wait for the reset (or wake, per the stop table)
  BACKSTOP          end a limit wait (limit-resume), else stall counters
  DISK_LOW          govern clean + check: pause, one-implementer or wake
  RESOURCE_HIGH     resource-high message once per episode (critical: pause
                    dispatch; high: cap fan-out)
  QUESTION, SESSION_GONE  WAKE
  PANES             WAKE stop=panes (leftover teammate panes or a failed
                    split; the driver asks the engine to shut finished
                    teammates down; tdrive never kills panes or processes)
After each event: a resource check (resource-high once per episode; a paused
episode that drops below critical gets one resource-resume; critical again
after it pauses again; still critical resources.critical_backstops backstops
after a pause wakes) and, while VERIFY_FAILED is set, a re-verify when the
build branch head moved.
Prints HANDLED <event> action=<a> lines (each also a `handled` trace event,
an adapter on-idle.sh line included) and stage reports, then exactly one
terminal line (exit 0):
  WAKE <event line or reason> stop=<id>
  COMPLETE <session> phases=<d>/<t> stop=plan-complete
  STOPPED <session> reason=stop-after-phases stop=stop-after-phases
After each handled event (and once at start) the pattern catcher scans the
run's trace (bounded 30 s) and prints one line per new incident:
  INCIDENT class=<c> severity=<s> line=L<n> | <summary>
Before a WAKE it prints up to lessons.wake_max lessons of that stop
(bounded 5 s); each is also a `seen before` item of the wake report heads-up:
  LESSON class=<c> seen=<n> path=<p> | <fix>
A scan or match failure is logged and never blocks the terminal line.
Retro (tdrive retro, bounded 120 s): with retro.at_end, one RETRO line right
before COMPLETE or STOPPED (it runs before the final report, whose last
line is then the run's ROI line; before STOPPED the ROI line is printed
right before RETRO); after a handled PHASE_DONE when the done count is
retro.every_phases (> 0) past the last retro, one RETRO line for the
events since that retro (features.auto_retro_every_phases; switched off by
the decay scan, the due retro is skipped as a blocked-off use).
R/retro.last holds `<done> <iso>` of the last one; a retro failure is
logged and never blocks the terminal line:
  ROI run=<run> value=<v> ... ratio=<n>
  RETRO <run> path=<p> events=<n> since=<iso|->
Model policy (policies/models.yaml, core/lib/models.py): each phase start
records the phase kind and the model and effort tdrive assigned (phase and
dispatch trace events, model_source=assigned). A protected phase (security,
money, auth) gets one protected-phase message when it first shows as NEXT or
IN_PROGRESS (ids in R/protected.announced):
  HANDLED <event> action=send:protected-phase
At models.limit_switch_hits distinct usage-limit episodes in the run (0:
never) the LIMIT handling records `tdrive decide --key models.table --value
<models.budget_table>`; after the reset, right after limit-resume:
  HANDLED <event> action=send:models-switch
A models.table set by the environment is logged and nothing is sent.
Every WAKE appends to R/questions.md and writes a report with stage=wake.
The run's trace.jsonl gets wake (with the line id of the triggering
watch_event), question (the pane's prompt region), limit, phase start/done
(a phase starts when it shows IN_PROGRESS, else when it is NEXT after the
previous PHASE_DONE, else at the cook send, else at the first event after a
resume) and run end (the stop id).
Under the test sandbox (TDRIVE_TEST=1 with a fixed TDRIVE_NOW) each BACKSTOP
advances TDRIVE_NOW by its after_min, so waits end on a simulated clock.
Exit: 0 terminal line, 2 usage or config error, 3 environment (watch, ack
or git failed), 5 a live loop owns the run.
EOF
}

run=${TDRIVE_RUN:-}
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --run)
      [ $# -ge 2 ] || td_die 2 "--run needs a value"
      run=$2
      shift 2 ;;
    *) td_die 2 "unknown argument: $1 (see core/loop.sh --help)" ;;
  esac
done
[ -n "$run" ] || td_die 2 "--run is required"
rd=$(td_state_dir "$run") || exit $?
[ -f "$rd/run.env" ] || td_die 2 "no run.env for run $run"
TD_RUNDIR=$rd
export TDRIVE_RUN=$run
td_require git python3 tmux

envget() { td_runenv_get "$run" "$1" 2>/dev/null; }
envset() { td_runenv_set "$run" "$1" "$2" || td_die 3 "cannot write run.env $1"; }

ENGINE=$(envget ENGINE)
REPO=$(envget REPO)
BRANCH=$(envget BRANCH)
SESSION=$(envget SESSION)
[ -n "$ENGINE" ] && [ -n "$REPO" ] && [ -n "$BRANCH" ] && [ -n "$SESSION" ] \
  || td_die 2 "run.env of $run lacks ENGINE, REPO, BRANCH or SESSION"
td_tmux_valid_session "$SESSION" || td_die 2 "invalid session name in run.env: $SESSION"
[ -d "$REPO" ] || td_die 3 "repo dir not found: $REPO"
git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $REPO"
if [ -z "${TDRIVE_PRESET:-}" ]; then
  p=$(envget PRESET) || p=""
  [ -n "$p" ] && export TDRIVE_PRESET=$p
fi

td_py runstate pid-alive "$run" loop && td_die 5 "a live loop owns this run: $run"

td_load_config --repo "$REPO" --rundir "$rd" || exit $?
td_adapter_resolve "$ENGINE" || exit $?
MSG_DIR="$TD_ADAPTER_DIR/templates/messages"

# Epoch arithmetic and the stop table live in this python helper.
LOOP_PY=$(cat <<'PY'
import calendar
import math
import sys
import time


def fail(msg):
    sys.stderr.write("loop: %s\n" % msg)
    sys.exit(2)


def epoch(iso):
    try:
        return calendar.timegm(time.strptime(iso, "%Y-%m-%dT%H:%M:%SZ"))
    except ValueError:
        fail("not an ISO time: %r" % iso)


def ceil_min(seconds):
    return int(math.ceil(max(0, seconds) / 60.0))


op, a = sys.argv[1], sys.argv[2:]
if op == "stops":
    sys.dont_write_bytecode = True
    sys.path.insert(0, a[0])
    import yamlite
    try:
        data = yamlite.load(a[1])
    except yamlite.YamlError as exc:
        fail(str(exc))
    conds = data.get("conditions") if isinstance(data, dict) else None
    if not isinstance(conds, list):
        fail("%s: conditions must be a list" % a[1])
    seen = {}
    for c in conds:
        if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not c.get("id"):
            fail("%s: every stop condition needs an id" % a[1])
        cid, act, allowed = c["id"], c.get("action"), c.get("allowed")
        if cid in seen:
            fail("%s: stop condition %s listed twice" % (a[1], cid))
        if not isinstance(allowed, list) or not all(isinstance(x, str) for x in allowed):
            fail("%s: stop condition %s: allowed must be a list of actions" % (a[1], cid))
        if act not in allowed:
            fail("%s: stop condition %s: action %r is not one of %s" % (a[1], cid, act, ", ".join(allowed)))
        seen[cid] = act
    missing = [n for n in a[2].split() if n not in seen]
    if missing:
        fail("%s: missing stop condition(s): %s" % (a[1], ", ".join(missing)))
    for cid in sorted(seen):
        sys.stdout.write("%s %s\n" % (cid, seen[cid]))
elif op == "limit-wait":
    now, margin, fallback = int(a[1]), int(a[2]), int(a[3])
    if a[0] == "unknown":
        sys.stdout.write("%d %d\n" % (now + fallback * 60, fallback))
    else:
        reset = epoch(a[0])
        sys.stdout.write("%d %d\n" % (reset, ceil_min(reset - now) + margin))
elif op == "wait-left":
    sys.stdout.write("%d\n" % max(1, ceil_min(int(a[0]) - int(a[1])) + int(a[2])))
elif op == "add-min":
    sys.stdout.write("%d\n" % (int(a[0]) + int(a[1]) * 60))
else:
    fail("unknown helper op: %s" % op)
PY
)
loop_py() { python3 -E -s -c "$LOOP_PY" "$@"; }

STOP_IDS="session-gone question panes trust-repeat limit disk-alert-persisting resource-critical-persisting verify-failures testlock policy-violation stall busy-stall time-budget plan-complete stop-after-phases"
STOP_TABLE=$(loop_py stops "$TD_LIB_DIR" "$TD_ROOT_DIR/policies/stop-conditions.yaml" "$STOP_IDS") || exit 2

# stop_action ID : the configured action of stop condition ID.
stop_action() {
  local id act
  while read -r id act; do
    [ "$id" = "$1" ] && { printf '%s\n' "$act"; return 0; }
  done <<EOF
$STOP_TABLE
EOF
  return 1
}

# ---- ownership ---------------------------------------------------------------------
td_py runstate pid-alive "$run" loop && td_die 5 "a live loop owns this run: $run"
(umask 077 && printf '%s\n' "$$" > "$rd/loop.pid.$$" && mv -f "$rd/loop.pid.$$" "$rd/loop.pid") \
  || td_die 3 "cannot write $rd/loop.pid"
export TDRIVE_LOOP_PID=$$
CHILD="" CHILD_OUT=""
on_exit() {
  local owner
  [ -n "$CHILD_OUT" ] && rm -f "$CHILD_OUT"
  account_active
  owner=$(head -n 1 "$rd/loop.pid" 2>/dev/null) || owner=""
  [ "$owner" = "$$" ] && rm -f "$rd/loop.pid"
}
# child_tree PID : PID and its descendants, parents first (ps; PID alone
# when ps is unavailable).
child_tree() {
  local all
  all=$(ps -A -o pid= -o ppid= 2>/dev/null) || all=""
  printf '%s\n' "$all" | awk -v root="$1" '
    { kids[$2] = kids[$2] " " $1 }
    END { q[1] = root; n = 1; for (i = 1; i <= n; i++) { print q[i]; c = split(kids[q[i]], k, " ")
          for (j = 1; j <= c; j++) if (k[j] != "") q[++n] = k[j] } }'
}
# on_signal NAME CODE : stop the running child (watch, verify) and its
# descendants, record the end, exit CODE. A bash `wait` returns at once on a
# trapped signal, so the loop never blocks on a long watch or verify.
on_signal() {
  local pids p
  trap '' INT TERM
  if [ -n "$CHILD" ]; then
    pids=$(child_tree "$CHILD")
    for p in $pids; do kill -TERM "$p" 2>/dev/null; done
    wait "$CHILD" 2>/dev/null
  fi
  td_log "loop stopped by SIG$1"
  td_trace loop run action=end stop=signal "signal=$1"
  exit "$2"
}
trap on_exit EXIT
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM

# run_child CMD... : run CMD in the background and wait for it (a wait that
# INT/TERM interrupt, unlike $(...)); CHILD_TEXT gets its stdout. Returns its
# exit status. Call it in the loop's own shell, never inside $(...).
run_child() {
  local rc
  [ -n "$CHILD_OUT" ] || CHILD_OUT=$(mktemp "${TMPDIR:-/tmp}/tdrive-loop.XXXXXX") \
    || td_die 3 "cannot create a temp file"
  "$@" > "$CHILD_OUT" &
  CHILD=$!
  wait "$CHILD"
  rc=$?
  CHILD=""
  CHILD_TEXT=$(cat "$CHILD_OUT")
  return "$rc"
}
td_log "loop started: run=$run session=$SESSION repo=$REPO branch=$BRANCH engine=$ENGINE"

SPEC="$SESSION:$REPO:$BRANCH"
RES_EPISODE_FILE="$rd/resource.episode"
LIMIT_WAIT_MIN=""
TURN=0
ST_TURN=-1
ST_NEXT_IDS="" ST_IP_IDS="" ST_DONE_IDS=""
MODELS_SWITCH_PENDING=0

# ---- helpers ---------------------------------------------------------------------------
# handled EV ACTION : the HANDLED line and its `handled` trace event (ROI).
handled() {
  printf 'HANDLED %s action=%s\n' "$1" "$2"
  td_trace loop handled "event=$1" "action=$2"
}

# field LINE KEY : the value of KEY=... in a machine line.
field() {
  local w
  for w in $1; do
    case "$w" in "$2="*) printf '%s\n' "${w#*=}"; return 0 ;; esac
  done
  return 1
}

branch_head() {
  git -C "$REPO" rev-parse --verify --quiet "$(td_branch_ref "$REPO" "$BRANCH")^{commit}" 2>/dev/null
}

# trace_phases SRC NEXT_SRC : the phase events a `tdrive state` output on
# stdin implies, each phase start with its kind, assigned model and dispatch
# event (core/lib/models.py phases). Never fails the caller.
trace_phases() {
  python3 -E -s "$TD_LIB_DIR/models.py" phases --run "$run" --src "$1" --next-src "${2:--}" \
    --repo "$REPO" --branch "$BRANCH" --table "$TDC_MODELS_TABLE" >/dev/null 2>&1
  return 0
}

# read_state [NEXT_SRC] : ST_STAGE ST_PLAN ST_DONE ST_TOTAL ST_NEXT_TEXT
# ST_NEXT_IDS ST_IP_IDS from the adapter (ST_TURN: this turn); the state also
# feeds the trace's phase events (NEXT ids start with NEXT_SRC when given).
read_state() {
  local out line ids id name rest names="" next_src=${1:--}
  ST_STAGE=unknown ST_PLAN=none ST_DONE=0 ST_TOTAL=0 ST_NEXT_TEXT="" ST_NEXT_IDS="" ST_IP_IDS="" ST_DONE_IDS=""
  out=$("${BASH:-/bin/bash}" "$TD_HERE/state.sh" --engine "$ENGINE" --repo "$REPO" --branch "$BRANCH") || {
    td_log "state failed for $REPO $BRANCH"
    return 1
  }
  ids=""
  while IFS= read -r line; do
    case "$line" in
      "STAGE "*) ST_STAGE=${line#STAGE } ;;
      "PLAN "*) ST_PLAN=${line#PLAN } ;;
      "DONE "*) ST_DONE=${line#DONE } ;;
      "TOTAL "*) ST_TOTAL=${line#TOTAL } ;;
      "NEXT "*) ids=${line#NEXT } ;;
      "IN_PROGRESS "*) ST_IP_IDS=${line#IN_PROGRESS } ;;
      "PHASE "*)
        rest=${line#PHASE }
        id=${rest%%$'\t'*}
        rest=${rest#*$'\t'}
        [ "${rest%%$'\t'*}" = done ] && ST_DONE_IDS="$ST_DONE_IDS $id"
        rest=${rest#*$'\t'}
        name=${rest%%$'\t'*}
        names="$names$id	$name
" ;;
    esac
  done <<EOF
$out
EOF
  case "$ST_DONE" in ''|*[!0-9]*) ST_DONE=0 ;; esac
  case "$ST_TOTAL" in ''|*[!0-9]*) ST_TOTAL=0 ;; esac
  [ "$ids" = - ] && ids=""
  [ "$ST_IP_IDS" = - ] && ST_IP_IDS=""
  ST_NEXT_IDS=$ids
  ST_TURN=$TURN
  IFS=',' read -r -a id_list <<EOF
$ids
EOF
  for id in ${id_list[@]+"${id_list[@]}"}; do
    [ -n "$id" ] || continue
    name=""
    while IFS=$'\t' read -r rest line; do
      [ "$rest" = "$id" ] && { name=$line; break; }
    done <<EOF
$names
EOF
    ST_NEXT_TEXT="${ST_NEXT_TEXT:+$ST_NEXT_TEXT, }$id${name:+ ($name)}"
  done
  [ -n "$ST_NEXT_TEXT" ] || ST_NEXT_TEXT="the next pending phase"
  printf '%s\n' "$out" | trace_phases loop "$next_src"
  return 0
}

# read_signal : SG_COUNT SG_HEAD from the adapter progress signal.
read_signal() {
  local out line rest
  SG_COUNT="" SG_HEAD=""
  out=$("${BASH:-/bin/bash}" "$TD_HERE/state.sh" --engine "$ENGINE" --repo "$REPO" --branch "$BRANCH" --signal) || return 1
  while IFS= read -r line; do
    case "$line" in
      "SIGNAL plan="*)
        rest=${line#SIGNAL plan=}
        SG_HEAD=${rest##* head=}
        rest=${rest% head=*}
        SG_COUNT=${rest##* count=} ;;
    esac
  done <<EOF
$out
EOF
  case "$SG_COUNT" in ''|*[!0-9]*) return 1 ;; esac
  [ -n "$SG_HEAD" ]
}

# report STAGE EV [HEADS-UP...] : a saved report on stdout; HANDLED EV
# action=report unless EV is empty.
report() {
  local stage=$1 ev=$2 h args=()
  shift 2
  for h in "$@"; do args+=(--heads-up "$h"); done
  if "${BASH:-/bin/bash}" "$TD_HERE/report.sh" --engine "$ENGINE" --repo "$REPO" --branch "$BRANCH" \
    --session "$SESSION" --stage "$stage" ${args[@]+"${args[@]}"}; then
    [ -n "$ev" ] && handled "$ev" report
    return 0
  fi
  td_log "report stage=$stage failed (exit $?)"
  return 1
}

# ack EV : advance the watch baseline to the current signal.
ack() {
  "${BASH:-/bin/bash}" "$TD_HERE/watch.sh" --ack --engine "$ENGINE" --spec "$SPEC" >&2 \
    || td_die 3 "cannot ack the watch baseline for $SESSION"
  handled "$1" ack
}

# ---- pattern catcher ---------------------------------------------------------------------
# incident_scan : scan the run's trace for incidents (bounded); prints the
# INCIDENT lines of new ones. A failure is logged, never fatal.
incident_scan() {
  local out rc
  out=$(td_bounded 30 python3 -E -s "$TD_LIB_DIR/incidents.py" scan --run "$run" --session "$SESSION" \
    --source live </dev/null)
  rc=$?
  [ "$rc" -eq 0 ] || td_log "incident scan failed (exit $rc)"
  printf '%s\n' "$out" | command grep -E '^INCIDENT ' || true
  return 0
}

# wake_lessons STOP : print the LESSON lines matching this wake (bounded) and
# set WAKE_SEEN to their `seen before` heads-up items. Never fatal.
wake_lessons() {
  local out rc line head cls n fix
  WAKE_SEEN=()
  [ "$TDC_LESSONS_WAKE_MAX" -gt 0 ] || return 0
  out=$(td_bounded 5 python3 -E -s "$TD_LIB_DIR/lessons.py" match --stop "$1" ${EV:+--event "$EV"} \
    --max "$TDC_LESSONS_WAKE_MAX" </dev/null)
  rc=$?
  [ "$rc" -eq 0 ] || td_log "lessons match failed (exit $rc)"
  while IFS= read -r line; do
    case "$line" in "LESSON "*" | "*) ;; *) continue ;; esac
    printf '%s\n' "$line"
    head=${line%% | *}
    cls=$(field "$head" class) || continue
    n=$(field "$head" seen) || n="?"
    fix=${line#* | }
    WAKE_SEEN+=("seen before: $cls (${n}x), fix: ${fix:0:120}")
  done <<LESSONS
$out
LESSONS
  return 0
}

# auto_retro DONE [SINCE] : the retro of this run (bounded 120 s); sets
# RETRO_LINE (its RETRO line), RETRO_ROI (its `ROI run=` line) and
# RETRO_CHANGED=1 when it wrote a proposal or switched a feature off.
# R/retro.last becomes `<DONE> <iso>` when it succeeds. A failure is logged,
# never fatal.
auto_retro() {
  local done=$1 since=${2:-} ts out rc
  RETRO_LINE="" RETRO_ROI="" RETRO_CHANGED=0
  ts=$(td_iso) || { td_log "retro skipped: no clock"; return 0; }
  out=$(td_bounded 120 python3 -E -s "$TD_LIB_DIR/retro.py" run --run "$run" ${since:+--since "$since"} </dev/null)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    td_log "retro failed (exit $rc)"
    return 0
  fi
  RETRO_LINE=$(printf '%s\n' "$out" | command grep -E '^RETRO ' || true)
  RETRO_ROI=$(printf '%s\n' "$out" | command grep -E '^ROI run=' || true)
  printf '%s\n' "$out" | command grep -q -E '^PROPOSAL |switched off: features\.' && RETRO_CHANGED=1
  (umask 077 && printf '%s %s\n' "$done" "$ts" > "$rd/retro.last.$$" && mv -f "$rd/retro.last.$$" "$rd/retro.last") \
    || td_log "cannot write $rd/retro.last"
  return 0
}

# periodic_retro DONE : a retro since the last one once retro.every_phases
# more phases are done than at that retro (features.auto_retro_every_phases;
# switched off by the decay scan, the due retro is a blocked-off use).
periodic_retro() {
  local done=$1 last_done=0 last_ts="" line
  [ "$TDC_RETRO_EVERY_PHASES" -gt 0 ] || return 0
  if [ -f "$rd/retro.last" ]; then
    IFS= read -r line < "$rd/retro.last" || true
    last_done=${line%% *}
    last_ts=${line#* }
    case "$last_done" in ''|*[!0-9]*) last_done=0; last_ts="" ;; esac
    [ "$last_ts" != "$line" ] || last_ts=""
  fi
  [ $((done - last_done)) -ge "$TDC_RETRO_EVERY_PHASES" ] || return 0
  if [ "$TDC_FEATURES_AUTO_RETRO_EVERY_PHASES" = false ]; then
    td_use auto_retro_every_phases blocked-off
    return 0
  fi
  td_use auto_retro_every_phases fired
  auto_retro "$done" "$last_ts"
  [ -n "$RETRO_LINE" ] && printf '%s\n' "$RETRO_LINE"
  [ "$RETRO_CHANGED" = 1 ] && td_use auto_retro_every_phases changed
  return 0
}

# end_retro DONE : the run-end retro (retro.at_end); the caller prints
# RETRO_LINE (and RETRO_ROI when no final report carries it).
end_retro() {
  RETRO_LINE="" RETRO_ROI="" RETRO_CHANGED=0
  [ "$TDC_RETRO_AT_END" = true ] || return 0
  auto_retro "$1"
}

# ---- stop conditions ---------------------------------------------------------------------
# wake_begin REASON ID : question entry and wake report; wake_end prints the
# WAKE line and exits.
wake_begin() {
  WAKE_LINE="WAKE $1 stop=$2"
  WAKE_STOP=$2
  td_trace loop wake "stop=$2" "line=$1" --ref-last source=watch_event --age-last latency_s=watch_event
  (umask 077 && printf -- '- [ ] %s %s\n' "$(td_iso)" "$WAKE_LINE" >> "$rd/questions.md") \
    || td_log "cannot append to $rd/questions.md"
  incident_scan
  wake_lessons "$2"
  report wake "" "$1 (stop=$2)" ${WAKE_SEEN[@]+"${WAKE_SEEN[@]}"} || true
}
wake_end() {
  td_trace loop run action=end "stop=$WAKE_STOP"
  printf '%s\n' "$WAKE_LINE"
  td_log "$WAKE_LINE"
  exit 0
}
wake() {
  wake_begin "$1" "$2"
  wake_end
}

finish_complete() {
  incident_scan
  td_trace loop run action=end stop=plan-complete
  end_retro "$ST_DONE"
  report final "" || true
  [ -n "$RETRO_LINE" ] && printf '%s\n' "$RETRO_LINE"
  printf 'COMPLETE %s phases=%s/%s stop=plan-complete\n' "$SESSION" "$ST_DONE" "$ST_TOTAL"
  td_log "plan complete: $ST_DONE/$ST_TOTAL"
  exit 0
}

finish_stopped() {
  send_tpl "$1" stop-after "reason=stop-after-phases" || true
  incident_scan
  td_trace loop run action=end stop=stop-after-phases
  end_retro "$ST_DONE"
  [ -n "$RETRO_ROI" ] && printf '%s\n' "$RETRO_ROI"
  [ -n "$RETRO_LINE" ] && printf '%s\n' "$RETRO_LINE"
  printf 'STOPPED %s reason=stop-after-phases stop=stop-after-phases\n' "$SESSION"
  td_log "stopped after $ST_DONE phase(s) (run.stop_after_phases=$TDC_RUN_STOP_AFTER_PHASES)"
  exit 0
}

# check_terminal EV : with nothing left to verify, end on a complete plan or
# on run.stop_after_phases.
check_terminal() {
  [ -z "$(envget VERIFY_PENDING)" ] && [ -z "$(envget VERIFY_FAILED)" ] || return 0
  read_state || return 0
  [ "$ST_STAGE" = complete ] && finish_complete
  if [ "$TDC_RUN_STOP_AFTER_PHASES" -gt 0 ] && [ "$ST_DONE" -ge "$TDC_RUN_STOP_AFTER_PHASES" ]; then
    finish_stopped "$1"
  fi
  return 0
}

# ---- sending ----------------------------------------------------------------------------
# limit_stale : the pane shows the limit line of LIMIT_EPISODE and its reset passed.
limit_stale() {
  local ep lines hash now
  ep=$(envget LIMIT_EPISODE)
  [ -n "$ep" ] || return 1
  case "${ep%%:*}" in ''|*[!0-9]*) return 1 ;; esac
  lines=$(td_classify "$SESSION") || return 1
  hash=$(td_classify_field "$lines" LIMIT_HASH) || return 1
  [ -n "$hash" ] && [ "$hash" = "${ep#*:}" ] || return 1
  now=$(td_now) || return 1
  [ "$now" -ge "${ep%%:*}" ]
}

# send_tpl EV NAME VAR=VALUE... : render templates/messages/NAME and send it
# through the send lock. A refusal is logged, never fatal; a refusal because
# of a stale limit screen (not a dialog) is retried with --force.
send_tpl() {
  local ev=$1 name=$2 tpl msg out rc
  shift 2
  tpl="$MSG_DIR/$name.txt"
  [ -f "$tpl" ] || tpl="$MSG_DIR/$name.md"
  [ -f "$tpl" ] || td_die 2 "adapter $ENGINE has no message template $name"
  local vars=()
  while [ $# -gt 0 ]; do vars+=(--var "$1"); shift; done
  msg=$(td_py render "$tpl" --single-line ${vars[@]+"${vars[@]}"}) || td_die 2 "cannot render $tpl"
  msg=${msg%"${msg##*[! ]}"}
  out=$(TDRIVE_TRACE_TEMPLATE=$name "${BASH:-/bin/bash}" "$TD_HERE/send.sh" --session "$SESSION" -- "$msg")
  rc=$?
  case "$rc:$out" in
    5:*"state=LIMIT reason=modal"*)
      if limit_stale; then
        td_log "the limit screen is stale; typing $name over it"
        out=$(TDRIVE_TRACE_TEMPLATE=$name "${BASH:-/bin/bash}" "$TD_HERE/send.sh" --session "$SESSION" --force -- "$msg")
        rc=$?
      fi ;;
  esac
  [ -n "$out" ] && printf '%s\n' "$out" >&2
  if [ "$rc" -eq 0 ]; then
    handled "$ev" "send:$name"
    return 0
  fi
  td_log "$name not sent to $SESSION (send exit $rc): ${out:-no output}"
  return "$rc"
}

# ---- govern ---------------------------------------------------------------------------------
# govern_check : GV_LEVEL GV_FREE and the RESOURCE fields, once per turn.
GV_TURN=-1
govern_check() {
  local out line
  [ "$GV_TURN" = "$TURN" ] && [ "${1:-}" != --fresh ] && return 0
  GV_LEVEL="" GV_FREE="" RS_LINE="" RS_LEVEL="" RS_ADVICE=""
  out=$("${BASH:-/bin/bash}" "$TD_HERE/govern.sh" check --repo "$REPO" --session "$SESSION") || {
    td_log "govern check failed (exit $?)"
    return 1
  }
  printf '%s\n' "$out" >&2
  while IFS= read -r line; do
    case "$line" in
      "DISK "*) GV_LEVEL=$(field "$line" level); GV_FREE=$(field "$line" free_gb) ;;
      "RESOURCE "*) RS_LINE=$line; RS_LEVEL=$(field "$line" level); RS_ADVICE=$(field "$line" advice) ;;
    esac
  done <<EOF
$out
EOF
  GV_TURN=$TURN
  return 0
}

res_episode() { cat "$RES_EPISODE_FILE" 2>/dev/null; }
res_episode_set() {
  (umask 077 && printf '%s\n' "$1" > "$RES_EPISODE_FILE.$$" && mv -f "$RES_EPISODE_FILE.$$" "$RES_EPISODE_FILE") \
    || td_die 3 "cannot write $RES_EPISODE_FILE"
}

# res_cap : the agent cap the current RESOURCE line allows: run.max_implementers
# at level ok, else 1, lowered to N by advice=max_implementers=N.
res_cap() {
  local cap=1 n
  [ "$RS_LEVEL" = ok ] && cap=$TDC_RUN_MAX_IMPLEMENTERS
  case "$RS_ADVICE" in
    max_implementers=*)
      n=${RS_ADVICE#max_implementers=}
      case "$n" in ''|*[!0-9]*) ;; *) [ "$n" -lt "$cap" ] && cap=$n ;; esac ;;
  esac
  printf '%s\n' "$cap"
}

# res_send EV : the resource-high message for the current RESOURCE line;
# critical pauses dispatch until a resource-resume, high caps fan-out.
res_send() {
  local rule
  if [ "$RS_LEVEL" = critical ]; then
    rule="Dispatch no new agents until the driver sends a resource resume message"
  else
    rule="Run at most $(res_cap) concurrent agents in total including nested"
  fi
  TDRIVE_TRACE_DISPATCH_RULE=$rule send_tpl "$1" resource-high "level=$RS_LEVEL" "mem_free_pct=$(field "$RS_LINE" mem_free_pct)" \
    "load_per_cpu=$(field "$RS_LINE" load_per_cpu)" "agents=$(field "$RS_LINE" agents)" \
    "advice=$RS_ADVICE" "max_implementers=$TDC_RUN_MAX_IMPLEMENTERS" "dispatch_rule=$rule"
}

# res_resume EV : the resource-resume message that lifts a pause.
res_resume() {
  send_tpl "$1" resource-resume "level=$RS_LEVEL" "mem_free_pct=$(field "$RS_LINE" mem_free_pct)" \
    "load_per_cpu=$(field "$RS_LINE" load_per_cpu)" "max_implementers=$(res_cap)"
}

# resource_turn EV : one resource check per turn. R/resource.episode holds
# the open episode: `paused N` after a pause (critical) message with N
# critical checks since, `capped` after a high message, `resumed` after a
# resource-resume. A paused episode below critical gets one resume (retried
# while the send fails); ok closes any episode; critical in a capped or
# resumed episode pauses again. Critical at resources.critical_backstops
# checks after a pause wakes. A legacy numeric episode counts as paused.
resource_turn() {
  local ev=$1 ep n=0
  [ "$TDC_RESOURCES_CHECK" = true ] || return 0
  govern_check || return 0
  ep=$(res_episode)
  case "$ep" in
    ''|capped|resumed) ;;
    "paused "*) n=${ep#paused } ;;
    *) n=$ep; ep="paused $ep" ;;
  esac
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  case "$RS_LEVEL" in
    ok)
      [ -n "$ep" ] || return 0
      case "$ep" in "paused "*) res_resume "$ev" || return 0 ;; esac
      rm -f "$RES_EPISODE_FILE"
      td_log "resource pressure is over; episode closed"
      return 0 ;;
    high)
      case "$ep" in
        "paused "*) res_resume "$ev" && res_episode_set resumed ;;
        '')
          case "$ev:$RS_ADVICE" in
            RESOURCE_HIGH:*|*:reduce-fanout|*:pause-dispatch) res_send "$ev" && res_episode_set capped ;;
          esac ;;
      esac
      return 0 ;;
    critical) ;;
    *) return 0 ;;
  esac
  case "$ep" in
    "paused "*) ;;
    *)
      res_send "$ev" && res_episode_set "paused 0"
      return 0 ;;
  esac
  case "$ev" in BACKSTOP|RESOURCE_HIGH) ;; *) return 0 ;; esac
  n=$((n + 1))
  res_episode_set "paused $n"
  handled "$ev" govern
  if [ "$n" -ge "$TDC_RESOURCES_CRITICAL_BACKSTOPS" ]; then
    wake "${RS_LINE% swap_used_pct=*} checks=$n" resource-critical-persisting
  fi
  return 0
}

# ---- verification ----------------------------------------------------------------------
# run_verify SHA : V_KIND PASS|FAIL|WEAK|DEFERRED|ERROR, V_RESULT, V_RC.
run_verify() {
  local out
  run_child "${BASH:-/bin/bash}" "$TD_HERE/verify.sh" --repo "$REPO" --ref "$1" --engine "$ENGINE"
  V_RC=$?
  out=$CHILD_TEXT
  [ -n "$out" ] && printf '%s\n' "$out" >&2
  V_RESULT=$(printf '%s\n' "$out" | command grep -E '^RESULT ' | tail -n 1)
  case "$V_RC:$V_RESULT" in
    0:"RESULT PASS"*) V_KIND=PASS ;;
    1:"RESULT FAIL"*) V_KIND=FAIL ;;
    1:"RESULT WEAK"*) V_KIND=WEAK ;;
    6:*) V_KIND=DEFERRED ;;
    *) V_KIND=ERROR ;;
  esac
  td_log "verify ${1:0:7}: $V_KIND (exit $V_RC) ${V_RESULT:-no RESULT line}"
}

send_verify_failed() {
  send_tpl "$1" verify-failed "sha7=${2:0:7}" "summary=$V_RESULT" "verify_file=$rd/verify/$2.txt" \
    "build_branch=$BRANCH" || true
}

# bump_fails COUNT : FAILS for COUNT plus one; prints the new n.
bump_fails() {
  local f n=1
  f=$(envget FAILS)
  if [ "${f%%:*}" = "$1" ]; then
    n=${f#*:}
    case "$n" in ''|*[!0-9]*) n=0 ;; esac
    n=$((n + 1))
  fi
  envset FAILS "$1:$n"
  printf '%s\n' "$n"
}

# pause_dispatch EV : pause message (once) and PAUSED=1.
pause_dispatch() {
  if [ "$(envget PAUSED)" != 1 ]; then
    govern_check || true
    send_tpl "$1" pause "free_gb=${GV_FREE:-?}" || true
  fi
  envset PAUSED 1
}

# complete_count EV COUNT SHA ACK : verify a completion at-least-once:
# VERIFY_PENDING, verify, report, ack, clear. ACK=if-current acks only when
# the signal still shows COUNT (newer progress then emits its own event).
# Returns 1 when the verify was deferred.
complete_count() {
  local ev=$1 c=$2 sha=$3 mode=$4 n=0
  envset VERIFY_PENDING "$c:$sha"
  run_verify "$sha"
  handled "$ev" verify
  case "$V_KIND" in
    PASS|WEAK)
      envset VERIFY_FAILED ""
      envset FAILS ""
      report phase "$ev" || true ;;
    FAIL)
      envset VERIFY_FAILED "$c:$sha"
      n=$(bump_fails "$c") || td_die 3 "cannot write run.env FAILS"
      send_verify_failed "$ev" "$sha"
      report phase "$ev" || true ;;
    DEFERRED)
      pause_dispatch "$ev"
      ack "$ev"
      return 1 ;;
    *)
      wake "verify error exit=$V_RC count=$c sha=${sha:0:7}" verify-failures ;;
  esac
  if [ "$mode" = always ] || { read_signal && [ "$SG_COUNT" = "$c" ]; }; then
    ack "$ev"
  fi
  envset VERIFY_PENDING ""
  if [ "$n" -ge "$TDC_VERIFY_MAX_FAILURES" ]; then
    wake "verify FAIL count=$c sha=${sha:0:7} fails=$n" verify-failures
  fi
  return 0
}

# drain_pending EV : verify a completion left by a crash or a deferral.
drain_pending() {
  local vp
  vp=$(envget VERIFY_PENDING)
  [ -n "$vp" ] || return 0
  case "$vp" in
    *:*) ;;
    *) td_log "ignoring malformed VERIFY_PENDING=$vp"; envset VERIFY_PENDING ""; return 0 ;;
  esac
  td_log "draining VERIFY_PENDING=$vp"
  complete_count "$1" "${vp%%:*}" "${vp#*:}" if-current && check_terminal "$1"
  return 0
}

# reverify EV : while VERIFY_FAILED is set, re-verify a moved branch head.
reverify() {
  local ev=$1 vf c head n
  vf=$(envget VERIFY_FAILED)
  [ -n "$vf" ] || return 0
  c=${vf%%:*}
  head=$(branch_head) || return 0
  [ "$head" != "${vf#*:}" ] || return 0
  run_verify "$head"
  handled "$ev" reverify
  case "$V_KIND" in
    PASS|WEAK)
      envset VERIFY_FAILED ""
      envset FAILS ""
      report phase "$ev" || true
      check_terminal "$ev" ;;
    FAIL)
      n=$(bump_fails "$c") || td_die 3 "cannot write run.env FAILS"
      envset VERIFY_FAILED "$c:$head"
      send_verify_failed "$ev" "$head"
      if [ "$n" -ge "$TDC_VERIFY_MAX_FAILURES" ]; then
        wake "verify FAIL count=$c sha=${head:0:7} fails=$n" verify-failures
      fi ;;
    *) td_log "re-verify of ${head:0:7} gave $V_KIND; VERIFY_FAILED kept" ;;
  esac
  return 0
}

# ---- clock -----------------------------------------------------------------------------------
# A fixed test clock moves only by the nominal minutes a watch waited.
advance_clock() {
  [ "${TDRIVE_TEST:-}" = 1 ] && [ -n "${TDRIVE_NOW:-}" ] || return 0
  case "$1" in ''|*[!0-9]*) return 0 ;; esac
  TDRIVE_NOW=$(loop_py add-min "$TDRIVE_NOW" "$1") || td_die 3 "cannot advance the test clock"
  export TDRIVE_NOW
}

# account_active : add the time since ACTIVE_MARK to run.env ACTIVE_S (the
# run's active loop seconds) and move the mark. The budget counts only time a
# loop runs: the gap between a WAKE (gate, question, operator pause, kill)
# and the next resume is time spent waiting on a human and is never counted.
ACTIVE_MARK=""
account_active() {
  local now acc
  [ -n "$ACTIVE_MARK" ] || return 0
  now=$(td_now) || return 0
  acc=$(envget ACTIVE_S)
  case "$acc" in ''|*[!0-9]*) acc=0 ;; esac
  [ "$now" -gt "$ACTIVE_MARK" ] && acc=$((acc + now - ACTIVE_MARK))
  ACTIVE_MARK=$now
  td_runenv_set "$run" ACTIVE_S "$acc" 2>/dev/null || td_log "cannot write run.env ACTIVE_S"
  ACTIVE_NOW_S=$acc
}

check_time_budget() {
  local active
  ACTIVE_NOW_S=""
  account_active
  [ "$TDC_RUN_MAX_MINUTES" -gt 0 ] || return 0
  [ -n "$ACTIVE_NOW_S" ] || return 0
  active=$((ACTIVE_NOW_S / 60))
  if [ "$active" -gt "$TDC_RUN_MAX_MINUTES" ]; then
    wake "time-budget active_min=$active max_minutes=$TDC_RUN_MAX_MINUTES" time-budget
  fi
}

# ---- test lock (gate.testlock) -----------------------------------------------------------
# testlock_turn EV HEAD : with gate.testlock, `tdrive testlock check` (check
# only) at HEAD for each phase in ST_DONE_IDS not yet in R/testlock.checked
# (seeded with the phases done before the first check, so earlier phases are
# never checked); a FAIL wakes stop=testlock with its VIOLATION lines.
TESTLOCK_FILE="$rd/testlock.checked"
testlock_seed() {
  [ "$TDC_GATE_TESTLOCK" = true ] && [ ! -f "$TESTLOCK_FILE" ] || return 0
  local out
  out=$("${BASH:-/bin/bash}" "$TD_HERE/state.sh" --engine "$ENGINE" --repo "$REPO" --branch "$BRANCH") || return 0
  (umask 077 && printf '%s\n' "$out" | awk -F '\t' '/^PHASE / && $2 == "done" { sub(/^PHASE /, "", $1); print $1 }' \
    > "$TESTLOCK_FILE") || td_log "cannot write $TESTLOCK_FILE"
}
testlock_turn() {
  local ev=$1 head=$2 id out rc line fails="" detail=""
  [ "$TDC_GATE_TESTLOCK" = true ] || return 0
  for id in $ST_DONE_IDS; do
    command grep -F -x -q -- "$id" "$TESTLOCK_FILE" 2>/dev/null && continue
    out=$("${BASH:-/bin/bash}" "$TD_HERE/testlock.sh" check --repo "$REPO" --branch "$BRANCH" --phase "$id" --head "$head")
    rc=$?
    [ -n "$out" ] && printf '%s\n' "$out" >&2
    printf '%s\n' "$id" >> "$TESTLOCK_FILE" || td_log "cannot write $TESTLOCK_FILE"
    line=$(printf '%s\n' "$out" | command grep -E '^TESTLOCK ' | tail -n 1)
    case "$rc:$line" in
      0:*result=PASS*) handled "$ev" "testlock:pass:$id" ;;
      1:*result=FAIL*)
        handled "$ev" "testlock:fail:$id"
        fails="${fails:+$fails ; }$line"
        detail="$detail$(printf '%s\n' "$out" | command grep -E '^VIOLATION ' | head -n 5 | sed 's/^/ ; /' | tr -d '\n')" ;;
      *)
        handled "$ev" "testlock:error:$id"
        fails="${fails:+$fails ; }testlock error exit=$rc phase=$id" ;;
    esac
  done
  [ -n "$fails" ] && wake "$fails$detail" testlock
  return 0
}

# ---- event handlers ----------------------------------------------------------------------
on_phase_done() {
  local new head
  new=${EV_LINE##*->}
  case "$new" in ''|*[!0-9]*) td_log "malformed event: $EV_LINE"; return 0 ;; esac
  head=$(branch_head) || td_die 3 "cannot resolve $BRANCH in $REPO"
  # Trace: the phases done now (their time ends at the event, not the verify).
  read_state || true
  if complete_count PHASE_DONE "$new" "$head" always; then
    testlock_turn PHASE_DONE "$head"
    check_terminal PHASE_DONE
  else
    testlock_turn PHASE_DONE "$head"
  fi
  # Trace: with no IN_PROGRESS row, the NEXT phases start after this one.
  read_state prev_done || true
  periodic_retro "$new"
  return 0
}

on_plan_changed() {
  local change old new
  change=${EV_LINE#PLAN_CHANGED "$SESSION" }
  old=${change%%->*}
  new=${change#*->}
  if [ "$old" = none ] && [ "$(envget COOK_SENT)" != 1 ]; then
    report plan-committed PLAN_CHANGED && envset STAGE_REPORTED plan-committed
  else
    report phase PLAN_CHANGED "plan changed $old->$new" || true
  fi
  ack PLAN_CHANGED
}

on_done_regressed() {
  local change
  change=${EV_LINE#DONE_REGRESSED "$SESSION" }
  report phase DONE_REGRESSED "done count regressed $change" || true
  ack DONE_REGRESSED
}

on_policy_violation() {
  wake_begin "$EV_LINE" policy-violation
  ack POLICY_VIOLATION
  wake_end
}

on_trust() {
  local n
  n=$(envget TRUST_REPEAT)
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  n=$((n + 1))
  envset TRUST_REPEAT "$n"
  [ "$n" -ge 2 ] && wake "$EV_LINE" trust-repeat
  case "$TDC_BOOT_DIALOG_SETTLE_S" in 0|0.0|'') ;; *) sleep "$TDC_BOOT_DIALOG_SETTLE_S" ;; esac
  if "${BASH:-/bin/bash}" "$TD_HERE/send.sh" --session "$SESSION" --keys "Down Enter" >&2; then
    handled TRUST keys
  else
    td_log "dialog keys not sent (send exit $?)"
  fi
}

on_limit() {
  local resets lines hash out
  resets=$(field "$EV_LINE" resets) || resets=unknown
  lines=$(td_classify "$SESSION") || lines=""
  hash=$(td_classify_field "$lines" LIMIT_HASH) || hash=""
  td_trace loop limit "reset=${resets:-unknown}" "hash=${hash:--}"
  [ "$(stop_action limit)" = wake ] && wake "$EV_LINE" limit
  out=$(loop_py limit-wait "${resets:-unknown}" "$(td_now)" "$TDC_LIMIT_MARGIN_MIN" "$TDC_LIMIT_FALLBACK_WAIT_MIN") \
    || td_die 3 "cannot compute the limit wait"
  envset LIMIT_EPISODE "${out% *}:$hash"
  envset LIMIT_WAITING 1
  LIMIT_WAIT_MIN=${out#* }
  handled LIMIT wait
  td_log "limit until ${resets:-unknown}; waiting $LIMIT_WAIT_MIN min"
  budget_switch
}

end_limit_wait() {
  read_state || true
  send_tpl "$1" limit-resume "next=$ST_NEXT_TEXT" || true
  models_switch_send "$1"
  envset LIMIT_WAITING 0
  LIMIT_WAIT_MIN=""
}

# ---- model policy ---------------------------------------------------------------------------
# budget_switch : at models.limit_switch_hits distinct usage-limit episodes
# in this run, record the decision to run subagents on models.budget_table.
# Nothing is sent now; models_switch_send tells the orchestrator after the
# reset. Never fatal.
budget_switch() {
  local out n rc
  [ "$TDC_MODELS_LIMIT_SWITCH_HITS" -gt 0 ] 2>/dev/null || return 0
  [ "$TDC_MODELS_TABLE" != "$TDC_MODELS_BUDGET_TABLE" ] || return 0
  out=$(td_py models limit-episodes --run "$run") || { td_log "cannot count limit episodes"; return 0; }
  n=${out#EPISODES }
  case "$n" in ''|*[!0-9]*) td_log "unexpected limit-episodes output: $out"; return 0 ;; esac
  [ "$n" -ge "$TDC_MODELS_LIMIT_SWITCH_HITS" ] || return 0
  out=$("${BASH:-/bin/bash}" "$TD_HERE/decide.sh" --repo "$REPO" \
    --decision "usage-limit pressure: switch subagent models to the budget table" \
    --options "$TDC_MODELS_TABLE; $TDC_MODELS_BUDGET_TABLE" --why "$n usage-limit episodes this run" \
    --key models.table --value "$TDC_MODELS_BUDGET_TABLE")
  rc=$?
  case "$rc" in
    0)
      printf '%s\n' "$out" >&2
      td_log "budget switch after $n usage-limit episodes: $out"
      TDC_MODELS_TABLE=$TDC_MODELS_BUDGET_TABLE
      MODELS_SWITCH_PENDING=1 ;;
    4) td_log "models.table is set by the environment; budget switch not recorded" ;;
    *) td_log "budget switch not recorded (decide exit $rc)" ;;
  esac
  return 0
}

# models_switch_send EV : once per recorded budget switch, the models-switch
# message with the budget table and the protected clause.
models_switch_send() {
  local tbl
  if [ "$MODELS_SWITCH_PENDING" != 1 ]; then
    td_py models switch-pending --run "$run" --table "$TDC_MODELS_BUDGET_TABLE" 2>/dev/null || return 0
  fi
  tbl=$(td_py models table --format message --table "$TDC_MODELS_BUDGET_TABLE") \
    || { td_log "cannot render the $TDC_MODELS_BUDGET_TABLE model table; models-switch not sent"; return 0; }
  send_tpl "$1" models-switch "table=$TDC_MODELS_BUDGET_TABLE" "model_table=$tbl" && MODELS_SWITCH_PENDING=0
  return 0
}

# protected_turn EV : when the state was read this turn, announce each
# protected phase now NEXT or IN_PROGRESS once (protected-phase message, id
# appended to R/protected.announced after the send). Never fatal.
protected_turn() {
  local ids out line head pid name pin=""
  [ "$ST_TURN" = "$TURN" ] || return 0
  [ "$ST_PLAN" = none ] || pin=$ST_PLAN
  ids="$ST_IP_IDS,$ST_NEXT_IDS"
  [ -n "${ids//,/}" ] || return 0
  out=$(td_py models protected --run "$run" --repo "$REPO" --branch "$BRANCH" --ids "$ids" \
    ${pin:+--plan "$pin"}) || { td_log "protected phase check failed (exit $?)"; return 0; }
  while IFS= read -r line; do
    case "$line" in "PROTECTED "*" | "*) ;; *) continue ;; esac
    head=${line%% | *}
    name=${line#* | }
    pid=$(field "$head" phase) || continue
    if send_tpl "$1" protected-phase "phase=$pid" "name=$name" "kind=$(field "$head" kind)" \
      "model=$(field "$head" model)"; then
      (umask 077 && printf '%s\n' "$pid" >> "$rd/protected.announced") \
        || td_log "cannot record $pid in $rd/protected.announced"
    fi
  done <<PROTECTED
$out
PROTECTED
  return 0
}

# bump_keyed KEY PREFIX : run.env KEY=<PREFIX>:<n>, n+1 when the prefix
# matches, else 1; prints the new n.
bump_keyed() {
  local cur n=1
  cur=$(envget "$1")
  if [ -n "$cur" ] && [ "${cur%:*}" = "$2" ]; then
    n=${cur##*:}
    case "$n" in ''|*[!0-9]*) n=0 ;; esac
    n=$((n + 1))
  fi
  envset "$1" "$2:$n"
  printf '%s\n' "$n"
}

on_backstop() {
  local key lines state busy idle_n=0 busy_n
  advance_clock "$(field "$EV_LINE" after_min)"
  if [ "$(envget LIMIT_WAITING)" = 1 ]; then
    end_limit_wait BACKSTOP
    return 0
  fi
  read_signal || td_die 3 "cannot read the progress signal of $REPO $BRANCH"
  key="$SG_COUNT:${SG_HEAD:0:7}"
  lines=$(td_classify "$SESSION") || lines=""
  state=$(td_classify_field "$lines" STATE) || state=""
  busy=0
  [ "$state" = BUSY ] && busy=1
  if [ "$busy" -eq 0 ]; then
    idle_n=$(bump_keyed IDLE_BACKSTOPS "$key") || td_die 3 "cannot write run.env IDLE_BACKSTOPS"
  fi
  busy_n=$(bump_keyed BUSY_BACKSTOPS "$key") || td_die 3 "cannot write run.env BUSY_BACKSTOPS"
  handled BACKSTOP wait
  if [ "$idle_n" -ge "$TDC_LOOP_STALL_BACKSTOPS" ]; then
    wake "$EV_LINE idle_backstops=$idle_n done=$SG_COUNT" stall
  fi
  if [ "$busy_n" -ge "$TDC_LOOP_BUSY_STALL_BACKSTOPS" ]; then
    wake "$EV_LINE busy_backstops=$busy_n done=$SG_COUNT" busy-stall
  fi
}

on_disk_low() {
  "${BASH:-/bin/bash}" "$TD_HERE/govern.sh" clean --repo "$REPO" >&2 || td_log "govern clean failed (exit $?)"
  handled DISK_LOW govern
  govern_check --fresh || return 0
  case "$GV_LEVEL" in
    alert) wake "$EV_LINE" disk-alert-persisting ;;
    pause) pause_dispatch DISK_LOW ;;
    one-implementer) send_tpl DISK_LOW one-implementer "free_gb=$GV_FREE" || true ;;
  esac
}

# run_stage NAME : the plan or cook stage of tdrive start for this run.
run_stage() {
  local rc
  "${BASH:-/bin/bash}" "$TD_HERE/start.sh" "$ENGINE" "$REPO" --stage "$1" --session "$SESSION" --no-follow
  rc=$?
  if [ "$rc" -eq 0 ]; then
    handled IDLE "send:$1"
    return 0
  fi
  td_log "stage $1 failed (exit $rc)"
  return 1
}

# nudge_plan / nudge_cook : the stage's nudge budget, then the nudge.
nudge_plan() {
  local n
  n=$(envget NUDGES_PLAN)
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  n=$((n + 1))
  envset NUDGES_PLAN "$n"
  [ "$n" -gt "$TDC_LOOP_MAX_NUDGES" ] && wake "$EV_LINE nudges=$((n - 1)) stage=plan" stall
  [ "${1:-}" = --count-only ] && return 0
  send_tpl IDLE nudge "next=commit the plan on $BRANCH" || true
}

nudge_cook() {
  local n
  n=$(bump_keyed NUDGES_COOK "$ST_DONE") || td_die 3 "cannot write run.env NUDGES_COOK"
  [ "$n" -gt "$TDC_LOOP_MAX_NUDGES" ] && wake "$EV_LINE nudges=$((n - 1)) stage=cook done=$ST_DONE" stall
  [ "${1:-}" = --count-only ] && return 0
  send_tpl IDLE nudge "next=$2" || true
}

# on_idle_adapter : 0 when the adapter's on-idle.sh handled the event.
on_idle_adapter() {
  local out id
  td_adapter_has "$ENGINE" on-idle.sh || return 1
  out=$(td_adapter_call "$ENGINE" on-idle.sh "$REPO" "$SESSION" "$run") || {
    td_log "on-idle.sh failed (exit $?); default handling"
    return 1
  }
  case "$out" in
    '') return 1 ;;
    *$'\n'*) td_log "on-idle.sh printed more than one line; default handling"; return 1 ;;
    "HANDLED "*" action="*)
      id=${out#HANDLED }
      handled "${id%% action=*}" "${id#* action=}"
      return 0 ;;
    "WAKE "*" stop="*)
      id=${out##* stop=}
      if [ "$(stop_action "$id")" = wake ]; then
        out=${out#WAKE }
        wake "${out% stop=*}" "$id"
      fi
      td_log "on-idle.sh woke with an unknown stop id: $id; default handling"
      return 1 ;;
  esac
  td_log "on-idle.sh printed an unexpected line: $out; default handling"
  return 1
}

on_idle() {
  local mi vf
  on_idle_adapter && return 0
  if [ "$(envget PAUSED)" = 1 ]; then
    govern_check --fresh || return 0
    handled IDLE govern
    case "$GV_LEVEL" in
      ok|one-implementer)
        mi=$TDC_RUN_MAX_IMPLEMENTERS
        [ "$GV_LEVEL" = one-implementer ] && mi=1
        send_tpl IDLE resume "max_implementers=$mi" || true
        envset PAUSED 0
        drain_pending IDLE ;;
      *) td_log "still paused: disk level $GV_LEVEL" ;;
    esac
    return 0
  fi
  if [ "$(envget LIMIT_WAITING)" = 1 ]; then
    end_limit_wait IDLE
    return 0
  fi
  read_state || return 0
  if [ "$ST_PLAN" = none ]; then
    if [ "$(envget PLAN_SENT)" != 1 ]; then
      run_stage plan || nudge_plan --count-only
    else
      nudge_plan
    fi
    return 0
  fi
  if [ "$(envget COOK_SENT)" != 1 ]; then
    run_stage cook || nudge_cook --count-only
    return 0
  fi
  if [ -n "$(envget VERIFY_PENDING)" ]; then
    drain_pending IDLE
    return 0
  fi
  vf=$(envget VERIFY_FAILED)
  if [ -z "$vf" ]; then
    check_terminal IDLE
    nudge_cook "" "$ST_NEXT_TEXT"
  else
    vf=${vf#*:}
    nudge_cook "" "fix the failed independent verify of ${vf:0:7} on $BRANCH"
  fi
}

# on_gate : the turn ended on a gate request while background work keeps the
# pane BUSY: the adapter's on-idle.sh signs it or wakes; nothing else is sent
# (no nudge while agents run).
on_gate() {
  on_idle_adapter && return 0
  handled GATE wait
}

# trace_question : the pane's prompt region as a question trace event.
trace_question() {
  local f
  f=$(mktemp "${TMPDIR:-/tmp}/tdrive-question.XXXXXX") || return 0
  td_classify "$SESSION" "$f" > /dev/null || true
  td_trace loop question --region-file "text=$f"
  rm -f "$f"
}

# ---- main ---------------------------------------------------------------------------------------
if [ "$TDC_GOVERN_AWAKE" = true ]; then
  "${BASH:-/bin/bash}" "$TD_HERE/govern.sh" awake --session "$SESSION" --repo "$REPO" >&2 \
    || td_log "keep-awake not started (govern exit $?)"
fi
testlock_seed
drain_pending VERIFY_PENDING
# Trace: the first event after a resume starts the NEXT phases (start_src resume).
LOOP_RESUMED=0
td_py trace resumed --run "$run" 2>/dev/null && LOOP_RESUMED=1

EV=""
# The active-time clock starts now: time since the last loop ended is not counted.
ACTIVE_MARK=$(td_now) || ACTIVE_MARK=""
[ -n "$(envget ACTIVE_S)" ] || td_log "time budget counts active loop time from now (run.env ACTIVE_S)"
incident_scan

while :; do
  TURN=$((TURN + 1))
  check_time_budget
  sup=""
  wargs=()
  if [ "$(envget LIMIT_WAITING)" = 1 ]; then
    sup="IDLE,LIMIT"
    if [ -z "$LIMIT_WAIT_MIN" ]; then
      ep=$(envget LIMIT_EPISODE)
      case "${ep%%:*}" in
        ''|*[!0-9]*) LIMIT_WAIT_MIN=$TDC_LIMIT_FALLBACK_WAIT_MIN ;;
        *) LIMIT_WAIT_MIN=$(loop_py wait-left "${ep%%:*}" "$(td_now)" "$TDC_LIMIT_MARGIN_MIN") \
             || td_die 3 "cannot compute the limit wait" ;;
      esac
    fi
    wargs=(--max-min "$LIMIT_WAIT_MIN")
  fi
  [ -n "$(res_episode)" ] && sup="${sup:+$sup,}RESOURCE_HIGH"
  [ -n "$sup" ] && wargs=(--suppress "$sup" ${wargs[@]+"${wargs[@]}"})

  run_child "${BASH:-/bin/bash}" "$TD_HERE/watch.sh" --engine "$ENGINE" --spec "$SPEC" ${wargs[@]+"${wargs[@]}"}
  rc=$?
  out=$CHILD_TEXT
  [ "$rc" -eq 0 ] || td_die "$rc" "watch failed (exit $rc)"
  EV_LINE=$(printf '%s\n' "$out" | command grep -E -v '^$' | tail -n 1)
  [ -n "$EV_LINE" ] || td_die 3 "watch printed no event"
  EV=${EV_LINE%% *}
  td_log "event: $EV_LINE"
  if [ "$LOOP_RESUMED" = 1 ]; then
    LOOP_RESUMED=0
    read_state resume || true
  fi

  if [ "$EV" != TRUST ]; then
    tr=$(envget TRUST_REPEAT)
    [ -z "$tr" ] || [ "$tr" = 0 ] || envset TRUST_REPEAT 0
  fi
  case "$EV" in
    PHASE_DONE) on_phase_done ;;
    PLAN_CHANGED) on_plan_changed ;;
    DONE_REGRESSED) on_done_regressed ;;
    POLICY_VIOLATION) on_policy_violation ;;
    IDLE) on_idle ;;
    GATE) on_gate ;;
    TRUST) on_trust ;;
    QUESTION) trace_question; wake "$EV_LINE" question ;;
    LIMIT) on_limit ;;
    BACKSTOP) on_backstop ;;
    DISK_LOW) on_disk_low ;;
    RESOURCE_HIGH) ;;
    SESSION_GONE) wake "$EV_LINE" session-gone ;;
    PANES) wake "$EV_LINE" panes ;;
    *) td_log "unknown event ignored: $EV_LINE" ;;
  esac
  protected_turn "$EV"
  resource_turn "$EV"
  reverify "$EV"
  incident_scan
done
