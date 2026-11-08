#!/bin/bash
# tdrive retro: turn one run's operate trace into a retro report.
set -u
TD_CMD=retro
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"

usage() {
  cat <<'EOF'
usage: tdrive retro [<run>] [--since ISO]

Reads the run's operate trace (a run of an older version without one is
backfilled first), scans it for incidents and writes a retro report into
the state dir's retros store (outside every project repo). --since keeps
only the events at or after ISO (YYYY-MM-DDTHH:MM:SSZ). Prints:
  RETRO <run> path=<p> events=<n> since=<iso|->
  METRIC name=<m> value=<v>     phases_done mean_phase_min rework_rounds
                                stalls nudges interventions false_events
                                limit_hits resource_pauses wakes
                                driver_response_min
  PHASE id=<id> secs=<n|-> rework=<n> first_pass=<yes|no|-> kind=<k|->
        model=<m|-> effort=<e|->                    per done phase
  INCIDENT class=<c> severity=<s> count=<n> runs=<n> first=L<n>
  LESSON class=<c> severity=<s> status=<st> seen=<n> runs=<n> last=<iso>
         path=<p>                                   lessons of those classes
  MODEL kind=<k> assigned_model=<m> effort=<e> samples=<n> ... recommend=<r>
        the model tdrive assigned per kind (engine use is not observed),
        over the newest retro.max_runs runs started by tdrive
  ROI run=<r> value=<v> catches=<c>/<n> avoided=<a> false=<n> incidents=<i>
      operator=<o> cost=wakes:<w>,tokens:<t|->,verify_min:<m>,wall_min:<x>
      ratio=<value / max(1, wakes + operator)>      the whole run
  ROI total runs=<n> ...        the newest retro.max_runs started runs
  DECAY id=<id> kind=<k> class=<safety|core|optional> runs=<k> fires=<n>
        changed=<n> candidate=<retire|demote|exempt> action=<off|report|none>
        | <evidence>
        the items of policies/features.yaml over the newest decay.runs
        started runs: no fires = retire, fired but never changed an outcome
        = demote. Safety items are exempt, core items reported, optional
        retire candidates switched off in the state dir's decay.yaml (any
        other config layer, e.g. tdrive decide --key features.<x> --value
        true, re-enables). Or DECAY insufficient runs=<n> need=<K>
  PROPOSAL id=<id> kind=<lesson|delete> path=<p>
        a markdown proposal in the state dir's proposals store: one per
        actionable lesson, one per feature still unrequested
        decay.delete_after_runs started runs after its switch-off
Code is never changed or deleted and no repo is written. The run is <run>,
else --run, else TDRIVE_RUN, else the run registered for the current
directory. Never retro a run you were not asked for.
Exit: 0 ok, 2 usage, no run or a state dir inside a project repo, 3 write
failed.
EOF
}

run_arg="" since=""
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --since)
      [ $# -ge 2 ] || td_die 2 "--since needs a value"
      since=$2
      shift 2 ;;
    --since=*) since=${1#--since=}; shift ;;
    -*) td_die 2 "unknown argument: $1 (see tdrive retro --help)" ;;
    *)
      [ -z "$run_arg" ] || td_die 2 "unexpected argument: $1 (see tdrive retro --help)"
      run_arg=$1
      shift ;;
  esac
done

if [ -n "$run_arg" ]; then
  if [ -n "${TDRIVE_RUN:-}" ] && [ "$TDRIVE_RUN" != "$run_arg" ]; then
    td_die 2 "two runs named: $run_arg and --run $TDRIVE_RUN"
  fi
  run=$run_arg
else
  run=$(td_run) || td_die 2 "cannot resolve run; name it or pass --run"
fi
td_require python3
td_py retro run --run "$run" ${since:+--since "$since"}
