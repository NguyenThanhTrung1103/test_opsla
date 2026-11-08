---
name: drive-govern
description: "Govern machine resources for a tdrive run: disk floors and concurrency advice, memory and load pressure with agent fan-out counting, read-only attribution of top consumers (processes, docker), allowlisted cache cleanup with in-use guards and dry-run, and keep-awake. Never kills, stops or prunes other workloads."
user-invocable: true
when_to_use: "Invoke on DISK_LOW, RESOURCE_HIGH, disk-alert-persisting or resource-critical-persisting, or to check whether the machine can take more implementers."
category: workflow
keywords: [govern, disk, memory, load, cleanup, attribution, awake]
argument-hint: "check [--repo R | --path P] [--session S] | attribute [--repo R] [--session S] | clean [--repo R] [--mode dry-run|apply|auto] [--only ids] | awake (--session S | --pid P)"
metadata:
  author: tony-drive
  version: "0.1.0"
---

# /drive-govern

Resolve the tdrive CLI first. Shell state does not persist between run_shell capability calls, so start every call with this block, then run `bash "$T" <command> ...` (never rely on the exec bit).

```bash
T="${TDRIVE_BIN:-}"
[ -f "$T" ] || T="$HOME/.claude/scripts/tdrive"
[ -f "$T" ] || T="$(command -v tdrive 2>/dev/null || true)"
if [ ! -f "$T" ] && [ -f "$PWD/.claude/scripts/tdrive" ]; then
  echo "warning: using project-local tdrive at $PWD/.claude/scripts/tdrive" >&2
  T="$PWD/.claude/scripts/tdrive"
fi
[ -f "$T" ] || { echo "tdrive not found; set TDRIVE_BIN" >&2; exit 3; }
T="$(cd -P "$(dirname "$T")" && pwd)/$(basename "$T")"
```

## Usage

- `bash "$T" govern check [--repo R | --path P] [--session S]`
- `bash "$T" govern attribute [--repo R] [--project NAME] [--session S]`
- `bash "$T" govern clean [--repo R] [--path P] [--mode dry-run|apply|auto] [--only id,...] [--until-free-gb N] [--all]`
- `bash "$T" govern awake (--session S | --pid P) [--repo R]`

## Output consumed

- `DISK path=<p> free_gb=<n.n> level=<ok|one-implementer|pause|alert> advice=<max_implementers=N|pause-dispatch|alert>`. Floors: one implementer at or below `floors.one_implementer_gb`, pause dispatch below `floors.pause_gb`, alert below `floors.alert_gb`.
- `RESOURCE mem_free_pct=<n|unknown> load_per_cpu=<n.nn> ncpu=<n> agents=<n> level=<ok|high|critical> advice=<max_implementers=N|reduce-fanout|pause-dispatch> swap_used_pct=<n|unknown> kernel_pressure=<normal|warn|critical|unknown>`
  - Primary signals drive the level: memory free % (critical below `resources.mem_free_alert_pct`, high below `resources.mem_free_high_pct`), load per cpu (`resources.load_high_per_cpu`, `resources.load_critical_per_cpu`) and agents (running agents including nested ones; high when above `run.max_implementers`).
  - swap used % and kernel pressure are context only and never drive the level (macOS swap is sized dynamically, so a full swap is normal).
  - advice: critical -> pause-dispatch; high with too many agents -> reduce-fanout; high otherwise -> max_implementers=1.
- `TOP by=<cpu|rss> pid=<n> cpu=<n.n> rss_mb=<n> owner=<ours|other> cmd=<basename>` and `DSTAT name=<n> project=<p|-> owner=<ours|other> cpu_pct=<n.n> mem_mb=<n>` (attribute; report only). `ours` = descended from this run's orchestrator pane or its compose project.
- `ATTRIB kind=<volume|container> name=<n> project=<p|-> owner=<ours|other> size_bytes=<n|?>`, `ATTRIB_SUMMARY ours_bytes=<n> other_bytes=<n> docker=<ok|unavailable>`
- `CLEAN id=<id> mode=<dry-run|apply> status=<ok|would-clean|skipped|failed> reason=<r|-> before_kb=<n|-> after_kb=<n|-> freed_kb=<n>`, then `CLEAN_SUMMARY mode=<m> freed_kb=<n> entries=<n>`
- `AWAKE pid=<n> method=<caffeinate|systemd-inhibit|none> status=<started|exists|skipped>`

## Rules

- Clean only the shipped allowlist (regenerable caches, dangling docker images, builder cache, stale verify worktrees). Review a dry-run first; `govern.mode=auto` applies only below the pause floor.
- In-use guards: an entry whose tool or target is in use is skipped with `reason=in-use:<pid>:<cmd>`; an unreadable process table skips it with `reason=guard:<key>` (fail-safe). Never work around a guard.
- govern never kills, stops or prunes other workloads: no process kill, no container stop, no volume or container prune. Report `owner=other` consumers to the operator and tell the orchestrator to reduce fan-out instead.
- Every line is appended to `runs/<run>/govern.jsonl`.
