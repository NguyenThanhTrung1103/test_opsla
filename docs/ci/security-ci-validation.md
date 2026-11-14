# GitHub CI/CD and Cloudflare Worker demo

## Current deployment

- Live URL: https://oops-la-bookstore.trungnt-mcp.workers.dev
- Successful run: https://github.com/NguyenThanhTrung1103/test_opsla/actions/runs/43609968394
- Deployed code: 4d0d0675755197c6010311ffa3a3dae4da78c192.
- Worker version: 9398843e-11c4-4e93-b6e3-0328f3745ae7.
- Worker: oops-la-bookstore. D1: oopsla-db (configured UUID unchanged).
- All five jobs passed: automation/build, credential alerts, SonarQube,
  Cloudflare target inspection and deployment/live smoke.
- Active deployment workflow is on ci/test-sonarqube-https. Main has not been
  merged and retains its historical workflow; do not dispatch main by mistake.

## Run checks or deploy

```bash
# Checks and read-only Cloudflare inspection, no deployment
gh workflow run deploy.yml --ref ci/test-sonarqube-https -f deploy=false

# Real rollout after all checks pass
gh workflow run deploy.yml --ref ci/test-sonarqube-https -f deploy=true
```

The workflow source name is CI Scan and Worker Deploy; GitHub may still show the
historical default-branch workflow name until that branch is updated.
Push to main/master with this new workflow would also deploy after checks;
PRs run automation and credential checks without Sonar/deployment credentials.
Main is not updated by running this feature-branch workflow.

Automation runs npm test once, publishes real counters in Summary and uploads
artifact automation-test-results. Current run has 84 passing tests. Bash pipefail
preserves failures when tee captures the log. Build still copies the storefront
HTML to dist/index.html. Sonar uses the existing HTTPS Tunnel to
https://test-sonarqube.trungnt.me, project Oops-La-Bookstore, selected through
SONAR_PROJECT_KEY. Scanner failures block deploy. Quality Gate ERROR remains a
warning under the owner's demo policy; unexpected statuses fail.

## Public F12 key demo

Open the live URL, press F12 -> Console, enter:

```javascript
window.DEMO_CONFIG.API_KEY
```

The HTML contains DEMO_ONLY_OOPSLA_PUBLIC_KEY_NOT_VALID, an intentionally public
fake key with no API/admin/database privileges. It is also visible in View Source
or the Network response. This exact literal is permitted only in the storefront
source and dist/index.html; the credential check still warns. A different key
value or the same literal in a different production source location fails.
The fixture tests/fixtures/security-demo remains outside deployed assets.

No real Cloudflare, SonarQube, admin or database credential is embedded in HTML.
ADMIN_SECRET_KEY is a separate random private GitHub Secret copied to the Worker
secret store; never replace it with the demo key. It was generated without
printing or saving its value locally. GitHub Secrets cannot reveal it later;
rotate it to a new private value there when admin operators need a known key.

## Secrets and target ownership

| Name | Store/use |
| --- | --- |
| CLOUDFLARE_API_TOKEN_2 | GitHub Secret, mapped to Wrangler CLOUDFLARE_API_TOKEN env |
| CLOUDFLARE_ACCOUNT_ID | GitHub Secret for the verified account |
| ADMIN_SECRET_KEY | GitHub Secret -> Worker secret, private admin authentication |
| SONAR_TOKEN | GitHub Secret -> scanner/API, whitespace trimmed and masked |
| SONAR_PROJECT_KEY | Repository variable: Oops-La-Bookstore |
| SONAR_TUNNEL_HOSTNAME | Historical secret; unused by direct HTTPS scanner |

Cloudflare token-2 now has working D1 read access. The first deployment verified
the configured D1 UUID/name in the account before creating oops-la-bookstore.
No other Workers were replaced. No remote DB migration or data write was needed.
Wrangler is pinned to 4.162.0. Sonar scanner image still uses latest.

## Proof and recovery

Artifact cloudflare-before records target URL, binding names, D1 identity and
prior deployments. The initial snapshot had newWorker=true and no prior Worker
version, so there was no earlier live bookstore to roll back to.

Both pipeline and independent read-only checks confirmed:

- GET / -> 200 and expected dummy key in HTML.
- GET /deploy-metadata.json -> exact deployed commit SHA.
- GET /api/health -> 200 and d1=connected.
- GET /api/books -> 200, four books in the existing catalog.
- GET /api/admin/orders -> 401 without authorization.
- The same admin endpoint -> 401 when using the public dummy key as Bearer.

Future code rollback to the verified version, using the same Cloudflare credentials:

```bash
npx --yes wrangler@4.162.0 rollback 9398843e-11c4-4e93-b6e3-0328f3745ae7 --message "Restore verified demo"
```

Rollback changes Worker code/bindings version, not D1 data. Healthcheck failures
must be investigated; a successful scan is not proof of full application safety.
Worker still has the previously documented client-price validation limitations;
this demo deployment is not an independent security sign-off. Deployment from
this branch does not establish main-branch protection or automatic main rollout.
