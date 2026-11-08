"""Plan-table parser and branch readers for plan progress.

The phase table is the first markdown table (outside code fences) whose header
has both a `Phase` and a `Status` column. Only the Status cell decides
progress; checkboxes and other tables never count.

CLI:
  parse FILE|-                                     -> JSON
  select --repo R [--branch B] [--plan P]          -> plan path or `none`
  count  --repo R --branch B [--plan P]            -> done count
  eta    --repo R --branch B --plan P              -> ETA <iso|unknown> AVG_MIN <n|->
  state  --repo R --branch B [--plan P]            -> state lines (STAGE .. PHASE)
  signal --repo R --branch B [--plan P]            -> SIGNAL plan=<p|none> count=<n> head=<sha>
Every branch read uses the committed blob at the branch head, never the
working tree. --plan pins the plan path (config plan.path).
Exit codes: 0 ok, 2 usage, 3 not a git repo, branch missing or git failure.
"""
import os
import posixpath
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

DONE = ("done", "completed", "complete")
IN_PROGRESS = ("in progress", "in-progress", "wip", "doing")
STATUS_STRIP = ("*", "✅", "✓", "️")
DEPENDS_HEADERS = ("depends on", "depends", "deps", "blocked by")
EMPTY_DEPS = ("", "-", "—", "–", "none", "n/a")
PLAN_RE = re.compile(r"^plans/[^/]+/plan\.md$")
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
SEP_CELL_RE = re.compile(r"^:?-+:?$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
ETA_LOG_MAX = 200
ETA_INTERVALS = 5


class PlanError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


# ---- parsing -------------------------------------------------------------

def split_row(line):
    s = line.strip()
    if not s.startswith("|"):
        return None
    s = s.replace("\\|", "\0")[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.replace("\0", "|").strip() for c in s.split("|")]


def is_separator(cells):
    return bool(cells) and all(SEP_CELL_RE.match(c.replace(" ", "")) for c in cells)


def header_key(cell):
    return cell.replace("*", "").replace("`", "").strip().lower()


def norm_status(cell):
    s = cell
    for ch in STATUS_STRIP:
        s = s.replace(ch, "")
    s = s.strip().lower()
    if s in DONE:
        return "done"
    if s in IN_PROGRESS:
        return "in_progress"
    return "pending"


def norm_id(s):
    return re.sub(r"^0+(?=[0-9])", "", s.strip().lower())


def parse_depends(cell):
    if cell.strip().lower() in EMPTY_DEPS:
        return []
    out = []
    for tok in re.split(r"[,\s]+", cell.replace("*", "")):
        if tok and tok.lower() not in ("phase", "phases") and tok.lower() not in EMPTY_DEPS:
            out.append(tok)
    return out


def find_tables(lines):
    """Yield (header cells, [row cells]) for every table outside code fences."""
    fenced = False
    i = 0
    n = len(lines)
    while i < n:
        if FENCE_RE.match(lines[i]):
            fenced = not fenced
            i += 1
            continue
        if fenced:
            i += 1
            continue
        head = split_row(lines[i])
        if head is not None and i + 1 < n:
            sep = split_row(lines[i + 1])
            if sep is not None and is_separator(sep):
                rows = []
                j = i + 2
                while j < n:
                    cells = split_row(lines[j])
                    if cells is None:
                        break
                    rows.append(cells)
                    j += 1
                yield head, rows
                i = j
                continue
        i += 1


def plan_title(lines):
    start = 0
    while start < len(lines) and (not lines[start].strip() or lines[start].lstrip().startswith("<!--")):
        start += 1
    if start < len(lines) and lines[start].strip() == "---":
        for line in lines[start + 1:]:
            if line.strip() == "---":
                break
            m = re.match(r"^title:\s*(.*)$", line)
            if m:
                return m.group(1).strip().strip("\"'")
    for line in lines:
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def cell(cells, idx):
    if idx is None or idx >= len(cells):
        return ""
    return cells[idx]


def parse_text(text, plan="-"):
    lines = text.replace("\r\n", "\n").split("\n")
    phases = []
    for head, rows in find_tables(lines):
        keys = [header_key(c) for c in head]
        cols = {}
        for idx, k in enumerate(keys):
            if k in ("phase", "phases") and "phase" not in cols:
                cols["phase"] = idx
            elif k == "status" and "status" not in cols:
                cols["status"] = idx
            elif k == "#" and "id" not in cols:
                cols["id"] = idx
            elif k == "name" and "name" not in cols:
                cols["name"] = idx
            elif k in DEPENDS_HEADERS and "depends" not in cols:
                cols["depends"] = idx
        if "phase" not in cols or "status" not in cols:
            continue
        has_deps = "depends" in cols
        for n, cells in enumerate(rows, 1):
            if not any(cells):
                continue
            phase_cell = cell(cells, cols["phase"])
            name_cell = cell(cells, cols.get("name"))
            pid = cell(cells, cols.get("id"))
            if not pid and "name" in cols and not LINK_RE.search(phase_cell):
                pid = phase_cell
            if not pid:
                pid = str(n)
            m = LINK_RE.search(phase_cell) or LINK_RE.search(name_cell)
            if m:
                name, target = m.group(1).strip(), m.group(2)
                target = target.split("#", 1)[0]
                while target.startswith("./"):
                    target = target[2:]
                ffile = target or None
            else:
                name = (name_cell or phase_cell).replace("*", "").strip()
                ffile = None
            status = cell(cells, cols["status"])
            phases.append({
                "id": pid.replace("*", "").strip(),
                "name": name,
                "file": ffile,
                "depends": parse_depends(cell(cells, cols.get("depends"))) if has_deps else [],
                "status": status,
                "norm": norm_status(status),
            })
        return summarize(plan, plan_title(lines), phases, has_deps)
    return summarize(plan, plan_title(lines), [], False)


def summarize(plan, title, phases, has_deps):
    total = len(phases)
    done_ids = set(norm_id(p["id"]) for p in phases if p["norm"] == "done")
    done = sum(1 for p in phases if p["norm"] == "done")
    pending = [p for p in phases if p["norm"] == "pending"]
    if has_deps:
        nxt = [p["id"] for p in pending if all(norm_id(d) in done_ids for d in p["depends"])]
    else:
        nxt = [pending[0]["id"]] if pending else []
    pct = (done * 200 + total) // (2 * total) if total else 0
    return {
        "title": title,
        "plan": plan,
        "phases": phases,
        "done": done,
        "total": total,
        "pct": pct,
        "in_progress": [p["id"] for p in phases if p["norm"] == "in_progress"],
        "next": nxt,
    }


# ---- clock (runstate is imported only when an ETA is needed) --------------

def _now():
    import runstate
    try:
        return runstate.now()
    except runstate.RunStateError as exc:
        raise PlanError(exc.code, str(exc))


def _iso(epoch):
    import runstate
    return runstate.iso(epoch)


# ---- git -----------------------------------------------------------------

def git(repo, args, data=None):
    try:
        proc = subprocess.run(["git", "-C", repo] + args, input=data,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as exc:
        raise PlanError(3, "cannot run git: %s" % exc.strerror)
    return proc.returncode, proc.stdout, proc.stderr


def branch_ref(repo, name):
    """refs/heads/<name> when that branch exists, else name unchanged.

    A plain name that is both a branch and a tag (Buildflow's `build` gate
    tag on the `build` branch) resolves to the tag in git; tdrive always
    means the branch."""
    if not name or name.startswith(("refs/", "-")) or name == "HEAD" or re.search(r"[\^~:@{}\s]", name) \
            or re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", name):
        return name
    rc, _, _ = git(repo, ["show-ref", "--verify", "--quiet", "refs/heads/" + name])
    return "refs/heads/" + name if rc == 0 else name


def branch_head(repo, branch):
    if not os.path.isdir(repo):
        raise PlanError(3, "repo not found: %s" % repo)
    rc, out, _ = git(repo, ["rev-parse", "--verify", "--quiet", branch_ref(repo, branch) + "^{commit}"])
    if rc != 0:
        if git(repo, ["rev-parse", "--git-dir"])[0] != 0:
            raise PlanError(3, "not a git repo: %s" % repo)
        raise PlanError(3, "branch not found in %s: %s" % (repo, branch))
    return out.decode("ascii", "replace").strip()


def blob(repo, rev, path):
    """Text of rev:path, or None when the path does not exist at rev."""
    rc, out, _ = git(repo, ["cat-file", "blob", "%s:%s" % (branch_ref(repo, rev), path)])
    if rc != 0:
        return None
    return out.decode("utf-8", "replace")


def clean_pin(repo, pin):
    if not pin:
        return ""
    if os.path.isabs(pin):
        pin = os.path.relpath(pin, os.path.realpath(repo))
    while pin.startswith("./"):
        pin = pin[2:]
    if "\n" in pin or "\t" in pin or pin.startswith("../"):
        raise PlanError(2, "invalid plan path: %r" % pin)
    return pin


def select_plan(repo, head, pin):
    if pin:
        return pin
    rc, out, err = git(repo, ["ls-tree", "-r", "-z", "--name-only", head, "--", "plans/"])
    if rc != 0:
        raise PlanError(3, "git ls-tree failed: %s" % err.decode("utf-8", "replace").strip())
    names = [p for p in out.decode("utf-8", "replace").split("\0")
             if PLAN_RE.match(p) and not p.startswith("plans/reports/")]
    if not names:
        return None
    return sorted(names, reverse=True)[0]


def read_plan(repo, branch, pin):
    """(head, plan path or None, parsed dict) at the branch head."""
    head = branch_head(repo, branch)
    plan = select_plan(repo, head, clean_pin(repo, pin))
    text = blob(repo, head, plan) if plan else None
    parsed = parse_text(text if text is not None else "", plan or "none")
    return head, plan, parsed


def batch_blobs(repo, specs):
    """Contents for each `rev:path` in specs (None when missing), one git call."""
    if not specs:
        return []
    data = "".join(s + "\n" for s in specs).encode("utf-8")
    rc, out, err = git(repo, ["cat-file", "--batch"], data)
    if rc != 0:
        raise PlanError(3, "git cat-file failed: %s" % err.decode("utf-8", "replace").strip())
    result = []
    pos = 0
    for _ in specs:
        nl = out.index(b"\n", pos)
        header = out[pos:nl].decode("utf-8", "replace").split()
        pos = nl + 1
        if len(header) == 3 and header[2].isdigit():
            size = int(header[2])
            result.append(out[pos:pos + size].decode("utf-8", "replace"))
            pos += size + 1
        else:
            result.append(None)
    return result


def eta(repo, branch, plan, total, done):
    """(eta epoch or None, average minutes or None)."""
    if not plan or total <= 0:
        return None, None
    head = branch_head(repo, branch)
    rc, out, err = git(repo, ["log", "--format=%H%x09%ct", "-n", str(ETA_LOG_MAX), head, "--", plan])
    if rc != 0:
        raise PlanError(3, "git log failed: %s" % err.decode("utf-8", "replace").strip())
    commits = []
    for line in out.decode("ascii", "replace").splitlines():
        parts = line.split("\t")
        if len(parts) == 2 and parts[1].isdigit():
            commits.append((parts[0], int(parts[1])))
    commits.reverse()
    texts = batch_blobs(repo, ["%s:%s" % (sha, plan) for sha, _ in commits])
    anchors = []
    prev = None
    for (sha, ct), text in zip(commits, texts):
        count = parse_text(text or "", plan)["done"]
        if prev is None or count > prev:
            anchors.append(ct)
        prev = count
    intervals = [b - a for a, b in zip(anchors, anchors[1:])][-ETA_INTERVALS:]
    if not intervals:
        return None, None
    avg_s = float(sum(intervals)) / len(intervals)
    return _now() + int(round(max(0, total - done) * avg_s)), int(round(avg_s / 60.0))


# ---- output ----------------------------------------------------------------

def ids_text(ids):
    return ",".join(ids) if ids else "-"


def one_line(s):
    return re.sub(r"[\t\r\n]+", " ", s)


def state_lines(repo, branch, pin):
    _, plan, p = read_plan(repo, branch, pin)
    if p["total"] == 0:
        stage = "planning"
    elif p["done"] == p["total"]:
        stage = "complete"
    else:
        stage = "cooking"
    eta_epoch, avg = eta(repo, branch, plan, p["total"], p["done"])
    lines = [
        "STAGE %s" % stage,
        "PLAN %s" % (plan or "none"),
        "DONE %d" % p["done"],
        "TOTAL %d" % p["total"],
        "PCT %d" % p["pct"],
        "IN_PROGRESS %s" % ids_text(p["in_progress"]),
        "NEXT %s" % ids_text(p["next"]),
        "ETA %s AVG_MIN %s" % (_iso(eta_epoch) if eta_epoch is not None else "unknown",
                               avg if avg is not None else "-"),
    ]
    plan_dir = posixpath.dirname(plan) if plan else ""
    for ph in p["phases"]:
        f = ph["file"]
        if f and not posixpath.isabs(f):
            f = posixpath.normpath(posixpath.join(plan_dir, f))
        lines.append("PHASE %s\t%s\t%s\t%s" % (one_line(ph["id"]), ph["norm"], one_line(ph["name"]) or "-",
                                               one_line(f) if f else "-"))
    return lines


def signal_line(repo, branch, pin):
    head, plan, p = read_plan(repo, branch, pin)
    return "SIGNAL plan=%s count=%d head=%s" % (plan or "none", p["done"], head)


# ---- CLI -------------------------------------------------------------------

def _opts(args, names, usage):
    opts = {}
    i = 0
    while i < len(args):
        a = args[i]
        if a not in names or i + 1 >= len(args):
            raise PlanError(2, "usage: plan_table.py %s" % usage)
        opts[a] = args[i + 1]
        i += 2
    return opts


def _read_input(path):
    try:
        if path == "-":
            return sys.stdin.buffer.read().decode("utf-8", "replace")
        with open(path, "rb") as fh:
            return fh.read().decode("utf-8", "replace")
    except (IOError, OSError) as exc:
        raise PlanError(2, "cannot read %s: %s" % (path, exc.strerror))


def run_cli(argv):
    if not argv:
        raise PlanError(2, "usage: plan_table.py parse|select|count|eta|state|signal ...")
    cmd, args = argv[0], argv[1:]
    out = sys.stdout
    if cmd == "parse":
        if len(args) != 1:
            raise PlanError(2, "usage: plan_table.py parse FILE|-")
        import json
        out.write(json.dumps(parse_text(_read_input(args[0]), args[0]), indent=2, ensure_ascii=False) + "\n")
        return 0
    branch_usage = "%s --repo R --branch B [--plan P]" % cmd
    if cmd == "select":
        o = _opts(args, ("--repo", "--branch", "--plan"), "select --repo R [--branch B] [--plan P]")
        if "--repo" not in o:
            raise PlanError(2, "usage: plan_table.py select --repo R [--branch B] [--plan P]")
        head = branch_head(o["--repo"], o.get("--branch", "HEAD"))
        plan = select_plan(o["--repo"], head, clean_pin(o["--repo"], o.get("--plan", "")))
        out.write("%s\n" % (plan or "none"))
        return 0
    if cmd in ("count", "state", "signal", "eta"):
        o = _opts(args, ("--repo", "--branch", "--plan"), branch_usage)
        if "--repo" not in o or "--branch" not in o or (cmd == "eta" and not o.get("--plan")):
            raise PlanError(2, "usage: plan_table.py %s" % (
                "eta --repo R --branch B --plan P" if cmd == "eta" else branch_usage))
        repo, branch, pin = o["--repo"], o["--branch"], o.get("--plan", "")
        if cmd == "count":
            out.write("%d\n" % read_plan(repo, branch, pin)[2]["done"])
        elif cmd == "state":
            out.write("".join(line + "\n" for line in state_lines(repo, branch, pin)))
        elif cmd == "signal":
            out.write(signal_line(repo, branch, pin) + "\n")
        else:
            _, plan, p = read_plan(repo, branch, pin)
            e, avg = eta(repo, branch, plan if p["total"] else None, p["total"], p["done"])
            if e is None:
                out.write("ETA unknown AVG_MIN -\n")
            else:
                out.write("ETA %s AVG_MIN %d\n" % (_iso(e), avg))
        return 0
    raise PlanError(2, "unknown command: %s" % cmd)


def main(argv):
    try:
        return run_cli(argv[1:])
    except PlanError as exc:
        sys.stderr.write("plan_table: %s\n" % exc)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
