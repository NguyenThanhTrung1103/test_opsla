# The Cookbook v1.0.5 → Windows + Google Antigravity + AgentKit

## AI Agent Handoff — Current Agreed Scope

**Status:** Integration verification pending. **Not a claim of full port or verified runtime compatibility.**

### Environment and agreed decisions
- User uses **Windows**, **Google Antigravity**, and has **AgentKit installed** (its invocation and working status are not verified).
- The original Cookbook v1.0.5 ZIP must remain **unchanged**. Work in a separate adapter/test workspace; never overwrite upstream files.
- The original **tdrive** is **optional, macOS-oriented, and intentionally skipped**. Do **not** port/reimplement tdrive or treat its absence as a blocker.
- Cookbook Intent Studio, Intent Check, the **six supplied workbooks** (`documents`, `auth-roles`, `booking`, `payments`, `email`, `crm`), design kits, and approved intent-to-build workflow are in scope.
- ARD MCP is optional and unverified. `tab-pilot` is optional and **not** part of mandatory validation; do not enable browser publishing or access without separate approval.
- **Oops La Book Store:** BRD v2.0 remains the business baseline; `ADC-001` is **ON HOLD**. **Do not code, build, or modify the Oops La app.** Use dummy data/workspace for all checks.

### Supporting documents (same port package)
- `README.md`: package usage, dry-run installer, tool commands, constraints.
- `PORT_ASSESSMENT.md`: source-to-port mapping, limitations, security caveats.
- `WINDOWS_PORT_STATUS.md`: testable procedures and PASS/FAIL/BLOCKED criteria for PV-01 and PV-02; **authoritative details for verification**.

## Required actions (AI Agent)

### PV-01 — Verify Antigravity Cookbook Skills discovery and execution
**Status:** NOT VERIFIED.

1. Record Windows and Antigravity versions. Create a disposable test workspace. Inspect existing `AGENTS.md` and `.agents/` before applying anything.
2. Inspect `install-windows.ps1` and preview (without `-Apply`); request approval before copying files to the test workspace. Never overwrite existing files.
3. Open test workspace in Antigravity; check actual discovery of `cookbook-intent`, `cookbook-intent-check`, `cookbook-build-brief`, `cookbook-recipes`, and `cookbook-agentkit` **if present**. Do not assume slash commands are supported merely from Skill filenames.
4. Test intent-check against an intentionally incomplete *dummy* `INTENT.md`; expect explicit GAPS and no invented business decisions.
5. Test recipes listing; verify only the **six actual workbooks** are described as official.
6. Record invocation, logs/outputs (redact secrets) and pass/fail evidence.

**PASS:** Actual discovery and reproducible correct skill behavior. **FAIL:** Missing/unusable skills, broken references or improper actions. **BLOCKED:** Cannot access local runtime or permissions not granted.

### PV-02 — Verify AgentKit consumes a reviewed build brief on Windows
**Status:** NOT VERIFIED.

1. From PowerShell, inspect `Get-Command ak -ErrorAction SilentlyContinue`, `ak --version`, and `ak --help`. Record exact installed command syntax and whether binary is Windows native, WSL, or a wrapper.
2. Prepare a *dummy approved* `INTENT.md` with scope, explicit restrictions, and acceptance criteria; run Cookbook skill to produce `docs/BRIEF.md`. Review for missing/guessed decisions.
3. Determine supported AgentKit planning or brief-consumption workflow from its installed help/docs. Do not assume Claude Code `/ak:plan` syntax works.
4. With approval, perform the smallest safe **non-destructive** test, and check AgentKit output actually reflects one specific constraint and one acceptance criterion from `docs/BRIEF.md`.
5. Capture exact command, sanitized result, files touched, exit status; report dependencies if Claude Code turns out to be required.

**PASS:** Verified supported invocation consumes the brief and preserves requirements. **FAIL:** Cannot use brief or violates constraints. **BLOCKED:** Runtime unavailable, unsupported auth, or missing test approval.

### Deliverable
Write `docs/COOKBOOK_ANTIGRAVITY_AGENTKIT_VERIFICATION.md` in the **temporary test workspace**, including:
- Machine and tool versions
- PV-01 and PV-02 status (`PASS`, `FAIL`, `BLOCKED`) separately
- Exact execution/invocation evidence, sanitized logs and output paths
- Files changed, blockers, root causes, proposed *minimal* fixes
- Remaining unverified items and whether user approval is required

**Restrictions:** Do not run `tdrive`, source macOS setup scripts, or install extra services without approval. Do not assume static package structure proves the port works. Do not edit Oops La, enable MCP/browser publishing, modify secrets, or auto-start builds.
