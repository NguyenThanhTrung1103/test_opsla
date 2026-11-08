#!/bin/bash
# tdrive govern: keep the machine able to finish the run. Reports the disk
# floor and resource pressure, attributes docker usage, runs allowlisted
# cleanup and keeps the machine awake. It never stops a container or kills
# a process.
set -u
TD_CMD=govern
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/tmux.sh"

usage() {
  cat <<'EOF'
usage: tdrive govern check [--repo R | --path P] [--session S]
       tdrive govern attribute [--repo R] [--project NAME] [--session S]
       tdrive govern clean [--repo R] [--path P] [--mode dry-run|apply|auto]
                           [--only id,...] [--until-free-gb N] [--all] [--policy FILE]
       tdrive govern awake (--session S | --pid P) [--repo R]

check      DISK path=<p> free_gb=<n.n> level=<ok|one-implementer|pause|alert>
             advice=<max_implementers=N|pause-dispatch|alert>
           RESOURCE mem_free_pct=<n|unknown> load_per_cpu=<n.nn> ncpu=<n>
             agents=<n> level=<ok|high|critical>
             advice=<max_implementers=N|reduce-fanout|pause-dispatch>
             swap_used_pct=<n|unknown> kernel_pressure=<...>
           The level is driven by memory free %, load per cpu and agents
           (pane AGENTS and nested claude processes of the session's pane);
           swap and kernel pressure are context only.
attribute  ATTRIB kind=<volume|container> name=<n> project=<p|-> owner=<ours|other>
             size_bytes=<n|?> (largest first), ATTRIB_SUMMARY, DSTAT (docker
           stats) and TOP (top 5 processes by cpu and by rss):
           TOP by=<cpu|rss> pid=<n> cpu=<n.n> rss_mb=<n> owner=<ours|other>
             cmd=<basename> ppid=<n>. Report only.
clean      ATTRIB_SUMMARY, one CLEAN line per policies/safe-cleanup.yaml
           entry, CLEAN_SUMMARY. Default mode govern.mode; auto applies only
           at the pause or alert floor; apply stops once --until-free-gb
           (default govern.target_free_gb) is free unless --all. A --policy
           outside the shipped file or ${XDG_CONFIG_HOME:-~/.config}/tdrive/
           runs as dry-run. Docker volumes and containers are never pruned.
awake      AWAKE pid=<n> method=<caffeinate|systemd-inhibit|none>
             status=<started|exists|skipped>; one keep-awake per pid.
Every line is appended to runs/<run>/govern.jsonl. The run is --run, else
the repo's registered run, else --session, else the basename of --repo (or
of the current dir's git toplevel, or of --path).
Exit: 0 ok, 2 usage or config error, 3 environment (df failed, dead pid,
session absent).
EOF
}

sub=${1:-}
[ $# -gt 0 ] && shift
case "$sub" in
  --help|-h|help) usage; exit 0 ;;
  check|attribute|clean|awake) ;;
  '') usage >&2; exit 2 ;;
  *) td_die 2 "unknown govern subcommand: $sub (see tdrive govern --help)" ;;
esac

repo="" path="" session="" pid="" py_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --all)
      [ "$sub" = clean ] || td_die 2 "--all is only valid for clean"
      py_args+=(--all); shift ;;
    --repo|--path|--session|--pid|--project|--mode|--only|--until-free-gb|--policy)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$sub:$1" in
        *:--repo) repo=$2 ;;
        check:--path|clean:--path) path=$2 ;;
        check:--session|attribute:--session|awake:--session) session=$2 ;;
        awake:--pid) pid=$2 ;;
        attribute:--project|clean:--project) py_args+=(--project "$2") ;;
        clean:--mode|clean:--only|clean:--until-free-gb|clean:--policy) py_args+=("$1" "$2") ;;
        *) td_die 2 "$1 is not valid for govern $sub" ;;
      esac
      shift 2 ;;
    *) td_die 2 "unknown argument: $1 (see tdrive govern --help)" ;;
  esac
done

if [ -n "$session" ]; then
  td_tmux_valid_session "$session" || td_die 2 "invalid session name: $session"
fi
case "$pid" in
  ''|*[!0-9]*) [ -z "$pid" ] || td_die 2 "--pid must be a number: $pid" ;;
esac
if [ "$sub" = awake ] && [ -z "$pid" ] && [ -z "$session" ]; then
  td_die 2 "awake needs --session S or --pid P"
fi

# The repo is --repo, else the git toplevel of the current dir, else the
# current dir. name_from names the run when nothing else resolves it: the
# repo (--repo or toplevel), else --path; a bare current dir never does.
name_from=""
if [ -n "$repo" ]; then
  [ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
  repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
  name_from=$repo
elif top=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$top" ] && [ -d "$top" ]; then
  repo=$(cd -P "$top" && pwd) || td_die 3 "cannot enter repo dir: $top"
  name_from=$repo
else
  repo=$(pwd -P) || td_die 3 "cannot resolve the current dir"
fi
if [ -n "$path" ]; then
  [ -d "$path" ] || td_die 3 "path not found: $path"
  path=$(cd -P "$path" && pwd) || td_die 3 "cannot enter path: $path"
  py_args+=(--path "$path")
  [ -n "$name_from" ] || name_from=$path
fi

# run_name DIR : DIR's basename as a valid run name (other characters become
# `-`, leading non-alphanumerics and `..` are dropped); empty when none is left.
run_name() {
  local n
  n=$(printf '%s' "${1##*/}" | LC_ALL=C tr -c 'A-Za-z0-9._-' '-')
  while :; do
    case "$n" in
      *..*) n=${n//../.} ;;
      [A-Za-z0-9]*|'') break ;;
      *) n=${n#?} ;;
    esac
  done
  printf '%s\n' "$n"
}

# Run: --run/TDRIVE_RUN, the repo index, the session, else the repo basename.
if [ -n "$session" ]; then
  run=$(td_run --repo "$repo" --session "$session") || exit 2
elif [ -n "${TDRIVE_RUN:-}" ]; then
  run=$(td_run --repo "$repo") || exit 2
elif run=$(td_run --repo "$repo" 2>/dev/null); then
  :
else
  rc=$?
  [ "$rc" -eq 2 ] || td_die "$rc" "run resolution failed (exit $rc)"
  run=""
  [ -z "$name_from" ] || run=$(run_name "$name_from")
  [ -n "$run" ] || td_die 2 "cannot resolve run; use --run NAME or --repo DIR"
  td_log "no run registered for $name_from; run=$run (its basename)"
fi
rd=$(td_state_dir "$run") || exit $?
TD_RUNDIR=$rd
[ -n "$session" ] || session=$(td_runenv_get "$run" SESSION 2>/dev/null) || session=""

# Orchestrator pane: its pid marks our processes; its screen shows the
# running agents. Neither is required when no session is known.
pane_pid=""
if [ -n "$session" ] && [ "$sub" != clean ] && command -v tmux >/dev/null 2>&1 && td_tmux_has "$session"; then
  pane_pid=$(td_tmux_pid "$session") || pane_pid=""
  case "$pane_pid" in ''|*[!0-9]*) pane_pid="" ;; esac
fi

case "$sub" in
  check)
    if [ -n "$pane_pid" ]; then
      py_args+=(--pane-pid "$pane_pid")
      lines=$(td_classify "$session") || lines=""
      agents=$(td_classify_field "$lines" AGENTS) || agents=0
      case "$agents" in ''|*[!0-9]*) agents=0 ;; esac
      py_args+=(--agents "$agents")
    fi ;;
  attribute)
    [ -n "$pane_pid" ] && py_args+=(--pane-pid "$pane_pid") ;;
  awake)
    if [ -z "$pid" ]; then
      [ -n "$pane_pid" ] || td_die 3 "session not found: $session"
      pid=$pane_pid
    fi
    py_args+=(--pid "$pid") ;;
esac

td_log "govern $sub run=$run repo=$repo"
td_py govern "$sub" --repo "$repo" --rundir "$rd" --jsonl "$rd/govern.jsonl" ${py_args[@]+"${py_args[@]}"}
