#!/bin/bash
# Buildflow bootstrap (experimental):
#   bootstrap.sh <dir> <brief> [--ref PATH]... [--directives FILE] [--force] [--dry-run]
# Installs Buildflow with `bash <buildflow.src>/bin/install.sh <dir>` (bounded
# 300 s) unless the dir already is a Buildflow project, then hands the dir to
# the AgentKit bootstrap in adopt mode for the shared steps: build branch,
# docs/BRIEF.md, references, .gitignore lines, the orchestrator directives and
# a commit of exactly those paths (never `git add -A`).
# Prints: BOOTSTRAPPED dir=<d> branch=<b> commit=<sha7>  (DRY lines only with --dry-run)
# Exit: 2 usage (buildflow.src unset or without bin/install.sh, bad name,
# missing brief/ref/directives file), 3 environment (install.sh or git
# failed), 5 unsafe dir (non-empty, not a Buildflow project, no --force).
set -u
TD_CMD=bootstrap
case "${BASH_SOURCE[0]}" in */*) TD_ADIR=${BASH_SOURCE[0]%/*} ;; *) TD_ADIR=. ;; esac
. "$TD_ADIR/../../core/lib/common.sh"
TD_ADIR=$(cd "$TD_ADIR" && pwd)

INSTALL_TIMEOUT_S=300
# Paths a Buildflow install owns in a project; with the top-level entries
# the install created, they are the only paths committed after an install
# into an existing repo.
KIT_PATHS=".claude buildflow .gitignore .gitattributes CLAUDE.md"
INSTALL_MSG="chore: install Buildflow for tdrive run"

usage() {
  cat <<'EOF'
usage: bootstrap.sh <dir> <brief> [--ref PATH]... [--directives FILE] [--force] [--dry-run]

Needs config buildflow.src (a Buildflow source tree with bin/install.sh; env
TDRIVE_BUILDFLOW_SRC). A missing or empty <dir> gets a new Buildflow project
(install.sh commits it); a dir that already has buildflow/bin/sign.sh and
.claude/ is adopted as is; any other non-empty dir needs --force, must be a
clean git repo, and the install's own paths are committed explicitly.
Then the AgentKit bootstrap runs in adopt mode: build branch, docs/BRIEF.md
(<brief> is @FILE, a file path or text), --ref copies under docs/reference,
.gitignore lines and the directives (the shipped Buildflow template rendered
from config unless --directives), committed by explicit paths.
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
printf '%s\n' "$name" | command grep -E -q '^[a-z0-9][a-z0-9_-]*$' \
  || td_die 2 "invalid project name: '$name' (want ^[a-z0-9][a-z0-9_-]*\$)"
case "$brief" in
  @*) [ -f "${brief#@}" ] && [ -r "${brief#@}" ] || td_die 2 "brief file not found: ${brief#@}" ;;
esac
for r in ${refs[@]+"${refs[@]}"}; do
  [ -e "$r" ] || td_die 2 "reference not found: $r"
done
if [ -n "$directives" ]; then
  [ -f "$directives" ] && [ -r "$directives" ] || td_die 2 "directives file not found: $directives"
fi
td_require git python3

rundir_args=()
if [ -n "${TDRIVE_RUN:-}" ] && [ -d "$(td_state_base)/runs/$TDRIVE_RUN" ]; then
  rundir_args=(--rundir "$(td_state_base)/runs/$TDRIVE_RUN")
fi
td_load_config --repo "$dir" ${rundir_args[@]+"${rundir_args[@]}"} || exit $?
src=$TDC_BUILDFLOW_SRC
case "$src" in "~/"*) src="$HOME/${src#"~/"}" ;; esac
[ -n "$src" ] || td_die 2 "buildflow.src is not set: point it at a Buildflow source tree (config buildflow.src or TDRIVE_BUILDFLOW_SRC)"
[ -f "$src/bin/install.sh" ] || td_die 2 "buildflow.src has no bin/install.sh: $src"
branch=$TDC_RUN_BUILD_BRANCH
[ -n "$branch" ] || td_die 2 "run.build_branch is empty"
git check-ref-format --branch "$branch" >/dev/null 2>&1 || td_die 2 "invalid run.build_branch: $branch"
# A branch named like a gate (default `build`) shares its name with that
# gate's tag once signed. tdrive reads refs/heads/<branch>; plain git warns.
case "$(td_py signing tier "$branch" 2>/dev/null)" in
  *reason=unknown-gate*|'') ;;
  *) td_log "warning: build branch '$branch' is also a Buildflow gate tag name; tdrive reads refs/heads/$branch, plain git commands warn 'refname ambiguous' (set run.build_branch to avoid it)" ;;
esac

# Mode: install (new project, or --force into a clean repo) or adopt.
install=1 adding=0
if [ -e "$dir" ] && [ ! -d "$dir" ]; then
  td_die 5 "not a directory: $dir"
elif [ -d "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
  if [ -f "$dir/buildflow/bin/sign.sh" ] && [ -d "$dir/.claude" ]; then
    install=0
  elif [ "$force" -eq 1 ]; then
    adding=1
  else
    td_die 5 "refusing to bootstrap a non-empty dir that is not a Buildflow project: $dir (pass --force)"
  fi
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/tdrive-bootstrap.XXXXXX") || td_die 3 "cannot create a temp dir"
trap 'rm -rf "$work"' EXIT

# Directives: the given file, else the shipped template rendered from config.
if [ -z "$directives" ]; then
  clause=""
  [ "$TDC_RUN_STOP_AFTER_PHASES" -gt 0 ] 2>/dev/null \
    && clause="Execute only the first $TDC_RUN_STOP_AFTER_PHASES ledger row(s), then stop and report."
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

adopt_args=("$dir" "$brief")
for r in ${refs[@]+"${refs[@]}"}; do adopt_args+=(--ref "$r"); done
adopt_args+=(--directives "$directives")
[ "$force" -eq 1 ] && adopt_args+=(--force)

# adopt : the shared AgentKit steps on a dir that now has .claude/.
adopt() {
  "${BASH:-/bin/bash}" "$TD_ADIR/../agentkit/bootstrap.sh" "${adopt_args[@]}"
}

if [ "$install" -eq 0 ]; then
  td_log "adopting the existing Buildflow project $dir"
  adopt
  exit $?
fi

if td_dry; then
  td_dry "bash $src/bin/install.sh $dir"
  [ "$adding" -eq 1 ] && td_dry "git -C $dir add -- <install paths: $KIT_PATHS + new top-level entries>" \
    && td_dry "git -C $dir commit -q -m \"$INSTALL_MSG\""
  td_dry "git -C $dir checkout -q -b $branch"
  td_dry "write $dir/docs/BRIEF.md"
  for r in ${refs[@]+"${refs[@]}"}; do td_dry "cp -R $r $dir/docs/reference/"; done
  td_dry "append to $dir/.gitignore: .env *.log .claude/hooks/.logs/"
  td_dry "append orchestrator directives (## Orchestration (driver directives)) to $dir/docs/BRIEF.md"
  td_dry "git -C $dir add -- .gitignore docs/BRIEF.md docs/reference"
  td_dry "git -C $dir commit -q -m \"chore: bootstrap project for tdrive run\" -- .gitignore docs/BRIEF.md docs/reference"
  exit 0
fi

before=""
if [ "$adding" -eq 1 ]; then
  [ -d "$dir/.git" ] || td_die 3 "--force install needs $dir to be a git repo with a clean tree (install.sh refuses otherwise)"
  before=$(ls -A "$dir") || td_die 3 "cannot list $dir"
else
  parent=${dir%/*}
  mkdir -p "${parent:-/}" || td_die 3 "cannot create ${parent:-/}"
fi

td_log "installing Buildflow from $src into $dir"
td_bounded "$INSTALL_TIMEOUT_S" "${BASH:-/bin/bash}" "$src/bin/install.sh" "$dir" < /dev/null >&2
rc=$?
[ "$rc" -eq 124 ] && td_die 3 "install.sh timed out after ${INSTALL_TIMEOUT_S}s"
[ "$rc" -eq 0 ] || td_die 3 "install.sh failed (exit $rc)"
[ -d "$dir/.claude" ] && [ -f "$dir/buildflow/bin/sign.sh" ] \
  || td_die 3 "install.sh did not produce a Buildflow project (.claude/ and buildflow/bin/sign.sh) in $dir"
git -C "$dir" rev-parse --verify --quiet HEAD >/dev/null 2>&1 || td_die 3 "install.sh left no commit in $dir"

if [ "$adding" -eq 1 ]; then
  paths=()
  after=$(ls -A "$dir") || td_die 3 "cannot list $dir"
  while IFS= read -r e; do
    case "$e" in ''|.git) continue ;; esac
    case " $KIT_PATHS " in
      *" $e "*) paths+=("$e"); continue ;;
    esac
    case "
$before
" in
      *"
$e
"*) ;;
      *) paths+=("$e") ;;
    esac
  done <<EOF
$after
EOF
  if [ ${#paths[@]} -gt 0 ]; then
    git -C "$dir" add -- "${paths[@]}" || td_die 3 "git add failed in $dir"
    if ! git -C "$dir" diff --cached --quiet -- "${paths[@]}"; then
      git -C "$dir" commit -q -m "$INSTALL_MSG" -- "${paths[@]}" >&2 || td_die 3 "git commit of the install failed in $dir"
      td_log "committed the Buildflow install: ${paths[*]}"
    fi
  fi
fi

adopt
