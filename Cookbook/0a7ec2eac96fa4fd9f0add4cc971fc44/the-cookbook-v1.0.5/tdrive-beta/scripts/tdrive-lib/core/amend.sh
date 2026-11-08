#!/bin/bash
# tdrive amend: write a plan amendment into the driven repo, send the
# orchestrator a one-line pointer, then confirm receipt by a plan commit that
# references the amendment id.
set -u
TD_CMD=amend
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"
. "$TD_HERE/lib/tmux.sh"
. "$TD_HERE/lib/adapter.sh"

usage() {
  cat <<'EOF'
usage: tdrive amend --repo R --session S --title TEXT (--file F | --body TEXT)
                    [--branch B] [--confirm-min N] [--no-wait]

Numbers the amendment Axx = 1 + the highest A<n> among docs/amendments/A*.md
in the working tree and on branch B, writes docs/amendments/Axx-<slug>.md
(not committed), sends a one-line pointer through `tdrive send`, then polls
until --confirm-min (default watch.backstop_min) for a commit on B, made
after the send, that touches plans/*/plan.md and mentions Axx in its message
or diff. --no-wait skips the confirmation; --dry-run prints DRY lines only.
Prints: AMEND_WRITTEN <Axx> path=<p>
        AMEND_SENT <Axx> session=<s>
        AMEND_CONFIRMED <Axx> commit=<sha7> | AMEND_UNCONFIRMED <Axx> after_min=<n>
B defaults to the run's BRANCH, then run.build_branch when it exists, then
the current branch.
Exit: 0 confirmed or not waited, 1 unconfirmed, 2 usage, 3 repo, git or
session missing, 5 send refused.
EOF
}

repo="" session="" title="" file="" body="" branch="" confirm_min="" no_wait=0
have_file=0 have_body=0
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --repo|--session|--title|--file|--body|--branch|--confirm-min)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --repo) repo=$2 ;;
        --session) session=$2 ;;
        --title) title=$2 ;;
        --file) file=$2; have_file=1 ;;
        --body) body=$2; have_body=1 ;;
        --branch) branch=$2 ;;
        --confirm-min) confirm_min=$2 ;;
      esac
      shift 2 ;;
    --no-wait) no_wait=1; shift ;;
    *) td_die 2 "unknown argument: $1 (see tdrive amend --help)" ;;
  esac
done

[ -n "$repo" ] || td_die 2 "--repo is required"
[ -n "$session" ] || td_die 2 "--session is required"
td_tmux_valid_session "$session" || td_die 2 "invalid session name: $session"
[ -n "$title" ] || td_die 2 "--title is required"
case "$title" in *$'\n'*|*$'\r'*) td_die 2 "--title must be one line" ;; esac
[ $((have_file + have_body)) -eq 1 ] || td_die 2 "give exactly one of --file or --body"
case "$confirm_min" in
  '') ;;
  *[!0-9]*) td_die 2 "--confirm-min must be a non-negative integer: $confirm_min" ;;
esac
if [ "$have_file" -eq 1 ]; then
  [ -f "$file" ] && [ -r "$file" ] || td_die 2 "cannot read --file: $file"
  body=$(cat "$file") || td_die 2 "cannot read --file: $file"
fi
[ -n "$body" ] || td_die 2 "empty amendment body"
[ -d "$repo" ] || td_die 3 "repo dir not found: $repo"
repo=$(cd -P "$repo" && pwd) || td_die 3 "cannot enter repo dir: $repo"
td_require git python3
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || td_die 3 "not a git repo: $repo"

run=$(td_run --repo "$repo" --session "$session") || exit 2
rd=$(td_state_dir "$run") || exit $?
TD_RUNDIR=$rd
export TDRIVE_RUN=$run
td_load_config --repo "$repo" --rundir "$rd" || exit $?
[ -n "$confirm_min" ] || confirm_min=$TDC_WATCH_BACKSTOP_MIN

if [ -z "$branch" ]; then
  branch=$(td_runenv_get "$run" BRANCH) || branch=""
  if [ -n "$branch" ] && ! git -C "$repo" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
    branch=""
  fi
  [ -n "$branch" ] || branch=$(td_adapter_branch "$repo" "$TDC_RUN_BUILD_BRANCH") || exit $?
fi
git -C "$repo" rev-parse --verify --quiet "$(td_branch_ref "$repo" "$branch")^{commit}" >/dev/null 2>&1 || td_die 3 "branch not found in $repo: $branch"

work=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-amend.XXXXXX") || td_die 3 "cannot create a temp dir"
trap 'rm -rf "$work"' EXIT

"${BASH:-/bin/bash}" "$TD_HERE/state.sh" --repo "$repo" --branch "$branch" > "$work/state"
rc=$?
[ "$rc" -eq 0 ] || td_die "$rc" "state failed for $repo $branch (exit $rc)"
in_flight=$(sed -n 's/^IN_PROGRESS //p' "$work/state")
case "$in_flight" in
  ''|-) in_flight=none ;;
  *) in_flight=${in_flight//,/, } ;;
esac

# amend_py CMD ARGS... : number/slug and receipt helpers.
amend_py() {
  python3 -E -s - "$@" <<'PY'
import os
import re
import subprocess
import sys

cmd = sys.argv[1]


def git(repo, args):
    p = subprocess.run(["git", "-C", repo] + args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        sys.stderr.write("amend: git %s failed: %s\n" % (args[0], p.stderr.decode("utf-8", "replace").strip()))
        sys.exit(3)
    return p.stdout.decode("utf-8", "replace")


if cmd == "name":
    repo, branch, title = sys.argv[2:5]
    names = []
    d = os.path.join(repo, "docs", "amendments")
    if os.path.isdir(d):
        names.extend(os.listdir(d))
    names.extend(os.path.basename(p) for p in git(repo, ["ls-tree", "--name-only", branch, "--", "docs/amendments/"]).splitlines())
    top = 0
    for n in names:
        m = re.match(r"^A([0-9]+)", n)
        if m and n.endswith(".md"):
            top = max(top, int(m.group(1)))
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40].strip("-") or "amendment"
    sys.stdout.write("A%02d\t%s\n" % (top + 1, slug))
elif cmd == "confirm":
    repo, branch, aid, since = sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
    rx = re.compile(r"(?<![A-Za-z0-9])%s(?![0-9])" % re.escape(aid))
    log = git(repo, ["log", branch, "--format=%H%x09%ct%x09%s", "-n", "200", "--", "plans/*/plan.md"])
    for line in log.splitlines():
        parts = line.split("\t", 2)
        if len(parts) < 2 or not parts[1].isdigit() or int(parts[1]) < since:
            continue
        if rx.search(git(repo, ["show", parts[0]])):
            sys.stdout.write(parts[0][:7] + "\n")
            sys.exit(0)
    sys.exit(1)
else:
    sys.stderr.write("amend: unknown helper %s\n" % cmd)
    sys.exit(2)
PY
}

named=$(amend_py name "$repo" "$branch" "$title") || exit $?
aid=${named%%$'\t'*}
slug=${named#*$'\t'}
rel="docs/amendments/$aid-$slug.md"
path="$repo/$rel"
day=$(td_py runstate local) || td_die 2 "cannot read the clock"
day=${day%%T*}

td_py render "$TD_ROOT_DIR/core/templates/amendment.md" --var "id=$aid" --var "title=$title" \
  --var "date=$day" --var "in_flight=$in_flight" --var "body=$body" > "$work/amendment.md" \
  || td_die 2 "cannot render the amendment"
pointer=$(td_py render "$TD_ROOT_DIR/core/templates/messages/amend-pointer.txt" --single-line \
  --var "id=$aid" --var "path=$rel" --var "branch=$branch") || td_die 2 "cannot render the pointer"

if td_dry; then
  td_dry "write $path"
  td_dry "send $session $pointer"
  exit 0
fi

[ -e "$path" ] && td_die 5 "amendment file already exists: $path"
mkdir -p "$repo/docs/amendments" || td_die 3 "cannot create $repo/docs/amendments"
cp "$work/amendment.md" "$path" || td_die 3 "cannot write $path"
printf 'AMEND_WRITTEN %s path=%s\n' "$aid" "$path"
td_trace amend amend "axx=$aid" status=written
td_log "wrote $path"

sent_at=$(td_now) || td_die 2 "cannot read the clock"
"${BASH:-/bin/bash}" "$TD_HERE/send.sh" --session "$session" -- "$pointer" >&2
rc=$?
[ "$rc" -eq 0 ] || td_die "$rc" "pointer not sent to $session (send exit $rc); $path is written"
printf 'AMEND_SENT %s session=%s\n' "$aid" "$session"
td_trace amend amend "axx=$aid" status=sent
td_log "sent $aid pointer to $session at epoch $sent_at"
[ "$no_wait" -eq 1 ] && exit 0

tick=${TDRIVE_TICK:-$TDC_WATCH_TICK_S}
case "$tick" in ''|*[!0-9.]*) td_die 2 "TDRIVE_TICK must be a number of seconds: $tick" ;; esac
max_s=$((confirm_min * 60))
nominal=0
while :; do
  sha=$(amend_py confirm "$repo" "$branch" "$aid" "$sent_at")
  rc=$?
  if [ "$rc" -eq 0 ] && [ -n "$sha" ]; then
    printf 'AMEND_CONFIRMED %s commit=%s\n' "$aid" "$sha"
    td_trace amend amend "axx=$aid" status=confirmed
    td_log "$aid confirmed by $sha"
    exit 0
  fi
  [ "$rc" -le 1 ] || td_die "$rc" "cannot check $branch for $aid"
  [ "$nominal" -ge "$max_s" ] && break
  case "$tick" in *[1-9]*) sleep "$tick" ;; esac
  nominal=$((nominal + TDC_WATCH_TICK_S))
done
printf 'AMEND_UNCONFIRMED %s after_min=%s\n' "$aid" "$confirm_min"
td_trace amend amend "axx=$aid" status=unconfirmed
td_log "$aid not confirmed after $confirm_min min"
exit 1
