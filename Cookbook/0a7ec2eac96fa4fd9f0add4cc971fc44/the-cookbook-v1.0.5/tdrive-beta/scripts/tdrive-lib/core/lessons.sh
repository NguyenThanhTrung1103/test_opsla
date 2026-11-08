#!/bin/bash
# tdrive lessons: list the lessons learned across runs, or the lessons that
# match a wake.
set -u
TD_CMD=lessons
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"

usage() {
  cat <<'EOF'
usage: tdrive lessons [list]
       tdrive lessons match --stop ID [--event EV]

Lessons are written by the pattern catcher (the drive loop's incident scan)
into the state dir's lessons store, outside every project repo. An incident
class seen lessons.min_count times across runs (driver and operator
interventions with --class count too), or once when its severity is high,
becomes a lesson with evidence (run, trace lines, capture) and a fix.
  list   every lesson:
         LESSON class=<c> severity=<s> status=<candidate|proposed|applied|retired>
                seen=<n> runs=<n> last=<iso> path=<p>
  match  the lessons for a wake with stop id ID (and watch event EV), most
         seen first, retired ones left out, at most lessons.wake_max:
         LESSON class=<c> seen=<n> path=<p> | <fix>
Exit: 0 ok, 2 usage, bad registry or a state dir inside a project repo.
EOF
}

sub=${1:-list}
[ $# -gt 0 ] && shift
case "$sub" in
  --help|-h|help) usage; exit 0 ;;
  list|match) ;;
  *) td_die 2 "unknown lessons subcommand: $sub (see tdrive lessons --help)" ;;
esac
for a in "$@"; do
  case "$a" in --help|-h) usage; exit 0 ;; esac
done

case "$sub" in
  list)
    [ $# -eq 0 ] || td_die 2 "unexpected argument: $1 (see tdrive lessons --help)"
    td_py lessons list ;;
  match)
    stop="" event=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --stop|--event)
          [ $# -ge 2 ] || td_die 2 "$1 needs a value"
          if [ "$1" = --stop ]; then stop=$2; else event=$2; fi
          shift 2 ;;
        *) td_die 2 "unknown argument: $1 (see tdrive lessons --help)" ;;
      esac
    done
    [ -n "$stop" ] || td_die 2 "lessons match needs --stop ID"
    max=$(td_cfg lessons.wake_max) || exit 2
    td_py lessons match --stop "$stop" ${event:+--event "$event"} --max "$max" ;;
esac
