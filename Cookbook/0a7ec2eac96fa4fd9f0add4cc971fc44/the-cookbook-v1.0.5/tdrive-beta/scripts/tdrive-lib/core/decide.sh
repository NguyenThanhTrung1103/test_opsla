#!/bin/bash
# tdrive decide: append a decision row to <repo>/docs/decisions.md and
# optionally record a typed config override in the run's decided.yaml.
# Never commits.
set -u
TD_CMD=decide
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"

usage() {
  cat <<'EOF'
usage: tdrive decide --repo R --decision TEXT --options TEXT --why TEXT
                     [--undo low|medium|high] [--key K --value V]

Appends "| <prefix>-NN | YYYY-MM-DD | decision | options | why | undo |" to
R/docs/decisions.md (prefix = decide.id_prefix, default TD). With --key, the
value is validated and written to the resolved run's decided.yaml.
Prints: DECIDED <ID> key=<k|-> value=<v|-> file=<path>
Exit: 2 usage/invalid or restricted key, 3 repo missing,
      4 shadowed-by-env (the key is set in the environment; nothing written).
EOF
}

repo="" decision="" options="" why="" undo=low key="" value="" have_value=0
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --repo|--decision|--options|--why|--undo|--key|--value)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --repo) repo=$2 ;;
        --decision) decision=$2 ;;
        --options) options=$2 ;;
        --why) why=$2 ;;
        --undo) undo=$2 ;;
        --key) key=$2 ;;
        --value) value=$2; have_value=1 ;;
      esac
      shift 2 ;;
    --) shift ;;
    *) td_die 2 "unknown argument: $1 (see tdrive decide --help)" ;;
  esac
done

[ -n "$repo" ] || td_die 2 "--repo is required"
[ -n "$decision" ] || td_die 2 "--decision is required"
[ -n "$options" ] || td_die 2 "--options is required"
[ -n "$why" ] || td_die 2 "--why is required"
case "$undo" in
  low) undo_text=Low ;;
  medium) undo_text=Medium ;;
  high) undo_text=High ;;
  *) td_die 2 "--undo must be low, medium or high" ;;
esac
if [ -n "$key" ] && [ "$have_value" -ne 1 ]; then td_die 2 "--key needs --value"; fi
if [ -z "$key" ] && [ "$have_value" -eq 1 ]; then td_die 2 "--value needs --key"; fi
[ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
repo=$(cd "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"

td_load_config --repo "$repo" || exit $?
prefix=$TDC_DECIDE_ID_PREFIX
case "$prefix" in
  ''|[!A-Za-z]*|*[!A-Za-z0-9]*) td_die 2 "decide.id_prefix must be alphanumeric and start with a letter: $prefix" ;;
esac

# clean_cell TEXT : one-line, sanitized, pipe-escaped table cell.
clean_cell() {
  local t=$1
  t=${t//$'\r'/ }
  t=${t//$'\n'/ }
  t=$(td_py sanitize --text "$t") || return 2
  t=${t//|/\\|}
  printf '%s' "$t"
}

out_key=- out_value=-
if [ -n "$key" ]; then
  run=$(td_run --repo "$repo") || td_die 2 "cannot resolve run; pass --run"
  rundir="$(td_state_base)/runs/$run"
  if td_dry; then
    res=$(td_py config --repo "$repo" set-decided "$rundir" "$key" "$value" --dry-run)
  else
    rundir=$(td_state_dir "$run") || exit $?
    TD_RUNDIR=$rundir
    res=$(td_py config --repo "$repo" set-decided "$rundir" "$key" "$value")
  fi
  rc=$?
  [ "$rc" -eq 0 ] || exit "$rc"
  out_key=$key
  out_value=${res#*$'\t'}
  decision="$decision (config $key=$out_value)"
fi

c_decision=$(clean_cell "$decision") || td_die 2 "cannot sanitize --decision"
c_options=$(clean_cell "$options") || td_die 2 "cannot sanitize --options"
c_why=$(clean_cell "$why") || td_die 2 "cannot sanitize --why"

file="$repo/docs/decisions.md"
max=0
if [ -f "$file" ]; then
  max=$(awk -v p="$prefix" '
    BEGIN { m = 0 }
    {
      s = $0
      if (sub("^\\| *" p "-", "", s)) {
        n = s
        sub(/[^0-9].*$/, "", n)
        if (n != "" && n + 0 > m) m = n + 0
      }
    }
    END { print m }' "$file") || td_die 2 "cannot read $file"
fi
id=$(printf '%s-%02d' "$prefix" $((max + 1)))
day=$(td_py runstate local) || td_die 2 "cannot read the clock"
day=${day%%T*}
row="| $id | $day | $c_decision | $c_options | $c_why | $undo_text |"

if td_dry; then
  [ -f "$file" ] || td_dry "create $file"
  td_dry "append $file $row"
else
  if [ ! -f "$file" ]; then
    mkdir -p "$repo/docs" || td_die 3 "cannot create $repo/docs"
    cat > "$file" <<EOF || td_die 3 "cannot write $file"
# Decisions log

Operator AFK during build. Format: \`| $prefix-NN | date | decision | options | why | undo cost |\`.

| ID | Date | Decision | Options considered | Why | Undo cost |
|---|---|---|---|---|---|
EOF
  elif [ -s "$file" ] && [ "$(tail -c 1 "$file" | od -An -c | tr -d ' ')" != '\n' ]; then
    printf '\n' >> "$file" || td_die 3 "cannot write $file"
  fi
  printf '%s\n' "$row" >> "$file" || td_die 3 "cannot write $file"
  td_log "appended $id to $file"
fi

printf 'DECIDED %s key=%s value=%s file=%s\n' "$id" "$out_key" "$out_value" "$file"

# Trace the decision in the resolved run, when one exists.
if [ -z "${TD_RUNDIR:-}" ] && ! td_dry; then
  r=$(td_run --repo "$repo" 2>/dev/null) || r=""
  [ -n "$r" ] && [ -d "$(td_state_base)/runs/$r" ] && TD_RUNDIR="$(td_state_base)/runs/$r"
fi
if [ -n "$key" ]; then
  td_trace decide decision "id=$id" "key=$out_key" "value=$out_value" "why=$why"
else
  td_trace decide decision "id=$id" "why=$why"
fi
