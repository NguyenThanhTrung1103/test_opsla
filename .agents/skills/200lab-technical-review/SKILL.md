---
name: 200lab-technical-review
description: Perform comprehensive code quality, design pattern, and maintainability reviews using 200Lab engineering best practices. Activate when the user requests code review, technical debt analysis, maintainability assessment, or runs /200lab-technical-review or $200lab-technical-review.
---

# 200Lab Technical Review

Conduct rigorous, evidence-based code quality reviews, evaluating design patterns, maintainability, separation of concerns, and technical debt against 200Lab engineering standards.

## Scope & Security Boundaries

- **HANDLES**: Read-only code quality auditing, architectural consistency review, code smell detection, and refactoring recommendations.
- **DOES NOT HANDLE**: Modifying repository code or applying automated refactorings without user approval.
- **SECURITY**: All reviews occur locally; only high-level pattern queries are sent to MCP.

---

## Execution Workflow

### Step 1: Query 200Lab Review Guidelines
- Query 200Lab MCP: `skill_find(query="code-review")` or `ai_tutor(question="What are the essential code review standards for clean architecture and maintainability?")`.

### Step 2: Inspect Target Files
Read selected modules:
- Service logic, data access objects, controllers, and utility helpers.
- Look for anti-patterns: God objects, tight coupling, hidden side-effects, hardcoded magic numbers, and missing error propagation.

### Step 3: Grade Dimensions
Evaluate code against 4 core dimensions:
1. **Separation of Concerns**: Is business logic isolated from framework dependencies?
2. **Error Propagation**: Are errors caught, enriched, and logged properly, or swallowed?
3. **Type Safety & Contracts**: Are input and output schemas strictly typed without unnecessary `any` types?
4. **Testability & Inversion**: Are dependencies injectable, facilitating unit testing without monkey patching?

### Step 4: Output Technical Review Report
Generate report adhering to `../../shared/report-schema.md`:
- Document findings with code snippets, line numbers, and concrete remediation advice.
- Calculate an overall Maintainability Score (0-100).
