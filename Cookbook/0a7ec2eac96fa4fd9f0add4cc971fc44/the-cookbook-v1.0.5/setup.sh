#!/usr/bin/env bash
# The Cookbook one-shot setup: everything a script can do, then a short report of what's left for you.
# Safe to re-run (each step skips what is already done).
#   bash setup.sh            set up
#   bash setup.sh --dry-run  show what would happen, change nothing
set -uo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
MCP_URL="https://mcp.arealisticdreamer.com/mcp"
OK=(); TODO=(); OPT=()
say() { printf '%s\n' "$*"; }

say "== The Cookbook setup ($DIR)"

# 1. Claude Code plugin (Intent Studio + Claude-ChatGPT discussion)
if command -v claude >/dev/null 2>&1; then
  if [ $DRY = 1 ]; then bash "$DIR/install.sh" --dry-run >/dev/null; OK+=("plugin: would install intent-studio@the-cookbook")
  elif bash "$DIR/install.sh" >/tmp/cookbook-install.log 2>&1; then OK+=("plugin intent-studio installed (folder: $DIR, keep it here)")
  else TODO+=("plugin install failed: see /tmp/cookbook-install.log"); fi
else
  TODO+=("Claude Code is not installed: https://docs.claude.com/en/docs/claude-code then run: bash setup.sh again")
fi

# 2. ARD MCP (newest recipes, buyer-only)
if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -q "$MCP_URL"; then OK+=("MCP 'ard' already added")
  elif [ $DRY = 1 ]; then OK+=("MCP: would add 'ard' ($MCP_URL)")
  elif claude mcp add --scope user --transport http ard "$MCP_URL" >/dev/null 2>&1; then OK+=("MCP 'ard' added")
  else TODO+=("MCP add failed: claude mcp add --scope user --transport http ard $MCP_URL"); fi
  TODO+=("MCP login (once): in Claude Code type /mcp, pick 'ard', Authenticate, sign in with your purchase email")
fi

# 3. tdrive beta (macOS only)
if [ "$(uname)" = "Darwin" ]; then
  if bash "$DIR/tdrive-beta/preflight.sh" >/tmp/cookbook-preflight.log 2>&1; then
    while IFS= read -r w; do OPT+=("tdrive warning: $w"); done < <(grep -E '^WARN' /tmp/cookbook-preflight.log | head -3)
    if [ $DRY = 1 ]; then OK+=("tdrive: preflight OK, would install")
    elif bash "$DIR/tdrive-beta/install.sh" >/tmp/cookbook-tdrive.log 2>&1; then OK+=("tdrive installed (/drive in Claude Code)")
    else TODO+=("tdrive install stopped: see /tmp/cookbook-tdrive.log (an existing file differs? re-run: bash tdrive-beta/install.sh --force, it backs up first)"); fi
  else
    TODO+=("tdrive needs: $(grep -E 'FAIL' /tmp/cookbook-preflight.log | sed -E 's/^[^A-Za-z]*FAIL:? *//' | head -4 | paste -sd ';' -) (full list: /tmp/cookbook-preflight.log)")
  fi
else
  OPT+=("tdrive skipped: macOS only. Intent Studio and the recipes work on any OS")
fi

# 4. tab-pilot (optional): detect only
if command -v claude >/dev/null 2>&1 && claude mcp list 2>/dev/null | grep -q "tab-pilot"; then
  OK+=("tab-pilot connected: say \"tạo Intent Studio trên ChatGPT cho mình\" and Claude creates the ChatGPT Project for you")
else
  OPT+=("tab-pilot (advanced, ~10 min): lets Claude discuss with your ChatGPT and set up the ChatGPT Project for you. Run: bash setup-tab-pilot.sh (it walks you through every click)")
fi

say ""; say "== Report"
for x in ${OK[@]+"${OK[@]}"};   do say "OK    $x"; done
for x in ${TODO[@]+"${TODO[@]}"}; do say "TODO  $x"; done
for x in ${OPT[@]+"${OPT[@]}"};  do say "OPT   $x"; done
say ""
say "Then restart Claude Code and just say what you want, e.g. \"Turn this idea into a plan: a booking app for hair salons\""
