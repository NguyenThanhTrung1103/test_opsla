# Test and SonarQube pipeline

The workflow `.github/workflows/deploy.yml` runs checks only: checkout, npm ci,
automated tests, build, redacted credential alerts and SonarQube analysis.
It reuses the test/build sequence from f500804ec805b6bbddd3901987f435f4ae431e24.
Deployment, remote migrations and the former broad security workflows are removed.

## HTTPS connection

The owner selected direct HTTPS without Cloudflare Access on 2026-11-14:

GitHub runner -> https://test-sonarqube.trungnt.me -> existing Cloudflare Tunnel
-> SonarQube at 192.168.99.33:9000.

Only Actions secret `SONAR_TOKEN` is required. Optional repository variable
`SONAR_PROJECT_KEY` overrides the default `test_opsla` (repository name).
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
`docs/plans/active/2026-11-14-test-sonarqube-ci.md` in the original workspace.
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
