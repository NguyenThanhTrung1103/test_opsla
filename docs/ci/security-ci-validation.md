# Test and SonarQube pipeline

The workflow `.github/workflows/deploy.yml` runs checks only: checkout, npm ci,
automated tests, build, redacted credential alerts and SonarQube analysis.
It reuses the test/build sequence from f500804ec805b6bbddd3901987f435f4ae431e24.
Deployment, remote migrations and the former broad security workflows are removed.

## HTTPS connection

The owner selected direct HTTPS without Cloudflare Access on 2026-11-14:

GitHub runner -> https://test-sonarqube.trungnt.me -> existing Cloudflare Tunnel
-> SonarQube at 192.168.99.33:9000.

Only Actions secret `SONAR_TOKEN` is required. Repository variable
`SONAR_PROJECT_KEY=Oops-La-Bookstore` selects the owner-confirmed project key.
The owner created the project and stored SONAR_TOKEN. Existing hostname/Cloudflare
deployment secrets are unused by this workflow. No Access service token or
runner-side cloudflared process is needed. The former TCP ingress example is
historical and must not replace the working HTTP origin route.

The host is publicly reachable; SonarQube owns authentication and project access.
No credentials are embedded in workflow files or passed as scanner arguments.
[SonarScanner environment variables](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner)
provide the host URL and token. The Docker scanner retains its inherited latest tag.

## Triggers and policy

Push and pull requests to main/master run tests/build and credential checks.
Manual workflow_dispatch is available. SonarQube runs on pushes/manual execution,
never on pull requests, so PR code receives no homelab credential.

- Test/build failures fail CI.
- Credential matches in storefront HTML, src or dist fail the credential job.
- Intentional API/DB fixtures remain in tests/fixtures/security-demo and warn.
- Missing fixture detections fail the positive control.
- Diagnostics report file/line/category, never credential values.
- This narrow literal-pattern check is not a comprehensive secret scanner.
- Missing SONAR_TOKEN, endpoint/scanner/task errors fail SonarQube.
- Completed quality gate ERROR warns, preserving the requested exercise.
- Unexpected quality-gate statuses fail; OK passes.

The scanner includes src, the actual storefront HTML and the credential fixture.
Fixtures are excluded from the separate test scope to avoid double indexing.

## Run and verify

Local: npm ci, npm test, npm run build, node scripts/ci/credential-alert.mjs.
On GitHub: Actions -> Tests and SonarQube (no deploy) -> Run workflow, selecting
the branch containing this HTTPS configuration. Or:

```bash
gh workflow run deploy.yml --ref ci/test-sonarqube-https
```

Do not dispatch an older branch's deploy workflow: it can still contain deployment.
Local validation on the isolated CI branch and live run evidence are recorded in
`docs/plans/completed/2026-11-14-test-sonarqube-ci.md` in the original workspace.
A workflow run is not evidence of required branch protection.

## Recovery

Revert the CI commit on its branch. Preserve unrelated uncommitted work in the
original workspace. No remote DB migration or application deployment is involved.

## Live GitHub result (2026-11-14)

Branch ci/test-sonarqube-https, commit e9c46dd, run:
https://github.com/NguyenThanhTrung1103/test_opsla/actions/runs/43570347596

Automated tests/build and credential-alert jobs passed on GitHub. The three
intentional fixture warnings are redacted. HTTPS readiness and token normalization
passed. Scanner connected, downloaded analyzers and indexed 39 files, but server
rejected submission: not authorized to analyze test_opsla, or project does not
exist and token cannot create it. Verify the exact project key and token Execute
Analysis permission; do not infer full authorization from scanner bootstrap.
Unauthenticated project discovery returns 401. Full pipeline success and quality
gate remain unverified. No merge or deployment performed. Default main still
contains its historical deploy workflow; run this branch explicitly.

## Validated successful run

The owner confirmed project key Oops-La-Bookstore and repository variable
SONAR_PROJECT_KEY now selects it. This resolves the earlier authorization failure.
Run https://github.com/NguyenThanhTrung1103/test_opsla/actions/runs/43570712635
completed SUCCESS for all three jobs on ci/test-sonarqube-https (code de250c3).
GitHub: 83/83 tests passed; three redacted fixture warnings; Sonar ANALYSIS
SUCCESSFUL / EXECUTION SUCCESS and quality-gate reporting succeeded without a
Sonar quality-gate warning. Results:
https://test-sonarqube.trungnt.me/dashboard?id=Oops-La-Bookstore

The task plan is docs/plans/completed/2026-11-14-test-sonarqube-ci.md. Main has
not been merged; its historical workflow is not replaced by this branch run.

## Automation test visibility

The existing npm test suite was retained from the original pipeline; the old
68+ label was descriptive, not a separate suite. The verified suite now contains
83 cases. The Automation Tests and Build job runs npm test once, saves its full
output as automation-test-results/automation-tests.log, and publishes actual
runner totals/pass/fail/skipped in the Actions Summary. Missing counters are
reported as Not reported rather than a passing zero. Bash pipefail preserves
test failures through tee; report steps run even when tests fail. Credential
alerts, SonarQube, build logic and triggers are unchanged.

Verified automation-report run: 43573139293 at commit 9415058 completed SUCCESS
for Automation Tests and Build, Frontend credential alerts and SonarQube via
HTTPS. Downloaded automation-test-results artifact confirms tests=83, pass=83,
fail=0, skipped=0. Summary/upload steps succeeded. Main remains unmerged.

## Authorized live deployment and F12 demo

The owner now authorizes real deployment after automation tests, credential
checks and Sonar analysis. workflow_dispatch input deploy defaults false for
checks-only runs; set deploy=true for an actual deployment. Push to main/master
with this workflow also deploys after all required jobs. PRs never deploy.
Cloudflare preflight verifies the existing oops-la-bookstore Worker, its DB
binding, account workers.dev hostname and previous deployment metadata. Snapshot
artifact cloudflare-before supports rollback. No remote DB migration is executed.

The exact public dummy literal DEMO_ONLY_OOPSLA_PUBLIC_KEY_NOT_VALID is now allowed
only in oops_la_book_store_uxui_fixed.html and dist/index.html. It is visible via
F12 / window.DEMO_CONFIG.API_KEY and cannot authenticate to admin. This owner
exception supersedes the older fixture-only rule for this one literal/location.
All other production credential patterns still fail. Positive/negative tests
cover allowed storefront/index, forbidden src location and a changed key value.
The original credential fixture stays outside dist. Deploy smoke verifies the
demo exists, exact deployed SHA, D1 health/catalog and anonymous/demo-key admin
requests return 401. Real ADMIN_SECRET_KEY is separate and stored in Secrets.
Wrangler is pinned to 4.162.0. Code rollback uses the previous version recorded
in cloudflare-before; no D1 data changes are part of code rollback.

Deployment now reads GitHub secret CLOUDFLARE_API_TOKEN_2 (standard Wrangler env
name remains CLOUDFLARE_API_TOKEN). Initial Worker creation is supported; the
configured D1 resource is verified by ID/name before creation. Latest diagnostic
run 43609538039 could list Workers but D1 listing itself returned 401/10000.
Deployment remains blocked on token-2 D1 Read access for the target account.
No live code/data changes have been made by these checks-only runs.
