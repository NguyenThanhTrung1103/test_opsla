import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectCredentials } from '../scripts/ci/credential-alert.mjs';

test('credential alerts allow environment lookups and flag literal API/DB credentials', () => {
  assert.equal(detectCredentials('const apiKey = process.env.API_KEY;').length, 0);
  for (const input of ['const apiKey = "fake-key";', 'const password = "fake-password";', '"postgres://user:fake@localhost/db"']) {
    assert.ok(detectCredentials(input).length > 0);
  }
});

test('credential CLI warns for fixtures, rejects production leaks and redacts values', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'oopsla-credential-test-'));
  try {
    for (const path of ['src', 'dist', 'scripts/ci', 'tests/fixtures/security-demo']) {
      mkdirSync(join(sandbox, path), { recursive: true });
    }
    cpSync('scripts/ci/credential-alert.mjs', join(sandbox, 'scripts/ci/credential-alert.mjs'));
    writeFileSync(join(sandbox, 'oops_la_book_store_uxui_fixed.html'), '<html>safe</html>');
    writeFileSync(join(sandbox, 'tests/fixtures/security-demo/demo.html'), 'const apiKey = "fixture-canary";');
    const run = () => spawnSync(process.execPath, ['scripts/ci/credential-alert.mjs'], {
      cwd: sandbox, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
    });
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /::warning file=tests\/fixtures\/security-demo\/demo.html/);
    assert.ok(!result.stdout.includes('fixture-canary'));

    writeFileSync(join(sandbox, 'dist/leak.js'), 'const password = "production-canary";');
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stdout, /::error file=dist\/leak.js/);
    assert.ok(!result.stdout.includes('production-canary'));

    writeFileSync(join(sandbox, 'dist/leak.js'), 'const apiKey = process.env.API_KEY;');
    writeFileSync(join(sandbox, 'tests/fixtures/security-demo/demo.html'), '<html>no trap</html>');
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Expected security fixture credentials were not detected/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
