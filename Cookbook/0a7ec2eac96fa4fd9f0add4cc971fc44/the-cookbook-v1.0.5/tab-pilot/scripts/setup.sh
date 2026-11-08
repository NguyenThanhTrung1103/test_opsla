#!/usr/bin/env bash
# tab-pilot setup: deploys YOUR relay to YOUR Cloudflare account and writes .env.
# Re-runnable (keeps the existing token unless --new-token).
#   ./scripts/setup.sh [--name tab-pilot] [--new-token]
# Needs: Node 18+, a Cloudflare account (free plan is fine), `npx wrangler login` done once.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; cd "$root"
NAME=tab-pilot; NEW_TOKEN=0
while [[ $# -gt 0 ]]; do case "$1" in --name) NAME="$2"; shift 2;; --new-token) NEW_TOKEN=1; shift;; *) echo "unknown arg $1"; exit 1;; esac; done
[[ -f .env ]] && set -a && . ./.env && set +a

say(){ printf '\n\033[1m== %s\033[0m\n' "$*"; }
W(){ (cd worker && npx --yes wrangler "$@"); }

say "1/6 dependencies"
(cd worker && { command -v pnpm >/dev/null && pnpm install --silent || npm install --silent; })

say "2/6 Cloudflare login"
if ! W whoami >/dev/null 2>&1; then echo "Not logged in. Run:  cd worker && npx wrangler login   then re-run this script."; exit 1; fi
if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  ids=$(W whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | sort -u)
  if [[ $(echo "$ids" | wc -l) -gt 1 ]]; then
    W whoami 2>/dev/null | grep -E '│' ; echo; read -rp "Several accounts. Paste the Account ID to use: " CLOUDFLARE_ACCOUNT_ID
  else CLOUDFLARE_ACCOUNT_ID="$ids"; fi
fi
export CLOUDFLARE_ACCOUNT_ID; echo "account: $CLOUDFLARE_ACCOUNT_ID"

say "3/6 file storage (R2 bucket ${NAME}-files, objects auto-delete after 1 day)"
W r2 bucket create "${NAME}-files" 2>&1 | grep -viE "would you like|fallback" || true
W r2 bucket lifecycle add "${NAME}-files" expire-1d --expire-days 1 --force >/dev/null 2>&1 || true

say "4/6 deploy relay worker '$NAME'"
sed -E "s/^  \"name\": \"[^\"]+\"/  \"name\": \"$NAME\"/; s/\"bucket_name\": \"[^\"]+\"/\"bucket_name\": \"${NAME}-files\"/" worker/wrangler.jsonc > worker/.wrangler.gen.jsonc
out=$(W deploy --config .wrangler.gen.jsonc 2>&1) || { echo "$out"; exit 1; }
URL=$(echo "$out" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)
[[ -n "$URL" ]] || { echo "$out"; echo "could not read worker URL"; exit 1; }
echo "relay: $URL"

say "5/6 access token"
if [[ $NEW_TOKEN == 1 || -z "${TAB_PILOT_TOKEN:-}" ]]; then TAB_PILOT_TOKEN=$(openssl rand -hex 24); fi
printf '%s' "$TAB_PILOT_TOKEN" | W secret put TOKEN --config .wrangler.gen.jsonc >/dev/null
umask 077; printf 'TAB_PILOT_URL=%s\nTAB_PILOT_TOKEN=%s\nCLOUDFLARE_ACCOUNT_ID=%s\n' "$URL" "$TAB_PILOT_TOKEN" "$CLOUDFLARE_ACCOUNT_ID" > .env
echo "saved to .env (keep it private — anyone with the token controls your logged-in browser)"

say "6/6 check"
sleep 4
curl -s -A tab-pilot-setup "$URL/rpc" -H "authorization: Bearer $TAB_PILOT_TOKEN" -d '{"tool":"status"}'; echo
cat <<EOM

Done. Next:
  1. Chrome → chrome://extensions → Developer mode → Load unpacked → $root/extension
  2. Extension options: Relay URL = $URL   Token = (TAB_PILOT_TOKEN in .env)
  3. Claude Code:  claude mcp add --scope user --transport http tab-pilot $URL/mcp --header "Authorization: Bearer \$TAB_PILOT_TOKEN"
  4. Test:  ./tp status   then   ./tp health_check
EOM
