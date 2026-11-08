#!/usr/bin/env bash
# The Cookbook: set up tab-pilot (Claude Code talks to YOUR ChatGPT in YOUR Chrome) with as few clicks as possible.
# Each step checks first and skips what is already done, so it is safe to re-run after fixing anything.
#   bash setup-tab-pilot.sh               set up (or repair)
#   bash setup-tab-pilot.sh --new-token   replace a leaked token (then paste the new one in the extension options)
# What only you can do (the script stops and tells you when): log in to Cloudflare in the browser,
# load the extension in Chrome (3 clicks), paste 2 values it puts on your clipboard, be logged in to ChatGPT.
set -uo pipefail
DIR=$(cd "$(dirname "$0")" && pwd); TP="$DIR/tab-pilot"; NAME=${TP_NAME:-tab-pilot}
say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
stop() { printf '\n\033[31mSTOP:\033[0m %s\nFix that, then run again: bash setup-tab-pilot.sh\n' "$*"; exit 1; }
W()    { (cd "$TP/worker" && npx --yes wrangler "$@"); }
cd "$TP" || stop "tab-pilot/ folder not found next to this script."
[ -f .env ] && set -a && . ./.env && set +a
[ "${1:-}" = "--new-token" ] && { TAB_PILOT_TOKEN=""; echo "A new token will replace the old one."; }

say "1/7 Checking your Mac"
[ "$(uname)" = "Darwin" ] || echo "Not a Mac: the script should still work, but the Chrome/clipboard helpers are Mac-only."
[ -d "/Applications/Google Chrome.app" ] || [ "$(uname)" != "Darwin" ] || stop "Google Chrome is not installed. Get it at https://www.google.com/chrome/"
command -v node >/dev/null 2>&1 || stop "Node.js is not installed (needed once, to put your relay on Cloudflare). Install the LTS version from https://nodejs.org (or: brew install node)."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || stop "Node.js $NODE_MAJOR is too old; tab-pilot needs 18 or newer. Install the LTS version from https://nodejs.org"
command -v claude >/dev/null 2>&1 || stop "Claude Code is not installed. Run: bash setup.sh first."
echo "OK: Chrome, Node.js $NODE_MAJOR, Claude Code"
(cd worker && npm install --silent --legacy-peer-deps --no-audit --no-fund >/dev/null 2>&1) || stop "npm install failed in tab-pilot/worker (check your internet connection)."

say "2/7 Cloudflare account (free) and login"
if ! W whoami >/dev/null 2>&1; then
  echo "You need a free Cloudflare account. No account yet? Create one first: https://dash.cloudflare.com/sign-up (verify your email)."
  echo "Now a browser window opens: log in and click Allow."
  W login || stop "Cloudflare login did not finish."
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  ids=$(W whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | sort -u)
  if [ "$(printf '%s\n' "$ids" | grep -c .)" -gt 1 ]; then
    W whoami 2>/dev/null | grep -E '│'; read -rp "You have several Cloudflare accounts. Paste the Account ID to use: " CLOUDFLARE_ACCOUNT_ID
  else CLOUDFLARE_ACCOUNT_ID="$ids"; fi
fi
[ -n "$CLOUDFLARE_ACCOUNT_ID" ] || stop "Could not read your Cloudflare Account ID (run: cd tab-pilot/worker && npx wrangler whoami)."
export CLOUDFLARE_ACCOUNT_ID; echo "OK: account $CLOUDFLARE_ACCOUNT_ID"

say "3/7 Your relay on Cloudflare"
CFG=.wrangler.gen.jsonc
GEN="worker/$CFG"
sed -E "s/^  \"name\": \"[^\"]+\"/  \"name\": \"$NAME\"/; s/\"bucket_name\": \"[^\"]+\"/\"bucket_name\": \"${NAME}-files\"/" worker/wrangler.jsonc > "$GEN"
# Large-file uploads need R2, which a new Cloudflare account may have switched off. The Cookbook only sends text,
# so if R2 is not available we deploy without it (everything the Cookbook uses still works).
if [ -z "${TP_FORCE_NO_R2:-}" ] && W r2 bucket list >/dev/null 2>&1; then
  W r2 bucket create "${NAME}-files" >/dev/null 2>&1 || true
  W r2 bucket lifecycle add "${NAME}-files" expire-1d --expire-days 1 --force >/dev/null 2>&1 || true
  echo "OK: file storage on (R2)"
else
  python3 - "$GEN" <<'PY'
import re,sys; p=sys.argv[1]; s=open(p).read()
s=re.sub(r'\s*"r2_buckets":\s*\[[^\]]*\],?', '', s); open(p,'w').write(s)
PY
  echo "OK: R2 is off on this account, so the relay runs without large-file uploads (not needed for The Cookbook)"
fi
out=$(W deploy --config "$CFG" 2>&1); rc=$?
if [ $rc -ne 0 ] || ! printf '%s' "$out" | grep -qE 'https://[a-zA-Z0-9.-]+\.workers\.dev'; then
  if printf '%s' "$out" | grep -qiE 'workers\.dev subdomain|register.*subdomain|onboard'; then
    stop "Your Cloudflare account has no workers.dev address yet (normal for a new account). Open https://dash.cloudflare.com → Workers & Pages, choose a subdomain name when asked (any name), wait 1 minute."
  fi
  printf '%s\n' "$out" | tail -15; stop "Deploying the relay failed (details above)."
fi
URL=$(printf '%s' "$out" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)
echo "OK: relay $URL"

say "4/7 Access token"
[ -n "${TAB_PILOT_TOKEN:-}" ] || TAB_PILOT_TOKEN=$(openssl rand -hex 24)
printf '%s' "$TAB_PILOT_TOKEN" | W secret put TOKEN --config "$CFG" >/dev/null 2>&1 || stop "Could not save the token on Cloudflare."
( umask 077; printf 'TAB_PILOT_URL=%s\nTAB_PILOT_TOKEN=%s\nCLOUDFLARE_ACCOUNT_ID=%s\n' "$URL" "$TAB_PILOT_TOKEN" "$CLOUDFLARE_ACCOUNT_ID" > .env )
echo "OK: saved in tab-pilot/.env (treat it like a password: never share it)"
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code}' -A tab-pilot-setup "$URL/rpc" -H "authorization: Bearer $TAB_PILOT_TOKEN" -d '{"tool":"status"}' | grep -q 200 && break; sleep 10; done

status() { ./tp status 2>/dev/null | grep -q '"connected":true'; }
say "5/7 Chrome extension"
if status; then echo "OK: extension already connected"; else
  cat <<EOM
Do this in Chrome (once):
  1. In the Chrome window that opens: turn on "Developer mode" (top right of chrome://extensions).
  2. Click "Load unpacked" and choose the folder that just opened in Finder: tab-pilot/extension
  3. On the tab-pilot card click "Details" -> "Extension options".
EOM
  [ "$(uname)" = "Darwin" ] && { open -a "Google Chrome" "chrome://extensions" 2>/dev/null; open "$TP/extension"; }
  if command -v pbcopy >/dev/null; then
    printf '%s' "$URL" | pbcopy; read -rp "  4. Relay URL is on your clipboard: paste it into 'Relay URL'. Press Enter here when done... " _
    printf '%s' "$TAB_PILOT_TOKEN" | pbcopy; read -rp "  5. Token is on your clipboard now: paste it into 'Token', click 'Save & connect'. Press Enter... " _
    printf '' | pbcopy
  else
    echo "  4. Relay URL: $URL"; echo "  5. Token: the TAB_PILOT_TOKEN line in tab-pilot/.env"; read -rp "  Paste both, click 'Save & connect', then press Enter... " _
  fi
  echo "Waiting for the extension to connect..."
  for i in $(seq 1 24); do status && break; sleep 5; done
  status || stop "The extension did not connect. In its options check: Relay URL = $URL, the token has no spaces, then click 'Save & connect' again. Chrome must stay open."
  echo "OK: extension connected"
fi

say "6/7 Connect Claude Code"
if claude mcp list 2>/dev/null | grep -q "tab-pilot"; then claude mcp remove --scope user tab-pilot >/dev/null 2>&1; fi
claude mcp add --scope user --transport http tab-pilot "$URL/mcp" --header "Authorization: Bearer $TAB_PILOT_TOKEN" >/dev/null 2>&1 || stop "claude mcp add failed."
echo "OK: Claude Code knows tab-pilot (restart Claude Code to load it)"

say "7/7 Which sites are logged in (in that Chrome)"
hc=$(./tp health_check 2>/dev/null)
HC="$hc" python3 - <<'PY'
import json, os
try:
    r = json.loads(os.environ["HC"])["result"]["results"]
except Exception:
    print("TODO  could not read the check. Run later: ./tab-pilot/tp health_check"); raise SystemExit
names = {"chatgpt": "ChatGPT", "gemini": "Gemini", "substack": "Substack", "linkedin": "LinkedIn", "tiktok": "TikTok", "viblo": "Viblo"}
for x in r:
    s = x.get("site", "?"); n = names.get(s, s)
    if x.get("ok"):
        print("OK    " + n)
    elif s == "chatgpt":
        print("TODO  ChatGPT: open chatgpt.com in this same Chrome and log in")
    else:
        print("OPT   " + n + ": log in to it in this same Chrome only if you want to post there")
print('OPT   dev.to: say "kết nối dev.to" in Claude Code when you want to post there')
PY
echo "(Re-check anytime: ./tab-pilot/tp health_check)"

cat <<EOM

Done. Keep Chrome open while Claude works with ChatGPT (the Mac can't be asleep).
Restart Claude Code, then just say it, for example:
  "Bàn với ChatGPT giúp mình: app đặt lịch cho tiệm tóc nên bán theo tháng hay một lần?"
  "Tạo Intent Studio trên ChatGPT cho mình"
  "Đăng bài này lên LinkedIn"  /  "Cross-post bài này sang Substack và LinkedIn"
Posting: Claude always shows you a draft and waits for your yes. Public posts also need "Allow publishing" ticked in the
extension options (off by default). Turn it on when you want to post, off again when you are done.
EOM
