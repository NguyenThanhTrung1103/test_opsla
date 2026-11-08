#!/usr/bin/env bash
# redeploy the relay after code changes (uses .env from setup.sh; worker name = first arg or "tab-pilot")
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; cd "$root"; set -a; . ./.env; set +a
NAME="${1:-tab-pilot}"
sed -E "s/^  \"name\": \"[^\"]+\"/  \"name\": \"$NAME\"/; s/\"bucket_name\": \"[^\"]+\"/\"bucket_name\": \"${NAME}-files\"/" worker/wrangler.jsonc > worker/.wrangler.gen.jsonc
VARS=(); [[ "${TAB_PILOT_DEV:-0}" == 1 ]] && VARS=(--var DEV_TOOLS:1)   # owner sees dev tools
cd worker && npx tsc --noEmit && npx wrangler deploy --config .wrangler.gen.jsonc ${VARS[@]+"${VARS[@]}"} 2>&1 | grep -E "Uploaded|https://|rror"
