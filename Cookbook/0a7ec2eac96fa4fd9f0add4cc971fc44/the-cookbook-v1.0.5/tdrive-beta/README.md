# tdrive (beta)

**Beta. Runs on macOS only.**

## What it does

- Supervises a Claude Code build session overnight so you don't have to sit and watch it.
- Starts the coding engine (AgentKit; Buildflow experimental) inside tmux, sends the plan, then the build.
- Wakes only when something needs attention: a question, a stall, a usage limit, low disk, a finished phase.
- Re-checks every "done" claim itself, in a separate git worktree, with mutation probes, before it believes it.
- Writes a short report per stage (DONE / NEXT / HEADS-UP) that you read in the morning.

## Who it's for
- **Heavy builders:** you run several agents and projects at once, and you've hit the walls: the machine crawls under load, the disk fills with build caches, too many helper agents spawn, a session dies at 3 a.m. tdrive's resource governor and rules were written from exactly those walls.
- **You own AgentKit or Buildflow but never got it going:** you don't have to learn to drive it. Give tdrive a brief; it boots the engine, sends the plan, keeps it moving overnight, re-checks every "done", and hands you a morning report. You make the business decisions; tdrive drives.

## Requirements

- macOS, `/bin/bash` (3.2+), python3 ≥ 3.8, git, tmux, `caffeinate` (ships with macOS)
- Claude Code (`claude` CLI) installed and logged in
- An engine, whichever you want tdrive to drive: AgentKit (`ak` on PATH) for `/drive agentkit`, or Buildflow (`~/.buildflow/kit`, or a `buildflow/` dir in the target repo) for the experimental `/drive buildflow`
- 10 GB+ free disk recommended. Docker is optional (only used to report and clean docker build cache).

## Install and first run

```bash
bash preflight.sh            # read-only check; every line is OK / WARN / FAIL with a fix hint
bash install.sh --dry-run    # shows what goes where in ~/.claude/, writes nothing
bash install.sh              # refuses if preflight fails or an existing file differs (--force backs up, then overwrites)
```

Restart Claude Code, then in a Claude Code session:

```
/drive version
/drive agentkit ~/work/my-app "<one-paragraph brief of what to build>"
```

An empty or missing dir is created as a new AgentKit project; a dir that already has `.claude/` is adopted. tdrive works on a build branch and commits only its own small set of files (the brief, its directives, `.gitignore` lines). Your git history stays yours.

Installed to: `~/.claude/scripts/tdrive` + `tdrive-lib/`, skills `/drive` and `/drive-*` (`~/.claude/skills/ak-drive*`), agents `driver` and `verifier`. Run state lives in `~/.tdrive/`, outside your repo.

## Safety boundaries

- Never deletes anything outside its cleanup allowlist (regenerable caches only, each skipped while a process uses it). Default cleanup mode is dry-run; only the `sleep-run` preset cleans for real.
- Never kills or stops other processes, containers or docker volumes. It reports them.
- Never signs your halt-tier gates (launch, offer, market and similar). The driver never writes feature code.
- Your git history stays intact: tdrive never pushes, force-pushes or rewrites history. Its only `git reset --hard` runs inside its own throwaway `tdrive-verify-*` worktree. Every change is a normal commit you can review or revert.
- Heads-up: the engine is started as `claude --dangerously-skip-permissions`, because no one is there to click approve. Only point it at repos you are fine with an agent editing on its own.

## How to stop it

- Stop the loop: `kill $(cat ~/.tdrive/runs/<run>/loop.pid)` (normal SIGTERM; it stops its own children and releases the lock). Don't use `kill -9`.
- Stop the engine too: `tmux kill-session -t <session>` (session = the project dir name unless you set `--session`).
- Resume later: `/drive resume <run>`.

## Network and incident sharing

tdrive itself makes no network calls and sends nothing anywhere. Logs, traces, lessons and reports stay in `~/.tdrive/` on your Mac, with secrets masked before they are written. Network traffic comes only from the tools it drives: Claude Code, and AgentKit (`ak new`, `ak kit install`, and `ak self-update` if a kit install fails). The optional `report.notify_env` setting runs a notify command you supply.

Incident sharing is opt-in: nothing is sent unless you choose to send it. If you want to help improve the beta, share `~/.tdrive/lessons/*.md` or a run's `reports/last.md` yourself after reading them.

`rules/` holds the incident lessons learned so far (false idle, false busy, nested fan-out over the cap, in-use cache cleanup, etc.) for reference.

## Support

Beta, no support promise. Report issues to: {SUPPORT_CONTACT}
