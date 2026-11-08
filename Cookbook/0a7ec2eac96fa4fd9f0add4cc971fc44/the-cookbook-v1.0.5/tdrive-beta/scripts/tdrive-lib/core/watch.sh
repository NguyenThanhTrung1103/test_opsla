#!/bin/bash
# tdrive watch: wait for the next event across one or more engine sessions,
# print exactly one event line and exit 0. Baselines advance only via --ack.
set -u
TD_CMD=watch
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/tmux.sh"
. "$TD_HERE/lib/adapter.sh"

usage() {
  cat <<'EOF'
usage: tdrive watch --spec session:repo[:branch] [--spec ...] [--engine E]
                    [--max-min N] [--suppress EV,EV] [--disk-path P]
       tdrive watch --ack --spec session:repo[:branch] [--spec ...] [--engine E]

Each tick (TDRIVE_TICK seconds, default watch.tick_s) checks the disk floor
and, per spec, the pane and the adapter's progress signal. The first event
by priority is printed and appended to the run's events.log:
  SESSION_GONE <s>
  POLICY_VIOLATION <s> <id> reason=<r>   (violation not acked yet)
  PLAN_CHANGED <s> <old|none>-><new>
  DONE_REGRESSED <s> <old>-><new>
  PHASE_DONE <s> <old>-><new>
  DISK_LOW - level=<one-implementer|pause|alert> free_gb=<n.n> path=<dir>
  RESOURCE_HIGH - level=<high|critical> mem_free_pct=<n> load_per_cpu=<n.nn> agents=<n>
  PANES <s> count=<n> max=<m> split_failed=<yes|no>
                               (the session has more than watch.max_panes
                                panes (0: count check off), or a teammate
                                split failed on screen (`Failed to create
                                teammate pane`, `no space for new pane`);
                                once per episode, R/watch/<s>.panes; tdrive
                                never kills a pane or a process)
  TRUST <s> | QUESTION <s> | LIMIT <s> resets=<iso|unknown> | IDLE <s>
  GATE <s> <tag>|ask=<kind>    (adapters with on-idle.sh: the turn ended on a
                                gate request, or on a gate-like ask
                                (approval, handoff; core/lib/gates.py),
                                while background agents or shells keep the
                                pane BUSY; only an occurrence not yet in
                                R/gates.seen)
  BACKSTOP - after_min=<n>     (nominal clock reached --max-min,
                                default watch.backstop_min)
The baseline (runs/<run>/watch/<s>.base: plan, count, head) is created on
the first watch and changes only with --ack, which records the current
signal and its violation ids and prints ACKED <s> plan=<p> count=<n> head=<sha>.
IDLE needs watch.idle_checks idle ticks in a row. A LIMIT screen whose line
hash and passed reset match run.env LIMIT_EPISODE counts as idle.
DISK_LOW fires when the level is worse than at watch start. The disk path is
--disk-path, else govern.disk_path, else the first spec's repo.
RESOURCE_HIGH fires when the resource level (memory free %, load per cpu,
running agents incl. nested; see tdrive govern check) is worse than at watch
start; off when resources.check is false.
--suppress accepts only IDLE, LIMIT, TRUST, QUESTION, DISK_LOW, RESOURCE_HIGH
and PANES.
Each watched run's trace.jsonl gets `watch` start/end, the `watch_event`
(with latency_s: emit minus the head commit time for PHASE_DONE,
PLAN_CHANGED and DONE_REGRESSED, minus the first non-busy tick for IDLE) and
`pane` samples (first tick, every state change, and once when a BUSY screen
stays unchanged for 3 ticks: static_ticks=3).
Exit: 0 event, 2 usage or config error, 3 tmux, git, repo or df missing.
EOF
}

SUPPRESSIBLE="IDLE LIMIT TRUST QUESTION DISK_LOW RESOURCE_HIGH PANES"
spec_args=() engine="" max_min="" suppress_arg="" disk_path="" ack=0
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --spec|--engine|--max-min|--suppress|--disk-path)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --spec) spec_args+=("$2") ;;
        --engine) engine=$2 ;;
        --max-min) max_min=$2 ;;
        --suppress) suppress_arg=$2 ;;
        --disk-path) disk_path=$2 ;;
      esac
      shift 2 ;;
    --ack) ack=1; shift ;;
    *) td_die 2 "unknown argument: $1 (see tdrive watch --help)" ;;
  esac
done

[ ${#spec_args[@]} -gt 0 ] || td_die 2 "at least one --spec session:repo[:branch] is required"
case "$max_min" in
  '') ;;
  *[!0-9]*) td_die 2 "--max-min must be a non-negative integer: $max_min" ;;
esac
suppressed=" "
if [ -n "$suppress_arg" ]; then
  IFS=',' read -r -a sup_list <<EOF
$suppress_arg
EOF
  for ev in ${sup_list[@]+"${sup_list[@]}"}; do
    case " $SUPPRESSIBLE " in
      *" $ev "*) [ -n "$ev" ] && suppressed="$suppressed$ev " ;;
      *) td_die 2 "cannot suppress $ev (allowed: $SUPPRESSIBLE)" ;;
    esac
  done
fi
is_suppressed() {
  case "$suppressed" in *" $1 "*) return 0 ;; esac
  return 1
}

td_require git python3
[ "$ack" -eq 1 ] || td_require tmux

# Per-spec state lives in parallel indexed arrays.
SP_S=() SP_REPO=() SP_BR=() SP_RUN=() SP_RD=() SP_PIN=() SP_ENG=()
SP_BPLAN=() SP_BCOUNT=() SP_ACKED=() SP_IDLE=() SP_GATES=()

# Check every spec's syntax before any slow work.
seen_s=" "
for spec in "${spec_args[@]}"; do
  s=${spec%%:*}
  rest=${spec#*:}
  [ "$rest" != "$spec" ] && [ -n "$rest" ] && [ -n "${rest%:*}" ] \
    || td_die 2 "bad spec (want session:repo[:branch]): $spec"
  td_tmux_valid_session "$s" || td_die 2 "invalid session name in spec: $s"
  case "$seen_s" in *" $s "*) td_die 2 "session listed twice: $s" ;; esac
  seen_s="$seen_s$s "
done

n=0
for spec in "${spec_args[@]}"; do
  s=${spec%%:*}
  rest=${spec#*:}
  case "$rest" in
    *:*) br=${rest##*:}; repo=${rest%:*} ;;
    *) br=""; repo=$rest ;;
  esac
  [ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
  repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
  git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $repo"
  run=$(td_run --repo "$repo" --session "$s") || td_die 2 "cannot resolve run for $s; pass --run"
  rd=$(td_state_dir "$run") || exit $?
  td_load_config --repo "$repo" --rundir "$rd" || exit $?
  [ -n "$br" ] || br=$(td_adapter_branch "$repo" "$TDC_RUN_BUILD_BRANCH") || exit $?
  eng=${engine:-$TDC_ENGINE}
  td_adapter_resolve "$eng" || exit $?
  SP_S[n]=$s SP_REPO[n]=$repo SP_BR[n]=$br SP_RUN[n]=$run SP_RD[n]=$rd
  SP_PIN[n]=$TDC_PLAN_PATH SP_ENG[n]=$eng SP_IDLE[n]=0
  SP_GATES[n]=0
  td_adapter_has "$eng" on-idle.sh && SP_GATES[n]=1
  n=$((n + 1))
done
if [ "$n" -gt 1 ]; then
  td_load_config --repo "${SP_REPO[0]}" --rundir "${SP_RD[0]}" || exit $?
fi
TD_RUNDIR=${SP_RD[0]}

# spec_signal I : run the adapter signal; sets SIG_PLAN SIG_COUNT SIG_HEAD and
# SIG_VIOL (one "<id> reason=<r>" per line).
spec_signal() {
  local i=$1 out rc line rest
  out=$(export TDRIVE_PLAN_PATH="${SP_PIN[$i]}"
        td_adapter_call "${SP_ENG[$i]}" state.sh "${SP_REPO[$i]}" "${SP_BR[$i]}" --signal)
  rc=$?
  [ "$rc" -eq 0 ] || td_die 3 "progress signal failed for ${SP_S[$i]} (adapter exit $rc)"
  SIG_PLAN="" SIG_COUNT="" SIG_HEAD="" SIG_VIOL=""
  while IFS= read -r line; do
    case "$line" in
      "SIGNAL plan="*)
        rest=${line#SIGNAL plan=}
        SIG_HEAD=${rest##* head=}
        rest=${rest% head=*}
        SIG_COUNT=${rest##* count=}
        SIG_PLAN=${rest% count=*} ;;
      "VIOLATION "*)
        SIG_VIOL="$SIG_VIOL${line#VIOLATION }
" ;;
    esac
  done <<EOF
$out
EOF
  case "$SIG_COUNT" in
    ''|*[!0-9]*) td_die 3 "bad progress signal for ${SP_S[$i]}: $out" ;;
  esac
  case "$SIG_PLAN$SIG_HEAD" in
    *$'\t'*) td_die 3 "bad progress signal for ${SP_S[$i]}: $out" ;;
  esac
  [ -n "$SIG_PLAN" ] && [ -n "$SIG_HEAD" ] || td_die 3 "bad progress signal for ${SP_S[$i]}: $out"
  return 0
}

# write_file PATH CONTENT : atomic replace under the private state dir.
write_file() {
  (umask 077 && mkdir -p "$(dirname "$1")" && printf '%s' "$2" > "$1.tmp.$$" && mv -f "$1.tmp.$$" "$1") \
    || td_die 3 "cannot write $1"
}

base_path() { printf '%s/watch/%s.base\n' "${SP_RD[$1]}" "${SP_S[$1]}"; }
panes_path() { printf '%s/watch/%s.panes\n' "${SP_RD[$1]}" "${SP_S[$1]}"; }
viol_path() { printf '%s/watch/%s.violations\n' "${SP_RD[$1]}" "${SP_S[$1]}"; }

write_base() {
  write_file "$(base_path "$1")" "$SIG_PLAN	$SIG_COUNT	$SIG_HEAD
"
}

if [ "$ack" -eq 1 ]; then
  i=0
  while [ "$i" -lt "$n" ]; do
    spec_signal "$i"
    ids=""
    while IFS= read -r v; do
      [ -n "$v" ] && ids="$ids${v%% *}
"
    done <<EOF
$SIG_VIOL
EOF
    write_base "$i"
    write_file "$(viol_path "$i")" "$ids"
    printf 'ACKED %s plan=%s count=%s head=%s\n' "${SP_S[$i]}" "$SIG_PLAN" "$SIG_COUNT" "$SIG_HEAD"
    TD_RUNDIR=${SP_RD[$i]} td_log "acked ${SP_S[$i]}: plan=$SIG_PLAN count=$SIG_COUNT head=$SIG_HEAD"
    i=$((i + 1))
  done
  exit 0
fi

# Baselines: initialize silently when missing, then load.
i=0
while [ "$i" -lt "$n" ]; do
  bf=$(base_path "$i")
  if [ ! -f "$bf" ]; then
    spec_signal "$i"
    write_base "$i"
    td_log "initialized baseline for ${SP_S[$i]}: plan=$SIG_PLAN count=$SIG_COUNT head=$SIG_HEAD"
  fi
  bp="" bc="" bh=""
  IFS=$'\t' read -r bp bc bh < "$bf" || true
  case "$bc" in ''|*[!0-9]*) td_die 3 "corrupt baseline $bf; re-run with --ack" ;; esac
  [ -n "$bp" ] || td_die 3 "corrupt baseline $bf; re-run with --ack"
  SP_BPLAN[i]=$bp SP_BCOUNT[i]=$bc
  SP_ACKED[i]=$(cat "$(viol_path "$i")" 2>/dev/null)
  i=$((i + 1))
done

# Disk floor: DISK_LOW fires only when the level is worse than at start.
[ -n "$disk_path" ] || disk_path=$TDC_GOVERN_DISK_PATH
[ -n "$disk_path" ] || disk_path=${SP_REPO[0]}
floors="$TDC_FLOORS_ONE_IMPLEMENTER_GB,$TDC_FLOORS_PAUSE_GB,$TDC_FLOORS_ALERT_GB"

# disk_check : sets DK_LEVEL DK_RANK DK_GB; non-zero when df failed.
disk_check() {
  local out w
  out=$(td_py disk level --path "$disk_path" --floors "$floors") || return 1
  DK_LEVEL="" DK_RANK="" DK_GB=""
  for w in $out; do
    case "$w" in
      level=*) DK_LEVEL=${w#level=} ;;
      rank=*) DK_RANK=${w#rank=} ;;
      free_gb=*) DK_GB=${w#free_gb=} ;;
    esac
  done
  case "$DK_RANK" in ''|*[!0-9]*) return 1 ;; esac
  return 0
}
disk_check || td_die 3 "cannot measure free space at $disk_path"
L0_RANK=$DK_RANK

# Resource level: RESOURCE_HIGH fires only when it is worse than at start.
# The start level has no agents yet; from the first tick on, agents are the
# panes' AGENTS counts and the nested claude processes under the pane pids
# (looked up once per session, when its pane is first read).
res_on=0
case "$TDC_RESOURCES_CHECK" in true) res_on=1 ;; esac
res_pid_args=()
SP_PID=()

# resource_check AGENTS : sets RS_LEVEL RS_RANK RS_MEM RS_LOAD RS_AGENTS;
# non-zero when the measurement failed.
resource_check() {
  local out w
  out=$(td_py resources check --repo "${SP_REPO[0]}" --rundir "${SP_RD[0]}" --agents "$1" \
        ${res_pid_args[@]+"${res_pid_args[@]}"}) || return 1
  RS_LEVEL="" RS_MEM="" RS_LOAD="" RS_AGENTS=""
  for w in $out; do
    case "$w" in
      level=*) RS_LEVEL=${w#level=} ;;
      mem_free_pct=*) RS_MEM=${w#mem_free_pct=} ;;
      load_per_cpu=*) RS_LOAD=${w#load_per_cpu=} ;;
      agents=*) RS_AGENTS=${w#agents=} ;;
    esac
  done
  case "$RS_LEVEL" in
    ok) RS_RANK=0 ;;
    high) RS_RANK=1 ;;
    critical) RS_RANK=2 ;;
    *) return 1 ;;
  esac
  return 0
}
R0_RANK=0
if [ "$res_on" -eq 1 ]; then
  if resource_check 0; then
    R0_RANK=$RS_RANK
  else
    td_log "cannot measure resources at watch start"
  fi
fi

# trace_all ARGS... : one watch trace event per distinct watched run.
trace_all() {
  local j=0 seen=" " rd
  while [ "$j" -lt "$n" ]; do
    rd=${SP_RD[$j]}
    case "$seen" in
      *" $rd "*) ;;
      *) TD_RUNDIR=$rd td_trace watch "$@"; seen="$seen$rd " ;;
    esac
    j=$((j + 1))
  done
}

# event_latency IDX EVENT : sets EV_LAT to the trace latency arguments.
event_latency() {
  local ct
  EV_LAT=()
  case "$2" in
    PHASE_DONE|PLAN_CHANGED|DONE_REGRESSED)
      [ "$1" -ge 0 ] && [ -n "$BEST_HEAD" ] || return 0
      ct=$(git -C "${SP_REPO[$1]}" log -1 --format=%ct "$BEST_HEAD" 2>/dev/null) || return 0
      case "$ct" in ''|*[!0-9]*) return 0 ;; esac
      EV_LAT=(--age-since "latency_s=$ct") ;;
    IDLE)
      [ "$1" -ge 0 ] && [ -n "${SP_IDLE_T0[$1]:-}" ] || return 0
      EV_LAT=("latency_s=$((SECONDS - SP_IDLE_T0[$1]))") ;;
  esac
  return 0
}

# emit IDX LINE : append LINE to the events.log of spec IDX's run (IDX -1:
# of every watched run, once each), trace it, print it and exit 0.
emit() {
  local idx=$1 line=$2 ts j rd seen=" " ev=${2%% *}
  ts=$(td_iso) || ts=unknown-time
  event_latency "$idx" "$ev"
  j=0
  while [ "$j" -lt "$n" ]; do
    rd=${SP_RD[$j]}
    if [ "$idx" -eq "$j" ] || [ "$idx" -lt 0 ]; then
      case "$seen" in
        *" $rd "*) ;;
        *)
          printf '%s %s\n' "$ts" "$line" >> "$rd/events.log" || td_log "cannot append to $rd/events.log"
          if [ "$idx" -ge 0 ]; then
            TD_RUNDIR=$rd td_trace watch watch_event "event=$ev" "line=$line" "session=${SP_S[$idx]}" \
              ${EV_LAT[@]+"${EV_LAT[@]}"}
          else
            TD_RUNDIR=$rd td_trace watch watch_event "event=$ev" "line=$line"
          fi
          seen="$seen$rd " ;;
      esac
    fi
    j=$((j + 1))
  done
  if [ "$ev" = PANES ] && [ "$idx" -ge 0 ]; then
    write_file "$(panes_path "$idx")" "${SP_PREC[$idx]}
"
  fi
  trace_all watch action=end
  printf '%s\n' "$line"
  exit 0
}

# Candidate event of the current tick: lowest rank wins, first spec on ties.
# 1 SESSION_GONE, 2 POLICY_VIOLATION, 3 PLAN_CHANGED, 4 DONE_REGRESSED,
# 5 PHASE_DONE, 6 DISK_LOW, 7 RESOURCE_HIGH, 8 PANES, 9 pane states.
consider() {
  if [ "$1" -lt "$BEST_RANK" ]; then
    BEST_RANK=$1 BEST_IDX=$2 BEST_LINE=$3 BEST_HEAD=${4:-}
  fi
}

# limit_stale IDX HASH : 0 when run.env LIMIT_EPISODE has this line hash and
# its reset time has passed.
limit_stale() {
  local ep reset hash now
  ep=$(td_runenv_get "${SP_RUN[$1]}" LIMIT_EPISODE 2>/dev/null) || return 1
  [ -n "$ep" ] && [ -n "$2" ] || return 1
  reset=${ep%%:*}
  hash=${ep#*:}
  case "$reset" in ''|*[!0-9]*) return 1 ;; esac
  [ "$hash" = "$2" ] || return 1
  now=$(td_now) || return 1
  [ "$now" -ge "$reset" ]
}

# panes_check IDX SPLIT_LINE : the pane count of spec IDX against
# watch.max_panes, and a teammate split failure line from this tick's screen.
# A PANES candidate when the count rose above the cap past the episode's
# count, or the failure line is new; SP_PREC[IDX] is the episode record
# (`<count over the cap or 0>\t<failure line sha1/12 or ->`) emit writes.
SP_PREC=()
panes_check() {
  local i=$1 split=$2 cnt max=$TDC_WATCH_MAX_PANES pf rc=0 rh=- over=0 fh=- fire=0 keep
  cnt=$(td_tmux_pane_count "${SP_S[$i]}") || { td_log "cannot count the panes of ${SP_S[$i]} this tick"; return 0; }
  case "$cnt" in ''|*[!0-9]*) return 0 ;; esac
  pf=$(panes_path "$i")
  [ -f "$pf" ] && IFS=$'\t' read -r rc rh < "$pf"
  case "$rc" in ''|*[!0-9]*) rc=0 ;; esac
  [ -n "$rh" ] || rh=-
  [ "$max" -gt 0 ] && [ "$cnt" -gt "$max" ] && over=1
  if [ -n "$split" ]; then
    fh=$(python3 -E -s -c 'import hashlib, sys; print(hashlib.sha1(sys.argv[1].encode("utf-8", "replace")).hexdigest()[:12])' "$split") || fh=-
    [ "$fh" != "$rh" ] && fire=1
  fi
  [ "$over" -eq 1 ] && [ "$cnt" -gt "$rc" ] && fire=1
  if [ "$fire" -eq 1 ]; then
    keep=0
    [ "$over" -eq 1 ] && keep=$cnt
    [ "$fh" = - ] && fh=$rh
    SP_PREC[i]="$keep	$fh"
    is_suppressed PANES || consider 8 "$i" "PANES ${SP_S[$i]} count=$cnt max=$max split_failed=$([ -n "$split" ] && echo yes || echo no)"
  elif [ "$over" -eq 0 ] && [ "$rc" -ne 0 ]; then
    # Back at or under the cap: the episode ends (the failure line is kept).
    write_file "$pf" "0	$rh
"
  fi
  return 0
}

idle_tick() {
  [ "${SP_IDLE[$1]}" -eq 0 ] && SP_IDLE_T0[$1]=$SECONDS
  SP_IDLE[$1]=$((SP_IDLE[$1] + 1))
  if [ "${SP_IDLE[$1]}" -ge "$TDC_WATCH_IDLE_CHECKS" ] && ! is_suppressed IDLE; then
    consider 9 "$1" "IDLE ${SP_S[$1]}"
  fi
}

tick=${TDRIVE_TICK:-$TDC_WATCH_TICK_S}
case "$tick" in ''|*[!0-9.]*) td_die 2 "TDRIVE_TICK must be a number of seconds: $tick" ;; esac
[ -n "$max_min" ] || max_min=$TDC_WATCH_BACKSTOP_MIN
max_s=$((max_min * 60))
nominal=0

# ---- trace: pane samples --------------------------------------------------------
SP_PST=() SP_STATIC=() SP_IDLE_T0=()
pane_dir=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-watch.XXXXXX") || td_die 3 "cannot create a temp dir"
trap 'rm -rf "$pane_dir"' EXIT
# A TERM/INT (the loop stopping) ends the tick sleep at once; EXIT cleans up.
TICK_PID=""
trap '[ -n "$TICK_PID" ] && kill "$TICK_PID" 2>/dev/null; exit 143' TERM
trap '[ -n "$TICK_PID" ] && kill "$TICK_PID" 2>/dev/null; exit 130' INT

# pane_sample IDX STATE LINES : a pane trace event on the first tick, on a
# state change, and once when a BUSY screen has stayed the same for 3 ticks.
pane_sample() {
  local i=$1 st=$2 cur="$pane_dir/pane.$1" prev="$pane_dir/pane.$1.prev" f v args=()
  if [ "$st" = BUSY ] && [ "${SP_PST[$i]:-}" = BUSY ] && cmp -s "$cur" "$prev"; then
    SP_STATIC[i]=$((${SP_STATIC[$i]:-0} + 1))
  elif [ "$st" = BUSY ]; then
    SP_STATIC[i]=1
  else
    SP_STATIC[i]=0
  fi
  if [ "${SP_PST[$i]:-}" != "$st" ] || [ "${SP_STATIC[$i]}" -eq 3 ]; then
    for f in AGENTS:agents SHELLS:shells PENDING_INPUT:pending_input; do
      v=$(td_classify_field "$3" "${f%%:*}") && [ -n "$v" ] && args+=("${f#*:}=$v")
    done
    [ "${SP_PST[$i]:-}" = "$st" ] && args+=("static_ticks=3")
    TD_RUNDIR=${SP_RD[$i]} td_trace watch pane "session=${SP_S[$i]}" "state=$st" \
      ${args[@]+"${args[@]}"} --file-sha "screen_sha=$cur"
  fi
  SP_PST[i]=$st
  mv -f "$cur" "$prev" 2>/dev/null || true
}

spec_trace=()
for spec in "${spec_args[@]}"; do spec_trace+=(--list-field "specs=$spec"); done
trace_all watch action=start "${spec_trace[@]}" ${suppress_arg:+"suppress=$suppress_arg"} "max_min=$max_min"

while :; do
  case "$tick" in *[1-9]*) sleep "$tick" & TICK_PID=$!; wait "$TICK_PID"; TICK_PID="" ;; esac
  nominal=$((nominal + TDC_WATCH_TICK_S))
  BEST_RANK=99 BEST_IDX=-1 BEST_LINE="" BEST_HEAD=""

  if disk_check; then
    if [ "$DK_RANK" -gt "$L0_RANK" ] && [ "$DK_LEVEL" != ok ] && ! is_suppressed DISK_LOW; then
      consider 6 -1 "DISK_LOW - level=$DK_LEVEL free_gb=$DK_GB path=$disk_path"
    fi
  else
    td_log "cannot measure free space at $disk_path this tick"
  fi

  pane_agents=0
  i=0
  while [ "$i" -lt "$n" ]; do
    s=${SP_S[$i]}
    lines=$(td_classify "$s" "$pane_dir/pane.$i") || td_die 3 "cannot classify the pane of $s"
    state=$(td_classify_field "$lines" STATE)
    gate_line=""
    if [ "$state" = BUSY ] && [ "${SP_GATES[$i]}" = 1 ] && ! is_suppressed IDLE; then
      # A turn that ended on a gate request is a gate even while background
      # agents or shells keep the pane BUSY (they never end the wait).
      g=$(td_py gates scan --pane "$pane_dir/pane.$i" --run "${SP_RUN[$i]}" 2>/dev/null) || g=""
      case "$g" in
        "GATE "*" turn_end=yes seen=no") g=${g#GATE tag=}; gate_line="GATE $s ${g%% *}" ;;
        "ASK "*" turn_end=yes seen=no") g=${g#ASK kind=}; gate_line="GATE $s ask=${g%% *}" ;;
      esac
    fi
    split=$(command grep -E -m 1 'Failed to create teammate pane|no space for new pane' "$pane_dir/pane.$i" 2>/dev/null) || split=""
    pane_sample "$i" "$state" "$lines"
    if [ "$state" = SESSION_GONE ]; then
      consider 1 "$i" "SESSION_GONE $s"
      break
    fi
    panes_check "$i" "$split"
    a=$(td_classify_field "$lines" AGENTS) || a=0
    case "$a" in ''|*[!0-9]*) a=0 ;; esac
    [ "$a" -gt "$pane_agents" ] && pane_agents=$a
    if [ "$res_on" -eq 1 ] && [ -z "${SP_PID[$i]:-}" ]; then
      p=$(td_tmux_pid "$s") || p=""
      case "$p" in
        ''|*[!0-9]*) SP_PID[i]=- ;;
        *) SP_PID[i]=$p; res_pid_args+=(--pane-pid "$p") ;;
      esac
    fi

    spec_signal "$i"
    while IFS= read -r v; do
      [ -n "$v" ] || continue
      case "
${SP_ACKED[$i]}
" in
        *"
${v%% *}
"*) ;;
        *) consider 2 "$i" "POLICY_VIOLATION $s $v"; break ;;
      esac
    done <<EOF
$SIG_VIOL
EOF
    if [ "$SIG_PLAN" != "${SP_BPLAN[$i]}" ]; then
      consider 3 "$i" "PLAN_CHANGED $s ${SP_BPLAN[$i]}->$SIG_PLAN" "$SIG_HEAD"
    elif [ "$SIG_COUNT" -lt "${SP_BCOUNT[$i]}" ]; then
      consider 4 "$i" "DONE_REGRESSED $s ${SP_BCOUNT[$i]}->$SIG_COUNT" "$SIG_HEAD"
    elif [ "$SIG_COUNT" -gt "${SP_BCOUNT[$i]}" ]; then
      consider 5 "$i" "PHASE_DONE $s ${SP_BCOUNT[$i]}->$SIG_COUNT" "$SIG_HEAD"
    fi

    case "$state" in
      TRUST) is_suppressed TRUST || consider 9 "$i" "TRUST $s" ;;
      QUESTION) is_suppressed QUESTION || consider 9 "$i" "QUESTION $s" ;;
      LIMIT)
        if limit_stale "$i" "$(td_classify_field "$lines" LIMIT_HASH)"; then
          idle_tick "$i"
        elif ! is_suppressed LIMIT; then
          reset=$(td_classify_field "$lines" LIMIT_RESET) || reset=unknown
          consider 9 "$i" "LIMIT $s resets=${reset:-unknown}"
        fi ;;
      BUSY)
        SP_IDLE[i]=0
        [ -n "$gate_line" ] && consider 9 "$i" "$gate_line" ;;
      READY|IDLE) idle_tick "$i" ;;
      *) td_log "unexpected pane state for $s: $state" ;;
    esac
    i=$((i + 1))
  done

  if [ "$res_on" -eq 1 ] && [ "$BEST_RANK" -gt 7 ] && ! is_suppressed RESOURCE_HIGH; then
    if resource_check "$pane_agents"; then
      if [ "$RS_RANK" -gt "$R0_RANK" ]; then
        consider 7 -1 "RESOURCE_HIGH - level=$RS_LEVEL mem_free_pct=$RS_MEM load_per_cpu=$RS_LOAD agents=$RS_AGENTS"
      fi
    else
      td_log "cannot measure resources this tick"
    fi
  fi

  [ -n "$BEST_LINE" ] && emit "$BEST_IDX" "$BEST_LINE"
  if [ "$nominal" -ge "$max_s" ]; then
    emit -1 "BACKSTOP - after_min=$((nominal / 60))"
  fi
done
