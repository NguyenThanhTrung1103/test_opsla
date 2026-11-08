# Port assessment — The Cookbook v1.0.5 → Antigravity

Source: uploaded The Cookbook v1.0.5 ZIP, 339 ZIP entries. This is a private-use adaptation; see `SOURCE_LICENSE.md`.

| Area | Source files | Status | Notes |
|---|---|---|---|
| Intent Studio | `plugin/skills/intent/`, `intent-studio/` | Adapted | Original METHOD, schema, checker, profile and references retained; modified entrypoint for native Antigravity. |
| Intent Checker | `plugin/skills/intent-check/` | Adapted | Explicit PASS/GAPS with no automatic business fixes. |
| Intent to build | `plugin/skills/intent-to-build/` | Adapted (generic only) | Only generic brief output; Buildflow/AgentKit/tdrive automations not converted. |
| Six recipes | `recipes/*.workbook.md` | Carried unchanged | documents, auth-roles, booking, payments, email, crm only. |
| Design kits | `design-kits/` | Carried unchanged | Reference templates, not active automation. |
| Offline guide | `guide/`, `START-HERE.md` | Carried unchanged | Claude-specific instructions still in original documents; use README for Antigravity. |
| ARD MCP | setup script + endpoint | Configuration sample only | `serverUrl` matches current Antigravity schema, but OAuth vendor authentication is unverified. |
| Claude plugin marketplace | `plugin/.claude-plugin/` | Not drop-in | Antigravity uses a different plugin manifest/installation surface. |
| tab-pilot | Chrome extension + Cloudflare relay | Requires separate adapter/test | High-privilege browser control, token/permissions, publishing approvals; no automatic install. |
| tdrive-beta | Mac/tmux/Claude/AgentKit/Buildflow | Not ported | Core orchestration relies on Claude CLI and engine adapters; a full rewrite is a separate engineering effort. |

## Important discrepancies / blockers

1. **Not a full 1:1 port.** Core product-thinking flow can be used now; unattended supervision, Cloudflare publishing and Claude marketplace installation are not available automatically.
2. Recipe selection must use the 6 **actual** workbooks in ZIP. Prior generic label `Catalog + CRUD + Request Workflow` is a conceptual pattern, not an official supplied recipe.
3. Oops La BRD has unresolved cancellation rights, confirmation with unverified stock, and refund/restock policy. Do not fill those through recipes or implementation defaults.
4. Reading `AGENTS.md` or entering slash commands alone has not been tested on the user's local Antigravity. Run verification on device.
5. The source `LICENSE.md` is labelled draft and indicates personal/client-project use but prohibits redistribution. Keep this pack private and confirm permissions if sharing with others.

## Recommended smoke tests in Antigravity

- List customizations; ensure four skills are discovered.
- Run `/cookbook-intent-check` against a deliberately incomplete INTENT.md; expect `RESULT GAPS` and questions, not invented values.
- Run `/cookbook-recipes` and ask for the exact six recipe names; verify no extra invented recipes.
- Run `/cookbook-build-brief` on an approved intent only in planning mode; confirm it does not edit product source.
- Connect ARD MCP only as separate opt-in after verifying vendor OAuth; inspect available tools and scopes.

## Recommendation

Adopt the **core** pack first. Do not attempt to replicate tdrive or grant tab-pilot broad account/browser permissions until a distinct functional/security test plan is approved. No installer or remote action was run during this preparation.


## Windows runtime verification handoff

Two compatibility checks remain **NOT VERIFIED**: **PV-01**, actual Antigravity discovery/execution of Cookbook Skills; and **PV-02**, actual AgentKit consumption of a reviewed `docs/BRIEF.md`. The executable agent test plan, PASS/FAIL/BLOCKED criteria and evidence requirements are in [`WINDOWS_PORT_STATUS.md`](WINDOWS_PORT_STATUS.md#ai-agent-handoff--two-pending-verifications-windows--antigravity--agentkit). Neither is a precondition to skipping optional macOS-only `tdrive`. Do not infer either has passed from package inspection.
