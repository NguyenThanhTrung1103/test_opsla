#!/bin/bash
# tdrive start: bootstrap a project, boot the engine session, send the plan
# and cook messages. Each stage is separately runnable and ends with a report.
set -u
TD_CMD=start
# Trace attribution of the sends this command and its boot make.
export TDRIVE_CALLER=start
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/tmux.sh"
. "$TD_HERE/lib/adapter.sh"
TD_HERE=$(cd "$TD_HERE" && pwd)

STAGES="all bootstrap boot plan cook"

usage() {
  cat <<'EOF'
usage: tdrive start <engine> <dir> [<brief>] [--ref P]... [--session S] [--method M]...
                    [--stage all|bootstrap|boot|plan|cook] [--resume] [--force] [--no-follow]

Stages (each ends with `tdrive report --stage <label>`):
  bootstrap  adapter bootstrap.sh: project, brief, references, .gitignore and
             the orchestrator directives (with method packs) committed on
             run.build_branch                         -> BOOTSTRAPPED ...
  boot       tdrive boot, govern awake, govern check; at the one-implementer
             floor the one-implementer message is sent, at pause/alert the
             pause message (PAUSED=1)                 -> READY ...
  plan       the plan message built from plan.command  -> PLAN_SENT <session>
  cook       needs a plan on the build branch: pins it (run.env PLAN and
             decided plan.path), re-acks the watch baseline and sends the
             cook message                             -> COOK_SENT <session>
  all        bootstrap, boot, plan.
The session defaults to the dir basename; the run is --run, else the dir's
registered run, else the session. A fresh start (no --resume, stage all or
bootstrap) archives an existing run when the dir is missing or its root
commit changed, and refuses otherwise. --resume skips bootstrap, boots only
when the session is gone (then sends the handoff-resume message) and skips
the plan when it was already sent. Method packs (--method and config
`methods`) come from TDRIVE_METHODS_PATH dirs, then the shipped methods/,
as <m>/directives.md. <brief> is required for stage all/bootstrap without
--resume. After stage all (and --resume) start becomes the drive loop for
the run (HANDLED lines, then one WAKE, COMPLETE or STOPPED line; see
core/loop.sh --help); --no-follow returns after the last stage instead.
Exit: 2 usage, config, unknown method, experimental engine, buildflow
switched off by the decay scan (features.buildflow=false) or no plan for
cook; 3 environment; 4 boot timeout; 5 refused (a live loop owns the run,
run exists, unsafe dir, session exists); otherwise the loop's exit.
EOF
}

engine="" dir="" brief="" session="" stage=all resume=0 force=0 follow=1
npos=0
refs=() method_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --ref|--session|--method|--stage)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --ref) refs+=("$2") ;;
        --session) session=$2 ;;
        --method) method_args+=("$2") ;;
        --stage) stage=$2 ;;
      esac
      shift 2 ;;
    --resume) resume=1; shift ;;
    --force) force=1; shift ;;
    --no-follow) follow=0; shift ;;
    -*) td_die 2 "unknown argument: $1 (see tdrive start --help)" ;;
    *)
      case "$npos" in
        0) engine=$1 ;;
        1) dir=$1 ;;
        2) brief=$1 ;;
        *) td_die 2 "unexpected argument: $1" ;;
      esac
      npos=$((npos + 1))
      shift ;;
  esac
done

case " $STAGES " in
  *" $stage "*) ;;
  *) td_die 2 "unknown stage: $stage (one of: $STAGES)" ;;
esac
[ -n "$engine" ] || td_die 2 "<engine> is required (see tdrive start --help)"
[ -n "$dir" ] || td_die 2 "<dir> is required"
if [ "$resume" -eq 1 ] && [ "$stage" != all ]; then
  td_die 2 "--resume runs the remaining stages; do not combine it with --stage $stage"
fi
fresh=0
if [ "$resume" -eq 0 ]; then
  case "$stage" in all|bootstrap) fresh=1 ;; esac
fi
[ "$fresh" -eq 0 ] || [ -n "$brief" ] || td_die 2 "<brief> is required for stage $stage (or pass --resume)"
td_adapter_resolve "$engine" || exit $?
td_require git python3
# The adapter files the requested stages use, checked before any side effect.
need_files=""
case "$stage:$resume" in
  all:0) need_files="bootstrap.sh templates/orchestrator-directives.md templates/messages/plan.txt" ;;
  all:1) need_files="templates/messages/plan.txt" ;;
  bootstrap:*) need_files="bootstrap.sh templates/orchestrator-directives.md" ;;
  plan:*) need_files="templates/messages/plan.txt" ;;
  cook:*) need_files="templates/messages/cook.txt" ;;
esac
case "$stage" in
  all|boot) need_files="$need_files templates/messages/one-implementer.txt templates/messages/pause.txt" ;;
esac
for f in $need_files; do
  [ -f "$TD_ADAPTER_DIR/$f" ] || td_die 2 "adapter $engine has no $f"
done

# Absolute dir with symlinks resolved as far as it exists.
case "$dir" in /*) ;; *) dir="$(pwd -P)/$dir" ;; esac
while :; do
  case "$dir" in
    ?*/) dir=${dir%/} ;;
    *) break ;;
  esac
done
if [ -d "$dir" ]; then
  dir=$(cd -P "$dir" && pwd) || td_die 3 "cannot enter $dir"
elif [ -d "${dir%/*}" ] && [ -n "${dir%/*}" ]; then
  dir="$(cd -P "${dir%/*}" && pwd)/${dir##*/}"
fi
base=${dir##*/}

# Default session: the dir basename with unsafe characters replaced.
default_session() {
  local n
  n=$(printf '%s' "$base" | LC_ALL=C tr -c 'A-Za-z0-9_-' '-')
  while :; do
    case "$n" in
      [A-Za-z0-9]*|'') break ;;
      *) n=${n#?} ;;
    esac
  done
  printf '%s\n' "$n"
}

guess=$session
[ -n "$guess" ] || guess=$(default_session)
[ -n "$guess" ] || td_die 2 "cannot derive a session name from $dir; pass --session"
td_tmux_valid_session "$guess" || td_die 2 "invalid session name: $guess"
run=$(td_run --repo "$dir" --session "$guess") || td_die 2 "cannot resolve run; pass --run"
rd="$(td_state_base)/runs/$run"
export TDRIVE_RUN=$run

have_env=0
[ -f "$rd/run.env" ] && have_env=1
if [ -z "$session" ]; then
  [ "$fresh" -eq 0 ] && [ "$have_env" -eq 1 ] && session=$(td_runenv_get "$run" SESSION 2>/dev/null)
  [ -n "$session" ] || session=$guess
  td_tmux_valid_session "$session" || td_die 2 "invalid session name in run.env: $session"
fi
# A continued run keeps its preset unless one is given now.
if [ "$fresh" -eq 0 ] && [ "$have_env" -eq 1 ] && [ -z "${TDRIVE_PRESET:-}" ]; then
  p=$(td_runenv_get "$run" PRESET 2>/dev/null) || p=""
  [ -n "$p" ] && export TDRIVE_PRESET=$p
fi

# The owning loop itself runs the plan and cook stages; anyone else is refused.
if td_py runstate pid-alive "$run" loop; then
  owner=$(head -n 1 "$rd/loop.pid" 2>/dev/null) || owner=""
  case "$stage" in
    plan|cook)
      if [ -z "${TDRIVE_LOOP_PID:-}" ] || [ "$owner" != "$TDRIVE_LOOP_PID" ]; then
        td_die 5 "a live loop owns this run: $run (stop it before starting again)"
      fi ;;
    *) td_die 5 "a live loop owns this run: $run (stop it before starting again)" ;;
  esac
fi
[ "$resume" -eq 0 ] || [ "$have_env" -eq 1 ] || td_die 2 "no run to resume: $run (no run.env)"

# root_sha DIR : the repo's root commit (lowest when several), empty if none.
root_sha() {
  git -C "$1" rev-list --max-parents=0 HEAD 2>/dev/null | LC_ALL=C sort | head -n 1
}

# ---- fresh-start lifecycle: archive a stale run, refuse a live one ---------------
if [ "$fresh" -eq 1 ] && [ -d "$rd" ]; then
  why=""
  if [ ! -d "$dir" ]; then
    why="dir $dir is missing"
  else
    recorded=$(td_runenv_get "$run" ROOT_SHA 2>/dev/null) || recorded=""
    current=$(root_sha "$dir")
    if [ -z "$recorded" ] || [ "$recorded" != "$current" ]; then
      why="root commit ${current:-none} differs from the recorded ${recorded:-none}"
    fi
  fi
  [ -n "$why" ] || td_die 5 "run exists; use --resume or --run (run $run, dir $dir)"
  if td_dry "archive run $run ($why)"; then
    :
  else
    old=$(td_py runstate archive "$run") || td_die 3 "cannot archive run $run"
    td_log "archived run $run to $old ($why)"
    have_env=0
  fi
fi

td_load_config --repo "$dir" --rundir "$rd" || exit $?
# A Buildflow run while the decay scan has switched the adapter off: one
# blocked-off use in the run's trace (it resets the deletion clock), then refuse.
if [ "$engine" = buildflow ] && [ "$TDC_FEATURES_BUILDFLOW" = false ]; then
  if ! td_dry; then
    TD_RUNDIR=$(td_state_dir "$run") || exit $?
    td_use buildflow blocked-off
  fi
  td_die 2 "buildflow is switched off by the decay scan (features.buildflow=false); re-enable: tdrive decide --key features.buildflow --value true, features.buildflow: true in the user config, or TDRIVE_FEATURES_BUILDFLOW=true"
fi
branch=$TDC_RUN_BUILD_BRANCH
if [ "$fresh" -eq 0 ] && [ "$have_env" -eq 1 ]; then
  b=$(td_runenv_get "$run" BRANCH 2>/dev/null) || b=""
  [ -n "$b" ] && branch=$b
fi
[ -n "$branch" ] || td_die 2 "run.build_branch is empty"
max_impl=$TDC_RUN_MAX_IMPLEMENTERS
parallel_flag=""
[ "$max_impl" -gt 1 ] 2>/dev/null && parallel_flag=" --parallel"
phase_clause=""
if [ "$TDC_RUN_STOP_AFTER_PHASES" -gt 0 ] 2>/dev/null; then
  phase_clause="Execute only the first $TDC_RUN_STOP_AFTER_PHASES phase(s), then stop and report."
fi

# ---- method packs ------------------------------------------------------------------
method_list=()
for m in ${method_args[@]+"${method_args[@]}"}; do method_list+=("$m"); done
if [ -n "$TDC_METHODS" ]; then
  IFS=',' read -r -a cfg_methods <<EOF
$TDC_METHODS
EOF
  for m in ${cfg_methods[@]+"${cfg_methods[@]}"}; do method_list+=("$m"); done
fi
method_text=""
seen=" "
for m in ${method_list[@]+"${method_list[@]}"}; do
  m=${m# }
  m=${m% }
  [ -n "$m" ] || continue
  printf '%s\n' "$m" | command grep -E -q '^[a-z0-9][a-z0-9_-]*$' || td_die 2 "invalid method name: $m"
  case "$seen" in *" $m "*) continue ;; esac
  seen="$seen$m "
  mf=""
  IFS=':' read -r -a mpath <<EOF
${TDRIVE_METHODS_PATH:-}
EOF
  for p in ${mpath[@]+"${mpath[@]}"}; do
    [ -n "$p" ] && [ -f "$p/$m/directives.md" ] && { mf="$p/$m/directives.md"; break; }
  done
  [ -n "$mf" ] || { [ -f "$TD_ROOT_DIR/methods/$m/directives.md" ] && mf="$TD_ROOT_DIR/methods/$m/directives.md"; }
  [ -n "$mf" ] || td_die 2 "unknown method: $m (no $m/directives.md in TDRIVE_METHODS_PATH or methods/)"
  body=$(cat "$mf") || td_die 2 "cannot read $mf"
  method_text="$method_text### Method: $m

$body

"
done

work=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-start.XXXXXX") || td_die 3 "cannot create a temp dir"
trap 'rm -rf "$work"' EXIT

# ---- run state ----------------------------------------------------------------------
preset_name=$TDC_PRESET
if td_dry; then
  if [ "$have_env" -eq 0 ] || [ "$fresh" -eq 1 ]; then
    td_dry "run $run: run.env ENGINE=$engine REPO=$dir BRANCH=$branch SESSION=$session PRESET=$preset_name"
  fi
  td_dry "index $dir -> $run"
else
  rd=$(td_state_dir "$run") || exit $?
  TD_RUNDIR=$rd
  if [ "$have_env" -eq 0 ] || [ "$fresh" -eq 1 ]; then
    for kv in "ENGINE=$engine" "REPO=$dir" "BRANCH=$branch" "SESSION=$session" \
      "PRESET=$preset_name" "STARTED_AT=$(td_iso)"; do
      td_runenv_set "$run" "${kv%%=*}" "${kv#*=}" || td_die 2 "cannot write run.env ${kv%%=*}"
    done
  else
    for kv in "ENGINE=$engine" "REPO=$dir" "BRANCH=$branch" "SESSION=$session"; do
      [ -n "$(td_runenv_get "$run" "${kv%%=*}")" ] && continue
      td_runenv_set "$run" "${kv%%=*}" "${kv#*=}" || td_die 2 "cannot write run.env ${kv%%=*}"
    done
  fi
  td_py runstate index-add "$run" "$dir" || td_die 3 "cannot register $dir in the run index"
  td_log "start $engine stage=$stage run=$run session=$session dir=$dir resume=$resume"
  if [ "$resume" -eq 1 ]; then
    td_trace start run action=resume ${preset_name:+"preset=$preset_name"} "engine=$engine" "cap=$max_impl" \
      "models_table=$TDC_MODELS_TABLE" --age-last since_wake_s=wake
  elif [ "$fresh" -eq 1 ]; then
    td_trace start run action=start ${preset_name:+"preset=$preset_name"} "engine=$engine" "cap=$max_impl" \
      "models_table=$TDC_MODELS_TABLE"
  fi
fi
[ "$follow" -eq 1 ] || td_log "--no-follow: returning after the last stage"

# ---- helpers -----------------------------------------------------------------------------
# report_stage LABEL : the stage report on stdout; STAGE_REPORTED on success.
report_stage() {
  if td_dry "tdrive report --repo $dir --session $session --stage $1"; then
    return 0
  fi
  if "${BASH:-/bin/bash}" "$TD_HERE/report.sh" --engine "$engine" --repo "$dir" --branch "$branch" \
    --session "$session" --stage "$1"; then
    td_runenv_set "$run" STAGE_REPORTED "$1" || td_log "cannot record STAGE_REPORTED=$1"
  else
    td_log "report for stage $1 failed (exit $?)"
  fi
  return 0
}

# send_message TEMPLATE_FILE VAR=VALUE... : render a single-line message and
# send it. Slash-command templates stay within send.max_inline, so they are
# typed inline and run.
send_message() {
  local tpl=$1 msg rc name
  shift
  local vars=()
  while [ $# -gt 0 ]; do vars+=(--var "$1"); shift; done
  msg=$(td_py render "$tpl" --single-line ${vars[@]+"${vars[@]}"}) || td_die 2 "cannot render $tpl"
  msg=${msg%"${msg##*[! ]}"}
  if td_dry "send $session: $msg"; then
    return 0
  fi
  name=${tpl##*/}
  TDRIVE_TRACE_TEMPLATE=${name%.*} "${BASH:-/bin/bash}" "$TD_HERE/send.sh" --session "$session" -- "$msg" >&2
  rc=$?
  [ "$rc" -eq 0 ] || td_die "$rc" "$(basename "$tpl") not sent to $session (send exit $rc)"
  td_log "sent $(basename "$tpl") to $session"
}

msg_dir="$TD_ADAPTER_DIR/templates/messages"

# trace_phases SRC NEXT_SRC : the phase events a `tdrive state` output on
# stdin implies, each phase start with its kind, assigned model and dispatch
# event (core/lib/models.py phases). Never fails the caller.
trace_phases() {
  python3 -E -s "$TD_LIB_DIR/models.py" phases --run "$run" --src "$1" --next-src "${2:--}" \
    --repo "$dir" --branch "$branch" --table "$TDC_MODELS_TABLE" >/dev/null 2>&1
  return 0
}

# ---- stages ----------------------------------------------------------------------------
stage_bootstrap() {
  local out rc force_args=() ref_args=() r model_table
  model_table=$(td_py models table --format directive --table "$TDC_MODELS_TABLE") \
    || td_die 2 "cannot render the model table (models.table=$TDC_MODELS_TABLE)"
  td_py render "$TD_ADAPTER_DIR/templates/orchestrator-directives.md" \
    --var "max_implementers=$max_impl" --var "build_branch=$branch" \
    --var "phase_limit_clause=$phase_clause" --var "method_directives=$method_text" \
    --var "model_table=$model_table" > "$work/directives.raw" \
    || td_die 2 "cannot render the orchestrator directives"
  awk 'NF { if (b && n) print ""; b = 0; n = 1; print; next } { b = 1 }' "$work/directives.raw" > "$work/directives.md" \
    || td_die 3 "cannot write the directives"
  [ "$force" -eq 1 ] && force_args=(--force)
  for r in ${refs[@]+"${refs[@]}"}; do ref_args+=(--ref "$r"); done
  out=$(td_adapter_call "$engine" bootstrap.sh "$dir" "$brief" ${ref_args[@]+"${ref_args[@]}"} \
    --directives "$work/directives.md" ${force_args[@]+"${force_args[@]}"})
  rc=$?
  [ -z "$out" ] || printf '%s\n' "$out"
  [ "$rc" -eq 0 ] || td_die "$rc" "bootstrap failed (exit $rc)"
  if ! td_dry; then
    r=$(root_sha "$dir")
    [ -n "$r" ] || td_die 3 "no root commit in $dir after bootstrap"
    td_runenv_set "$run" ROOT_SHA "$r" || td_die 2 "cannot write run.env ROOT_SHA"
  fi
  report_stage bootstrapped
}

stage_boot() {
  local rc check level free rendered line model
  if td_dry; then
    if [ -d "$dir" ]; then
      "${BASH:-/bin/bash}" "$TD_HERE/boot.sh" --session "$session" --dir "$dir" || return $?
    else
      # The same render as boot.sh: run.effort and the orchestrator model.
      line=$(td_py models resolve orchestrator --table "$TDC_MODELS_TABLE") \
        || td_die 2 "cannot resolve the orchestrator model"
      model=${line#* model=}
      model=${model%% *}
      [ "$model" = - ] && model=""
      printf '%s' "$TDC_BOOT_ENGINE_CMD" > "$work/cmd.tpl"
      rendered=$(td_py render "$work/cmd.tpl" --single-line --var "effort=$TDC_RUN_EFFORT" \
        --var "model_flag=${model:+ --model $model}") \
        || td_die 2 "cannot render the engine command"
      td_dry "tmux new-session -d -s $session -x 220 -y 60 -c $dir env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT $rendered"
    fi
    [ "$TDC_GOVERN_AWAKE" = true ] && td_dry "tdrive govern awake --session $session --repo $dir"
    td_dry "tdrive govern check --repo $dir --session $session"
    report_stage booted
    return 0
  fi
  "${BASH:-/bin/bash}" "$TD_HERE/boot.sh" --session "$session" --dir "$dir"
  rc=$?
  [ "$rc" -eq 0 ] || td_die "$rc" "boot failed (exit $rc)"
  if [ "$TDC_GOVERN_AWAKE" = true ]; then
    "${BASH:-/bin/bash}" "$TD_HERE/govern.sh" awake --session "$session" --repo "$dir" >&2 \
      || td_log "keep-awake not started (govern exit $?)"
  fi
  if check=$("${BASH:-/bin/bash}" "$TD_HERE/govern.sh" check --repo "$dir" --session "$session"); then
    printf '%s\n' "$check" >&2
    level="" free=""
    for w in $(printf '%s\n' "$check" | command grep -E '^DISK ' | head -n 1); do
      case "$w" in
        level=*) level=${w#level=} ;;
        free_gb=*) free=${w#free_gb=} ;;
      esac
    done
    case "$level" in
      one-implementer)
        send_message "$msg_dir/one-implementer.txt" "free_gb=$free" ;;
      pause|alert)
        send_message "$msg_dir/pause.txt" "free_gb=$free"
        td_runenv_set "$run" PAUSED 1 || td_die 2 "cannot write run.env PAUSED" ;;
    esac
  else
    td_log "govern check failed at boot (exit $?); floor not checked"
  fi
  report_stage booted
}

stage_plan() {
  # Baseline the watch before the plan exists, so the drive loop sees the
  # plan commit as PLAN_CHANGED none->plan however fast it lands.
  if ! td_dry && [ -d "$dir" ] && [ ! -f "$rd/watch/$session.base" ]; then
    "${BASH:-/bin/bash}" "$TD_HERE/watch.sh" --ack --engine "$engine" --spec "$session:$dir:$branch" >&2 \
      || td_log "watch baseline not written before the plan (exit $?)"
  fi
  send_message "$msg_dir/plan.txt" "plan_command=$TDC_PLAN_COMMAND" "build_branch=$branch"
  td_dry && { report_stage plan-sent; return 0; }
  printf 'PLAN_SENT %s\n' "$session"
  td_runenv_set "$run" PLAN_SENT 1 || td_die 2 "cannot write run.env PLAN_SENT"
  report_stage plan-sent
}

stage_cook() {
  local st rc plan line
  if [ ! -d "$dir" ]; then
    td_die 2 "no-plan: $dir does not exist"
  fi
  st=$("${BASH:-/bin/bash}" "$TD_HERE/state.sh" --engine "$engine" --repo "$dir" --branch "$branch")
  rc=$?
  [ "$rc" -eq 0 ] || td_die "$rc" "state failed for $dir $branch (exit $rc)"
  plan=""
  while IFS= read -r line; do
    case "$line" in "PLAN "*) plan=${line#PLAN } ;; esac
  done <<EOF
$st
EOF
  if [ -z "$plan" ] || [ "$plan" = none ]; then
    td_die 2 "no-plan: no plan.md on $branch in $dir; run the plan stage and wait for the plan commit"
  fi
  if td_dry; then
    td_dry "pin plan $plan (run.env PLAN, decided plan.path)"
    td_dry "tdrive watch --ack --spec $session:$dir:$branch"
  else
    td_runenv_set "$run" PLAN "$plan" || td_die 2 "cannot write run.env PLAN"
    td_py config set-decided "$rd" plan.path "$plan" >&2
    rc=$?
    case "$rc" in
      0) ;;
      4) td_log "plan.path is set by the environment; the decided pin is shadowed" ;;
      *) td_die "$rc" "cannot pin plan.path (exit $rc)" ;;
    esac
    "${BASH:-/bin/bash}" "$TD_HERE/watch.sh" --ack --engine "$engine" --spec "$session:$dir:$branch" >&2
    rc=$?
    [ "$rc" -eq 0 ] || td_die "$rc" "cannot re-baseline the watch on $plan (exit $rc)"
  fi
  send_message "$msg_dir/cook.txt" "plan_path=$plan" "max_implementers=$max_impl" \
    "parallel_flag=$parallel_flag" "build_branch=$branch" "phase_limit_clause=$phase_clause"
  td_dry && { report_stage cook-sent; return 0; }
  # Trace: the first phases start with the cook send (no IN_PROGRESS row yet).
  printf '%s\n' "$st" | trace_phases start cook_sent
  printf 'COOK_SENT %s\n' "$session"
  td_runenv_set "$run" COOK_SENT 1 || td_die 2 "cannot write run.env COOK_SENT"
  report_stage cook-sent
}

# resume_session : boot a gone session and point it at the newest committed
# orchestrator handoff brief (else docs/BRIEF.md).
resume_session() {
  local brief_path
  if td_tmux_has "$session"; then
    td_log "session $session is alive; not booting"
    return 0
  fi
  stage_boot
  brief_path=$(git -C "$dir" ls-tree -r --name-only "$(td_branch_ref "$dir" "$branch")" -- docs/handoff 2>/dev/null \
    | command grep -E '^docs/handoff/HANDOFF-[^/]+\.md$' | LC_ALL=C sort | tail -n 1)
  [ -n "$brief_path" ] || brief_path=docs/BRIEF.md
  send_message "$TD_ROOT_DIR/core/templates/messages/handoff-resume.txt" "path=$brief_path" "branch=$branch"
}

case "$stage" in
  bootstrap) stage_bootstrap ;;
  boot) stage_boot ;;
  plan) stage_plan ;;
  cook) stage_cook ;;
  all)
    if [ "$resume" -eq 1 ]; then
      td_require tmux
      resume_session
      if [ "$(td_runenv_get "$run" PLAN_SENT 2>/dev/null)" = 1 ]; then
        td_log "plan already sent; skipping the plan stage"
      else
        stage_plan
      fi
    else
      stage_bootstrap
      stage_boot
      stage_plan
    fi
    if [ "$follow" -eq 1 ]; then
      td_dry "tdrive loop --run $run" && exit 0
      rm -rf "$work"
      trap - EXIT
      exec "${BASH:-/bin/bash}" "$TD_HERE/loop.sh" --run "$run"
    fi ;;
esac
exit 0
