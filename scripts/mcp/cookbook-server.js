#!/usr/bin/env node
/**
 * Native Hybrid MCP Server for The Cookbook
 * Zero-dependency, pure Node.js stdio MCP Server running directly inside Antigravity.
 * Exposes all official Cookbook recipes, workbooks, decisions, traps, and guides.
 * Supports:
 * - Online Live Sync via OAuth Bearer token (~/.gemini/config/ard-token.json)
 * - Automatic Token Refresh (offline_access)
 * - 100% Offline Fallback from local Cookbook files
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to local Cookbook base
const COOKBOOK_ROOT = path.resolve(__dirname, '../../Cookbook/0a7ec2eac96fa4fd9f0add4cc971fc44/the-cookbook-v1.0.5');
const RECIPES_DIR = path.join(COOKBOOK_ROOT, 'recipes');
const DOMAIN_FILE = path.join(COOKBOOK_ROOT, 'DOMAIN.md');
const GUIDE_DIR = path.join(COOKBOOK_ROOT, 'guide');

// Path to saved OAuth tokens
const TOKEN_PATH = path.join(os.homedir(), '.gemini', 'config', 'ard-token.json');
const ARD_BASE = 'https://mcp.arealisticdreamer.com';

const TOOLS = [
  {
    name: 'cookbook_list_recipes',
    description: 'Liệt kê danh mục tất cả 6 công thức chính thức của The Cookbook kèm tóm tắt và mức độ rủi ro.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'cookbook_get_recipe',
    description: 'Đọc toàn văn một workbook công thức trong The Cookbook (Decisions, Traps, Guarantees, Tests). Tự động lấy bản online mới nhất nếu đã xác thực OAuth.',
    inputSchema: {
      type: 'object',
      properties: {
        recipe_name: {
          type: 'string',
          description: 'Tên công thức: auth-roles, booking, crm, documents, email, hoặc payments',
          enum: ['auth-roles', 'booking', 'crm', 'documents', 'email', 'payments']
        }
      },
      required: ['recipe_name']
    }
  },
  {
    name: 'cookbook_search',
    description: 'Tìm kiếm từ khóa trên toàn bộ công thức và tài liệu hướng dẫn The Cookbook.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Từ khóa tìm kiếm (ví dụ: "chuyển khoản", "cọc", "phân quyền", "hủy đơn", "booking")'
        }
      },
      required: ['keyword']
    }
  }
];

// Helper: Refresh access token if expired
async function getValidToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    if (!data.access_token) return null;

    // Check if token needs refresh (if updated_at exists and token is > 50 mins old)
    const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    const isExpired = Date.now() - updatedAt > 50 * 60 * 1000;

    if (isExpired && data.refresh_token && data.client_id) {
      try {
        const refreshParams = new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: data.client_id,
          refresh_token: data.refresh_token
        });

        const refreshRes = await fetch(`${ARD_BASE}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: refreshParams.toString()
        });

        if (refreshRes.ok) {
          const freshData = await refreshRes.json();
          const updated = {
            ...data,
            ...freshData,
            updated_at: new Date().toISOString()
          };
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2), 'utf8');
          return updated.access_token;
        }
      } catch (err) {
        // Fallback to current access_token
      }
    }

    return data.access_token;
  } catch (e) {
    return null;
  }
}

// 1. List Recipes
function handleListRecipes() {
  if (fs.existsSync(DOMAIN_FILE)) {
    return fs.readFileSync(DOMAIN_FILE, 'utf8');
  }

  const files = fs.readdirSync(RECIPES_DIR).filter(f => f.endsWith('.workbook.md'));
  return 'Danh mục công thức có sẵn:\n' + files.map(f => `- ${f.replace('.workbook.md', '')}`).join('\n');
}

// 2. Get Recipe (Hybrid: Cloud online first, local fallback)
async function handleGetRecipe(recipeName) {
  const cleanName = recipeName.replace('.workbook.md', '').replace('.md', '');
  const token = await getValidToken();

  // Try Online fetch if token exists
  if (token) {
    try {
      const res = await fetch(`${ARD_BASE}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'get_recipe',
            arguments: { recipe: cleanName }
          }
        })
      });

      if (res.ok) {
        const cloudData = await res.json();
        const textContent = cloudData.result?.content?.[0]?.text;
        if (textContent) {
          return `[NGUỒN: CLOUD ONLINE (The Cookbook Live)]\n\n` + textContent;
        }
      }
    } catch (netErr) {
      // Offline fallback silently
    }
  }

  // Fallback to local files
  const filePath = path.join(RECIPES_DIR, `${cleanName}.workbook.md`);
  if (!fs.existsSync(filePath)) {
    return `LỖI: Không tìm thấy công thức "${recipeName}". Các công thức hợp lệ gồm: auth-roles, booking, crm, documents, email, payments.`;
  }

  return `[NGUỒN: LOCAL REPO (The Cookbook v1.0.5)]\n\n` + fs.readFileSync(filePath, 'utf8');
}

// 3. Search
function handleSearch(keyword) {
  const results = [];
  const q = keyword.toLowerCase();

  // Search in recipes
  if (fs.existsSync(RECIPES_DIR)) {
    const files = fs.readdirSync(RECIPES_DIR).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(RECIPES_DIR, f), 'utf8');
      if (content.toLowerCase().includes(q)) {
        const idx = content.toLowerCase().indexOf(q);
        const snippet = content.slice(Math.max(0, idx - 100), Math.min(content.length, idx + 200)).replace(/\n+/g, ' ');
        results.push(`[recipes/${f}]: "...${snippet}..."`);
      }
    }
  }

  // Search in guide
  if (fs.existsSync(GUIDE_DIR)) {
    const guideFiles = fs.readdirSync(GUIDE_DIR).filter(f => f.endsWith('.md'));
    for (const f of guideFiles) {
      const content = fs.readFileSync(path.join(GUIDE_DIR, f), 'utf8');
      if (content.toLowerCase().includes(q)) {
        const idx = content.toLowerCase().indexOf(q);
        const snippet = content.slice(Math.max(0, idx - 100), Math.min(content.length, idx + 200)).replace(/\n+/g, ' ');
        results.push(`[guide/${f}]: "...${snippet}..."`);
      }
    }
  }

  if (results.length === 0) {
    return `Không tìm thấy kết quả nào phù hợp với từ khóa "${keyword}" trong The Cookbook.`;
  }

  return `Tìm thấy ${results.length} kết quả cho "${keyword}":\n\n` + results.join('\n\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line || !line.trim()) return;

  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;

    if (method === 'initialize') {
      const res = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'cookbook-mcp', version: '1.1.0' }
        }
      };
      process.stdout.write(JSON.stringify(res) + '\n');
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'tools/list') {
      const res = {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      };
      process.stdout.write(JSON.stringify(res) + '\n');
      return;
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      let resultText = '';

      if (name === 'cookbook_list_recipes') {
        resultText = handleListRecipes();
      } else if (name === 'cookbook_get_recipe') {
        resultText = await handleGetRecipe(args?.recipe_name || '');
      } else if (name === 'cookbook_search') {
        resultText = handleSearch(args?.keyword || '');
      } else {
        resultText = `LỖI: Tool không tồn tại "${name}".`;
      }

      const res = {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: resultText }]
        }
      };
      process.stdout.write(JSON.stringify(res) + '\n');
      return;
    }

    if (id !== undefined) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {}
      }) + '\n');
    }
  } catch (err) {
    // Ignore parse errors on ping lines
  }
});
