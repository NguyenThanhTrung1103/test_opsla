#!/usr/bin/env node
/**
 * OAuth 2.0 PKCE Authenticator for The Cookbook Remote MCP (ard)
 * Connects Google Antigravity to https://mcp.arealisticdreamer.com/mcp
 * Zero external dependencies - pure standard Node.js.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

const ARD_BASE = 'https://mcp.arealisticdreamer.com';
const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const TOKEN_DIR = path.join(os.homedir(), '.gemini', 'config');
const TOKEN_PATH = path.join(TOKEN_DIR, 'ard-token.json');

// Helper: Base64URL encoding
function base64UrlEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper: Generate PKCE code verifier and challenge
function generatePKCE() {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64UrlEncode(hash);
  return { codeVerifier, codeChallenge };
}

// 1. Dynamic Client Registration (RFC 7591)
async function registerClient() {
  console.log('🔄 [1/4] Đang đăng ký OAuth Client với máy chủ The Cookbook...');
  const res = await fetch(`${ARD_BASE}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Antigravity-Cookbook/1.0' },
    body: JSON.stringify({
      client_name: 'Antigravity Cookbook Client',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Đăng ký Client thất bại (${res.status}): ${errText}`);
  }

  const data = await res.json();
  console.log(`✓ Đăng ký thành công! Client ID: ${data.client_id}`);
  return data.client_id;
}

// 2. Exchange authorization code for tokens (RFC 6749 specifies application/x-www-form-urlencoded)
async function exchangeCodeForTokens(clientId, code, codeVerifier) {
  console.log('🔄 [3/4] Đang trao đổi mã xác thực để lấy Access Token...');
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code: code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier
  });

  const res = await fetch(`${ARD_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Antigravity-Cookbook/1.0'
    },
    body: params.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lấy Token thất bại (${res.status}): ${errText}`);
  }

  const tokenData = await res.json();
  return tokenData;
}

// Main Flow
async function main() {
  console.log('\n======================================================');
  console.log('  THE COOKBOOK — XÁC THỰC MCP CHO GOOGLE ANTIGRAVITY');
  console.log('======================================================\n');

  try {
    const clientId = await registerClient();
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = base64UrlEncode(crypto.randomBytes(16));

    const authUrl = `${ARD_BASE}/authorize?` + new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: 'offline_access',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state
    }).toString();

    // Start local HTTP server to receive callback
    const server = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

      if (parsedUrl.pathname === '/callback') {
        const code = parsedUrl.searchParams.get('code');
        const returnedState = parsedUrl.searchParams.get('state');
        const error = parsedUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>Lỗi xác thực: ${error}</h1><p>Vui lòng thử lại trong terminal.</p>`);
          server.close();
          process.exit(1);
          return;
        }

        if (returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Lỗi: State không khớp! Bảo mật không an toàn.</h1>');
          server.close();
          process.exit(1);
          return;
        }

        if (code) {
          try {
            const tokenData = await exchangeCodeForTokens(clientId, code, codeVerifier);

            // Save tokens to ~/.gemini/config/ard-token.json
            fs.mkdirSync(TOKEN_DIR, { recursive: true });
            const savedPayload = {
              client_id: clientId,
              token_endpoint: `${ARD_BASE}/oauth/token`,
              mcp_endpoint: `${ARD_BASE}/mcp`,
              updated_at: new Date().toISOString(),
              ...tokenData
            };
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(savedPayload, null, 2), 'utf8');

            console.log(`\n🎉 [4/4] XÁC THỰC THÀNH CÔNG!`);
            console.log(`📁 Token đã được lưu an toàn tại: ${TOKEN_PATH}`);
            console.log('✨ Từ bây giờ, Antigravity sẽ tự động kết nối và đồng bộ online từ tác giả!');

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>Xác thực thành công — The Cookbook</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 50px 20px; background: #0c0d0e; color: #f5f5f5; }
                  .card { max-width: 500px; margin: 0 auto; background: #18191b; border: 1px solid #2d3139; padding: 40px; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                  h1 { color: #10b981; margin-bottom: 12px; }
                  p { color: #9ca3af; line-height: 1.6; }
                  .tag { background: #222; color: #e5e7eb; padding: 4px 10px; border-radius: 4px; font-family: monospace; font-size: 13px; }
                </style>
              </head>
              <body>
                <div class="card">
                  <h1>✓ Xác thực thành công!</h1>
                  <p>Tài khoản của bạn đã được liên kết với <strong>Google Antigravity</strong>.</p>
                  <p>Bản quyền The Cookbook MCP hiện đã sẵn sàng đồng bộ trực tuyến.</p>
                  <p style="margin-top: 25px;"><span class="tag">Bạn có thể đóng tab này và quay lại Antigravity</span></p>
                </div>
              </body>
              </html>
            `);

            setTimeout(() => {
              server.close();
              process.exit(0);
            }, 1000);
          } catch (exchangeErr) {
            console.error('❌ Lỗi đổi token:', exchangeErr.message);
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>Lỗi: ${exchangeErr.message}</h1>`);
            server.close();
            process.exit(1);
          }
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(PORT, () => {
      console.log(`🔄 [2/4] Đang mở trình duyệt để bạn đăng nhập Email mua hàng...`);
      console.log(`🌐 Link đăng nhập trực tiếp (nếu trình duyệt không tự mở):`);
      console.log(`👉 ${authUrl}\n`);

      // Auto open browser on Windows
      const openCmd = process.platform === 'win32'
        ? `start "" "${authUrl}"`
        : process.platform === 'darwin'
        ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;

      exec(openCmd, (err) => {
        if (err) {
          console.log('ℹ️ Không thể tự mở trình duyệt. Vui lòng bấm vào liên kết ở trên.');
        }
      });
    });

    // Timeout safety: close after 5 minutes
    setTimeout(() => {
      console.log('\n⏱️ Quá thời gian chờ xác thực (5 phút). Vui lòng chạy lại khi sẵn sàng.');
      server.close();
      process.exit(0);
    }, 5 * 60 * 1000);

  } catch (err) {
    console.error('\n❌ Thất bại:', err.message);
    process.exit(1);
  }
}

main();
