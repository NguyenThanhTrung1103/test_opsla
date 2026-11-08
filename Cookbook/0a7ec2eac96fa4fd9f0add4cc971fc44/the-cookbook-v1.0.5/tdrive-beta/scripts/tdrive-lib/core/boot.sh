#!/bin/bash
# tdrive boot: start the engine in a tmux session, accept start-up dialogs,
# and wait until the pane is ready.
set -u
TD_CMD=boot
# Trace attribution of the dialog keys this command sends.
export TDRIVE_CALLER=boot
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/tmux.sh"

usage() {
  cat <<'EOF'
usage: tdrive boot --session S --dir D [--effort E] [--model M] [--cmd CMD]
                   [--reuse] [--timeout SECONDS]

Starts `boot.engine_cmd` in a new tmux session S (220x60, cwd D), with
{{effort}} rendered (default run.effort) and {{model_flag}} as ` --model M`
(default: the orchestrator row of the models.table table in
policies/models.yaml; empty when that row has no model). A command without
{{model_flag}} starts without a model flag. Inherited CLAUDECODE and
CLAUDE_CODE_* variables are removed from the launch with `env -u`.
Trust and bypass dialogs are accepted with Down + Enter after
boot.dialog_settle_s, through the send lock. --timeout overrides
boot.timeout_s (0 = check once).
Prints: READY <session> pid=<pane_pid>          (exit 0)
        BOOT_TIMEOUT <session> state=<STATE>    (exit 4)
Exit: 2 usage or the run's engine buildflow switched off by the decay scan
      (features.buildflow=false), 3 tmux missing, dir missing or session
      gone, 5 session already exists (use --reuse to attach to it).
EOF
}

session="" dir="" effort="" model="" have_model=0 cmd="" have_cmd=0 reuse=0 timeout=""
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --session|--dir|--effort|--model|--cmd|--timeout)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --session) session=$2 ;;
        --dir) dir=$2 ;;
        --effort) effort=$2 ;;
        --model) model=$2; have_model=1 ;;
        --cmd) cmd=$2; have_cmd=1 ;;
        --timeout) timeout=$2 ;;
      esac
      shift 2 ;;
    --reuse) reuse=1; shift ;;
    *) td_die 2 "unknown argument: $1 (see tdrive boot --help)" ;;
  esac
done

[ -n "$session" ] || td_die 2 "--session is required"
td_tmux_valid_session "$session" || td_die 2 "invalid session name: $session (letters, digits, _ and - only)"
[ -n "$dir" ] || td_die 2 "--dir is required"
case "$timeout" in
  '') ;;
  *[!0-9]*) td_die 2 "--timeout must be a non-negative integer: $timeout" ;;
esac
[ -d "$dir" ] || td_die 3 "dir not found: $dir"
dir=$(cd -P "$dir" && pwd) || td_die 3 "cannot enter dir: $dir"
td_require tmux

run=$(td_run --repo "$dir" --session "$session") || td_die 2 "cannot resolve run; pass --run"
rundir=$(td_state_dir "$run") || exit $?
TD_RUNDIR=$rundir
td_load_config --repo "$dir" --rundir "$rundir" || exit $?
# The run's engine switched off by the decay scan: a blocked-off use, then refuse.
if [ "$(td_runenv_get "$run" ENGINE 2>/dev/null)" = buildflow ] && [ "$TDC_FEATURES_BUILDFLOW" = false ]; then
  td_dry || td_use buildflow blocked-off
  td_die 2 "buildflow is switched off by the decay scan (features.buildflow=false); re-enable: tdrive decide --key features.buildflow --value true, features.buildflow: true in the user config, or TDRIVE_FEATURES_BUILDFLOW=true"
fi

[ -n "$effort" ] || effort=$TDC_RUN_EFFORT
td_py config validate run.effort "$effort" >/dev/null || exit 2
if [ "$have_model" -eq 0 ]; then
  line=$(td_py models resolve orchestrator --table "$TDC_MODELS_TABLE") || td_die 2 "cannot resolve the orchestrator model"
  model=${line#* model=}
  model=${model%% *}
  [ "$model" = - ] && model=""
fi
# The model is typed into a shell command line: aliases only.
case "$model" in
  '') model_flag="" ;;
  [!A-Za-z0-9]*|*[!A-Za-z0-9._-]*) td_die 2 "invalid model: $model (a letter or digit, then letters, digits, . _ -)" ;;
  *) model_flag=" --model $model" ;;
esac
[ "$have_cmd" -eq 1 ] || cmd=$TDC_BOOT_ENGINE_CMD
[ -n "$cmd" ] || td_die 2 "empty engine command"
[ -n "$timeout" ] || timeout=$TDC_BOOT_TIMEOUT_S
settle=$TDC_BOOT_DIALOG_SETTLE_S

work=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-boot.XXXXXX") || td_die 3 "cannot create a temp dir"
trap 'rm -rf "$work"' EXIT

printf '%s' "$cmd" > "$work/cmd.tpl"
rendered=$(td_py render "$work/cmd.tpl" --single-line --var "effort=$effort" --var "model_flag=$model_flag") || td_die 2 "cannot render the engine command"
[ -n "$rendered" ] || td_die 2 "empty engine command after rendering"

# A tmux server started from inside a Claude tool hands its Claude variables
# to every new pane; strip them so the engine starts as a top-level session.
launch="env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT"
for v in $(compgen -e | LC_ALL=C sort); do
  case "$v" in
    CLAUDE_CODE_ENTRYPOINT) ;;
    CLAUDE_CODE_*) launch="$launch -u $v" ;;
  esac
done
# Buildflow: a supervised orchestrator signs a gate only on the driver's exact `APPROVE <tag>` line
# (sign.sh --approval, Buildflow >= 3.4.2). Older kits ignore the variable.
if [ "$(td_runenv_get "$run" ENGINE 2>/dev/null)" = buildflow ] && [ "${TDC_BUILDFLOW_SUPERVISED:-true}" = true ]; then
  launch="$launch BF_SUPERVISED=1"
fi
launch="$launch $rendered"

exists=0
td_tmux_has "$session" && exists=1
if [ "$exists" -eq 1 ] && [ "$reuse" -eq 0 ]; then
  td_die 5 "session already exists: $session (use --reuse to attach to it)"
fi

if td_dry; then
  if [ "$exists" -eq 1 ]; then
    td_dry "reuse tmux session $session"
  else
    td_dry "tmux new-session -d -s $session -x 220 -y 60 -c $dir $launch"
  fi
  exit 0
fi

if [ "$exists" -eq 1 ]; then
  td_log "reusing tmux session $session"
else
  if ! tmux new-session -d -s "$session" -x 220 -y 60 -c "$dir" "$launch"; then
    td_tmux_has "$session" && td_die 5 "session already exists: $session"
    td_die 3 "cannot start tmux session $session"
  fi
  td_log "started tmux session $session in $dir: $launch"
fi

# accept_dialog : settle, then Down + Enter through the send lock.
accept_dialog() {
  sleep "$settle"
  TDRIVE_RUN=$run "${BASH:-/bin/bash}" "$TD_HERE/send.sh" --session "$session" --keys "Down Enter" >&2 \
    || td_log "dialog keys not sent (send exit $?)"
}

tick=${TDRIVE_TICK:-1}
start=$SECONDS
sends=0
state=""
while :; do
  lines=$(td_classify "$session" "$work/cur") || td_die 3 "cannot classify the pane of $session"
  state=$(td_classify_field "$lines" STATE)
  case "$state" in
    READY)
      pid=$(td_tmux_pid "$session")
      printf 'READY %s pid=%s\n' "$session" "${pid:-unknown}"
      td_log "ready: $session pid=${pid:-unknown}"
      exit 0 ;;
    SESSION_GONE)
      td_die 3 "session $session is gone" ;;
    TRUST)
      if [ "$sends" -gt 0 ] && cmp -s "$work/cur" "$work/prev"; then
        # The same dialog is still on screen: retry once.
        if [ "$sends" -lt 2 ]; then
          td_log "dialog still open after Down Enter; retrying once"
          accept_dialog
          sends=$((sends + 1))
        fi
      else
        td_log "accepting $(td_classify_field "$lines" DIALOG) dialog"
        accept_dialog
        sends=1
      fi
      cp "$work/cur" "$work/prev" ;;
  esac
  if [ $((SECONDS - start)) -ge "$timeout" ]; then
    printf 'BOOT_TIMEOUT %s state=%s\n' "$session" "${state:-unknown}"
    td_log "timeout after ${timeout}s: state=$state"
    exit 4
  fi
  sleep "$tick"
done
