"""Test-lock check of a test-first phase (RED -> GREEN -> GATE).

The red commit of phase ID is the newest commit reachable from head whose
subject is `test(phase-ID): red ...` (numeric ids are zero-pad aware: 6,
06 and 006 are one phase), or --red. Every commit in red..head that touches
a test file (config gate.test_globs) must be a `test(phase-ID): fix ...`
commit with a reason in its body (trailer lines such as Signed-off-by do not
count). Commits whose subject is `test(phase-OTHER): ...` belong to another
phase and are skipped. Non-merge commits are checked file by file; a merge
commit only for the files it changed against every parent (a conflict
resolution or an evil merge).

CLI:
  testlock.py [--repo R] [--rundir D] check --head SHA --phase ID [--red SHA]
  testlock.py [--repo R] [--rundir D] commands
check prints, in order:
  FIX commit=<sha7> files=<n> | <first reason line>
  VIOLATION file=<path> commit=<sha7> kind=<not-fix|fix-no-reason|merge> | <subject>
  WARN red_production files=<n> max_lines=<m> paths=<p,...>
  TESTLOCK phase=<id> red=<sha7|-> head=<sha7> changed=<n> allowed_fix=<n> violations=<n> other_phase=<n> result=<PASS|FAIL> [reason=red_missing]
commands prints gate.commands, one per line (nothing when unset).
Exit codes: 0 PASS (or commands ok), 1 FAIL, 2 usage or config error,
3 git error (head or red does not resolve, red is not an ancestor of head).
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import config  # noqa: E402

DOC_GLOBS = ("*.md", "*.markdown", "*.txt", "*.log", "docs/**", "plans/**", "**/reports/**")
_TRAILER = re.compile(r"^(?:[A-Z][A-Za-z0-9-]*-[Bb]y|Change-Id|Co-authored-by|Refs?|Closes|Fixes):\s")
_SUBJECT = re.compile(r"^test\(phase-([A-Za-z0-9._-]+)\)!?:\s*(\S+)")


class TestlockError(Exception):
    def __init__(self, msg, code=2):
        Exception.__init__(self, msg)
        self.code = code


# ---- phase ids ----------------------------------------------------------------

def norm_phase(pid):
    """Canonical phase id: digits lose their leading zeros, others as given."""
    pid = pid.strip()
    if pid.isdigit():
        return str(int(pid))
    return pid


def show_phase(pid):
    """Display form: numeric ids zero-padded to two digits (6 -> 06)."""
    n = norm_phase(pid)
    return "%02d" % int(n) if n.isdigit() else n


def subject_kind(subject, pid):
    """(phase-matches, word) for a `test(phase-X): word` subject, else None."""
    m = _SUBJECT.match(subject)
    if not m:
        return None
    word = m.group(2).rstrip(":,.;").lower()
    return (norm_phase(m.group(1)) == norm_phase(pid), word)


# ---- globs ----------------------------------------------------------------------

def _glob_re(pat):
    out, i, n = [], 0, len(pat)
    while i < n:
        c = pat[i]
        if pat.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif pat.startswith("**", i):
            out.append(".*")
            i += 2
        elif c == "*":
            out.append("[^/]*")
            i += 1
        elif c == "?":
            out.append("[^/]")
            i += 1
        elif c == "[":
            j = pat.find("]", i + 1)
            if j < 0:
                out.append(re.escape(c))
                i += 1
            else:
                body = pat[i + 1:j]
                if body.startswith("!"):
                    body = "^" + body[1:]
                out.append("[" + body.replace("\\", "\\\\") + "]")
                i = j + 1
        else:
            out.append(re.escape(c))
            i += 1
    return re.compile("".join(out) + r"\Z")


class Globs(object):
    def __init__(self, patterns):
        self.items = []
        for p in patterns:
            p = p.strip()
            if not p:
                continue
            anchored = p.startswith("/")
            body = p.lstrip("/")
            self.items.append(("/" in body or anchored, anchored, _glob_re(body)))

    def match(self, path):
        base = path.rsplit("/", 1)[-1]
        parts = path.split("/")
        for has_slash, anchored, rx in self.items:
            if not has_slash:
                if rx.match(base):
                    return True
                continue
            if anchored:
                if rx.match(path):
                    return True
                continue
            for k in range(len(parts)):
                if rx.match("/".join(parts[k:])):
                    return True
        return False


# ---- git -----------------------------------------------------------------------

def git(repo, *args):
    try:
        p = subprocess.Popen(("git", "-C", repo) + args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as exc:
        raise TestlockError("git not runnable: %s" % exc, 3)
    out, err = p.communicate()
    if p.returncode != 0:
        raise TestlockError("git %s failed: %s" % (" ".join(args), err.decode("utf-8", "replace").strip()), 3)
    return out.decode("utf-8", "replace")


def resolve(repo, ref):
    if not ref or ref.startswith("-"):
        raise TestlockError("invalid ref: %r" % ref, 2)
    try:
        return git(repo, "rev-parse", "--verify", "--quiet", ref + "^{commit}").strip()
    except TestlockError:
        raise TestlockError("ref does not resolve in %s: %s" % (repo, ref), 3)


def is_ancestor(repo, a, b):
    p = subprocess.Popen(("git", "-C", repo, "merge-base", "--is-ancestor", a, b),
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    p.communicate()
    return p.returncode == 0


def find_red(repo, head, pid):
    out = git(repo, "log", "--format=%H%x1f%s", head)
    for line in out.splitlines():
        sha, _, subject = line.partition("\x1f")
        k = subject_kind(subject, pid)
        if k and k[0] and k[1] == "red":
            return sha
    return ""


def commit_files(repo, sha, merge):
    if merge:
        out = git(repo, "diff-tree", "--no-commit-id", "-r", "--cc", "--name-only", "-z", sha)
    else:
        out = git(repo, "diff-tree", "--no-commit-id", "-r", "--root", "--no-renames", "--name-only", "-z", sha)
    return [f for f in out.split("\0") if f and f != sha]


def reason_of(message):
    lines = message.splitlines()[1:]
    kept = [ln.strip() for ln in lines if ln.strip() and not _TRAILER.match(ln.strip())]
    return kept[0] if kept else ""


def one_line(s, limit=160):
    s = " ".join(s.split())
    return s if len(s) <= limit else s[:limit - 3] + "..."


# ---- check ---------------------------------------------------------------------

def check(repo, head_ref, pid, red_ref, globs, stub_max, out):
    if not pid or not re.match(r"^[A-Za-z0-9._-]+$", pid):
        raise TestlockError("invalid phase id: %r" % pid, 2)
    head = resolve(repo, head_ref)
    phase = show_phase(pid)
    if red_ref:
        red = resolve(repo, red_ref)
        if not is_ancestor(repo, red, head):
            raise TestlockError("red %s is not an ancestor of head %s" % (red[:7], head[:7]), 3)
    else:
        red = find_red(repo, head, pid)
    if not red:
        out.write("TESTLOCK phase=%s red=- head=%s changed=0 allowed_fix=0 violations=0 other_phase=0 "
                  "result=FAIL reason=red_missing\n" % (phase, head[:7]))
        return 1

    changed, fixes, violations, other = set(), [], [], 0
    log = git(repo, "log", "--reverse", "--format=%H%x1f%P%x1f%B%x1e", "%s..%s" % (red, head))
    for rec in log.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        sha, parents, message = (rec.split("\x1f", 2) + ["", ""])[:3]
        subject = message.split("\n", 1)[0].strip()
        merge = len(parents.split()) > 1
        tests = [f for f in commit_files(repo, sha, merge) if globs.match(f)]
        if not tests:
            continue
        k = subject_kind(subject, pid)
        if k and not k[0]:
            other += 1
            continue
        changed.update(tests)
        if merge:
            kind = "merge"
        elif k and k[1] == "fix":
            reason = reason_of(message)
            if reason:
                fixes.append((sha, len(tests), reason))
                continue
            kind = "fix-no-reason"
        else:
            kind = "not-fix"
        for f in tests:
            violations.append((f, sha, kind, subject))

    for sha, n, reason in fixes:
        out.write("FIX commit=%s files=%d | %s\n" % (sha[:7], n, one_line(reason)))
    for f, sha, kind, subject in violations:
        out.write("VIOLATION file=%s commit=%s kind=%s | %s\n" % (f, sha[:7], kind, one_line(subject)))

    docs = Globs(DOC_GLOBS)
    prod = []
    for line in git(repo, "diff-tree", "--no-commit-id", "-r", "--root", "--no-renames", "--numstat", red).splitlines():
        cols = line.split("\t", 2)
        if len(cols) != 3 or cols[2] == red:
            continue
        added, path = cols[0], cols[2]
        if globs.match(path) or docs.match(path) or not added.isdigit():
            continue
        if int(added) > stub_max:
            prod.append(path)
    if prod:
        shown = ",".join(prod[:5]) + (",..." if len(prod) > 5 else "")
        out.write("WARN red_production files=%d max_lines=%d paths=%s\n" % (len(prod), stub_max, shown))

    result = "FAIL" if violations else "PASS"
    out.write("TESTLOCK phase=%s red=%s head=%s changed=%d allowed_fix=%d violations=%d other_phase=%d result=%s\n"
              % (phase, red[:7], head[:7], len(changed), len(fixes), len(violations), other, result))
    return 1 if violations else 0


# ---- CLI -----------------------------------------------------------------------

def _opts(args, names):
    vals, i = {}, 0
    while i < len(args):
        a = args[i]
        if a in names and i + 1 < len(args):
            vals[a] = args[i + 1]
            i += 2
        else:
            raise TestlockError("unknown or incomplete argument: %s" % a, 2)
    return vals


def main(argv):
    args = argv[1:]
    repo, rundir = None, None
    try:
        while args and args[0] in ("--repo", "--rundir"):
            if len(args) < 2:
                raise TestlockError("%s needs a value" % args[0], 2)
            if args[0] == "--repo":
                repo = args[1]
            else:
                rundir = args[1] or None
            args = args[2:]
        if not args or args[0] not in ("check", "commands"):
            raise TestlockError("usage: testlock.py [--repo R] [--rundir D] check|commands ...", 2)
        repo = os.path.abspath(repo or os.getcwd())
        try:
            cfg = config.Config(repo, rundir)
        except config.ConfigError as exc:
            raise TestlockError("config: %s" % exc, exc.code)
        if args[0] == "commands":
            if len(args) != 1:
                raise TestlockError("usage: testlock.py commands", 2)
            for c in cfg.values["gate.commands"][0]:
                if "\n" in c or "\t" in c:
                    raise TestlockError("gate.commands: a command must be one line without tabs", 2)
                sys.stdout.write(c + "\n")
            return 0
        o = _opts(args[1:], ("--head", "--phase", "--red"))
        if "--head" not in o or "--phase" not in o:
            raise TestlockError("check needs --head and --phase", 2)
        globs = Globs(cfg.values["gate.test_globs"][0])
        return check(repo, o["--head"], o["--phase"], o.get("--red", ""), globs,
                     cfg.values["gate.stub_max_lines"][0], sys.stdout)
    except TestlockError as exc:
        sys.stderr.write("testlock: %s\n" % exc)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
