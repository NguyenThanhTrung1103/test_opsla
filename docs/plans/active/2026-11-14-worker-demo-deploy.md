# Worker deployment with public demo key

## Status

Active

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

- [ ] Implement and validate narrow demo exception and deployment workflow.
- [ ] Verify account, Worker, bindings and prior deployment version.
- [ ] Deploy after tests/scans and verify through public endpoints.
- [ ] Record final evidence, URL, rollback and residual risks.
