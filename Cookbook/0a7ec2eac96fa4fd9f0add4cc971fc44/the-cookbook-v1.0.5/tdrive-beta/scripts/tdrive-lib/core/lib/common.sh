#!/bin/bash
# Shared shell library for tdrive commands. Source it; never execute it.
# Functions are the public td_* API used by every command script.
#
# Variables a caller may set:
#   TD_CMD     command name used in log lines (default: script basename)
#   TD_RUNDIR  run dir; when set, td_log also appends to TD_RUNDIR/tdrive.log

TD_LIB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TD_ROOT_DIR=$(cd "$TD_LIB_DIR/../.." && pwd)
: "${TD_CMD:=$(basename "${0%.sh}")}"

td_root() {
  printf '%s\n' "$TD_ROOT_DIR"
}

# td_py MODULE[.py] ARGS... : run a core/lib python helper.
td_py() {
  local mod=$1
  shift
  case "$mod" in *.py) ;; *) mod="$mod.py" ;; esac
  python3 -E -s "$TD_LIB_DIR/$mod" "$@"
}

td_now() { td_py runstate now; }
td_iso() { td_py runstate iso "$@"; }
td_stamp() { td_py runstate stamp --pid "$$"; }

td_log() {
  local msg="$*" ts
  printf '%s: %s\n' "$TD_CMD" "$msg" >&2
  if [ -n "${TD_RUNDIR:-}" ] && [ -d "$TD_RUNDIR" ]; then
    ts=$(td_iso 2>/dev/null) || ts=unknown-time
    printf '%s %s %s\n' "$ts" "$TD_CMD" "$msg" >> "$TD_RUNDIR/tdrive.log"
  fi
  return 0
}

# td_die CODE MESSAGE... : log and exit with CODE.
td_die() {
  local code=$1
  shift
  td_log "$@"
  exit "$code"
}

# td_run [--repo P] [--session S] : print the resolved run name (exit 2 if none).
# Uses --run/TDRIVE_RUN first, then runs/index.tsv, then the session.
td_run() {
  td_py runstate resolve "$@"
}

td_state_base() {
  printf '%s\n' "${TDRIVE_STATE_DIR:-$HOME/.tdrive}"
}

# td_state_dir RUN : create runs/RUN/ under umask 077 and print its path.
# A run dir created here starts with an empty trace.jsonl, so its first trace
# event is never mistaken for the resume of an older run (one without a trace).
td_state_dir() {
  local run=$1 dir new=0
  case "$run" in
    ''|.*|*/*|*[!A-Za-z0-9._-]*) td_log "invalid run name: $run"; return 2 ;;
  esac
  dir="$(td_state_base)/runs/$run"
  [ -d "$dir" ] || new=1
  (umask 077 && mkdir -p "$dir") || { td_log "cannot create $dir"; return 3; }
  if [ "$new" -eq 1 ] && [ "${TDRIVE_DRY_RUN:-}" != 1 ]; then
    (umask 077 && : >> "$dir/trace.jsonl") 2>/dev/null || td_log "cannot create $dir/trace.jsonl"
  fi
  printf '%s\n' "$dir"
}

# _td_trace_run : the run a trace event belongs to: the basename of
# TD_RUNDIR, else TDRIVE_RUN; empty when neither is set.
_td_trace_run() {
  local r=""
  if [ -n "${TD_RUNDIR:-}" ]; then
    r=${TD_RUNDIR%/}
    r=${r##*/}
  fi
  [ -n "$r" ] || r=${TDRIVE_RUN:-}
  printf '%s' "$r"
}

# td_trace SRC KIND [field=value | field:=JSON | --option VALUE]... : append
# one event to the run's operate trace (core/lib/trace.py emit; options such
# as --ref-last FIELD=KIND pass through). Does nothing when no run resolves.
# Never prints and never changes the caller's exit status.
td_trace() {
  local src=$1 kind=$2 run a name args=()
  shift 2
  run=$(_td_trace_run)
  [ -n "$run" ] || return 0
  while [ $# -gt 0 ]; do
    a=$1
    case "$a" in
      --*)
        [ $# -ge 2 ] || break
        args+=("$a" "$2")
        shift 2
        continue ;;
      *=*)
        name=${a%%=*}
        case "$name" in
          *:) args+=(--json-field "${name%:}=${a#*=}") ;;
          *) args+=(--field "$a") ;;
        esac ;;
    esac
    shift
  done
  python3 -E -s "$TD_LIB_DIR/trace.py" emit --run "$run" --src "$src" --kind "$kind" \
    ${args[@]+"${args[@]}"} </dev/null >/dev/null 2>&1
  return 0
}

# td_use FEATURE EFFECT [detail=TEXT] : one `use` trace event (src = TD_CMD):
# EFFECT fired, changed (the use altered an outcome) or blocked-off (asked
# for while switched off). The usage counter of the decay scan; one append.
# Same guarantees as td_trace; an unknown effect is logged, not written.
td_use() {
  local feature=$1 effect=$2
  shift 2
  case "$effect" in
    fired|changed|blocked-off) ;;
    *) td_log "unknown use effect $effect of $feature (not written)"; return 0 ;;
  esac
  td_trace "$TD_CMD" use "feature=$feature" "effect=$effect" "$@"
}

# td_trace_phases SRC NEXT_SRC : read `tdrive state` lines on stdin and emit
# the phase start/done events they imply (NEXT_SRC: prev_done, cook_sent,
# resume or -). Same guarantees as td_trace.
td_trace_phases() {
  local run
  run=$(_td_trace_run)
  [ -n "$run" ] || { cat >/dev/null; return 0; }
  python3 -E -s "$TD_LIB_DIR/trace.py" phases --run "$run" --src "$1" --next-src "${2:--}" >/dev/null 2>&1
  return 0
}

# td_load_config [--repo DIR] [--rundir DIR] : set TDC_<KEY> shell variables.
# Values are assigned with printf -v and never parsed by the shell.
td_load_config() {
  local out rc k v
  out=$(td_py config "$@" dump --format tsv)
  rc=$?
  [ "$rc" -eq 0 ] || return "$rc"
  while IFS=$'\t' read -r k v; do
    [ -n "$k" ] || continue
    case "$k" in
      *[!A-Z0-9_]*) td_log "bad config line for key: $k"; return 2 ;;
    esac
    printf -v "TDC_$k" '%s' "$v"
  done <<EOF
$out
EOF
  TD_CONFIG_LOADED=1
  return 0
}

# td_cfg KEY : print a config value (dotted key). Uses loaded TDC_* values,
# otherwise asks config.py for the current directory's layers.
td_cfg() {
  local key=$1 var
  var="TDC_$(printf '%s' "$key" | tr 'a-z.' 'A-Z_')"
  case "$var" in *[!A-Za-z0-9_]*) td_log "invalid config key: $key"; return 2 ;; esac
  if [ -n "${TD_CONFIG_LOADED:-}" ] && [ -n "${!var+set}" ]; then
    printf '%s\n' "${!var}"
    return 0
  fi
  td_py config get "$key"
}

# td_bounded SECS CMD... : run CMD with a timeout (exit 124 on timeout).
td_bounded() {
  local secs=$1
  shift
  python3 -E -s "$TD_LIB_DIR/run_bounded.py" --timeout "$secs" -- "$@"
}

td_sha256() {
  local f=$1 out
  if command -v sha256sum >/dev/null 2>&1; then
    out=$(sha256sum "$f") || return 1
  elif command -v shasum >/dev/null 2>&1; then
    out=$(shasum -a 256 "$f") || return 1
  else
    td_log "no sha256 tool (sha256sum or shasum)"
    return 3
  fi
  printf '%s\n' "${out%% *}"
}

# td_branch_ref REPO NAME : refs/heads/NAME when that branch exists, else
# NAME. A plain name that is also a tag (Buildflow's `build` gate tag on the
# `build` branch) resolves to the tag in git; tdrive always means the branch.
td_branch_ref() {
  case "$2" in
    ''|refs/*|-*|HEAD|*[~^:@{}' ']*) printf '%s\n' "$2"; return 0 ;;
  esac
  if git -C "$1" show-ref --verify --quiet "refs/heads/$2" 2>/dev/null; then
    printf 'refs/heads/%s\n' "$2"
  else
    printf '%s\n' "$2"
  fi
}

# td_require TOOL... : exit 3 when a tool is missing.
td_require() {
  local t
  for t in "$@"; do
    command -v "$t" >/dev/null 2>&1 || td_die 3 "required tool not found: $t"
  done
}

# td_dry            : true when dry-run is active.
# td_dry ACTION...  : when dry-run is active print "DRY ACTION..." and return 0,
#                     otherwise return 1 (use as: td_dry "rm x" || rm x).
td_dry() {
  [ "${TDRIVE_DRY_RUN:-}" = 1 ] || return 1
  [ $# -gt 0 ] && printf 'DRY %s\n' "$*"
  return 0
}

td_runenv_get() { td_py runstate get "$1" "$2"; }
td_runenv_set() { td_py runstate set "$1" "$2" "$3"; }
