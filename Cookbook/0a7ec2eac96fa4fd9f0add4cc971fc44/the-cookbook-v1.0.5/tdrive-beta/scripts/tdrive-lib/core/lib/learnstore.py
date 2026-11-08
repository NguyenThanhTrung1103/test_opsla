"""Cross-run learning store: the single resolver of its paths.

S = $TDRIVE_STATE_DIR or ~/.tdrive (as runstate). Kinds:
  lessons      S/lessons/                  lesson files and the ledger
  retros       S/retros/                   retro reports
  proposals    S/proposals/                proposal markdown files (<id>.md)
  ledger       S/lessons/incidents.jsonl   cross-run incident ledger
  ledger_lock  S/lessons/.ledger.lock      lock around ledger and lesson writes
  decay        S/decay.yaml                decay layer: features switched off
Directories are created with umask 077. The store never lives inside a
project repo: S is refused when its real path lies inside the run's REPO,
inside any repo registered in S/runs/index.tsv, or inside a git work tree
whose top level is not $HOME (a dotfiles home is allowed).

path_of(KIND) is the same path without the guard or a directory created
(for readers such as the config loader).

CLI: learnstore.py path KIND [--run R]   -> the path
Exit codes: 0 ok, 2 usage, unknown kind or store inside a project repo.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import runstate  # noqa: E402

# kind -> (path parts under S, is a directory)
KINDS = {
    "lessons": (("lessons",), True),
    "retros": (("retros",), True),
    "proposals": (("proposals",), True),
    "ledger": (("lessons", "incidents.jsonl"), False),
    "ledger_lock": (("lessons", ".ledger.lock"), False),
    "decay": (("decay.yaml",), False),
}
GIT_TIMEOUT_S = 10


class StoreError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def _inside(path, root):
    root = root.rstrip(os.sep) or os.sep
    return path == root or path.startswith(root + os.sep)


def _existing_ancestor(path):
    p = path
    while p and not os.path.isdir(p):
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    return p


def _git_toplevel(path):
    """The git work tree top level holding path, or None (no git, no tree)."""
    env = dict((k, v) for k, v in os.environ.items() if not k.startswith("GIT_"))
    try:
        p = subprocess.run(["git", "-C", _existing_ancestor(path), "rev-parse", "--show-toplevel"],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=GIT_TIMEOUT_S, env=env)
    except (OSError, subprocess.SubprocessError):
        return None
    if p.returncode != 0:
        return None
    top = p.stdout.decode("utf-8", "replace").strip()
    return os.path.realpath(top) if top else None


def guard(run=None):
    """Raise StoreError(2) when the store would lie inside a project repo."""
    s = os.path.realpath(runstate.state_dir())
    repos = []
    if run:
        try:
            repo = runstate.env_get(run, "REPO")
        except runstate.RunStateError as exc:
            raise StoreError(exc.code, str(exc))
        if repo:
            repos.append(repo)
    repos.extend(r for r, _run in runstate._read_index())
    for repo in repos:
        if _inside(s, os.path.realpath(repo)):
            raise StoreError(2, "store inside a project repo: %s" % s)
    top = _git_toplevel(s)
    if top and top != os.path.realpath(os.path.expanduser("~")):
        raise StoreError(2, "store inside a project repo: %s" % s)
    return s


def path_of(kind):
    """The path of KIND, read-only: no guard, nothing created."""
    if kind not in KINDS:
        raise StoreError(2, "unknown store kind: %s (one of %s)" % (kind, ", ".join(sorted(KINDS))))
    return os.path.join(runstate.state_dir(), *KINDS[kind][0])


def paths(kind, run=None):
    """The path of KIND, its directory created (umask 077) after the guard."""
    if kind not in KINDS:
        raise StoreError(2, "unknown store kind: %s (one of %s)" % (kind, ", ".join(sorted(KINDS))))
    parts, is_dir = KINDS[kind]
    s = guard(run)
    path = os.path.join(s, *parts)
    runstate.ensure_dir(path if is_dir else os.path.dirname(path))
    return os.path.join(runstate.state_dir(), *parts)


def main(argv):
    args = argv[1:]
    try:
        if len(args) not in (2, 4) or args[0] != "path" or (len(args) == 4 and args[2] != "--run"):
            raise StoreError(2, "usage: learnstore.py path KIND [--run R]")
        run = args[3] if len(args) == 4 else None
        if run is not None and not runstate.valid_run(run):
            raise StoreError(2, "invalid run name: %r" % run)
        sys.stdout.write(paths(args[1], run) + "\n")
    except StoreError as exc:
        sys.stderr.write("learnstore: %s\n" % exc)
        return exc.code
    except OSError as exc:
        sys.stderr.write("learnstore: %s\n" % exc)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
