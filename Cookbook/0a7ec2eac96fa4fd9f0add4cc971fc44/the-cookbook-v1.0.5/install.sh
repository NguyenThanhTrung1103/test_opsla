#!/usr/bin/env bash
# The Cookbook installer: Claude Code plugin (Intent Studio + Claude-ChatGPT discussion).
# Falls back to copying the Intent Studio skill when the claude CLI is missing.
#   bash install.sh            install
#   bash install.sh --dry-run  show what would happen
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
run() { echo "+ $*"; [ $DRY = 1 ] || "$@"; }

echo "The Cookbook installer ($DIR)"
if command -v claude >/dev/null 2>&1; then
  if claude plugin marketplace list 2>/dev/null | grep -q "the-cookbook"; then
    run claude plugin marketplace update the-cookbook
  else
    run claude plugin marketplace add "$DIR"
  fi
  run claude plugin install intent-studio@the-cookbook
  echo "OK: plugin installed. Restart Claude Code, then just say what you want, e.g.:"
  echo "  \"Turn this idea into a plan: a booking app for hair salons\""
  echo "  \"Bàn với ChatGPT giúp mình: nên bán theo tháng hay một lần?\"  (needs tab-pilot; without it Claude does it itself)"
  echo "Keep this folder where it is: Claude Code reads the plugin from it ($DIR)."
else
  dest="$HOME/.claude/skills/intent-studio"
  echo "claude CLI not found: installing the Intent Studio skill only."
  if [ -d "$dest" ]; then run mv "$dest" "$dest.bak.$(date +%s)"; fi
  run mkdir -p "$HOME/.claude/skills"
  run cp -R "$DIR/intent-studio/claude-code-skill" "$dest"
  echo "OK: skill installed at $dest. In Claude Code say: \"Turn this idea into a plan: <your idea>\""
fi
echo
echo "Next (optional):"
echo "  MCP (newest recipes): claude mcp add --transport http ard https://mcp.arealisticdreamer.com/mcp"
echo "  tdrive (macOS beta):  bash tdrive-beta/preflight.sh && bash tdrive-beta/install.sh"
echo "  Claude discusses with your ChatGPT/Gemini (tab-pilot, ~10 min, needs your free Cloudflare login + loading a Chrome extension by hand):"
echo "    read tab-pilot/START-HERE-COOKBOOK.md (steps in tab-pilot/README.md). Then say e.g. \"Nhờ ChatGPT viết bài giới thiệu app\"."
