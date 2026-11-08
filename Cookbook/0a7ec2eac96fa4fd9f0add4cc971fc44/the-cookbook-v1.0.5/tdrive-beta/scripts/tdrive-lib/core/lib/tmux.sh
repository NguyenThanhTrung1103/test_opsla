#!/bin/bash
# tmux helpers for tdrive. Source after common.sh; never execute.
# Every target is exact: `=<session>:` for pane commands, `=<session>` for
# session commands, so a session name never prefix-matches another session.

# Key names accepted by td_tmux_send_keys (one argv each).
TD_TMUX_KEYS="Enter Escape Tab BSpace Space Up Down Left Right C-u 1 2 3 4 5 6 7 8 9"

# td_tmux_valid_session NAME : 0 when NAME is a safe tmux session name.
td_tmux_valid_session() {
  case "$1" in
    ''|[!A-Za-z0-9]*|*[!A-Za-z0-9_-]*) return 1 ;;
  esac
  return 0
}

# td_tmux_key_ok KEY : 0 when KEY is whitelisted.
td_tmux_key_ok() {
  case " $TD_TMUX_KEYS " in
    *" $1 "*) [ -n "$1" ] && return 0 ;;
  esac
  return 1
}

td_tmux_has() {
  tmux has-session -t "=$1" >/dev/null 2>&1
}

# td_tmux_capture S plain|ansi OUT : capture the visible pane into OUT.
# Non-zero means the session is gone.
td_tmux_capture() {
  local s=$1 mode=$2 out=$3
  case "$mode" in
    plain) tmux capture-pane -p -t "=$s:" > "$out" 2>/dev/null ;;
    ansi) tmux capture-pane -p -e -t "=$s:" > "$out" 2>/dev/null ;;
    *) td_log "td_tmux_capture: bad mode $mode"; return 2 ;;
  esac
}

# td_tmux_pid S : print the pane pid.
td_tmux_pid() {
  tmux display-message -p -t "=$1:" '#{pane_pid}' 2>/dev/null
}

# td_tmux_pane_count S : print the number of panes in session S (every
# window: agent-team teammates split the engine window). Non-zero when the
# session is gone or tmux failed.
td_tmux_pane_count() {
  local out n=0 line
  out=$(tmux list-panes -s -t "=$1" -F '#{pane_id}' 2>/dev/null) || return 1
  while IFS= read -r line; do
    [ -n "$line" ] && n=$((n + 1))
  done <<EOF
$out
EOF
  printf '%s\n' "$n"
}

# td_tmux_send_literal S TEXT : type TEXT (already sanitized) without Enter.
td_tmux_send_literal() {
  tmux send-keys -t "=$1:" -l -- "$2"
}

# td_tmux_send_keys S KEY... : validate every key first (exit status 2 and
# nothing sent on a bad key), then send each key as its own argv.
td_tmux_send_keys() {
  local s=$1 k
  shift
  [ $# -gt 0 ] || { td_log "no keys to send"; return 2; }
  for k in "$@"; do
    td_tmux_key_ok "$k" || { td_log "bad-key: $k"; return 2; }
  done
  for k in "$@"; do
    tmux send-keys -t "=$s:" "$k" || return 1
  done
  return 0
}

# td_classify S [PLAIN_COPY] : capture plain + ansi and print the classifier
# lines. Prints `STATE SESSION_GONE` when the capture fails. With PLAIN_COPY,
# the plain capture is also copied there.
td_classify() {
  local s=$1 keep=${2:-} p a rc
  p=$(mktemp "${TMPDIR:-/tmp}/tdrive-pane.XXXXXX") || { td_log "cannot create a temp file"; return 3; }
  a="$p.ansi"
  if ! td_tmux_capture "$s" plain "$p" || ! td_tmux_capture "$s" ansi "$a"; then
    rm -f "$p" "$a"
    [ -n "$keep" ] && : > "$keep"
    printf 'STATE SESSION_GONE\n'
    return 0
  fi
  [ -n "$keep" ] && cp "$p" "$keep"
  td_py pane_classify --plain "$p" --ansi "$a"
  rc=$?
  rm -f "$p" "$a"
  return "$rc"
}

# td_classify_field LINES NAME : print the value of the NAME line.
td_classify_field() {
  local line
  while IFS= read -r line; do
    case "$line" in
      "$2 "*) printf '%s\n' "${line#"$2" }"; return 0 ;;
      "$2") printf '\n'; return 0 ;;
    esac
  done <<EOF
$1
EOF
  return 1
}
