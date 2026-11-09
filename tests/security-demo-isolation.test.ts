import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function getFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Security Demo Isolation & Leak Guards', () => {
  const rootDir = process.cwd();

  test('production HTML template does NOT contain leaked credentials or APP_CONFIG', () => {
    const htmlPath = path.join(rootDir, 'oops_la_book_store_uxui_fixed.html');
    assert.ok(fs.existsSync(htmlPath), 'oops_la_book_store_uxui_fixed.html must exist');
    const content = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(!content.includes('APP_CONFIG'), 'HTML template must not contain APP_CONFIG');
    assert.ok(!content.includes('PAYMENT_GATEWAY_SECRET'), 'HTML template must not contain PAYMENT_GATEWAY_SECRET');
    assert.ok(!content.includes('SuperSecretPass123'), 'HTML template must not contain SuperSecretPass123');
  });

  test('no production source or deploy workflow contains public fallback admin secret', () => {
    const forbiddenPattern = 'oopsla-secret-admin-key-change-in-prod';
    const deployWorkflowPath = path.join(rootDir, '.github/workflows/deploy.yml');
    assert.ok(fs.existsSync(deployWorkflowPath), 'deploy.yml must exist');
    const deployContent = fs.readFileSync(deployWorkflowPath, 'utf8');
    assert.ok(
      !deployContent.includes(forbiddenPattern),
      `deploy.yml must not contain ${forbiddenPattern}`
    );

    const srcFiles = getFilesRecursively(path.join(rootDir, 'src'));
    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(
        !content.includes(forbiddenPattern),
        `Source file ${path.relative(rootDir, filePath)} must not contain ${forbiddenPattern}`
      );
    }
  });

  test('security demo fixture exists in test fixtures and contains APP_CONFIG', () => {
    const fixturePath = path.join(rootDir, 'tests/fixtures/security-demo/app-config-leak.html');
    assert.ok(fs.existsSync(fixturePath), 'Fixture app-config-leak.html must exist');
    const content = fs.readFileSync(fixturePath, 'utf8');
    assert.ok(content.includes('APP_CONFIG'), 'Fixture must contain APP_CONFIG for security scanner detection');
    assert.ok(content.includes('PAYMENT_GATEWAY_SECRET'), 'Fixture must contain PAYMENT_GATEWAY_SECRET');
    assert.ok(content.includes('SuperSecretPass123'), 'Fixture must contain SuperSecretPass123');
  });
});
