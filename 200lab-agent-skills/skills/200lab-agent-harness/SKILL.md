---
name: 200lab-agent-harness
description: Audit AI agent architectures, tool calling reliability, context window management, state durability, guardrails, permission boundaries, and evaluation metrics using 200Lab Agent Harness engineering standards. Activate when the user mentions AI agents, LLM workflows, tool calling reliability, context optimization, or runs /200lab-agent-harness or $200lab-agent-harness.
---

# 200Lab AI Agent Harness Review

Evaluate AI agent implementations, MCP tool servers, context window management, and safety guardrails against 200Lab Agent Harness best practices.

## Scope & Security Boundaries

- **HANDLES**: Read-only inspection of agent prompts, tool call definitions, schema validation, context optimization, and sandbox boundaries.
- **DOES NOT HANDLE**: Modifying system prompts, altering tool permissions, or executing arbitrary agent actions.
- **SECURITY**: Never leak API keys, system tokens, or proprietary system instructions.

---

## Applicability Gate

Before executing this skill, check if the workspace contains AI agent infrastructure:
- Look for MCP server configs (`mcp_config.json`, `~/.codex/config.toml`).
- Look for LLM API integrations (OpenAI, Anthropic, Gemini client libraries).
- Look for Agent harness files (`AGENTS.md`, `.specify/`, tool calling schemas).

*If no AI agent components exist, report: `STATUS: NOT APPLICABLE (No AI agent or LLM workflows detected in repository)`.*

---

## Execution Workflow

### Step 1: Query 200Lab MCP for Agent Harness Standards
- Call `skill_find(query="agent-harness")` or `ai_tutor(question="What are the essential reliability criteria for AI agent tool calling and context management?")`.

### Step 2: Audit Agent Reliability Pillars
1. **Schema Strictness**: Are tool parameters validated with strict JSON schema and clear type definitions?
2. **Context Window Engineering**: Are prompts bounded? Does the agent implement progressive disclosure to prevent token overflow?
3. **State Durability**: Is conversational and task state persisted (e.g. SQLite, JSONL) to survive process interruptions?
4. **Permission & Sandbox Boundaries**: Does the agent enforce read-only guards or require human confirmation for destructive actions?
5. **Observability & Error Handling**: Are tool call latency, token counts, and API failures logged and monitored?

### Step 3: Produce Agent Harness Audit Report
Format findings per `../../shared/report-schema.md`:
- Category: `Agent Schema`, `Context Management`, `Security Boundary`, or `State Durability`.
- Provide concrete improvements (e.g. adding Zod validation to tool arguments).
