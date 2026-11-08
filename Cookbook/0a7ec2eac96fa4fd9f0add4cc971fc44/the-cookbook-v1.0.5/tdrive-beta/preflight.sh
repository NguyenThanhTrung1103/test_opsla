#!/bin/bash
# tdrive beta preflight. Read-only: installs nothing, needs no sudo.
#   bash preflight.sh [target-repo-dir]
# One line per check: OK|FAIL|WARN <item> <detail> [fix: <hint>]
# Last line: PREFLIGHT PASS|FAIL fails=<n> warns=<n>   (exit 0 pass, 1 fail)
# Bash 3.2 compatible.
set -u

TARGET=${1:-}
fails=0
warns=0

ok()   { echo "OK   $1 $2"; }
fail() { echo "FAIL $1 $2${3:+  fix: $3}"; fails=$((fails + 1)); }
warn() { echo "WARN $1 $2${3:+  fix: $3}"; warns=$((warns + 1)); }
have() { command -v "$1" >/dev/null 2>&1; }

# 1. macOS
os=$(uname -s 2>/dev/null)
if [ "$os" = Darwin ]; then
  ok macos "$(sw_vers -productVersion 2>/dev/null || echo Darwin)"
else
  fail macos "uname=$os; macOS only for this beta" "run on a Mac"
fi

# 2. bash >= 3.2 (the bash running this script; tdrive is run with bash too)
bmaj=${BASH_VERSINFO[0]:-0}
bmin=${BASH_VERSINFO[1]:-0}
if [ "$bmaj" -gt 3 ] || { [ "$bmaj" -eq 3 ] && [ "$bmin" -ge 2 ]; }; then
  ok bash "$BASH_VERSION"
else
  fail bash "version ${BASH_VERSION:-unknown} < 3.2" "use /bin/bash"
fi

# 3. python3 >= 3.8 (stdlib only)
if have python3; then
  pyv=$(python3 -I -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>/dev/null)
  if [ -z "$pyv" ]; then
    fail python3 "present but does not run" "xcode-select --install  or  brew install python"
  elif python3 -I -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null; then
    ok python3 "$pyv"
  else
    fail python3 "$pyv < 3.8" "brew install python"
  fi
else
  fail python3 "not on PATH" "xcode-select --install  or  brew install python"
fi

# 4. git
if have git; then
  ok git "$(git --version 2>/dev/null | awk '{print $3}')"
else
  fail git "not on PATH" "xcode-select --install  or  brew install git"
fi

# 5. tmux
if have tmux; then
  ok tmux "$(tmux -V 2>/dev/null)"
else
  fail tmux "not on PATH (the engine runs inside a tmux session)" "brew install tmux"
fi

# 6. claude CLI (Claude Code)
if have claude; then
  cv=$(claude --version 2>/dev/null | head -n 1)
  ok claude "${cv:-version unknown} ($(command -v claude))"
else
  fail claude "Claude Code CLI not on PATH" "install Claude Code (see its official docs), then run claude once to log in"
fi

# 7. caffeinate (keep the Mac awake during overnight runs)
if have caffeinate; then
  ok caffeinate "$(command -v caffeinate)"
else
  fail caffeinate "not on PATH (ships with macOS)" "check /usr/bin is on PATH"
fi

# 8. free disk in $HOME
kb=$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
case "$kb" in
  ''|*[!0-9]*) warn disk "cannot read free space for $HOME" ;;
  *)
    gb=$((kb / 1024 / 1024))
    if [ "$gb" -ge 10 ]; then
      ok disk "free=${gb}GB in $HOME"
    else
      warn disk "free=${gb}GB in $HOME (< 10GB; tdrive pauses the build when disk runs low)" "free some space before an overnight run"
    fi ;;
esac

# 9. engine: AgentKit (ak) or Buildflow
engines=""
if have ak; then
  engines="agentkit"
  ok agentkit "$(ak --version 2>/dev/null | head -n 1) ($(command -v ak))"
fi
bf=""
if [ -d "$HOME/.buildflow/kit" ]; then bf="$HOME/.buildflow/kit"; fi
if [ -z "$bf" ] && [ -n "$TARGET" ] && [ -d "$TARGET/buildflow" ]; then bf="$TARGET/buildflow"; fi
if [ -n "$bf" ]; then
  engines="${engines:+$engines,}buildflow"
  ok buildflow "found $bf (experimental: needs --experimental-buildflow)"
fi
if [ -z "$engines" ]; then
  warn engine "neither AgentKit nor Buildflow found" \
    "/drive agentkit needs the 'ak' CLI on PATH (plus claude); /drive buildflow needs ~/.buildflow/kit or a buildflow/ dir in the target repo (pass it: bash preflight.sh <repo>)"
fi

# 10. docker (optional)
if have docker; then
  ok docker "$(docker --version 2>/dev/null | head -n 1) (optional)"
else
  warn docker "not found (optional: only used to report and clean docker build cache)"
fi

if [ "$fails" -eq 0 ]; then
  echo "PREFLIGHT PASS fails=$fails warns=$warns"
  exit 0
fi
echo "PREFLIGHT FAIL fails=$fails warns=$warns"
exit 1
