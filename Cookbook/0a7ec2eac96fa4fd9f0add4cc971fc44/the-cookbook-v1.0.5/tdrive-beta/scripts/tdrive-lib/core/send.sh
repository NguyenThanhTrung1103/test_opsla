#!/bin/bash
# tdrive send: type a sanitized message (or whitelisted keys) into the engine
# pane, guarded by the run's send lock and a post-typing race check.
set -u
TD_CMD=send
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/tmux.sh"

usage() {
  cat <<'EOF'
usage: tdrive send --session S (TEXT... | --file F | --keys "K1 K2" | --peek)
                   [--durable --repo R] [--force] [--no-enter]

Text is sanitized. Text with a newline or longer than send.max_inline is
written to the run's outbox/<stamp>.md and a one-line pointer is typed
instead. After typing, the pane is captured again; Enter is pressed only
when the typed text is still pending in the input box and no dialog opened.
--keys sends whitelisted key names only:
  Enter Escape Tab BSpace Space Up Down Left Right C-u 1-9
--peek prints the classifier lines, `---`, then the pane text.
--durable also appends the text under "## Driver directives (durable)" in
R/docs/BRIEF.md and commits it when R is on run.build_branch with a clean
index and no merge or rebase in progress (otherwise the commit is deferred).
--force types into a dialog (TRUST/QUESTION/LIMIT) and skips the race
check; --no-enter only types.
Prints: SENT <session> mode=<inline|pointer|keys> chars=<n>
        REFUSED <session> state=<STATE> reason=<modal|race|pending-input|lock|bad-key|interactive-command>
A text whose first word is /model or /effort is refused (state=-,
reason=interactive-command): those commands stall an unattended session;
models and effort are launch parameters.
Exit: 2 usage or bad key, 3 tmux missing or session gone, 5 refused.
EOF
}

session="" file="" keys="" repo=""
have_file=0 have_keys=0 peek=0 durable=0 force=0 no_enter=0
words=()
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --session|--file|--keys|--repo)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --session) session=$2 ;;
        --file) file=$2; have_file=1 ;;
        --keys) keys=$2; have_keys=1 ;;
        --repo) repo=$2 ;;
      esac
      shift 2 ;;
    --peek) peek=1; shift ;;
    --durable) durable=1; shift ;;
    --force) force=1; shift ;;
    --no-enter) no_enter=1; shift ;;
    --) shift; while [ $# -gt 0 ]; do words+=("$1"); shift; done ;;
    -*) td_die 2 "unknown argument: $1 (see tdrive send --help)" ;;
    *) words+=("$1"); shift ;;
  esac
done

[ -n "$session" ] || td_die 2 "--session is required"
td_tmux_valid_session "$session" || td_die 2 "invalid session name: $session"
have_text=0
[ ${#words[@]} -gt 0 ] && have_text=1
if [ $((have_text + have_file + have_keys + peek)) -ne 1 ]; then
  td_die 2 "give exactly one of TEXT, --file, --keys or --peek"
fi
if [ "$durable" -eq 1 ]; then
  [ $((have_text + have_file)) -eq 1 ] || td_die 2 "--durable needs TEXT or --file"
  [ -n "$repo" ] || td_die 2 "--durable needs --repo"
fi

# Trace attribution: a hand-run send is the driver's; start, boot, loop and
# amend send on their own behalf. The caller may name the message template
# (TDRIVE_TRACE_TEMPLATE) and its dispatch rule (TDRIVE_TRACE_DISPATCH_RULE).
case "${TDRIVE_CALLER:-}" in
  loop|start|boot|amend) tsrc=$TDRIVE_CALLER ;;
  *) tsrc=driver ;;
esac
mode=""

# trace_send RESULT CHARS [REASON] : the send event of this call.
trace_send() {
  td_trace "$tsrc" send "mode=${mode:--}" "result=$1" ${2:+"chars=$2"} ${3:+"reason=$3"} \
    ${TDRIVE_TRACE_TEMPLATE:+"template=$TDRIVE_TRACE_TEMPLATE"} \
    ${TDRIVE_TRACE_DISPATCH_RULE:+"dispatch_rule=$TDRIVE_TRACE_DISPATCH_RULE"}
}

# trace_answer TEXT : the send answered an orchestrator question.
trace_answer() {
  td_trace "$tsrc" answer "text=$1" "by=$tsrc" --ref-last ref=question
}

key_list=()
if [ "$have_keys" -eq 1 ]; then
  mode=keys
  IFS=' ' read -r -a key_list <<EOF
$keys
EOF
  [ ${#key_list[@]} -gt 0 ] || td_die 2 "--keys needs at least one key"
  for k in "${key_list[@]}"; do
    if ! td_tmux_key_ok "$k"; then
      printf 'REFUSED %s state=- reason=bad-key\n' "$session"
      trace_send refused "" bad-key
      td_die 2 "key not allowed: $k"
    fi
  done
fi

if [ -n "$repo" ]; then
  [ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
  repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
fi
td_require tmux

run=$(td_run ${repo:+--repo "$repo"} --session "$session") || td_die 2 "cannot resolve run; pass --run"
rundir=$(td_state_dir "$run") || exit $?
TD_RUNDIR=$rundir
td_load_config ${repo:+--repo "$repo"} --rundir "$rundir" || exit $?

# Interactive model and effort commands open a picker or change the session
# without the driver seeing it; they are never typed.
if [ $((have_text + have_file)) -eq 1 ]; then
  if [ "$have_file" -eq 1 ]; then
    first=$(awk 'NF { print $1; exit }' "$file" 2>/dev/null)
  else
    first=$(printf '%s\n' "${words[*]}" | awk 'NF { print $1; exit }')
  fi
  case "$first" in
    /model|/effort)
      printf 'REFUSED %s state=- reason=interactive-command\n' "$session"
      trace_send refused "" interactive-command
      td_die 5 "refused: $first is an interactive command; pass models and effort as launch parameters" ;;
  esac
fi

if ! td_tmux_has "$session"; then
  [ "$peek" -eq 1 ] && printf 'STATE SESSION_GONE\n'
  td_die 3 "session not found: $session"
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-send.XXXXXX") || td_die 3 "cannot create a temp dir"
lock_held=0
on_exit() {
  if [ "$lock_held" -eq 1 ]; then
    td_py runstate lock-release "$run" send --pid "$$" >/dev/null 2>&1
  fi
  rm -rf "$work"
}
trap on_exit EXIT

if [ "$peek" -eq 1 ]; then
  lines=$(td_classify "$session" "$work/pane") || exit 3
  printf '%s\n---\n' "$lines"
  td_py sanitize --keep-newlines < "$work/pane"
  [ "$(td_classify_field "$lines" STATE)" = SESSION_GONE ] && exit 3
  exit 0
fi

# char_len TEXT : length in characters, independent of the locale.
char_len() {
  python3 -E -s -c 'import sys; sys.stdout.write("%d\n" % len(sys.argv[1]))' "$1"
}

# trim TEXT : strip leading and trailing spaces.
trim() {
  local t=$1
  t=${t#"${t%%[! ]*}"}
  t=${t%"${t##*[! ]}"}
  printf '%s' "$t"
}

acquire_lock() {
  local rc
  td_py runstate lock-acquire "$run" send --wait "$TDC_SEND_LOCK_WAIT_S" --pid "$$"
  rc=$?
  if [ "$rc" -eq 5 ]; then
    printf 'REFUSED %s state=- reason=lock\n' "$session"
    trace_send refused "" lock
    td_die 5 "send lock is held by another sender"
  fi
  [ "$rc" -eq 0 ] || td_die "$rc" "cannot take the send lock"
  lock_held=1
}

if [ "$have_keys" -eq 1 ]; then
  if td_dry; then
    for k in "${key_list[@]}"; do td_dry "tmux send-keys -t =$session: $k"; done
    exit 0
  fi
  acquire_lock
  # Keys usually answer a question; the pane is read first only when the
  # trace holds an unanswered one.
  before=""
  if td_py trace unanswered --run "$run" 2>/dev/null; then
    before=$(td_classify "$session") || before=""
    before=$(td_classify_field "$before" STATE) || before=""
  fi
  td_tmux_send_keys "$session" "${key_list[@]}" || td_die 3 "tmux send-keys failed for $session"
  printf 'SENT %s mode=keys chars=%s\n' "$session" "${#key_list[@]}"
  td_log "sent keys to $session: ${key_list[*]}"
  trace_send sent "${#key_list[@]}"
  [ "$before" = QUESTION ] && trace_answer "${key_list[*]}"
  exit 0
fi

# ---- text payload ----------------------------------------------------------
if [ "$have_file" -eq 1 ]; then
  [ -f "$file" ] && [ -r "$file" ] || td_die 2 "cannot read --file: $file"
  raw=$(cat "$file") || td_die 2 "cannot read --file: $file"
else
  raw="${words[*]}"
fi
raw=${raw//$'\r\n'/$'\n'}

clean=$(td_py sanitize --text "$raw") || td_die 2 "cannot sanitize the message"
[ -n "$(trim "$clean")" ] || td_die 2 "empty message"
clean_len=$(char_len "$clean") || td_die 3 "python3 failed"

mode=inline
payload=$clean
case "$raw" in *$'\n'*) mode=pointer ;; esac
[ "$clean_len" -gt "$TDC_SEND_MAX_INLINE" ] && mode=pointer
if [ "$mode" = pointer ]; then
  stamp=$(td_stamp) || td_die 3 "cannot create a stamp"
  outfile="$rundir/outbox/$stamp.md"
  payload=$(td_py sanitize --text "Read the file $outfile and follow it.") || td_die 2 "cannot sanitize the pointer"
  if td_dry; then
    td_dry "write $outfile"
  else
    (umask 077 && mkdir -p "$rundir/outbox") || td_die 3 "cannot create $rundir/outbox"
    td_py sanitize --keep-newlines --text "$raw" > "$outfile" || td_die 3 "cannot write $outfile"
    td_log "long payload written to $outfile"
  fi
fi
payload_len=$(char_len "$payload") || td_die 3 "python3 failed"

# Prefix the race check compares against INPUT_TEXT (first 20 chars).
want=$(trim "$payload")
want=$(python3 -E -s -c 'import sys; sys.stdout.write(sys.argv[1][:20])' "$want") || td_die 3 "python3 failed"

if td_dry; then
  td_dry "tmux send-keys -t =$session: -l -- $payload"
  [ "$no_enter" -eq 1 ] || td_dry "tmux send-keys -t =$session: Enter"
  [ "$durable" -eq 1 ] && td_dry "append directive to $repo/docs/BRIEF.md"
  exit 0
fi

if [ "${TDRIVE_TICK:-}" = 0 ]; then
  poll=0
else
  poll=0.3
fi

# classify_now : refresh $lines, $state, $pending, $input_text.
classify_now() {
  lines=$(td_classify "$session") || td_die 3 "cannot classify the pane of $session"
  state=$(td_classify_field "$lines" STATE)
  pending=$(td_classify_field "$lines" PENDING_INPUT) || pending=""
  input_text=$(td_classify_field "$lines" INPUT_TEXT) || input_text=""
}

# text_pending : the typed payload is still waiting in the input box.
text_pending() {
  [ "$pending" = yes ] || return 1
  case "$(trim "$input_text")" in
    "$want"*) return 0 ;;
  esac
  return 1
}

refuse() {
  printf 'REFUSED %s state=%s reason=%s\n' "$session" "$1" "$2"
  trace_send refused "" "$2"
  td_die 5 "refused: state=$1 reason=$2"
}

acquire_lock
classify_now
before=$state
case "$state" in
  SESSION_GONE) td_die 3 "session $session is gone" ;;
  TRUST|QUESTION|LIMIT)
    if [ "$force" -eq 1 ]; then
      td_log "typing into $state because of --force"
    else
      refuse "$state" modal
    fi ;;
esac

if [ "$pending" = yes ]; then
  td_log "clearing pending input with C-u: $input_text"
  td_tmux_send_keys "$session" C-u || td_die 3 "tmux send-keys failed for $session"
  [ "$poll" = 0 ] || sleep "$poll"
  classify_now
  [ "$pending" = yes ] && refuse "$state" pending-input
  case "$state" in
    SESSION_GONE) td_die 3 "session $session is gone" ;;
    TRUST|QUESTION|LIMIT) [ "$force" -eq 1 ] || refuse "$state" modal ;;
  esac
fi

td_tmux_send_literal "$session" "$payload" || td_die 3 "tmux send-keys failed for $session"

if [ "$no_enter" -eq 0 ] && [ "$force" -eq 1 ]; then
  # --force types into a dialog on purpose, where the input box is hidden;
  # the race check cannot apply.
  td_tmux_send_keys "$session" Enter || td_die 3 "tmux send-keys failed for $session"
elif [ "$no_enter" -eq 0 ]; then
  ok=0
  tries=0
  while :; do
    classify_now
    case "$state" in
      SESSION_GONE) td_die 3 "session $session is gone" ;;
      QUESTION|TRUST) break ;;
    esac
    if text_pending; then
      ok=1
      break
    fi
    tries=$((tries + 1))
    [ "$tries" -ge 15 ] && break
    [ "$poll" = 0 ] || sleep "$poll"
  done
  if [ "$ok" -ne 1 ]; then
    td_tmux_send_keys "$session" C-u || td_log "C-u failed for $session"
    refuse "$state" race
  fi
  td_tmux_send_keys "$session" Enter || td_die 3 "tmux send-keys failed for $session"
  [ "$poll" = 0 ] || sleep 1
  classify_now
  if [ "$state" != SESSION_GONE ] && text_pending; then
    td_log "text still in the input box after Enter; pressing Enter again"
    td_tmux_send_keys "$session" Enter || td_die 3 "tmux send-keys failed for $session"
  fi
fi

printf 'SENT %s mode=%s chars=%s\n' "$session" "$mode" "$payload_len"
td_log "sent $mode message to $session ($payload_len chars)"
trace_send sent "$payload_len"
[ "$before" = QUESTION ] && trace_answer "$clean"

# ---- durable directive ------------------------------------------------------
[ "$durable" -eq 1 ] || exit 0

brief="$repo/docs/BRIEF.md"
heading="## Driver directives (durable)"
one_line=$(td_py sanitize --text "${raw//$'\n'/ }") || td_die 2 "cannot sanitize the directive"
entry="- $(td_iso) $(trim "$one_line")"

if [ ! -f "$brief" ]; then
  mkdir -p "$repo/docs" || td_die 3 "cannot create $repo/docs"
  printf '%s\n\n%s\n' "$heading" "$entry" > "$brief" || td_die 3 "cannot write $brief"
elif ! command grep -E -q '^## Driver directives \(durable\)$' "$brief"; then
  if [ -s "$brief" ] && [ "$(tail -c 1 "$brief" | od -An -c | tr -d ' ')" != '\n' ]; then
    printf '\n' >> "$brief" || td_die 3 "cannot write $brief"
  fi
  printf '\n%s\n\n%s\n' "$heading" "$entry" >> "$brief" || td_die 3 "cannot write $brief"
else
  TD_HEADING=$heading TD_ENTRY=$entry awk '
    BEGIN { h = ENVIRON["TD_HEADING"]; add = ENVIRON["TD_ENTRY"] }
    { line[NR] = $0 }
    END {
      hs = 0
      for (i = 1; i <= NR; i++) if (line[i] == h) { hs = i; break }
      ne = NR + 1
      for (i = hs + 1; i <= NR; i++) if (line[i] ~ /^##? /) { ne = i; break }
      last = hs
      for (i = hs + 1; i < ne; i++) if (line[i] ~ /[^ \t]/) last = i
      for (i = 1; i <= NR; i++) {
        print line[i]
        if (i == last) {
          if (last == hs) print ""
          print add
        }
      }
    }' "$brief" > "$work/brief" || td_die 3 "cannot update $brief"
  cat "$work/brief" > "$brief" || td_die 3 "cannot write $brief"
fi
td_log "directive appended to $brief"

# git_path_exists NAME : the repo's git dir holds NAME.
git_path_exists() {
  local p
  p=$(git -C "$repo" rev-parse --git-path "$1" 2>/dev/null) || return 1
  case "$p" in /*) ;; *) p="$repo/$p" ;; esac
  [ -e "$p" ]
}

defer() {
  td_log "commit deferred: $1 (the orchestrator commits BRIEF changes with its next commit)"
  exit 0
}

git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || defer "not a git repo"
branch=$(git -C "$repo" symbolic-ref --short -q HEAD) || branch=""
[ "$branch" = "$TDC_RUN_BUILD_BRANCH" ] || defer "branch ${branch:-detached} is not $TDC_RUN_BUILD_BRANCH"
for g in MERGE_HEAD rebase-merge rebase-apply; do
  git_path_exists "$g" && defer "$g present"
done
git -C "$repo" diff --cached --quiet || defer "index has staged changes"

added=0
if ! git -C "$repo" ls-files --error-unmatch -- docs/BRIEF.md >/dev/null 2>&1; then
  git -C "$repo" add -- docs/BRIEF.md || defer "cannot stage docs/BRIEF.md"
  added=1
fi
tries=0
while :; do
  if err=$(git -C "$repo" commit -q -m "docs(brief): add driver directive" -- docs/BRIEF.md 2>&1); then
    td_log "committed directive on $branch"
    exit 0
  fi
  case "$err" in
    *index.lock*)
      tries=$((tries + 1))
      if [ "$tries" -le 3 ]; then
        sleep 1
        continue
      fi ;;
  esac
  [ "$added" -eq 1 ] && git -C "$repo" reset -q -- docs/BRIEF.md >/dev/null 2>&1
  defer "git commit failed: $(printf '%s' "$err" | head -n 1)"
done
