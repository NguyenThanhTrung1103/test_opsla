---
name: 200lab-systematic-debugging
description: Execute systematic root cause analysis, reproduction scripting, error tracing, hypothesis testing, and regression test design using 200Lab Systematic Debugging methodology. Activate when the user mentions bug investigation, root cause analysis, debugging an error, reproducing a defect, or runs /200lab-systematic-debugging or $200lab-systematic-debugging.
---

# 200Lab Systematic Debugging

Diagnose complex technical bugs through structured hypothesis elimination, error tracing, and deterministic reproduction scripts without jumping to premature fixes.

## Scope & Security Boundaries

- **HANDLES**: Read-only log and code inspection, root cause deduction, reproduction test design, and regression test recommendations.
- **DOES NOT HANDLE**: Applying speculative code patches or modifying test baselines without explicit confirmation.
- **SECURITY**: Sanitize stack traces, sensitive user inputs, and environment variables before analysis.

---

## Prerequisites & MCP Discovery

1. Verify 200Lab MCP server connection.
2. Query 200Lab MCP:
   - Call `skill_find(query="systematic-debugging")` or `ai_tutor(question="Explain the scientific debugging methodology for race conditions and state corruption")`.
3. If MCP is unavailable, proceed using local scientific debugging steps and label findings `[LOCAL-HEURISTIC]`.

---

## Execution Workflow

### Step 1: Clarify Problem & Expected vs Actual
- Record the exact failure symptom: Error message, HTTP status code, or unexpected UI state.
- Establish the observable delta between expected behavior and actual behavior.

### Step 2: Trace Execution Path & Call Stack
- Read relevant entry points, error handling middleware, and storage operations.
- Map the execution flow from trigger to failure point.

### Step 3: Formulate & Rank Hypotheses
- Generate at least 2 distinct hypotheses explaining the defect.
- For each hypothesis, identify a definitive test that can prove or disprove it.

### Step 4: Deterministic Reproduction
- Design an isolated, minimal reproduction script or unit test (e.g. `tests/repro-bug.test.ts`).
- Verify that the test fails predictably under the specified conditions.

### Step 5: Root Cause & Regression Plan
- Identify the root cause mechanism (e.g. state mutation, asynchronous timing, type mismatch).
- Outline the minimal surgical fix required.
- Specify regression tests to prevent the bug from recurring.

---

## Output Report Structure

- **Bug Summary**: Concise title and severity.
- **Symptom & Environment**: Logs, stack traces, and reproduction environment.
- **Hypotheses Evaluation**: Table of hypotheses tested and results.
- **Confirmed Root Cause**: Detailed explanation with line-level code citations.
- **Reproduction & Verification Test Plan**: Test code ready to run.
