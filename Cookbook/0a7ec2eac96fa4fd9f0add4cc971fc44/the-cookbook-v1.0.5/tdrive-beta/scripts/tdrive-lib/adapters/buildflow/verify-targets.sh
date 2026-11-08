#!/bin/bash
# Buildflow verify target discovery (experimental): verify-targets.sh <dir>
# The AgentKit discovery (Makefile, package.json, go.mod, tests/run.sh), then
# `check<TAB>bash buildflow/bin/check.sh` when the project ships Buildflow's
# check script. Exit: 0 ok, 2 usage, 3 dir or manifest unreadable.
set -u
TD_CMD=verify-targets
case "${BASH_SOURCE[0]}" in */*) TD_ADIR=${BASH_SOURCE[0]%/*} ;; *) TD_ADIR=. ;; esac
. "$TD_ADIR/../../core/lib/common.sh"

[ $# -eq 1 ] || td_die 2 "usage: verify-targets.sh <dir>"
dir=$1
[ -d "$dir" ] || td_die 3 "dir not found: $dir"

"${BASH:-/bin/bash}" "$TD_ADIR/../agentkit/verify-targets.sh" "$dir" || exit $?
if [ -f "$dir/buildflow/bin/check.sh" ]; then
  printf 'check\tbash buildflow/bin/check.sh\n'
fi
exit 0
