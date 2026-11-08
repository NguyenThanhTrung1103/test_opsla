# 200Lab MCP Connection & Authentication Verification

## 1. Environment Support Matrix

The skills in this collection operate on both **Antigravity CLI (Agy CLI)** and **OpenAI Codex CLI**.

### A. OpenAI Codex CLI Setup
Codex stores MCP configurations in `~/.codex/config.toml` and encrypted OAuth secrets in `~/.codex/secrets/mcp_oauth.age`.

1. **Check registration**:
   ```bash
   codex mcp list
   ```
   *Expected Output:*
   ```text
   Name             Url                                Status   Auth
   200lab-ai-tutor  https://mcp.200lab.io/mcp/learner  enabled  OAuth
   ```

2. **Add & Authorize (if missing)**:
   ```bash
   codex mcp add 200lab-ai-tutor --url https://mcp.200lab.io/mcp/learner
   ```
   *Follow the browser link to log in at 200lab.io and accept OAuth authorization.*

### B. Antigravity CLI (Agy CLI) Setup
Antigravity supports HTTP/SSE MCP servers through its configuration file:
- Global: `~/.gemini/config/mcp_config.json`
- Project: `.agents/mcp_config.json`

Configuration format:
```json
{
  "mcpServers": {
    "200lab-ai-tutor": {
      "url": "https://mcp.200lab.io/mcp/learner"
    }
  }
}
```

---

## 2. Connection Probe Verification Sequence

Before executing an audit skill:
1. **HTTP Probe**: Check if `https://mcp.200lab.io/mcp/learner` responds to an HTTP POST (JSON-RPC `tools/list` or `ping`).
2. **Auth Verification**:
   - In Codex: Check if `200lab-ai-tutor` shows `enabled` in `codex mcp list`.
   - If HTTP 401 is returned: Direct user to re-run OAuth login.
3. **Tool Listing**: Confirm presence of `skill_find`, `skill_get`, or `ai_tutor`.
