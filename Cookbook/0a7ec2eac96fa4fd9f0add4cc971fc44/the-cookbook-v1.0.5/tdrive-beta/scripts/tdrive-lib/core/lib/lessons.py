"""Cross-run incident ledger and lesson files.

Ledger (learnstore kind `ledger`): one JSON row per incident occurrence,
  {"v": 1, "class", "severity", "run", "lines", "ts", "summary", "capture",
   "source": live|retro|backfill|intervention, "anchor"}
deduped by (run, class, anchor). Appends and lesson rewrites run under the
ledger lock (learnstore kind `ledger_lock`).
Lesson candidate: a class with >= lessons.min_count occurrences (all runs,
all sources), or one occurrence of a high-severity class. Its lesson file
<lessons>/<class>.md holds a yamlite header between `---` lines
(class severity status seen runs first_seen last_seen fix promote_to
proposal), then `## Evidence` (one line per occurrence) and `## Fix` (the
registry fix_hint and the texts of the interventions). status is one of
candidate|proposed|applied|retired and survives every rewrite, as does
proposal.

CLI:
  list                               LESSON class=<c> severity=<s> status=<st>
                                       seen=<n> runs=<n> last=<iso> path=<p>
  match --stop ID [--event EV] [--max N]
                                     lessons whose class wake_match holds ID
                                     or EV, status not retired, most seen
                                     first, at most N (default
                                     lessons.wake_max):
                                     LESSON class=<c> seen=<n> path=<p> | <fix>
                                     each shown lesson is a `use lessons
                                     changed` event of TDRIVE_RUN; with
                                     features.lessons off (decay) nothing is
                                     shown (one blocked-off use instead)
Exit: 0 ok, 2 usage, bad registry or store inside a project repo.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import learnstore  # noqa: E402
import runstate  # noqa: E402
import trace  # noqa: E402
import yamlite  # noqa: E402

STATUSES = ("candidate", "proposed", "applied", "retired")
HEADER = ("class", "severity", "status", "seen", "runs", "first_seen", "last_seen", "fix", "promote_to", "proposal")
FIX_MAX = 160


class LessonError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


# ---- ledger -------------------------------------------------------------------------

def read_ledger(path):
    rows = []
    try:
        fh = open(path, "rb")
    except (IOError, OSError):
        return rows
    with fh:
        for raw in fh:
            try:
                row = json.loads(raw.decode("utf-8"))
            except ValueError:
                continue
            if isinstance(row, dict) and row.get("v") == 1 and isinstance(row.get("class"), str) \
                    and isinstance(row.get("run"), str):
                rows.append(row)
    return rows


def _anchor(row):
    a = row.get("anchor")
    if isinstance(a, str):
        return a
    lines = row.get("lines") or []
    return lines[0] if lines else None


def ledger_keys(path):
    return set((r["run"], r["class"], _anchor(r)) for r in read_ledger(path))


def _append(path, rows):
    if not rows:
        return
    data = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows).encode("utf-8")
    old = os.umask(0o077)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    finally:
        os.umask(old)
    try:
        if os.write(fd, data) != len(data):
            raise IOError("short write to %s" % path)
    finally:
        os.close(fd)


def record(run, rows, registry, min_count, ledger, lock, lesson_dir, lessons_on=True):
    """Append the rows not yet in the ledger and rewrite the lessons of their
    classes, all under the ledger lock. Returns the rows appended. With
    lessons_on False (features.lessons switched off by decay) the ledger
    still records; a lesson that would be written is a blocked-off use."""
    by_id = dict((c["id"], c) for c in registry)
    written, withheld = [], []
    with runstate._FileLock(lock):
        keys = ledger_keys(ledger)
        added = []
        for r in rows:
            key = (run, r["class"], r["anchor"])
            if key in keys or r["class"] not in by_id:
                continue
            keys.add(key)
            added.append({"v": 1, "class": r["class"], "severity": r["severity"], "run": run, "lines": r["lines"],
                          "ts": r.get("ts"), "summary": r.get("summary", ""), "capture": r.get("capture"),
                          "source": r["source"], "anchor": r["anchor"]})
        _append(ledger, added)
        if added:
            all_rows = read_ledger(ledger)
            for cls in sorted(set(r["class"] for r in added)):
                cls_rows = [r for r in all_rows if r["class"] == cls]
                if lessons_on:
                    if write_lesson(by_id[cls], cls_rows, min_count, lesson_dir):
                        written.append(cls)
                elif len(cls_rows) >= min_count or by_id[cls]["severity"] == "high":
                    withheld.append(cls)
    for cls in written:
        trace.use(run, "incidents", "lessons", "fired", detail=cls)
    if withheld:
        trace.use(run, "incidents", "lessons", "blocked-off", detail=",".join(withheld))
    return added


# ---- lesson files -------------------------------------------------------------------

def _q(s):
    s = " ".join(str(s).split())
    return '"%s"' % s.replace("\\", "\\\\").replace('"', '\\"')


def read_header(path):
    """The header map of a lesson file, or None."""
    try:
        with open(path) as fh:
            text = fh.read()
    except (IOError, OSError):
        return None
    parts = text.split("---\n")
    if len(parts) < 3 or parts[0] != "":
        return None
    try:
        head = yamlite.loads(parts[1], path)
    except yamlite.YamlError:
        return None
    return head if isinstance(head, dict) else None


def lesson_path(lesson_dir, cls):
    return os.path.join(lesson_dir, cls + ".md")


def write_lesson(entry, rows, min_count, lesson_dir):
    """Write or refresh the lesson of a class when it is a candidate."""
    path = lesson_path(lesson_dir, entry["id"])
    old = read_header(path) if os.path.exists(path) else None
    candidate = len(rows) >= min_count or (entry["severity"] == "high" and rows)
    if not candidate and old is None:
        return None
    status = old.get("status") if old else None
    if status not in STATUSES:
        status = "candidate"
    proposal = old.get("proposal") if old else None
    rows = sorted(rows, key=lambda r: (str(r.get("ts") or ""), r["run"], int(_anchor(r)[1:]) if _anchor(r) else 0))
    stamps = [r["ts"] for r in rows if r.get("ts")]
    head = [
        "---",
        "class: %s" % entry["id"],
        "severity: %s" % entry["severity"],
        "status: %s" % status,
        "seen: %d" % len(rows),
        "runs: %d" % len(set(r["run"] for r in rows)),
        "first_seen: %s" % (_q(min(stamps)) if stamps else "null"),
        "last_seen: %s" % (_q(max(stamps)) if stamps else "null"),
        "fix: %s" % _q(entry["fix_hint"]),
        "promote_to: %s" % entry["promote"]["target"],
        "proposal: %s" % ("null" if proposal in (None, "") else _q(proposal)),
        "---",
    ]
    body = ["", "# Lesson: %s" % entry["id"], "", entry["description"], "", "## Evidence"]
    for r in rows:
        body.append("- run=%s trace=%s capture=%s ts=%s source=%s | %s"
                    % (r["run"], ",".join(r.get("lines") or []), r.get("capture") or "-", r.get("ts") or "-",
                       r.get("source"), r.get("summary", "")))
    body += ["", "## Fix", entry["fix_hint"]]
    for r in rows:
        if r.get("source") == "intervention":
            body.append("- run=%s trace=%s: %s" % (r["run"], ",".join(r.get("lines") or []), r.get("summary", "")))
    runstate.atomic_write(path, "\n".join(head + body) + "\n")
    return path


def all_lessons(lesson_dir):
    """[(class, header, path)] of every lesson file, by class."""
    out = []
    try:
        names = sorted(os.listdir(lesson_dir))
    except OSError:
        return out
    for name in names:
        if name.startswith(".") or not name.endswith(".md"):
            continue
        path = os.path.join(lesson_dir, name)
        head = read_header(path)
        if head and isinstance(head.get("class"), str):
            out.append((head["class"], head, path))
    return out


def _n(v):
    return v if isinstance(v, int) and not isinstance(v, bool) else 0


def match(registry, lesson_dir, stop, event=None, limit=3):
    wanted = set(x for x in (stop, event) if x)
    by_id = dict((c["id"], c) for c in registry)
    found = []
    for cls, head, path in all_lessons(lesson_dir):
        entry = by_id.get(cls)
        if entry is None or head.get("status") == "retired" or not wanted & set(entry["wake_match"]):
            continue
        found.append((cls, head, path))
    found.sort(key=lambda x: x[0])
    found.sort(key=lambda x: str(x[1].get("last_seen") or ""), reverse=True)
    found.sort(key=lambda x: _n(x[1].get("seen")), reverse=True)
    return found[:max(0, limit)]


# ---- CLI ------------------------------------------------------------------------------

def _fix(head):
    fix = " ".join(str(head.get("fix") or "-").split())
    return fix if len(fix) <= FIX_MAX else fix[:FIX_MAX - 1] + "…"


def main(argv):
    args = argv[1:]
    sub = args[0] if args else "list"
    try:
        if sub == "list":
            if len(args) > 1:
                raise LessonError(2, "usage: lessons.py list")
            for cls, head, path in all_lessons(learnstore.paths("lessons")):
                sys.stdout.write("LESSON class=%s severity=%s status=%s seen=%s runs=%s last=%s path=%s\n"
                                 % (cls, head.get("severity"), head.get("status"), _n(head.get("seen")),
                                    _n(head.get("runs")), head.get("last_seen") or "-", path))
            return 0
        if sub != "match":
            raise LessonError(2, "unknown lessons subcommand: %s (list or match)" % sub)
        o = {}
        i = 1
        while i < len(args):
            if args[i] not in ("--stop", "--event", "--max") or i + 1 >= len(args):
                raise LessonError(2, "usage: lessons.py match --stop ID [--event EV] [--max N]")
            o[args[i]] = args[i + 1]
            i += 2
        if not o.get("--stop"):
            raise LessonError(2, "usage: lessons.py match --stop ID [--event EV] [--max N]")
        if "--max" in o:
            try:
                limit = int(o["--max"])
            except ValueError:
                raise LessonError(2, "--max must be an integer: %r" % o["--max"])
        else:
            import config
            try:
                limit = config.Config().values["lessons.wake_max"][0]
            except config.ConfigError as exc:
                raise LessonError(2, str(exc))
        import incidents
        try:
            registry = incidents.load_registry()
        except incidents.IncidentError as exc:
            raise LessonError(exc.code, str(exc))
        import features
        run = os.environ.get("TDRIVE_RUN") or None
        found = match(registry, learnstore.paths("lessons"), o["--stop"], o.get("--event"), limit)
        if not features.run_enabled("lessons", run):
            if found and run:
                trace.use(run, "loop", "lessons", "blocked-off", detail=",".join(c for c, _h, _p in found))
            return 0
        for cls, head, path in found:
            sys.stdout.write("LESSON class=%s seen=%d path=%s | %s\n" % (cls, _n(head.get("seen")), path, _fix(head)))
            if run:
                trace.use(run, "loop", "lessons", "changed", detail=cls)
    except LessonError as exc:
        sys.stderr.write("lessons: %s\n" % exc)
        return exc.code
    except learnstore.StoreError as exc:
        sys.stderr.write("lessons: %s\n" % exc)
        return exc.code
    except (IOError, OSError) as exc:
        sys.stderr.write("lessons: %s\n" % exc)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
