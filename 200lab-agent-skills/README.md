# 200Lab Agent Skills Collection

A suite of 8 standardized, modular Agent Skills designed to audit, evaluate, and visualize software architectures using **200Lab MCP Server** (`https://mcp.200lab.io/mcp/learner`).

Compatible with both **Antigravity CLI (Agy CLI)** and **OpenAI Codex CLI**.

---

## 1. Capability & Provenance Matrix

| Skill | Trigger Command | Upstream 200Lab Capability | Integration Status | Role / Output |
| :--- | :--- | :--- | :--- | :--- |
| **`200lab-system-design`** | `/200lab-system-design` <br/> `$200lab-system-design` | `skill_find`, `skill_get`, `ai_tutor` | **VERIFIED** | System Design Audit Report (Modularity, Caching, DB, SPOF). |
| **`200lab-backend-reliability`** | `/200lab-backend-reliability` <br/> `$200lab-backend-reliability` | `skill_find`, `skill_get`, `ai_tutor` | **VERIFIED** | Reliability Audit (Timeouts, Idempotency, Concurrency, Retries). |
| **`200lab-systematic-debugging`**| `/200lab-systematic-debugging` <br/> `$200lab-systematic-debugging`| `skill_find`, `skill_get`, `ai_tutor` | **VERIFIED** | Root cause analysis & deterministic reproduction plans. |
| **`200lab-agent-harness`** | `/200lab-agent-harness` <br/> `$200lab-agent-harness` | `skill_find`, `ai_tutor` | **VERIFIED** | AI agent reliability, tool calling schema, context optimization. |
| **`200lab-diagram-director`** | `/200lab-diagram-director` <br/> `$200lab-diagram-director` | `skill_find`, `ai_tutor` | **VERIFIED** | Mermaid C4 container & sequence flow diagrams. |
| **`200lab-ai-tutor`** | `/200lab-ai-tutor` <br/> `$200lab-ai-tutor` | `ai_tutor`, `ai_tutor_recommend`, `search`, `get` | **VERIFIED** | Contextual architectural advice & curated learning paths. |
| **`200lab-technical-review`** | `/200lab-technical-review` <br/> `$200lab-technical-review` | `skill_find`, `skill_get`, `ai_tutor` | **VERIFIED** | Code quality, design pattern consistency & maintainability. |
| **`200lab-html-presentation`** | `/200lab-html-presentation` <br/> `$200lab-html-presentation` | *Local presentation helper* | **LOCAL HELPER** | Converts markdown findings into an interactive HTML dashboard. |

---

## 2. Architecture & Design Principles

```
200lab-agent-skills/
├── README.md               # Documentation & usage guide
├── install.py              # Cross-platform Python installer
├── install.ps1             # Windows PowerShell installer
├── shared/                 # Reusable protocols & policies
│   ├── mcp-discovery.md    # 200Lab MCP tools & endpoints
│   ├── connection-check.md # Codex & Agy connection procedures
│   ├── security-policy.md  # Zero Scope Drift & privacy rules
│   └── report-schema.md    # Standard finding format
├── skills/                 # 8 Standalone Agent Skills
│   ├── 200lab-system-design/
│   ├── 200lab-backend-reliability/
│   ├── 200lab-systematic-debugging/
│   ├── 200lab-agent-harness/
│   ├── 200lab-diagram-director/
│   ├── 200lab-ai-tutor/
│   ├── 200lab-technical-review/
│   └── 200lab-html-presentation/
└── tests/                  # Automated verification suite
    ├── validate_skills.py  # Metadata & line-count validation
    └── test_system_design_audit.py # Read-only workflow test
```

### Key Principles
1. **MCP-Powered Layer**: Skills act as orchestrators querying live 200Lab rubrics, not static hardcoded checklists.
2. **Progressive Disclosure**: SKILL.md files are under 70 lines each, keeping LLM context clean.
3. **Zero Scope Drift**: Strict **READ-ONLY** operation. No automated code changes, database migrations, or git commits.

---

## 3. Installation

### Quick Install (Python)
```bash
python install.py --target all
```
*Options:* `--target agy` (Antigravity), `--target codex` (Codex CLI), `--target project` (Local `.agents/skills`), or `all`.

### Windows PowerShell Install
```powershell
.\install.ps1 -Target all
```

---

## 4. MCP Configuration & Verification

### In OpenAI Codex CLI
1. Verify connection:
   ```bash
   codex mcp list
   ```
2. If unauthenticated, add and complete OAuth via:
   ```bash
   codex mcp add 200lab-ai-tutor --url https://mcp.200lab.io/mcp/learner
   ```

### In Antigravity CLI (Agy CLI)
Add the server to your project `.agents/mcp_config.json` or global `~/.gemini/config/mcp_config.json`:
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

## 5. Usage Examples

### Example 1: Full System Architecture Review
- **Antigravity CLI**:
  ```text
  /200lab-system-design
  ```
- **OpenAI Codex CLI**:
  ```text
  $200lab-system-design
  ```

### Example 2: Backend Concurrency & Reliability Audit
- **Antigravity CLI**:
  ```text
  /200lab-backend-reliability
  ```
- **OpenAI Codex CLI**:
  ```text
  $200lab-backend-reliability
  ```

### Example 3: Generate Interactive HTML Audit Dashboard
- **Antigravity CLI**:
  ```text
  /200lab-html-presentation
  ```
- **OpenAI Codex CLI**:
  ```text
  $200lab-html-presentation
  ```

---

## 6. Security & Invariant Guarantee
- **Invariant SD-01**: Source code is strictly read-only.
- **Invariant SD-02**: Secrets, tokens, and PII are filtered before any query.
- **Invariant SD-03**: No mock data is presented as verified upstream MCP content.
