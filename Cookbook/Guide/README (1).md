# The Cookbook 1.0.5 — Windows + Antigravity + AgentKit port (private use)

This is an adaptation of the user-supplied archive. It **does not** claim full operational equivalence to the original macOS-only tdrive runner. It includes the upstream source as read-only reference, Antigravity skills, a Windows installer, and a safe Windows AgentKit companion.

## First: safe setup

Open PowerShell at the extracted package root (PowerShell 5.1+; Windows 10/11). Run a preview first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Workspace 'C:\path\to\your-project'
```

Copy (only after reviewing conflicts):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Workspace 'C:\path\to\your-project' -Apply
```

The installer copies only `.agents/skills`, policy and reference assets, **not** the entire upstream scripts. It refuses collisions. It does not run the original Bash files, network, `ak` or Claude Code.

## Read-only checks

```powershell
py -3 .\tools\cookbook_windows.py doctor --workspace 'C:\path\to\your-project'
py -3 .\tools\cookbook_windows.py plan-status --repo 'C:\path\to\your-project'
py -3 .\tools\cookbook_windows.py verify-targets --repo 'C:\path\to\your-project'
```

`doctor` checks installed `ak`, Git, Python and known project files. `plan-status` inspects `plans/*/plan.md` or `--plan`. `verify-targets` suggests available test commands but **does not run them**. Tests are run manually by you, not the package.

## Skills

Run `/cookbook-intent`, `/cookbook-intent-check`, `/cookbook-recipes`, `/cookbook-agentkit`, and `/cookbook-build-brief` once recognized by Antigravity. These are skill names, **not** automatic AgentKit commands. The real `/ak:plan` interface from the source is Claude Code-specific; verify your installed `ak` CLI command interface.

## ARD MCP

Example only: `.agents/mcp_config.example.json`. To use it, manually merge into your existing `.agents/mcp_config.json`, review the endpoint and sign in only through a trusted flow. No credentials are supplied.

## Safety and status

- Don't run `upstream/setup.sh` or `upstream/tdrive-beta/install.sh` on Windows.
- `upstream/` is for comparison, license review and selective manual adaptation; not a plug-and-play Antigravity plugin.
- `tab-pilot` is not installed; if tested later, publishing must stay OFF by default.
- Do not launch builds for Oops La: ADC-001 is ON HOLD and the remaining business decisions require approval.
- See `WINDOWS_PORT_STATUS.md` and `SOURCE_LICENSE.md`.


## Handoff to a local AI Agent: verification is pending

Before claiming the port works end-to-end on Windows, execute **PV-01** (Antigravity discovers *and follows* Cookbook Skills) and **PV-02** (installed AgentKit actually consumes a reviewed build brief) as specified in `WINDOWS_PORT_STATUS.md`. Both are currently **NOT VERIFIED**. Test only in a disposable workspace; report PASS/FAIL/BLOCKED with evidence. The original `tdrive` is optional on Windows. Do not initiate Oops La development: ADC-001 remains ON HOLD.
