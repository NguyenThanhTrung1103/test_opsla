#!/bin/bash
# tdrive trace: record a driver or operator event, validate a trace, or
# convert a run of an older version into a trace.
set -u
TD_CMD=trace
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"

usage() {
  cat <<'EOF'
usage: tdrive trace add --kind intervention|answer|alert --text TEXT
                        [--by driver|operator] [--ref L<n>] [--class CLASS]
       tdrive trace check [FILE]
       tdrive trace backfill

The operate trace is runs/<run>/trace.jsonl (schema v1, one JSON event per
line, line id L<n> = line number). Every tdrive command appends its own
events; these subcommands are for the driver and the operator.
  add       append an intervention (something a human or the driver had to
            correct), an answer to an orchestrator question, or an alert.
            --by defaults to driver; --ref cites the line it answers or
            corrects; --class names an incident class.
            Prints: TRACED <run> L<n> kind=<kind>
  check     validate FILE (default: the run's trace).
            Prints: TRACE OK file=<p> lines=<n> v=1, or one
            TRACE INVALID L<n> reason=<r> per bad line; a line of a newer
            schema prints TRACE UNSUPPORTED L<n> v=<n> and is skipped.
  backfill  convert the run's events.log, tdrive.log, govern.jsonl,
            verify/, reports/, questions.md, decided.yaml, run.env and the
            run's time window of the state dir's driver-actions.log into a
            trace (src=backfill). Refused when the trace exists.
            Prints: TRACED <run> backfill lines=<n>
The run is --run, else TDRIVE_RUN, else the run registered for the current
directory. Never run backfill on a run you were not asked to convert.
Exit: 0 ok, 1 invalid trace (check), 2 usage or no run, 3 write failed,
      5 trace exists (backfill).
EOF
}

[ $# -gt 0 ] || { usage >&2; exit 2; }
sub=$1
shift
case "$sub" in
  --help|-h|help) usage; exit 0 ;;
  add|check|backfill) ;;
  *) td_die 2 "unknown trace subcommand: $sub (see tdrive trace --help)" ;;
esac
for a in "$@"; do
  case "$a" in --help|-h) usage; exit 0 ;; esac
done

if [ "$sub" = check ] && [ $# -gt 0 ]; then
  [ $# -eq 1 ] || td_die 2 "usage: tdrive trace check [FILE]"
  td_py trace check "$1"
  exit $?
fi
case "$sub:$#" in
  check:0|backfill:0|add:*) ;;
  *) td_die 2 "unexpected argument: $1 (see tdrive trace --help)" ;;
esac

run=$(td_run) || td_die 2 "cannot resolve run; pass --run"
case "$sub" in
  check) td_py trace check "$(td_state_base)/runs/$run/trace.jsonl" ;;
  backfill) td_py trace backfill --run "$run" ;;
  add) td_py trace add --run "$run" "$@" ;;
esac
