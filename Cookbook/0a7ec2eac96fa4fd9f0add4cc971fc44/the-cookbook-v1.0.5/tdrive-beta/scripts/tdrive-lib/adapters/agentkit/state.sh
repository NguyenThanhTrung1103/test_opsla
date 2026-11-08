#!/bin/bash
# AgentKit state adapter: state.sh <repo> <branch> [--signal]
# Reads the plan.md phase table from the branch blob (never the working tree).
# Full mode prints the state header lines and one PHASE line per row;
# --signal prints `SIGNAL plan=<path|none> count=<done> head=<sha>`.
# The plan is pinned by config plan.path (TDRIVE_PLAN_PATH), otherwise the
# newest plans/*/plan.md on the branch.
set -u
TD_CMD=state
case "${BASH_SOURCE[0]}" in */*) TD_ADIR=${BASH_SOURCE[0]%/*} ;; *) TD_ADIR=. ;; esac
. "$TD_ADIR/../../core/lib/common.sh"

[ $# -ge 2 ] && [ $# -le 3 ] || td_die 2 "usage: state.sh <repo> <branch> [--signal]"
repo=$1 branch=$2 mode=state
if [ $# -eq 3 ]; then
  [ "$3" = --signal ] || td_die 2 "unknown argument: $3"
  mode=signal
fi

if [ -n "${TDRIVE_PLAN_PATH+set}" ]; then
  pin=$TDRIVE_PLAN_PATH
else
  pin=$(td_py config --repo "$repo" get plan.path) || exit $?
fi

out=$(td_py plan_table "$mode" --repo "$repo" --branch "$branch" ${pin:+--plan "$pin"}) || exit $?
[ "$mode" = state ] && printf 'ENGINE agentkit\n'
printf '%s\n' "$out"
