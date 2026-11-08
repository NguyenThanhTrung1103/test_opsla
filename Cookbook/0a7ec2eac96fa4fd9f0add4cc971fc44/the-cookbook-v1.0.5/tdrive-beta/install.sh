#!/bin/bash
# tdrive beta installer. Copies this package into ~/.claude/:
#   scripts/tdrive, scripts/tdrive-lib/  -> ~/.claude/scripts/
#   skills/<name>/                       -> ~/.claude/skills/<name>/
#   agents/*.md                          -> ~/.claude/agents/
#
#   bash install.sh [--dry-run] [--force]
#
# - Runs preflight.sh first and refuses (exit 1) if it fails.
# - Never overwrites an existing file that differs, unless --force; without it
#   every conflict is listed with a diff summary and nothing is written.
#   With --force the old files are first backed up to
#   ~/.claude/.tdrive-backup-<stamp>/.
# - --dry-run prints what would happen and writes nothing.
# Lines: NEW|SAME|CONFLICT|WRITE|BACKUP <dest> ... ; last line:
#   INSTALL OK|DRY-RUN|REFUSED new=<n> same=<n> conflict=<n>
# Exit: 0 ok/dry-run, 1 refused (preflight or conflicts), 2 usage, 3 I/O error.
# Bash 3.2 compatible.
set -u

DRY=0
FORCE=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "install: unknown argument: $a" >&2; exit 2 ;;
  esac
done

PKG=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd) || exit 3
DEST="$HOME/.claude"

echo "== preflight"
if ! /bin/bash "$PKG/preflight.sh"; then
  echo "INSTALL REFUSED preflight failed; fix the FAIL lines above and rerun"
  exit 1
fi

# Build the list "src<TAB>dest" for every file in the package payload.
list=$(mktemp "${TMPDIR:-/tmp}/tdrive-install.XXXXXX") || exit 3
trap 'rm -f "$list"' EXIT
(
  cd "$PKG" || exit 3
  find scripts skills agents -type f ! -name .DS_Store ! -name '*.pyc' ! -path '*/__pycache__/*' | LC_ALL=C sort
) | while IFS= read -r rel; do
  printf '%s\t%s\n' "$PKG/$rel" "$DEST/$rel"
done > "$list" || exit 3

new=0; same=0; conflict=0
echo "== plan (dest=$DEST)"
while IFS="$(printf '\t')" read -r src dst; do
  if [ ! -e "$dst" ]; then
    new=$((new + 1)); echo "NEW      $dst"
  elif cmp -s "$src" "$dst"; then
    same=$((same + 1))
  else
    conflict=$((conflict + 1))
    if [ -f "$dst" ]; then
      stat=$(diff "$dst" "$src" 2>/dev/null | awk '/^</{d++} /^>/{a++} END{printf "+%d -%d lines", a, d}')
    else
      stat="dest is not a regular file"
    fi
    echo "CONFLICT $dst ($stat vs package)"
  fi
done < "$list"
echo "SAME     $same file(s) already identical"

if [ "$conflict" -gt 0 ] && [ "$FORCE" -eq 0 ]; then
  echo "INSTALL REFUSED new=$new same=$same conflict=$conflict (existing files differ; review them, then rerun with --force to back up and overwrite)"
  exit 1
fi

if [ "$DRY" -eq 1 ]; then
  echo "INSTALL DRY-RUN new=$new same=$same conflict=$conflict (nothing written)"
  exit 0
fi

stamp=$(date +%Y%m%d-%H%M%S)
backup="$DEST/.tdrive-backup-$stamp"
while IFS="$(printf '\t')" read -r src dst; do
  if [ -e "$dst" ] && cmp -s "$src" "$dst"; then continue; fi
  if [ -e "$dst" ]; then
    rel=${dst#"$DEST"/}
    mkdir -p "$(dirname "$backup/$rel")" && cp -p "$dst" "$backup/$rel" || { echo "install: backup failed for $dst" >&2; exit 3; }
    echo "BACKUP   $dst -> $backup/$rel"
  fi
  mkdir -p "$(dirname "$dst")" && cp "$src" "$dst" || { echo "install: cannot write $dst" >&2; exit 3; }
  echo "WRITE    $dst"
done < "$list"

echo "INSTALL OK new=$new same=$same conflict=$conflict"
echo "Next: restart Claude Code, then run: /drive version"
exit 0
