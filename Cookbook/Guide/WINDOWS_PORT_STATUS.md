# Port status — Windows + Antigravity + existing AgentKit

## Source-backed findings

- Upstream `tdrive-beta/README.md` explicitly says **macOS only**. `preflight.sh` requires `Darwin`, `tmux`, `caffeinate`, `claude` and an engine (`ak` or Buildflow). AgentKit alone is insufficient for the original unattended supervisor.
- The AgentKit adapter in `upstream/tdrive-beta/scripts/tdrive-lib/adapters/agentkit/` includes bootstrap/state/verify-targets helpers, but they are Bash scripts calling original tdrive core and Claude-specific orchestration.
- Upstream Intent Studio contains a real AgentKit output adapter: `upstream/intent-studio/claude-code-skill/references/outputs/agentkit/ADAPTER.md`. This can be used without macOS to produce a reviewed `docs/BRIEF.md`.
- Upstream tab-pilot `README.md` describes MCP/HTTP/WebSocket transport for external agents, but `setup-tab-pilot.sh` and tool setup are Bash/Claude-shaped; Windows support requires separate live validation. Browser account control is high privilege.
- Supplied recipe workbooks total six: documents, auth-roles, booking, payments, email, crm. No official commerce recipe is included in the uploaded ZIP.

## Actual status

| Subsystem | Result | Why |
|---|---|---|
| Cookbook source + guide | INCLUDED AS READ-ONLY REFERENCE | Full upstream payload preserved under `upstream/` |
| Intent / check / recipes / build brief / design | PORTED FOR ANTIGRAVITY | Converted skills in `.agents/skills/` and references |
| AgentKit INTENT → BRIEF | PORTED AS WORKFLOW | Companion skill + source adapter; local `ak` syntax requires device test |
| AgentKit local discovery | PROVIDED | Read-only Windows-capable `doctor` command |
| Plan status, test target discovery, report | PROVIDED | Python companion; does not drive agents |
| Original tdrive unattended orchestration | **NOT PORTED** | macOS/tmux/Claude dependency and no verified Antigravity programmable headless control |
| ARD MCP | CONFIG SAMPLE | Actual authentication and entitlement not tested |
| tab-pilot | SOURCE INCLUDED, NOT INSTALLED | Must test Windows relay, extension and authentication separately |
| Buildflow | SOURCE INCLUDED, NOT INTEGRATED | User says AgentKit is available, not Buildflow |

## Previously missed considerations

1. Do **not** generate old `.agents/workflows/*.md` files: Antigravity retired legacy workflows on 2026-10-19. Use Skills.
2. Only original six workbooks exist; a custom product pattern is not a Cookbook recipe.
3. An `ak` binary being installed does not prove that it runs without Claude Code: check `ak --help`, and test a disposable sandbox project before claiming independent operation.
4. Original `tdrive` runs `claude --dangerously-skip-permissions`; never recreate this silent permission bypass in a Windows wrapper.
5. Distinguish `0 stock` from `unknown stock` in Oops La; do not let implementation guess.
6. The user must review permissions and original license before redistribution; this pack is for the same user's local adaptation.
7. A safe installation should **not overwrite** existing `.agents`, `AGENTS.md`, or MCP configuration.

## Validation still required on user's Windows PC

- Antigravity discovers skills in `.agents/skills/`.
- Native PowerShell installer dry-run and install succeed without overwrite.
- `ak --version` and `ak --help` run; AgentKit workflow demonstrated in a disposable repo.
- A checked `INTENT.md` produces a compliant `BRIEF.md` with no guessed decisions.
- ARD MCP OAuth is tested only after user consent.
- tab-pilot token/relay/publishing is never enabled without explicit separate approval.

**Do not call this 100% feature parity.** This pack is a maximal safe Windows adaptation with a full upstream source archive, but original tdrive is not replaced.


## AI AGENT HANDOFF — TWO PENDING VERIFICATIONS (Windows / Antigravity / AgentKit)

> **Status: NOT TESTED / NOT VERIFIED on the user's Windows machine.** The presence of skill folders, a generated build brief, or an installed `ak` executable is **not** proof of end-to-end compatibility. This section is an action checklist for a local AI Agent, not a claim that the checks have passed.
> **Scope:** verify integration only in a disposable test workspace; do **not** build or modify the Oops La application. `ADC-001` remains **ON HOLD**. Original `tdrive` is optional for Windows and is **not a prerequisite** for either verification.

### PV-01 — Antigravity discovers AND correctly executes Cookbook Skills

**Question:** Does the user's installed Google Antigravity discover and follow the Cookbook Skills from `.agents/skills/` in an actual workspace?

**Local agent procedure:**
1. Record Windows version, Antigravity version, active workspace path, and the installed skill directory. Use a **temporary test workspace**; inspect existing `.agents/` and `AGENTS.md` before copying anything.
2. Run `install-windows.ps1` **without `-Apply` first** to inspect collisions; apply only after explicit user approval and only to the test workspace. Do not overwrite existing files.
3. Open that workspace in Antigravity. Inspect the agent's actual skill listing/discovery mechanism; confirm the intended skills are loaded (at least `cookbook-intent`, `cookbook-intent-check`, `cookbook-build-brief`, `cookbook-recipes`, `cookbook-agentkit` if included in the installed pack). **Do not assume** a `/skill-name` slash command exists merely because a `SKILL.md` exists.
4. Invoke `cookbook-intent-check` using Antigravity's supported skill invocation or natural-language routing on a deliberately incomplete **dummy** `INTENT.md`. Confirm the agent identifies missing decisions and returns `GAPS` instead of inventing them.
5. Invoke `cookbook-recipes` in the same sandbox. Confirm it reads the **six actual supplied workbooks** (documents, auth-roles, booking, payments, email, crm) without inventing extra official recipes.
6. Record the invocation method, output, errors, screenshots/log excerpts without secrets, and whether the skill references resolved properly.

**PASS:** Evidence shows actual skill discovery **and** reproducible behavior consistent with the source Skill and reference files; no unapproved writes.
**FAIL:** Skills are missing, cannot be invoked, references are broken, or the agent disregards critical instructions.
**BLOCKED:** No access to the installed Antigravity runtime; never mark PASS from a static ZIP inspection.

### PV-02 — AgentKit on Windows receives and can use the reviewed build brief

**Question:** Can the actual installed AgentKit (`ak`) on Windows consume a Cookbook-generated and reviewed `docs/BRIEF.md` without requiring Claude Code or inventing business decisions?

**Local agent procedure:**
1. In PowerShell run `Get-Command ak -ErrorAction SilentlyContinue`, `ak --version`, and `ak --help`. Save relevant output, record whether `ak` is native Windows, through WSL, or a wrapper, and identify the **supported command syntax from this installed version**. Do not assume `/ak:plan` is a Windows CLI command.
2. Use a **dummy approved** `INTENT.md` with explicit scope and acceptance criteria (not the Oops La BRD). Through the installed Cookbook intent/build-brief skill, prepare `docs/BRIEF.md`; inspect that it includes the intent, boundaries, acceptance criteria and clearly flags unanswered decisions rather than filling them.
3. Determine from `ak --help` / local documentation how AgentKit accepts a plan or brief. With user permission, run the **smallest non-destructive planning/import check** on the dummy workspace. Do not perform a build, installation, network side effect or unauthorized edit.
4. Confirm the AgentKit output/plan demonstrably references the content of `docs/BRIEF.md` (not merely that the file exists). Compare at least one specific scope constraint and one acceptance criterion against the output.
5. Record exact command, exit status, output path and evidence. If this installed AgentKit only supports invocation through Claude Code, report the dependency rather than writing an unverified bridge.

**PASS:** A reproducible, supported AgentKit invocation demonstrably ingests the reviewed brief and preserves its constraints.
**FAIL:** The installed `ak` cannot accept the brief, cannot run on Windows as configured, or drops/changes essential requirements.
**BLOCKED:** AgentKit is not accessible, help/docs are unavailable, or the user has not authorized the needed test. Never mark PASS based solely on `ak --version`.

### Deliverable from the local AI Agent

Create `docs/COOKBOOK_ANTIGRAVITY_AGENTKIT_VERIFICATION.md` in the **test workspace** with: machine/tool versions; PV-01 and PV-02 each marked `PASS`, `FAIL`, or `BLOCKED`; exact invocation method; minimal sanitized evidence; problems found and recommended fixes; files modified; and remaining unverified claims. Ask for approval before editing an existing project or changing authentication/MCP/browser permissions.

**Do not:** run `tdrive`/macOS scripts, assume Claude-specific commands work in Antigravity, install extra services, use credentials/tokens in logs, or begin implementing Oops La.
