# Security & Zero Scope Drift Policy

## 1. Zero Scope Drift Invariant (Strict Read-Only)
All `200lab-*` skills are designed for **analysis, review, audit, and architecture evaluation**.

- **MUST NOT**:
  - Automatically modify source code, test code, or build scripts.
  - Automatically commit changes, stage git files, or push branches.
  - Automatically alter database schemas, execute migrations, or modify live data.
  - Automatically install new third-party packages or update `package.json`.
  - Automatically trigger CI/CD pipelines or deployments.

- **REPAIR / REFACTORING RULE**:
  Any code remediation suggested by the skills must be presented as **proposals / code snippets** within the report. Implementation requires an explicit, separate user instruction.

---

## 2. Secrets & Privacy Protection
- **No Secret Exfiltration**: Never send raw `.env`, JWT private keys, API secrets, database passwords, or personal credentials to external MCP servers.
- **Sanitized Prompts**: When querying `ai_tutor` or `skill_find`, send only architectural concepts, abstracted function signatures, and sanitized problem statements.
- **Local File Inspection**: Repository files are read strictly on the local machine using read-only operations.
