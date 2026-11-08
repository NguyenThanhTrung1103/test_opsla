#!/bin/bash
# tdrive sign: sign a Buildflow gate under the signing policy (experimental).
# The halt tier is refused before Buildflow's sign.sh could ever be invoked.
set -u
TD_CMD=sign
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"

SIGN_TIMEOUT_S=60
AUTH_REL=.tdrive/standing-authorization.yaml

usage() {
  cat <<'EOF'
usage: tdrive --experimental-buildflow sign <gate> --repo R [--note TEXT] [--dry-run]
       tdrive --experimental-buildflow sign <gate> --repo R --chat-approval QUOTE
                                        --approved-at ISO [--dry-run]
       tdrive --experimental-buildflow sign --tier <gate>
       tdrive --experimental-buildflow sign --check-auth <gate> --repo R
       tdrive --experimental-buildflow sign --authorize --repo R --gates a,b --days N
                                        --signer EMAIL --ssh-key FILE [--replace]

Signing policy (policies/signing.yaml; the halt tier is fixed in code):
  halt         frame market offer wishlist signal launch-plan launch (+ -N), any
               unknown name, halt_extra: never signed. The question is batched
               in runs/<run>/questions.md for the operator. Exit 10.
  authorized   bash R/buildflow/bin/sign.sh <gate> --auto, only when a valid
               ssh-signed standing authorization lists the gate, else exit 11.
  auto-notify  bash R/buildflow/bin/sign.sh <gate> --auto, then a heads-up report.
A successful signing appends "SIGNED <gate> tier=<T> by=tdrive" to the run's
events.log. sign.sh runs bounded to 60 s; a failure exits 12.
--dry-run (global) prints the sign.sh call as a DRY line and never runs it.

--chat-approval (the driver relays an approval the operator gave in chat):
QUOTE is the operator's words verbatim (one line, 3..500 chars), ISO the UTC
time they said it (YYYY-MM-DDTHH:MM:SSZ, at most 24 h old). Any tier, halt
included: the operator approved, the driver only relays. Refused unless the
run saw the gate raised (gates.seen, a WAKE GATE line in questions.md, or the
pane ending its turn on it). It appends a decisions row (tdrive decide), a
CHAT_APPROVAL line to events.log, an `answer` trace event and a record in
runs/<run>/approvals.jsonl, then runs
  bash R/buildflow/bin/sign.sh <gate> --delegated
       -m 'approved: "<quote>" · operator approved in chat via driver · <TD-NN> · at <ISO>'
and logs "SIGNED <gate> tier=<T> by=operator-chat via=driver decision=<id>".
Prints: SIGN gate=<g> tier=<T> action=<signed|refused|dry-run> reason=chat-approval decision=<id>

--authorize (a human at a terminal only) writes R/.tdrive/standing-authorization.yaml
and signs it with ssh-keygen -Y sign into the .sig next to it. It asks you to
type the project name (the repo dir name). Gates must be authorized-tier gates
or authorized patterns; days <= signing.max_auth_days; signer != signing.driver_identity.

Prints: SIGN gate=<g> tier=<authorized|auto-notify|halt> action=<signed|refused|dry-run> reason=<r>
Exit: 0 signed or dry-run, 2 usage/config (or no experimental flag, or an
allowed_signers file inside a repo), 3 environment, 5 --authorize without a
terminal or a mistyped project name, 10 halt tier refused, 11 authorized tier
without a valid signed authorization, 12 sign.sh failed (or the tag exists),
13 chat approval refused (malformed quote or time, or the gate was never raised).
EOF
}

mode=sign gate="" repo="" note="" gates="" days="" signer="" ssh_key="" replace=0
chat_quote="" have_chat=0 approved_at=""
need_value() { [ "$2" -ge 2 ] || td_die 2 "$1 needs a value"; }
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --dry-run) export TDRIVE_DRY_RUN=1; shift ;;
    --tier|--check-auth)
      need_value "$1" $#
      mode=${1#--}; gate=$2; shift 2 ;;
    --authorize) mode=authorize; shift ;;
    --replace) replace=1; shift ;;
    --chat-approval) need_value "$1" $#; chat_quote=$2; have_chat=1; shift 2 ;;
    --approved-at) need_value "$1" $#; approved_at=$2; shift 2 ;;
    --repo|--note|--gates|--days|--signer|--ssh-key)
      need_value "$1" $#
      case "$1" in
        --repo) repo=$2 ;;
        --note) note=$2 ;;
        --gates) gates=$2 ;;
        --days) days=$2 ;;
        --signer) signer=$2 ;;
        --ssh-key) ssh_key=$2 ;;
      esac
      shift 2 ;;
    --)
      shift
      if [ $# -gt 1 ] || { [ $# -eq 1 ] && [ -n "$gate" ]; }; then
        td_die 2 "only one gate may be given"
      fi
      [ $# -eq 0 ] || { gate=$1; shift; } ;;
    -*) td_die 2 "unknown argument: $1 (see tdrive sign --help)" ;;
    *)
      [ -z "$gate" ] || td_die 2 "only one gate may be given"
      gate=$1; shift ;;
  esac
done

[ "${TDRIVE_EXPERIMENTAL_BUILDFLOW:-}" = 1 ] \
  || td_die 2 "sign is experimental; pass --experimental-buildflow (or TDRIVE_EXPERIMENTAL_BUILDFLOW=1)"
td_require python3 git

# repo_top : validate --repo and set REPO to its git toplevel.
repo_top() {
  [ -n "$repo" ] || td_die 2 "--repo is required"
  [ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
  REPO=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) || td_die 3 "not a git repo: $repo"
  REPO=$(cd -P "$REPO" && pwd) || td_die 3 "cannot enter repo dir: $REPO"
}

# gate_tier GATE : set TIER and TIER_REASON (and GATE_SHOWN) from the engine.
gate_tier() {
  local out f fields=()
  out=$(td_py signing tier "$1" ${2:+"$2"}) || td_die $? "tier lookup failed for the gate"
  TIER="" TIER_REASON="" GATE_SHOWN=""
  read -r -a fields <<< "$out"
  for f in ${fields[@]+"${fields[@]}"}; do
    case "$f" in
      gate=*) GATE_SHOWN=${f#gate=} ;;
      tier=*) TIER=${f#tier=} ;;
      reason=*) TIER_REASON=${f#reason=} ;;
    esac
  done
  case "$TIER" in authorized|auto-notify|halt) ;; *) td_die 2 "unexpected tier output: $out" ;; esac
  [ -n "$TIER_REASON" ] && [ -n "$GATE_SHOWN" ] || td_die 2 "unexpected tier output: $out"
}

case "$mode" in
  tier)
    [ -z "$repo" ] || td_die 2 "--tier takes no --repo"
    td_py signing tier "$gate"
    exit $? ;;
  check-auth)
    repo_top
    td_py signing check-auth --repo "$REPO" --gate "$gate"
    exit $? ;;
esac

# ---- --authorize: human only ------------------------------------------------

yaml_str() {
  local v=$1
  v=${v//\\/\\\\}
  v=${v//\"/\\\"}
  printf '"%s"' "$v"
}

authorize() {
  local project typed now expires_epoch issued expires list="" g entries=() bad="" sha f tmp kt kb
  if ! { [ -t 0 ] && [ -t 1 ]; }; then
    td_die 5 "sign --authorize needs a human at a terminal (stdin and stdout must be a TTY)"
  fi
  [ -n "$gate" ] && td_die 2 "--authorize takes no gate argument"
  repo_top
  [ -n "$gates" ] && [ -n "$days" ] && [ -n "$signer" ] && [ -n "$ssh_key" ] \
    || td_die 2 "--authorize needs --gates, --days, --signer and --ssh-key"
  td_load_config --repo "$REPO" || exit $?
  project=${REPO##*/}

  IFS=, read -r -a entries <<EOF
$gates
EOF
  [ ${#entries[@]} -gt 0 ] || td_die 2 "--gates is empty"
  for g in "${entries[@]}"; do
    gate_tier "$g" --entry
    if [ "$TIER" != authorized ]; then
      bad="$bad $GATE_SHOWN(tier=$TIER)"
      continue
    fi
    list="$list${list:+, }$(yaml_str "$g")"
  done
  [ -z "$bad" ] || td_die 2 "only authorized-tier gates or authorized patterns can be authorized; offenders:$bad"
  case "$days" in ''|*[!0-9]*) td_die 2 "--days must be a whole number of days" ;; esac
  [ "$days" -ge 1 ] && [ "$days" -le "$TDC_SIGNING_MAX_AUTH_DAYS" ] \
    || td_die 2 "--days must be between 1 and signing.max_auth_days ($TDC_SIGNING_MAX_AUTH_DAYS)"
  case "$signer" in
    -*|*[!A-Za-z0-9._%+@-]*) td_die 2 "--signer must be an ssh principal such as an email address" ;;
  esac
  [ "$(printf '%s' "$signer" | tr 'A-Z' 'a-z')" != "$(printf '%s' "$TDC_SIGNING_DRIVER_IDENTITY" | tr 'A-Z' 'a-z')" ] \
    || td_die 2 "--signer must not be the driver identity ($TDC_SIGNING_DRIVER_IDENTITY)"
  [ -f "$ssh_key" ] || td_die 2 "--ssh-key file not found: $ssh_key"
  f="$REPO/$AUTH_REL"
  if [ -e "$f" ] || [ -e "$f.sig" ]; then
    [ "$replace" -eq 1 ] || td_die 2 "$f already exists; pass --replace to write a new one"
  fi

  printf 'Authorize tdrive to sign these authorized-tier gates in %s for %s day(s): %s\n' "$REPO" "$days" "$gates" > /dev/tty
  printf 'Type the project name (%s) to confirm: ' "$project" > /dev/tty
  IFS= read -r typed < /dev/tty || typed=""
  [ "$typed" = "$project" ] || td_die 5 "typed name does not match the project name; nothing written"

  now=$(td_now) || td_die 3 "cannot read the clock"
  expires_epoch=$((now + days * 86400))
  issued=$(td_iso "$now") || td_die 3 "cannot format the issue time"
  expires=$(td_iso "$expires_epoch") || td_die 3 "cannot format the expiry time"

  (umask 022 && mkdir -p "$REPO/.tdrive") || td_die 3 "cannot create $REPO/.tdrive"
  tmp="$f.tmp.$$"
  {
    printf '# Standing authorization for tdrive authorized-tier gates. Written by tdrive sign --authorize.\n'
    printf '# Do not edit: any change breaks body_sha256 and the ssh signature in the .sig file.\n'
    printf 'signer: %s\n' "$(yaml_str "$signer")"
    printf 'issued: %s\n' "$(yaml_str "$issued")"
    printf 'expires: %s\n' "$(yaml_str "$expires")"
    printf 'project: %s\n' "$(yaml_str "$project")"
    printf 'gates: [%s]\n' "$list"
  } > "$tmp" || { rm -f "$tmp"; td_die 3 "cannot write $tmp"; }
  sha=$(td_py signing body-sha "$tmp") || { rm -f "$tmp"; td_die 3 "cannot hash $tmp"; }
  printf 'body_sha256: "%s"\n' "$sha" >> "$tmp" || { rm -f "$tmp"; td_die 3 "cannot write $tmp"; }
  rm -f "$f.sig"
  mv -f "$tmp" "$f" || { rm -f "$tmp"; td_die 3 "cannot write $f"; }
  if ! ssh-keygen -Y sign -f "$ssh_key" -n tdrive-auth "$f" < /dev/tty >&2 || [ ! -s "$f.sig" ]; then
    rm -f "$f" "$f.sig"
    td_die 1 "ssh-keygen -Y sign failed; nothing kept"
  fi

  printf 'AUTHORIZED file=%s sig=%s sha12=%s expires=%s\n' "$f" "$f.sig" "$(printf '%.12s' "$sha")" "$expires"
  {
    printf '\nNext, commit both files on the branch the engine builds on:\n'
    printf '  git -C %s add %s %s.sig\n' "$REPO" "$AUTH_REL" "$AUTH_REL"
    printf '  git -C %s commit -m "chore: standing authorization for authorized-tier gates"\n' "$REPO"
    printf '\nallowed_signers (%s) needs this line for the signer:\n' "$TDC_SIGNING_ALLOWED_SIGNERS"
    if [ -f "$ssh_key.pub" ] && read -r kt kb _ < "$ssh_key.pub"; then
      printf '  %s namespaces="tdrive-auth" %s %s\n' "$signer" "$kt" "$kb"
    else
      printf '  %s namespaces="tdrive-auth" <key type> <base64 public key>\n' "$signer"
    fi
    printf 'Keep allowed_signers outside every git repo.\n'
  } >&2
  exit 0
}

[ "$mode" = authorize ] && authorize

# ---- sign <gate> ------------------------------------------------------------

[ -n "$gate" ] || td_die 2 "a gate is required (see tdrive sign --help)"
case "$note" in *$'\n'*|*$'\r'*) td_die 2 "--note must be a single line" ;; esac
repo_top
run=$(td_run --repo "$REPO") || exit 2
rd=$(td_state_dir "$run") || exit $?
TD_RUNDIR=$rd
export TDRIVE_RUN=$run
td_load_config --repo "$REPO" --rundir "$rd" || exit $?

# result ACTION REASON CODE : print the sign line and exit.
result() {
  printf 'SIGN gate=%s tier=%s action=%s reason=%s\n' "$GATE_SHOWN" "$TIER" "$1" "$2"
  exit "$3"
}

# ask TEXT : batch a question for the operator (run state only).
ask() {
  if td_dry; then
    printf 'DRY question: %s\n' "$1"
    return 0
  fi
  (umask 077 && printf -- '- [ ] %s %s\n' "$(td_iso)" "$1" >> "$rd/questions.md") \
    || td_log "cannot append to $rd/questions.md"
  td_log "question: $1"
}

gate_tier "$gate"
td_log "gate $GATE_SHOWN tier=$TIER reason=$TIER_REASON"

# ---- sign <gate> --chat-approval: the operator approved in chat ----------------
# pane_gate : PANE_FP is the fingerprint of the run session's turn-end
# request for this gate (empty when the pane does not end its turn on it).
pane_gate() {
  local session pf scan="" w
  PANE_FP=""
  session=$(td_runenv_get "$run" SESSION 2>/dev/null) || session=""
  [ -n "$session" ] && command -v tmux >/dev/null 2>&1 || return 0
  . "$TD_HERE/lib/tmux.sh"
  td_tmux_valid_session "$session" || return 0
  pf=$(mktemp "${TMPDIR:-/tmp}/tdrive-sign.XXXXXX") || return 0
  if td_tmux_capture "$session" plain "$pf"; then
    scan=$(td_py gates scan --pane "$pf" --run "$run" 2>/dev/null) || scan=""
  fi
  rm -f "$pf"
  case "$scan" in
    "GATE tag=$gate "*" turn_end=yes "*)
      for w in $scan; do case "$w" in fp=*) PANE_FP=${w#fp=} ;; esac; done ;;
  esac
  return 0
}

# gate_raised : 0 when the run saw this gate raised, or the pane ends its turn on it.
gate_raised() {
  td_py gates pending --run "$run" --gate "$gate" >/dev/null 2>&1 && return 0
  pane_gate
  [ -n "$PANE_FP" ]
}

chat_sign() {
  local chk why out id dq tag_sha src
  [ -z "$note" ] || td_die 2 "--chat-approval takes no --note (the quote is the note)"
  [ -n "$approved_at" ] || td_die 2 "--chat-approval needs --approved-at (UTC time the operator said it)"
  reason=chat-approval
  chk=$(td_py signing chat-check --approved-at "$approved_at" --quote "$chat_quote")
  if [ $? -ne 0 ]; then
    why=${chk##*reason=}
    td_log "chat approval of $GATE_SHOWN refused: ${why:-invalid}"
    result refused "chat-${why:-invalid}" 13
  fi
  if git -C "$REPO" rev-parse --verify --quiet "refs/tags/$gate" >/dev/null 2>&1; then
    result refused already-signed 12
  fi
  if ! gate_raised; then
    td_log "chat approval of $GATE_SHOWN refused: the run never saw the gate raised"
    result refused chat-gate-not-raised 13
  fi
  # The quote goes into the tag note inside double quotes (Buildflow's
  # `approved: "<words>"` shape), so its own double quotes become single.
  dq=${chat_quote//\"/\'}
  out=$("${BASH:-/bin/bash}" "$TD_HERE/decide.sh" --repo "$REPO" \
    --decision "operator approved gate $GATE_SHOWN (tier $TIER) in chat; driver relays, tdrive signs $GATE_SHOWN --delegated" \
    --options "sign $GATE_SHOWN --delegated | hold" \
    --why "operator in chat at $approved_at: \"$dq\"")
  [ $? -eq 0 ] || td_die 3 "cannot record the decision for the chat approval of $GATE_SHOWN"
  id=$(printf '%s\n' "$out" | sed -n 's/^DECIDED \([^ ]*\) .*/\1/p' | tail -n 1)
  [ -n "$id" ] || td_die 3 "unexpected decide output: $out"
  msg="approved: \"$dq\" · operator approved in chat via driver · $id · at $approved_at"
  if td_dry "cd $REPO && bash buildflow/bin/sign.sh $GATE_SHOWN --delegated -m '$msg'"; then
    printf 'SIGN gate=%s tier=%s action=dry-run reason=chat-approval decision=%s\n' "$GATE_SHOWN" "$TIER" "$id"
    exit 0
  fi
  td_py signing approval-add --run "$run" --gate "$gate" --tier "$TIER" --decision "$id" \
    --approved-at "$approved_at" --quote "$chat_quote" --status approved \
    || td_die 3 "cannot record the chat approval in $rd/approvals.jsonl"
  (umask 077 && printf '%s CHAT_APPROVAL %s tier=%s decision=%s approved_at=%s\n' "$(td_iso)" "$GATE_SHOWN" "$TIER" \
    "$id" "$approved_at" >> "$rd/events.log") || td_log "cannot append to $rd/events.log"
  td_trace driver answer "text=$chat_quote" "by=operator-chat-via-driver" "gate=$GATE_SHOWN" "decision=$id" \
    "approved_at=$approved_at"
  td_log "chat approval of $GATE_SHOWN recorded as $id"
  if [ ! -f "$REPO/buildflow/bin/sign.sh" ]; then
    ask "Gate $GATE_SHOWN (chat approval $id) could not be signed: $REPO/buildflow/bin/sign.sh is missing"
    printf 'SIGN gate=%s tier=%s action=refused reason=sign.sh-missing decision=%s\n' "$GATE_SHOWN" "$TIER" "$id"
    exit 12
  fi
  (cd "$REPO" && td_bounded "$SIGN_TIMEOUT_S" "${BASH:-/bin/bash}" buildflow/bin/sign.sh "$gate" --delegated -m "$msg") \
    < /dev/null >&2
  src=$?
  if [ "$src" -ne 0 ]; then
    ask "Gate $GATE_SHOWN (chat approval $id): sign.sh --delegated failed with exit $src"
    printf 'SIGN gate=%s tier=%s action=refused reason=sign.sh-exit-%s decision=%s\n' "$GATE_SHOWN" "$TIER" "$src" "$id"
    exit 12
  fi
  tag_sha=$(git -C "$REPO" rev-parse --verify --quiet "refs/tags/$gate") || tag_sha=""
  td_py signing approval-add --run "$run" --gate "$gate" --tier "$TIER" --decision "$id" \
    --approved-at "$approved_at" --quote "$chat_quote" --status signed ${tag_sha:+--tag-sha "$tag_sha"} \
    || td_log "cannot record the signed chat approval in $rd/approvals.jsonl"
  (umask 077 && printf '%s SIGNED %s tier=%s by=operator-chat via=driver decision=%s\n' "$(td_iso)" "$GATE_SHOWN" \
    "$TIER" "$id" >> "$rd/events.log") || td_log "cannot append to $rd/events.log"
  # The request on screen is handled: the loop must not wake on it again.
  pane_gate
  [ -z "$PANE_FP" ] || td_py gates record --run "$run" --tag "$gate" --fp "$PANE_FP" --outcome signed-chat \
    || td_log "cannot record gate $GATE_SHOWN in gates.seen"
  td_log "signed $GATE_SHOWN (tier $TIER) on the operator's chat approval $id"
  printf 'SIGN gate=%s tier=%s action=signed reason=chat-approval decision=%s\n' "$GATE_SHOWN" "$TIER" "$id"
  exit 0
}
[ "$have_chat" -eq 1 ] && chat_sign
[ -z "$approved_at" ] || td_die 2 "--approved-at needs --chat-approval"

if [ "$TIER" = halt ]; then
  ask "Gate $GATE_SHOWN needs the operator: bash buildflow/bin/sign.sh $GATE_SHOWN at a terminal (tier halt, $TIER_REASON)"
  result refused "$TIER_REASON" 10
fi

msg="tdrive: tier auto-notify"
reason=auto-notify
if [ "$TIER" = authorized ]; then
  auth_out=$(td_py signing check-auth --repo "$REPO" --gate "$gate")
  arc=$?
  sha12="" areason="" fields=()
  read -r -a fields <<< "$auth_out"
  for f in ${fields[@]+"${fields[@]}"}; do
    case "$f" in
      sha12=*) sha12=${f#sha12=} ;;
      reason=*) areason=${f#reason=} ;;
    esac
  done
  if [ "$arc" -ne 0 ]; then
    if [ -z "$areason" ]; then
      td_die "$arc" "standing authorization check failed (exit $arc)"
    fi
    if [ "$arc" -eq 2 ]; then
      td_log "standing authorization refused: $areason"
      result refused "$areason" 2
    fi
    ask "Gate $GATE_SHOWN (tier authorized) needs the operator: no valid signed standing authorization (reason=$areason); sign it at a terminal with bash buildflow/bin/sign.sh $GATE_SHOWN, or renew it with tdrive sign --authorize"
    result refused "$areason" 11
  fi
  case "$sha12" in ''|*[!0-9a-f]*) td_die 2 "unexpected check-auth output: $auth_out" ;; esac
  msg="tdrive: standing authorization $sha12"
  reason=standing-authorization
fi
[ -n "$note" ] && msg="$msg; $note"

# Last line of defense: only the authorized and auto-notify tiers ever reach sign.sh.
case "$TIER" in authorized|auto-notify) ;; *) td_die 10 "refusing to sign a tier $TIER gate" ;; esac

if td_dry "cd $REPO && bash buildflow/bin/sign.sh $GATE_SHOWN --auto -m \"$msg\""; then
  result dry-run "$reason" 0
fi

if [ ! -f "$REPO/buildflow/bin/sign.sh" ]; then
  ask "Gate $GATE_SHOWN (tier $TIER) could not be signed: $REPO/buildflow/bin/sign.sh is missing"
  result refused sign.sh-missing 12
fi

(cd "$REPO" && td_bounded "$SIGN_TIMEOUT_S" "${BASH:-/bin/bash}" buildflow/bin/sign.sh "$gate" --auto -m "$msg") < /dev/null >&2
src=$?
if [ "$src" -ne 0 ]; then
  ask "Gate $GATE_SHOWN (tier $TIER): sign.sh failed with exit $src; sign it at a terminal with bash buildflow/bin/sign.sh $GATE_SHOWN"
  result refused "sign.sh-exit-$src" 12
fi

(umask 077 && printf '%s SIGNED %s tier=%s by=tdrive\n' "$(td_iso)" "$GATE_SHOWN" "$TIER" >> "$rd/events.log") \
  || td_log "cannot append to $rd/events.log"
td_log "signed $GATE_SHOWN (tier $TIER)"

if [ "$TIER" = auto-notify ]; then
  "${BASH:-/bin/bash}" "$TD_HERE/report.sh" --repo "$REPO" --heads-up "auto-signed $GATE_SHOWN (tier auto-notify)" >&2
  rrc=$?
  [ "$rrc" -eq 0 ] || td_log "heads-up report for $GATE_SHOWN failed (exit $rrc)"
fi
result signed "$reason" 0
