---
name: 200lab-system-design
description: Audit repository system architecture, modular boundaries, coupling, database schema, caching, bottlenecks, and single points of failure using 200Lab System Design rubrics. Activate when the user mentions 200lab system design, asks to review architecture, assess scalability, audit microservices or modular monolith, or runs /200lab-system-design or $200lab-system-design.
---

# 200Lab System Design Audit

Evaluate repository architecture, component coupling, data persistence layer, caching policies, and throughput bottlenecks against 200Lab System Design engineering standards.

## Scope & Security Boundaries

- **HANDLES**: Read-only architecture inspection, coupling analysis, data modeling audit, single point of failure (SPOF) detection, and architectural recommendations.
- **DOES NOT HANDLE**: Automatic code refactoring, database migrations, package installations, or direct production changes.
- **SECURITY**: Never transmit database credentials, private keys, or proprietary client data to external MCP endpoints.

---

## Prerequisites & MCP Connection

Before auditing, verify the 200Lab MCP server connection:
1. Check if `200lab-ai-tutor` is registered in Codex (`codex mcp list`) or Antigravity (`.agents/mcp_config.json`).
2. If unauthenticated, notify the user to authenticate via `codex mcp add 200lab-ai-tutor --url https://mcp.200lab.io/mcp/learner` or log in on `200lab.io`.
3. If MCP is offline, explicitly notify the user and offer a local heuristic evaluation using [system-design-rubric.md](references/system-design-rubric.md).

---

## Execution Workflow

### Step 1: Discover 200Lab System Design Rubric
Query 200Lab MCP tools:
- Call `skill_find(query="system-design")` to identify available rubrics.
- Call `skill_get(skill_id="system-design")` or `ai_tutor(question="What are the primary criteria for modular monolith vs microservices architecture review?")`.
- Load the rubric dimensions: Modularity, Storage, Caching, Bottlenecks, SPOF.

### Step 2: Read-Only Repository Inspection
Target specific architecture anchors without reading unnecessary files:
- Entry point: `src/server/app.ts` or `src/index.ts`
- Domain models: `src/types/domain.ts` or `src/models/`
- Core services: `src/services/`
- Storage layer: `src/storage/` or `prisma/schema.prisma` or `migrations/`

### Step 3: Architecture Evaluation Criteria
Assess the codebase against 5 core 200Lab dimensions:
1. **Modularity & Coupling**: Are domain services decoupled? Are circular dependencies present?
2. **Data Persistence**: Is data persistence atomic? Does the storage layer handle transactions and locking?
3. **Caching Strategy**: Are hot reads cached? Is there a cache invalidation strategy?
4. **Scalability & Bottlenecks**: Are CPU-intensive or blocking operations decoupled from the request-response cycle?
5. **Resilience & SPOF**: What happens if the persistence layer or external service fails?

### Step 4: Generate System Design Report
Follow the format defined in `../../shared/report-schema.md`:
- Assign finding IDs: `[FINDING-SD-001]`, `[FINDING-SD-002]`, etc.
- Include Severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
- Provide exact file and line references with clickable links.
- Detail evidence, root cause, impact, and remediation pattern.

---

## Failure Handling

- If `skill_get` returns an entitlement error (paid course lock), fall back to `references/system-design-rubric.md` and prefix all findings with `[LOCAL-HEURISTIC]`.
- If no backend or architecture files are present, report `BLOCKED: No server or domain architecture found in workspace`.
