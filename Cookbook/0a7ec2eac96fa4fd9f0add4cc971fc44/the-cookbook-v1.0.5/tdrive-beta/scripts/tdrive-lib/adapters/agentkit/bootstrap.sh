#!/bin/bash
# AgentKit bootstrap: bootstrap.sh <dir> <brief> [--ref PATH]... [--directives FILE] [--force] [--dry-run]
# Creates (ak new + ak kit install engineer) or adopts a project dir, puts it
# on the build branch, writes docs/BRIEF.md, references, .gitignore lines and
# the orchestrator directives, then commits exactly those paths.
# Prints: BOOTSTRAPPED dir=<d> branch=<b> commit=<sha7>  (DRY lines only with --dry-run)
# Exit: 2 usage (bad name, missing brief/ref/directives file), 3 environment
# (ak, git or a filesystem step failed), 5 unsafe dir (non-empty, no .claude/).
set -u
TD_CMD=bootstrap
case "${BASH_SOURCE[0]}" in */*) TD_ADIR=${BASH_SOURCE[0]%/*} ;; *) TD_ADIR=. ;; esac
. "$TD_ADIR/../../core/lib/common.sh"
TD_ADIR=$(cd "$TD_ADIR" && pwd)

AK_TIMEOUT_S=300
MARKER='## Orchestration (driver directives)'
IGNORE_LINES='.env
*.log
.claude/hooks/.logs/'
COMMIT_MSG="chore: bootstrap project for tdrive run"

usage() {
  cat <<'EOF'
usage: bootstrap.sh <dir> <brief> [--ref PATH]... [--directives FILE] [--force] [--dry-run]

<brief> is @FILE or a file path (copied) or literal text (# Brief + text).
A missing <dir> is created with `ak new <name> --template engineer` in its
parent, then `ak kit install engineer` (on failure: ak self-update and one
retry). A dir with .claude/ is adopted without ak calls; a non-empty dir
without .claude/ needs --force. An existing docs/BRIEF.md is never replaced
(not even with --force); a different <brief> is written alongside as
docs/BRIEF.run.md and the directives point at it. Without --directives the
shipped template is rendered from config. Only these paths are committed:
README.md .agentkit kits .claude .gitignore docs/BRIEF.md docs/reference
(adopted dir: .gitignore docs/BRIEF.md docs/reference), plus docs/BRIEF.run.md
when written.
EOF
}

dir="" brief="" have_brief=0 directives="" force=0
refs=()
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --ref|--directives)
      [ $# -ge 2 ] || td_die 2 "$1 needs a value"
      case "$1" in
        --ref) refs+=("$2") ;;
        --directives) directives=$2 ;;
      esac
      shift 2 ;;
    --force) force=1; shift ;;
    --dry-run) TDRIVE_DRY_RUN=1; export TDRIVE_DRY_RUN; shift ;;
    -*) td_die 2 "unknown argument: $1 (see bootstrap.sh --help)" ;;
    *)
      if [ -z "$dir" ]; then
        dir=$1
      elif [ "$have_brief" -eq 0 ]; then
        brief=$1 have_brief=1
      else
        td_die 2 "unexpected argument: $1"
      fi
      shift ;;
  esac
done

[ -n "$dir" ] || td_die 2 "<dir> is required"
[ -n "$brief" ] || td_die 2 "<brief> is required (@FILE, a file path or text)"
case "$dir" in /*) ;; *) dir="$(pwd -P)/$dir" ;; esac
while :; do
  case "$dir" in
    ?*/) dir=${dir%/} ;;
    *) break ;;
  esac
done
name=${dir##*/}
parent=${dir%/*}
[ -n "$parent" ] || parent=/
printf '%s\n' "$name" | command grep -E -q '^[a-z0-9][a-z0-9_-]*$' \
  || td_die 2 "invalid project name: '$name' (want ^[a-z0-9][a-z0-9_-]*\$)"
if [ -d "$parent" ]; then
  parent=$(cd -P "$parent" && pwd) || td_die 3 "cannot enter $parent"
  dir="${parent%/}/$name"
fi

# Brief source: @FILE or an existing file is copied, anything else is text.
brief_file=""
case "$brief" in
  @*)
    brief_file=${brief#@}
    [ -f "$brief_file" ] && [ -r "$brief_file" ] || td_die 2 "brief file not found: $brief_file" ;;
  *$'\n'*) ;;
  *) [ -f "$brief" ] && [ -r "$brief" ] && brief_file=$brief ;;
esac
i=0
while [ "$i" -lt ${#refs[@]} ]; do
  r=${refs[$i]}
  while :; do
    case "$r" in
      ?*/) r=${r%/} ;;
      *) break ;;
    esac
  done
  [ -e "$r" ] || td_die 2 "reference not found: $r"
  refs[i]=$r
  i=$((i + 1))
done
if [ -n "$directives" ]; then
  [ -f "$directives" ] && [ -r "$directives" ] || td_die 2 "directives file not found: $directives"
fi
td_require git python3

# Mode: fresh (ak new + kit install) or adopt (a dir that already has .claude/).
mode=fresh new_force=0
if [ -e "$dir" ] && [ ! -d "$dir" ]; then
  td_die 5 "not a directory: $dir"
elif [ -d "$dir" ]; then
  if [ -d "$dir/.claude" ]; then
    mode=adopt
  elif [ -z "$(ls -A "$dir" 2>/dev/null)" ]; then
    new_force=1
  elif [ "$force" -eq 1 ]; then
    new_force=1
  else
    td_die 5 "refusing to bootstrap a non-empty dir without .claude/: $dir (pass --force)"
  fi
fi

rundir_args=()
if [ -n "${TDRIVE_RUN:-}" ] && [ -d "$(td_state_base)/runs/$TDRIVE_RUN" ]; then
  rundir_args=(--rundir "$(td_state_base)/runs/$TDRIVE_RUN")
fi
td_load_config --repo "$dir" ${rundir_args[@]+"${rundir_args[@]}"} || exit $?
branch=$TDC_RUN_BUILD_BRANCH
[ -n "$branch" ] || td_die 2 "run.build_branch is empty"
git check-ref-format --branch "$branch" >/dev/null 2>&1 || td_die 2 "invalid run.build_branch: $branch"

work=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-bootstrap.XXXXXX") || td_die 3 "cannot create a temp dir"
trap 'rm -rf "$work"' EXIT

# Directives: the given file, else the shipped template rendered from config.
if [ -z "$directives" ]; then
  clause=""
  [ "$TDC_RUN_STOP_AFTER_PHASES" -gt 0 ] 2>/dev/null \
    && clause="Execute only the first $TDC_RUN_STOP_AFTER_PHASES phase(s), then stop and report."
  model_table=$(td_py models table --format directive --table "$TDC_MODELS_TABLE") \
    || td_die 2 "cannot render the model table (models.table=$TDC_MODELS_TABLE)"
  td_py render "$TD_ADIR/templates/orchestrator-directives.md" \
    --var "max_implementers=$TDC_RUN_MAX_IMPLEMENTERS" --var "build_branch=$branch" \
    --var "phase_limit_clause=$clause" --var "method_directives=" --var "model_table=$model_table" \
    > "$work/directives.raw" \
    || td_die 2 "cannot render the orchestrator directives"
  awk 'NF { if (b && n) print ""; b = 0; n = 1; print; next } { b = 1 }' "$work/directives.raw" > "$work/directives" \
    || td_die 3 "cannot write the directives"
  directives="$work/directives"
fi

if [ "$mode" = fresh ]; then
  stage_paths="README.md .agentkit kits .claude .gitignore docs/BRIEF.md docs/reference"
else
  stage_paths=".gitignore docs/BRIEF.md docs/reference"
fi
RUN_BRIEF_REL=docs/BRIEF.run.md

# same_brief GIVEN EXISTING : 0 when EXISTING (without the appended directives
# section and trailing blank lines) holds exactly the GIVEN brief.
same_brief() {
  local strip='/^## Orchestration \(driver directives\)$/ { exit } { a[++n] = $0 }
    END { while (n > 0 && a[n] ~ /^[ \t]*$/) n--; for (i = 1; i <= n; i++) print a[i] }'
  [ "$(awk "$strip" "$1")" = "$(awk "$strip" "$2")" ]
}

# render_brief OUT : the given brief as it would be written to docs/BRIEF.md.
render_brief() {
  if [ -n "$brief_file" ]; then
    cp "$brief_file" "$1"
  else
    printf '# Brief\n\n%s\n' "$brief" > "$1"
  fi
}

# is_own_repo : the dir is the top level of its own git repo.
is_own_repo() {
  local top
  top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || return 1
  [ -n "$top" ] && [ "$(cd -P "$top" && pwd)" = "$(cd -P "$dir" && pwd)" ]
}

# ak_new_args / ak_install : the exact ak invocations.
ak_new_args=(new "$name" --template engineer --yes --no-interactive)
[ "$new_force" -eq 1 ] && ak_new_args+=(--force)
ak_install_args=(kit install engineer --yes --no-interactive)

# ---- dry run -----------------------------------------------------------------
if td_dry; then
  if [ "$mode" = fresh ]; then
    [ -d "$parent" ] || td_dry "mkdir -p $parent"
    td_dry "(cd $parent && ak ${ak_new_args[*]})"
    td_dry "(cd $dir && ak ${ak_install_args[*]})"
  fi
  if [ -d "$dir" ] && is_own_repo; then
    cur=$(git -C "$dir" symbolic-ref --short -q HEAD 2>/dev/null) || cur=""
  else
    td_dry "git -C $dir init -q"
    cur=""
  fi
  if [ "$cur" != "$branch" ]; then
    if [ -d "$dir" ] && git -C "$dir" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
      td_dry "git -C $dir checkout -q $branch"
    else
      td_dry "git -C $dir checkout -q -b $branch"
    fi
  fi
  if [ -f "$dir/docs/BRIEF.md" ]; then
    td_dry "keep existing $dir/docs/BRIEF.md"
    render_brief "$work/brief.given" || td_die 3 "cannot render the brief"
    if ! same_brief "$work/brief.given" "$dir/docs/BRIEF.md"; then
      td_dry "write the given brief alongside: $dir/$RUN_BRIEF_REL"
      stage_paths="$stage_paths $RUN_BRIEF_REL"
    fi
  elif [ -n "$brief_file" ]; then
    td_dry "cp $brief_file $dir/docs/BRIEF.md"
  else
    td_dry "write $dir/docs/BRIEF.md (# Brief + literal text)"
  fi
  for r in ${refs[@]+"${refs[@]}"}; do
    td_dry "cp -R $r $dir/docs/reference/"
  done
  missing=""
  while IFS= read -r l; do
    present=0
    if [ -f "$dir/.gitignore" ]; then
      while IFS= read -r g; do
        [ "$g" = "$l" ] && present=1
      done < "$dir/.gitignore"
    fi
    [ "$present" -eq 1 ] || missing="$missing $l"
  done <<EOF
$IGNORE_LINES
EOF
  [ -z "$missing" ] || td_dry "append to $dir/.gitignore:$missing"
  if [ -f "$dir/docs/BRIEF.md" ] \
    && command grep -E -q '^## Orchestration \(driver directives\)$' "$dir/docs/BRIEF.md"; then
    td_dry "directives already in $dir/docs/BRIEF.md"
  else
    td_dry "append orchestrator directives ($MARKER) to $dir/docs/BRIEF.md"
  fi
  td_dry "git -C $dir add -- $stage_paths"
  td_dry "git -C $dir commit -q -m \"$COMMIT_MSG\" -- $stage_paths"
  exit 0
fi

# ---- ak: new project + kit install -----------------------------------------------
# ak_call DIR ARGS... : run ak bounded in DIR; its output goes to stderr.
ak_call() {
  local where=$1
  shift
  (cd "$where" && td_bounded "$AK_TIMEOUT_S" ak "$@") >&2
}

if [ "$mode" = fresh ]; then
  td_require ak
  mkdir -p "$parent" || td_die 3 "cannot create $parent"
  ak_call "$parent" "${ak_new_args[@]}"
  rc=$?
  [ "$rc" -eq 0 ] || td_die 3 "ak new $name failed (exit $rc)"
  [ -d "$dir" ] || td_die 3 "ak new did not create $dir"
  td_log "ak new created $dir"
  if ! ak_call "$dir" "${ak_install_args[@]}"; then
    td_log "ak kit install engineer failed; running ak self-update and retrying once"
    ak_call "$dir" self-update --channel stable --yes || td_log "ak self-update failed (exit $?)"
    ak_call "$dir" "${ak_install_args[@]}"
    rc=$?
    [ "$rc" -eq 0 ] || td_die 3 "ak kit install engineer failed twice (exit $rc)"
  fi
  td_log "engineer kit installed in $dir"
fi

# ---- git repo and build branch ---------------------------------------------------
if ! is_own_repo; then
  git -C "$dir" init -q || td_die 3 "git init failed in $dir"
fi
cur=$(git -C "$dir" symbolic-ref --short -q HEAD 2>/dev/null) || cur=""
if [ "$cur" != "$branch" ]; then
  if git -C "$dir" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
    git -C "$dir" checkout -q "$branch" || td_die 3 "cannot check out $branch in $dir"
  else
    git -C "$dir" checkout -q -b "$branch" || td_die 3 "cannot create branch $branch in $dir"
  fi
fi

# ---- brief, references, .gitignore, directives -------------------------------------
mkdir -p "$dir/docs" || td_die 3 "cannot create $dir/docs"
bf="$dir/docs/BRIEF.md"
run_brief=""
if [ -f "$bf" ]; then
  # Never replace an existing brief (it may hold intent the given text lacks).
  render_brief "$work/brief.given" || td_die 3 "cannot render the brief"
  if same_brief "$work/brief.given" "$bf"; then
    td_log "keeping the existing $bf (same as the given brief)"
  else
    cp "$work/brief.given" "$dir/$RUN_BRIEF_REL" || td_die 3 "cannot write $dir/$RUN_BRIEF_REL"
    run_brief=$RUN_BRIEF_REL
    stage_paths="$stage_paths $RUN_BRIEF_REL"
    td_log "kept the existing $bf; the given brief differs and is written alongside as $dir/$RUN_BRIEF_REL"
  fi
else
  render_brief "$bf" || td_die 3 "cannot write $bf"
fi

if [ ${#refs[@]} -gt 0 ]; then
  mkdir -p "$dir/docs/reference" || td_die 3 "cannot create $dir/docs/reference"
  for r in "${refs[@]}"; do
    cp -R "$r" "$dir/docs/reference/" || td_die 3 "cannot copy reference $r"
  done
fi

# ends_with_newline FILE : the file is empty or its last byte is a newline.
ends_with_newline() {
  [ ! -s "$1" ] || [ "$(tail -c 1 "$1" | od -An -c | tr -d ' ')" = '\n' ]
}

gi="$dir/.gitignore"
while IFS= read -r l; do
  present=0
  if [ -f "$gi" ]; then
    while IFS= read -r g; do
      [ "$g" = "$l" ] && present=1
    done < "$gi"
  fi
  [ "$present" -eq 1 ] && continue
  if [ -f "$gi" ] && ! ends_with_newline "$gi"; then
    printf '\n' >> "$gi" || td_die 3 "cannot write $gi"
  fi
  printf '%s\n' "$l" >> "$gi" || td_die 3 "cannot write $gi"
done <<EOF
$IGNORE_LINES
EOF

if command grep -E -q '^## Orchestration \(driver directives\)$' "$bf"; then
  td_log "directives already present in $bf"
else
  ends_with_newline "$bf" || printf '\n' >> "$bf" || td_die 3 "cannot write $bf"
  printf '\n' >> "$bf" || td_die 3 "cannot write $bf"
  if ! command grep -E -q '^## Orchestration \(driver directives\)$' "$directives"; then
    printf '%s\n\n' "$MARKER" >> "$bf" || td_die 3 "cannot write $bf"
  fi
  cat "$directives" >> "$bf" || td_die 3 "cannot append the directives to $bf"
  if [ -n "$run_brief" ]; then
    ends_with_newline "$bf" || printf '\n' >> "$bf"
    printf '\nAlso read `%s`: the brief given to this run (the brief above was kept as is).\n' "$run_brief" >> "$bf" \
      || td_die 3 "cannot write $bf"
  fi
  ends_with_newline "$bf" || printf '\n' >> "$bf"
  td_log "orchestrator directives appended to $bf"
fi

# ---- stage and commit the explicit paths only ---------------------------------------
add_paths=()
for p in $stage_paths; do
  [ -e "$dir/$p" ] && add_paths+=("$p")
done
git -C "$dir" add -- "${add_paths[@]}" || td_die 3 "git add failed in $dir"
commit_paths=()
for p in "${add_paths[@]}"; do
  [ -n "$(git -C "$dir" ls-files -- "$p" 2>/dev/null)" ] && commit_paths+=("$p")
done

if [ ${#commit_paths[@]} -gt 0 ] && ! git -C "$dir" diff --cached --quiet -- "${commit_paths[@]}" 2>/dev/null; then
  if ! err=$(git -C "$dir" commit -q -m "$COMMIT_MSG" -- "${commit_paths[@]}" 2>&1); then
    if [ -z "$(git -C "$dir" config user.name 2>/dev/null)" ] || [ -z "$(git -C "$dir" config user.email 2>/dev/null)" ]; then
      td_log "no git identity; committing as tdrive"
      err=$(git -C "$dir" -c user.name=tdrive -c user.email=tdrive@localhost \
        commit -q -m "$COMMIT_MSG" -- "${commit_paths[@]}" 2>&1) \
        || td_die 3 "git commit failed: $(printf '%s' "$err" | head -n 1)"
    else
      td_die 3 "git commit failed: $(printf '%s' "$err" | head -n 1)"
    fi
  fi
  td_log "committed ${commit_paths[*]} on $branch"
else
  td_log "nothing new to commit in $dir"
fi
sha=$(git -C "$dir" rev-parse --short=7 HEAD 2>/dev/null) || td_die 3 "no commit on $branch in $dir"
printf 'BOOTSTRAPPED dir=%s branch=%s commit=%s\n' "$dir" "$branch" "$sha"
exit 0
