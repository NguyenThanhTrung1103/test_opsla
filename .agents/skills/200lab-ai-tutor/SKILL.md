---
name: 200lab-ai-tutor
description: Retrieve technical lessons, architectural patterns, course materials, and tailored implementation guidance directly from 200Lab knowledge base. Activate when the user asks technical questions, seeks 200Lab learning resources, requests architecture explanations, or runs /200lab-ai-tutor or $200lab-ai-tutor.
---

# 200Lab AI Tutor

Connect directly to 200Lab's educational repository and AI tutor to provide contextual engineering explanations, design tradeoffs, and curated learning roadmaps mapped to the current codebase.

## Scope & Security Boundaries

- **HANDLES**: Querying 200Lab's `ai_tutor`, `ai_tutor_recommend`, `search`, and `get` tools, explaining technical concepts, and recommending engineering tutorials.
- **DOES NOT HANDLE**: Modifying project code or executing code modifications.
- **SECURITY**: Never pass sensitive code secrets or proprietary credentials in queries.

---

## Execution Workflow

### Step 1: Analyze Technical Query & Current Codebase Context
- Identify the core technical domain (e.g. Clean Architecture, Event Sourcing, High Concurrency, Database Indexing).
- Detect the project's primary languages and frameworks from `package.json`, `go.mod`, etc.

### Step 2: Query 200Lab Knowledge Base
Invoke 200Lab MCP tools:
- `search(query="<topic>")`: Search articles, lessons, and code examples.
- `ai_tutor(question="<specific problem>", context="<sanitized project stack>")`: Ask the 200Lab tutor for expert guidance.
- `ai_tutor_recommend(topic="<topic>", current_stack="<stack>")`: Request tailored learning milestones and recommended articles.
- `get(resource_id="<id>")`: Retrieve detailed lesson content if referenced.

### Step 3: Synthesize Contextual Advice
- Link theoretical concepts from 200Lab directly to the user's specific codebase files.
- Highlight architectural tradeoffs (e.g., consistency vs availability, synchronous vs asynchronous messaging).
- Provide reference URLs and recommended reading paths from 200Lab.

---

## Failure Handling

- If 200Lab MCP is disconnected, guide the user to reconnect via `codex mcp list` or OAuth login.
- Clearly differentiate between official 200Lab course content and general engineering knowledge.
