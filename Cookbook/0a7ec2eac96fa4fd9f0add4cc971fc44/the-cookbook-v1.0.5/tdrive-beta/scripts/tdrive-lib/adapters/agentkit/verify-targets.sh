#!/bin/bash
# AgentKit verify target discovery: verify-targets.sh <dir>
# Prints `<name>\t<command>` per target, optionally preceded by
# `SETUP\t<command>` (automatic setup) or `NEEDS_SETUP\t<ecosystem>`
# (dependencies are required but there is no automatic setup; the operator
# sets verify.setup). Discovery stops at the first matching source:
#   1. Makefile: lint typecheck test build archtest, then the first drift gate
#      among gen-check drift check-generated generate-check codegen-check
#   2. package.json scripts lint typecheck test build (pnpm, yarn or npm)
#   3. go.mod: vet, test, build
#   4. tests/run.sh
# Nothing found prints nothing. Exit: 0 ok, 2 usage, 3 dir or package.json unreadable.
set -u
TD_CMD=verify-targets
case "${BASH_SOURCE[0]}" in */*) TD_ADIR=${BASH_SOURCE[0]%/*} ;; *) TD_ADIR=. ;; esac
. "$TD_ADIR/../../core/lib/common.sh"

MAKE_TARGETS="lint typecheck test build archtest"
MAKE_DRIFT_GATES="gen-check drift check-generated generate-check codegen-check"
SCRIPT_TARGETS="lint typecheck test build"
PNPM_SETUP="pnpm install --frozen-lockfile --prefer-offline"

[ $# -eq 1 ] || td_die 2 "usage: verify-targets.sh <dir>"
dir=$1
[ -d "$dir" ] || td_die 3 "dir not found: $dir"

# make_defined FILE : print the rule targets defined in a makefile, one per line.
# A rule line starts with names followed by `:` or `::` (not `:=`/`::=`).
make_defined() {
  command grep -E '^[A-Za-z0-9_.-][A-Za-z0-9_. -]*:' "$1" \
    | command grep -E -v '^[^:]*::?=' \
    | while IFS= read -r line; do
        for name in ${line%%:*}; do
          printf '%s\n' "$name"
        done
      done
}

makefile=""
for f in GNUmakefile makefile Makefile; do
  if [ -f "$dir/$f" ]; then
    makefile="$dir/$f"
    break
  fi
done

if [ -n "$makefile" ]; then
  defined=" $(make_defined "$makefile" | tr '\n' ' ') "
  for t in $MAKE_TARGETS; do
    case "$defined" in *" $t "*) printf '%s\tmake %s\n' "$t" "$t" ;; esac
  done
  for t in $MAKE_DRIFT_GATES; do
    case "$defined" in
      *" $t "*)
        printf '%s\tmake %s\n' "$t" "$t"
        break ;;
    esac
  done
  exit 0
fi

if [ -f "$dir/package.json" ]; then
  if [ -f "$dir/pnpm-lock.yaml" ]; then
    runner="pnpm run" eco=pnpm
  elif [ -f "$dir/yarn.lock" ]; then
    runner="yarn" eco=yarn
  else
    runner="npm run" eco=npm
  fi
  # Prints `deps` when the manifest declares dependencies, then the scripts
  # it defines among SCRIPT_TARGETS (in that order).
  info=$(python3 -E -s - "$dir/package.json" $SCRIPT_TARGETS <<'PY'
import json
import sys

path, wanted = sys.argv[1], sys.argv[2:]
try:
    with open(path) as fh:
        data = json.load(fh)
except (IOError, OSError, ValueError) as exc:
    sys.stderr.write("verify-targets: cannot read %s: %s\n" % (path, exc))
    sys.exit(3)
if not isinstance(data, dict):
    sys.stderr.write("verify-targets: %s: top level must be an object\n" % path)
    sys.exit(3)
for key in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
    if data.get(key):
        sys.stdout.write("deps\n")
        break
scripts = data.get("scripts")
if isinstance(scripts, dict):
    for name in wanted:
        if isinstance(scripts.get(name), str) and scripts[name].strip():
            sys.stdout.write(name + "\n")
PY
  ) || exit 3
  if [ "$eco" = pnpm ]; then
    printf 'SETUP\t%s\n' "$PNPM_SETUP"
  else
    case "$info" in deps*) printf 'NEEDS_SETUP\t%s\n' "$eco" ;; esac
  fi
  while IFS= read -r t; do
    case "$t" in ''|deps) continue ;; esac
    printf '%s\t%s %s\n' "$t" "$runner" "$t"
  done <<EOF
$info
EOF
  exit 0
fi

if [ -f "$dir/go.mod" ]; then
  printf 'vet\tgo vet ./...\n'
  printf 'test\tgo test ./...\n'
  printf 'build\tgo build ./...\n'
  exit 0
fi

if [ -f "$dir/tests/run.sh" ]; then
  printf 'test\tbash tests/run.sh\n'
fi
exit 0
