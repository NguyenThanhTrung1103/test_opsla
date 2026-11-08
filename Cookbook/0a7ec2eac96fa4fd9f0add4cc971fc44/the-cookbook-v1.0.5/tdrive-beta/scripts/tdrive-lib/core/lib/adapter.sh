#!/bin/bash
# Engine adapter resolver. Source after common.sh; never execute.
# An adapter is adapters/<engine>/ with adapter.yaml (`name`, `experimental`)
# plus its scripts. Experimental adapters are refused (status 2) unless
# TDRIVE_EXPERIMENTAL_BUILDFLOW=1 (set by the --experimental-buildflow flag).

# td_adapter_resolve ENGINE : set TD_ADAPTER_DIR. Validated dirs are cached
# per process, so subshells started after the first call reuse the result.
td_adapter_resolve() {
  local engine=$1 var dir meta
  case "$engine" in
    ''|[!a-z0-9]*|*[!a-z0-9_-]*) td_log "invalid engine name: $engine"; return 2 ;;
  esac
  var="TD_ADAPTER_CACHE_${engine//-/_}"
  if [ -n "${!var:-}" ]; then
    TD_ADAPTER_DIR=${!var}
    return 0
  fi
  dir="$TD_ROOT_DIR/adapters/$engine"
  if [ ! -f "$dir/adapter.yaml" ]; then
    td_log "unknown engine: $engine (no adapters/$engine/adapter.yaml)"
    return 2
  fi
  meta=$(python3 -E -s - "$TD_LIB_DIR" "$dir/adapter.yaml" "$engine" <<'PY'
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
import yamlite
path, engine = sys.argv[2], sys.argv[3]
try:
    data = yamlite.load(path)
except yamlite.YamlError as exc:
    sys.stderr.write("adapter: %s\n" % exc)
    sys.exit(2)
if not isinstance(data, dict):
    sys.stderr.write("adapter: %s: top level must be a map\n" % path)
    sys.exit(2)
extra = sorted(set(data) - set(("name", "experimental")))
if extra:
    sys.stderr.write("adapter: %s: unknown field(s): %s\n" % (path, ", ".join(extra)))
    sys.exit(2)
if data.get("name") != engine:
    sys.stderr.write("adapter: %s: name must be %s\n" % (path, engine))
    sys.exit(2)
if not isinstance(data.get("experimental"), bool):
    sys.stderr.write("adapter: %s: experimental must be true or false\n" % path)
    sys.exit(2)
sys.stdout.write("true\n" if data["experimental"] else "false\n")
PY
  ) || return 2
  if [ "$meta" = true ] && [ "${TDRIVE_EXPERIMENTAL_BUILDFLOW:-}" != 1 ]; then
    td_log "adapter $engine is experimental; pass --experimental-buildflow (or TDRIVE_EXPERIMENTAL_BUILDFLOW=1)"
    return 2
  fi
  printf -v "$var" '%s' "$dir"
  TD_ADAPTER_DIR=$dir
  return 0
}

# td_adapter_dir ENGINE : print the adapter dir (status 2 when unknown or refused).
td_adapter_dir() {
  td_adapter_resolve "$1" || return $?
  printf '%s\n' "$TD_ADAPTER_DIR"
}

# td_adapter_has ENGINE SCRIPT : 0 when the adapter ships SCRIPT.
td_adapter_has() {
  td_adapter_resolve "$1" || return $?
  case "$2" in ''|*[!A-Za-z0-9_.-]*|.*) return 1 ;; esac
  [ -f "$TD_ADAPTER_DIR/$2" ]
}

# td_adapter_call ENGINE SCRIPT ARGS... : run an adapter script with bash and
# return its status (2 when the adapter or the script is missing).
td_adapter_call() {
  local engine=$1 script=$2
  shift 2
  td_adapter_resolve "$engine" || return $?
  case "$script" in
    ''|*[!A-Za-z0-9_.-]*|.*) td_log "invalid adapter script name: $script"; return 2 ;;
  esac
  if [ ! -f "$TD_ADAPTER_DIR/$script" ]; then
    td_log "adapter $engine has no $script"
    return 2
  fi
  "${BASH:-/bin/bash}" "$TD_ADAPTER_DIR/$script" "$@"
}

# td_adapter_branch REPO BUILD_BRANCH : print BUILD_BRANCH when it exists in
# REPO, otherwise the current branch (status 3 when neither is available).
td_adapter_branch() {
  local repo=$1 want=$2 cur
  if [ -n "$want" ] && git -C "$repo" rev-parse --verify --quiet "refs/heads/$want" >/dev/null 2>&1; then
    printf '%s\n' "$want"
    return 0
  fi
  cur=$(git -C "$repo" symbolic-ref --short -q HEAD 2>/dev/null)
  if [ -z "$cur" ]; then
    td_log "no branch $want in $repo and HEAD is detached; pass a branch"
    return 3
  fi
  printf '%s\n' "$cur"
}

# td_valid_target NAME CMD : status 2 (logged) unless NAME is a safe log file
# name and CMD one non-empty line without tabs.
td_valid_target() {
  case "$1" in
    ''|.*|*[!A-Za-z0-9_.-]*) td_log "invalid target name: $1"; return 2 ;;
  esac
  [ -n "$2" ] || { td_log "target $1 has an empty command"; return 2; }
  case "$2" in
    *$'\n'*|*$'\t'*) td_log "target $1: command must be one line without tabs"; return 2 ;;
  esac
  return 0
}

# td_verify_targets ENGINE WORKTREE WANT : the verify targets of WORKTREE as
# `tdrive verify` resolves them without --target: the adapter's
# verify-targets.sh discovery, narrowed to the comma-separated names in WANT
# (empty: every discovered target, in discovery order). Sets the arrays
# TV_NAMES TV_CMDS, TV_SETUP (the adapter's SETUP command) and
# TV_NEEDS_SETUP (its NEEDS_SETUP ecosystem). Status: 0 ok, 2 an invalid
# target or a WANT name that was not discovered, 3 discovery failed.
td_verify_targets() {
  local engine=$1 wt=$2 want=$3 disc n c w i found
  local d_names=() d_cmds=() want_list=()
  TV_NAMES=() TV_CMDS=() TV_SETUP="" TV_NEEDS_SETUP=""
  disc=$(td_adapter_call "$engine" verify-targets.sh "$wt") || {
    td_log "adapter $engine verify-targets.sh failed"
    return 3
  }
  while IFS=$'\t' read -r n c; do
    case "$n" in
      '') continue ;;
      SETUP) TV_SETUP=$c ;;
      NEEDS_SETUP) TV_NEEDS_SETUP=$c ;;
      *)
        td_valid_target "$n" "$c" || return 2
        d_names+=("$n")
        d_cmds+=("$c") ;;
    esac
  done <<EOF
$disc
EOF
  if [ -z "$want" ]; then
    TV_NAMES=(${d_names[@]+"${d_names[@]}"})
    TV_CMDS=(${d_cmds[@]+"${d_cmds[@]}"})
    return 0
  fi
  IFS=',' read -r -a want_list <<EOF
$want
EOF
  for w in ${want_list[@]+"${want_list[@]}"}; do
    [ -n "$w" ] || continue
    found=0 i=0
    while [ "$i" -lt ${#d_names[@]} ]; do
      if [ "${d_names[i]}" = "$w" ]; then
        TV_NAMES+=("$w")
        TV_CMDS+=("${d_cmds[i]}")
        found=1
        break
      fi
      i=$((i + 1))
    done
    if [ "$found" -ne 1 ]; then
      td_log "target $w was not discovered (found: ${d_names[*]+${d_names[*]}})"
      return 2
    fi
  done
  return 0
}
