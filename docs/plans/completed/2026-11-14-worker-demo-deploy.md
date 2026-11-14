# Worker deployment with public demo key

## Status

Completed

## Outcome and authority

Owner requests a real Cloudflare Worker deployment through GitHub Actions with
automation tests, Sonar scanning and an API key visible in HTML/F12 for a demo.
Only the literal DEMO_ONLY_OOPSLA_PUBLIC_KEY_NOT_VALID may be public in the
storefront and built index. It has no service, admin or database privileges.
Real Cloudflare/Sonar/admin credentials remain server-side/GitHub Secrets.

## Approach

Work on isolated ci/test-sonarqube-https, preserving original dirty workspace.
Add the demo literal and narrow warning exception, validate positive/negative
cases, retain tests/scan/report jobs, inspect Cloudflare target and rollback
metadata using Actions credentials, then deploy oops-la-bookstore on explicit
dispatch. Verify live HTML, health, catalog and unauthenticated admin rejection.
No destructive DB migration or main-branch merge is included.

## Risks and recovery

Local Wrangler OAuth returns 403; use existing Actions secrets for account reads.
Record prior Worker deployment version before mutation and retain snapshot.
Do not overwrite unknown remote bindings or migrate an existing database blindly.
Rollback Worker code to the recorded version if smoke fails; DB not mutated.
Quality Gate findings remain warnings as requested previously; scan execution
errors and unexpected production credential matches still block deployment.

## Progress

- [x] Implement and validate narrow demo exception and deployment workflow.
- [x] Verify account, Worker, bindings and prior deployment version.
- [x] Deploy after tests/scans and verify through public endpoints.
- [x] Record final evidence, URL, rollback and residual risks.

## Execution evidence

Local npm test 84/84 passed; build passed; credential check reported three
fixture warnings, two approved dummy-key warnings and zero unexpected production
hits. New test proves wrong location/value still fails the exception boundary.
Actionlint passed. Run 43607827022 passed all three existing scan/test jobs but
preflight hit D1 metadata API 401/10000. No deployment occurred. e9d2645 verifies
binding ID plus existing Worker /api/health instead of requiring D1 admin API.
Run 43608099248 is checks-only. Generated a private random ADMIN_SECRET_KEY into
GitHub Secrets without printing/storing it locally; deployment will replace the
old Worker admin credential with this private value, never the public demo key.

## Token-2 continuation

Owner created CLOUDFLARE_API_TOKEN_2. Updated workflow to bind it to the standard
CLOUDFLARE_API_TOKEN environment variable in both preflight and deployment jobs.
Run 43609407345 still received D1 resource API 401/10000. Diagnostic run
43609538039 confirms even GET /accounts/{account}/d1/database fails 401/10000,
while listing Workers succeeds. This is a D1-access blocker, not merely a missing
configured DB ID. No deployment/migration occurred. Existing configured Worker
is absent; preflight now handles initial creation and requires database identity
verification before deploy. New Worker has no prior Worker version to rollback.
Need owner to add Account > D1 > Read to token-2 for the same target account,
or update token-2 with a new appropriately scoped token. Never request values.

## Final result — 2026-11-14

Owner updated token-2 D1 permission. Run 43609968394 at code 4d0d067 completed
SUCCESS for all five jobs, including real deploy and live smoke. New Worker:
https://oops-la-bookstore.trungnt-mcp.workers.dev in the verified account;
D1 oopsla-db UUID 3c078acc-b184-480b-81c4-58bc7b1c73c5 was confirmed. New Worker
snapshot had no prior deployment. Version 9398843e-11c4-4e93-b6e3-0328f3745ae7
is now the verified recovery version for future rollouts. No DB migration.
Independent public checks: / 200 with fake key; metadata SHA exactly 4d0d0675755197c6010311ffa3a3dae4da78c192;
health D1 connected; books count 4; admin 401 for anonymous and demo-key requests.
Automation suite 84 pass. Main unmerged; existing original worktree edits preserved.
Known application validation limits remain; no independent security approval claimed.
