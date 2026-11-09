import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

describe('Server Startup Fail-Closed Verification', () => {
  test('refuses to start when ADMIN_SECRET_KEY is not configured', async () => {
    const tempStorage = path.join(os.tmpdir(), `oopsla-storage-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      STORAGE_FILE: tempStorage,
    };
    delete env.ADMIN_SECRET_KEY;

    const child = spawn(process.execPath, ['--experimental-strip-types', 'src/server/app.ts'], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Server startup process timed out after 10s. stdout: ${stdout}, stderr: ${stderr}`));
      }, 10000);

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    assert.equal(exitCode, 1, `Expected exit code 1, got ${exitCode}. stdout: ${stdout}, stderr: ${stderr}`);
    assert.ok(
      stderr.includes('ADMIN_SECRET_KEY is not configured'),
      `Expected stderr to contain 'ADMIN_SECRET_KEY is not configured', got: ${stderr}`
    );
  });
});
