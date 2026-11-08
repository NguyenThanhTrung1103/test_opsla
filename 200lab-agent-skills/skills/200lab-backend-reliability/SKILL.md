---
name: 200lab-backend-reliability
description: Audit backend reliability, timeouts, retry policies, idempotency, race conditions, transaction integrity, and concurrency risks using 200Lab Backend Reliability standards. Activate when the user mentions backend reliability, idempotency, race conditions, transaction safety, concurrent orders, or runs /200lab-backend-reliability or $200lab-backend-reliability.
---

# 200Lab Backend Reliability Audit

Examine backend services for timeout propagation, exponential backoff, idempotency keys, race conditions, and transaction boundary integrity.

## Scope & Security Boundaries

- **HANDLES**: Read-only reliability inspection, concurrency audit, idempotency check, failure recovery review, and structured reporting.
- **DOES NOT HANDLE**: Writing production patches, changing database isolation levels, or modifying live transactions.
- **SECURITY**: Do not expose payment webhook secrets, tokens, or transaction IDs to external APIs.

---

## Prerequisites & MCP Discovery

1. Check MCP connectivity via Codex or Antigravity configuration.
2. Query 200Lab MCP:
   - Call `skill_find(query="backend-reliability")` or `ai_tutor(question="Explain key patterns for idempotency and transaction boundaries in ordering systems")`.
3. If MCP is unavailable, use local reliability heuristics and mark findings `[LOCAL-HEURISTIC]`.

---

## Execution Workflow

### Step 1: Target Reliability-Critical Code Paths
Inspect services that process financial, inventory, or transactional workflows:
- Order processing: `src/services/orderService.ts`
- Webhook / payment handlers: `src/server/app.ts` or `src/controllers/`
- Data store operations: `src/storage/`

### Step 2: Reliability Audit Checklist
Check for the 6 core reliability vulnerabilities:
1. **Idempotency Keys**: Do POST/mutation endpoints enforce an `Idempotency-Key` header to prevent duplicate processing on retries?
2. **Race Conditions & Concurrency**: Does concurrent inventory decrement prevent overselling? (e.g. check-then-act vs atomic decrement).
3. **Timeouts & Deadlines**: Do outgoing network and database calls have explicit timeouts?
4. **Retry with Exponential Backoff & Jitter**: Are transient failures retried safely without stampeding downstream services?
5. **Transaction Rollback**: If a multi-step operation fails midway, are previous mutations properly rolled back?
6. **Graceful Shutdown**: Does the server handle `SIGTERM` / `SIGINT` by finishing in-flight requests before exiting?

### Step 3: Produce Evidence-Based Findings
Format each vulnerability as defined in `../../shared/report-schema.md`:
- ID format: `[FINDING-REL-001]`
- Quote exact line numbers and vulnerable code snippet.
- Outline realistic failure scenario (e.g. "When 2 clients simultaneously checkout the last monograph copy...").
- Detail remediation (e.g. SQL `WHERE stock >= quantity`, optimistic version lock).

---

## Failure Handling

- When 200Lab MCP is offline, provide the report with explicit note: `Notice: Evaluated using built-in 200Lab reliability heuristics`.
- If no backend logic is present (pure static UI), return `STATUS: NOT APPLICABLE (No backend services found)`.
