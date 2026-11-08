"""Operate trace: R/trace.jsonl, schema v1, one JSON object per line.

Envelope (all required): v (1), ts (ISO UTC, TDRIVE_NOW or clock), run,
src, kind, data. Every string is scrubbed and cut to 400 chars; a line over
4000 bytes drops array tails, then optional fields (never a byte slice) and
carries "truncated": true. A line is appended with O_APPEND and one write;
its id is its 1-based line number L<n>. A trace failure is logged to
R/tdrive.log and never changes the calling command's stdout or exit code.
TDRIVE_DRY_RUN=1 writes nothing. The first event of a run that tdrive
started (run.env) with a tdrive.log but no trace (a run of an older
version, resumed) backfills it first; a run tdrive did not start is never
backfilled unless `tdrive trace backfill` is asked for it by name.

CLI:
  emit --run R --src S --kind K [--field k=v]... [--json-field k=JSON]...
       [--list-field k=v]...
       [--ref-last FIELD=KIND] [--age-last FIELD=KIND] [--age-since FIELD=EPOCH]
       [--file-sha FIELD=PATH] [--region-file FIELD=PATH]
       [--verify-file PATH] [--report-file PATH] [--ignored-tests REPO]
      Appends one event; prints nothing; always exits 0.
      --ignored-tests adds ignored_test_files {n, paths (first 5)}: the
      git-ignored files under the test dirs of the work tree REPO (bounded).
  phases --run R --src S [--next-src prev_done|cook_sent|resume|-] < state
      `phase done` for done ids with an open start, `phase start` for new
      IN_PROGRESS ids, then for new NEXT ids with --next-src (resume only
      right after a `run action=resume`). Always exits 0.
  resumed --run R              exit 0 when the last run event is a resume
                               with no phase event after it, else 1
  unanswered --run R           exit 0 when the last question has no answer
                               after it, else 1
  check [FILE]                 TRACE OK file=<p> lines=<n> v=1 |
                               TRACE INVALID L<n> reason=<r> ... |
                               TRACE UNSUPPORTED L<n> v=<n>   (exit 0/1/2)
  backfill --run R             TRACED <run> backfill lines=<n> (exit 0/2/5)
  add --run R --kind intervention|answer|alert --text T [--by driver|operator]
      [--ref L<n>] [--class C]  TRACED <run> L<n> kind=<k>     (exit 0/2/3)
Python: read(path) yields (lineno, obj) of v1 lines; emit(run, src, kind,
data) appends one event and returns its end offset (None when not written);
use(run, src, feature, effect[, detail]) appends one `use` event (effect
fired|changed|blocked-off), the usage counter of the decay scan.
"""
import calendar
import hashlib
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import runstate  # noqa: E402
from scrub import scrub  # noqa: E402

V = 1
TRACE = "trace.jsonl"
STR_MAX = 400
STR_MIN = 100
LINE_MAX = 4000
ELLIPSIS = "…"
SRCS = ("loop", "start", "boot", "watch", "verify", "govern", "send", "amend", "decide", "report",
        "driver", "operator", "backfill", "incidents", "retro")
# kind -> (required data fields, known optional fields). Unknown optional
# fields are accepted: new optional fields do not bump v.
KINDS = {
    "run": (("action",), ("preset", "engine", "cap", "models_table", "stop", "since_wake_s")),
    "watch": (("action",), ("specs", "suppress", "max_min")),
    "watch_event": (("event", "line"), ("session", "latency_s")),
    "pane": (("session", "state"), ("agents", "shells", "pending_input", "screen_sha", "static_ticks")),
    "wake": (("stop", "line"), ("source", "latency_s")),
    "decision": (("id",), ("key", "value", "why")),
    "verify": (("sha", "result"), ("count", "targets", "probes", "reason", "ignored_test_files")),
    "govern": (("line",), ()),
    "send": (("mode", "result"), ("template", "chars", "reason", "dispatch_rule")),
    "amend": (("axx", "status"), ()),
    "question": (("text",), ()),
    "answer": (("text",), ("by", "ref")),
    "intervention": (("text",), ("by", "ref", "class")),
    "alert": (("text",), ("by", "ref", "class")),
    "phase": (("id", "event"), ("name", "secs", "start_src", "kind", "model", "effort", "model_source")),
    "dispatch": (("phase", "kind"), ("model", "effort", "model_source")),
    "limit": (("reset", "hash"), ()),
    "report": (("stage",), ("done_chars", "done_lines", "verify_shown", "verify_sha", "heads_up",
                            "pending_sha")),
    "incident": (("class", "severity", "lines"), ("summary", "capture")),
    "retro": (("path",), ("since", "proposals", "roi", "off", "on")),
    "handled": (("event", "action"), ("tokens",)),
    "use": (("feature", "effect"), ("detail",)),
}
USE_EFFECTS = ("fired", "changed", "blocked-off")
ENVELOPE = ("v", "ts", "run", "src", "kind", "data")
START_SRCS = ("in_progress", "prev_done", "cook_sent", "resume")
ADD_KINDS = ("intervention", "answer", "alert")
INT_FIELDS = frozenset(("cap", "since_wake_s", "max_min", "latency_s", "agents", "shells", "static_ticks",
                        "secs", "count", "chars", "done_chars", "done_lines", "tokens", "agents_pane",
                        "agents_ps", "exit", "pid", "ppid"))
BOOL_FIELDS = frozenset(("verify_shown", "summary_empty"))
LINE_ID_RE = re.compile(r"^L[1-9][0-9]*$")
ISO_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")


class TraceError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


# ---- helpers ---------------------------------------------------------------------

def log(rd, msg):
    """One `<iso> trace <msg>` line in R/tdrive.log; never raises."""
    if not rd or not os.path.isdir(rd):
        return
    try:
        ts = runstate.iso()
    except runstate.RunStateError:
        ts = "unknown-time"
    try:
        with open(os.path.join(rd, "tdrive.log"), "a") as fh:
            fh.write("%s trace %s\n" % (ts, msg.replace("\n", " ")))
    except (IOError, OSError):
        pass


def epoch(iso):
    try:
        return calendar.timegm(time.strptime(iso, "%Y-%m-%dT%H:%M:%SZ"))
    except (TypeError, ValueError):
        return None


def trace_path(run):
    return os.path.join(runstate.run_dir(run), TRACE)


def check_event(obj):
    """None when obj is a valid v1 event, else the reason it is invalid."""
    if not isinstance(obj, dict):
        return "bad-json"
    for k in ENVELOPE:
        if k not in obj:
            return "missing:%s" % k
    if not isinstance(obj["v"], int) or isinstance(obj["v"], bool):
        return "bad-type:v"
    if not isinstance(obj["ts"], str) or not ISO_RE.match(obj["ts"]):
        return "bad-type:ts"
    if not isinstance(obj["run"], str) or not runstate.valid_run(obj["run"]):
        return "bad-type:run"
    if obj["src"] not in SRCS:
        return "bad-src:%s" % obj["src"]
    if obj["kind"] not in KINDS:
        return "unknown-kind:%s" % obj["kind"]
    if not isinstance(obj["data"], dict):
        return "bad-type:data"
    for k in KINDS[obj["kind"]][0]:
        if k not in obj["data"]:
            return "missing:%s" % k
    return None


def read(path):
    """Yield (lineno, obj) for every valid v1 line; v > 1 lines are skipped
    with one tdrive.log warning; invalid lines are skipped."""
    warned = False
    try:
        fh = open(path, "rb")
    except (IOError, OSError):
        return
    with fh:
        for n, raw in enumerate(fh, 1):
            try:
                obj = json.loads(raw.decode("utf-8"))
            except ValueError:
                continue
            if not isinstance(obj, dict):
                continue
            v = obj.get("v")
            if isinstance(v, int) and not isinstance(v, bool) and v > V:
                if not warned:
                    log(os.path.dirname(path), "skipped L%d of %s: unsupported v=%d" % (n, path, v))
                    warned = True
                continue
            if check_event(obj) is None and obj["v"] == V:
                yield n, obj


def _clean(value, flag):
    """Scrub and cut every string in value (recursively)."""
    if isinstance(value, str):
        s = scrub(value)
        if len(s) > STR_MAX:
            flag[0] = True
            s = s[:STR_MAX - 1] + ELLIPSIS
        return s
    if isinstance(value, list):
        return [_clean(x, flag) for x in value]
    if isinstance(value, dict):
        return dict((k, _clean(v, flag)) for k, v in value.items())
    return value


def _clip(value, limit):
    if isinstance(value, str):
        return value if len(value) <= limit else value[:limit - 1] + ELLIPSIS
    if isinstance(value, list):
        return [_clip(x, limit) for x in value]
    if isinstance(value, dict):
        return dict((k, _clip(v, limit)) for k, v in value.items())
    return value


def _dumps(obj):
    return json.dumps(obj, ensure_ascii=False)


def _size(value):
    return len(_dumps(value).encode("utf-8"))


def shape(obj):
    """The JSON line of obj, scrubbed and within LINE_MAX bytes, or None."""
    flag = [False]
    obj["data"] = _clean(obj["data"], flag)
    if flag[0]:
        obj["truncated"] = True
    required = set(KINDS[obj["kind"]][0])
    data = obj["data"]
    clipped = False
    line = _dumps(obj)
    while len(line.encode("utf-8")) > LINE_MAX:
        obj["truncated"] = True
        lists = [k for k, v in data.items() if isinstance(v, list) and len(v) > 1]
        optional = [k for k in data if k not in required]
        if lists:
            k = max(lists, key=lambda x: _size(data[x]))
            data[k] = data[k][:-1]
        elif optional:
            k = max(optional, key=lambda x: _size(data[x]))
            del data[k]
        elif not clipped:
            obj["data"] = data = _clip(data, STR_MIN)
            clipped = True
        else:
            return None
        line = _dumps(obj)
    return line


def _append(path, line):
    """Append line with one write; returns the end offset, None on a short write."""
    data = (line + "\n").encode("utf-8")
    old = os.umask(0o077)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    finally:
        os.umask(old)
    try:
        n = os.write(fd, data)
        end = os.lseek(fd, 0, os.SEEK_CUR)
    finally:
        os.close(fd)
    if n != len(data):
        raise TraceError(3, "short write to %s: %d of %d bytes (not retried)" % (path, n, len(data)))
    return end


def line_id(path, end):
    """Number of newlines in path up to the byte offset end."""
    count = 0
    left = end
    with open(path, "rb") as fh:
        while left > 0:
            chunk = fh.read(min(65536, left))
            if not chunk:
                break
            count += chunk.count(b"\n")
            left -= len(chunk)
    return count


def _last(path, kind):
    """(lineno, obj) of the last v1 event of kind, or (None, None)."""
    found = (None, None)
    for n, o in read(path):
        if o["kind"] == kind:
            found = (n, o)
    return found


def _resolve_refs(path, data, refs, now):
    for op, field, arg in refs:
        if op == "age-since":
            data[field] = max(0, now - arg)
            continue
        n, o = _last(path, arg)
        if n is None:
            continue
        if op == "ref-last":
            data[field] = "L%d" % n
        elif op == "age-last":
            t = epoch(o["ts"])
            if t is not None:
                data[field] = max(0, now - t)


def _ensure_backfilled(run, rd, path):
    """Backfill a legacy run (run.env and tdrive.log, no trace) once, under
    the run.env lock."""
    if os.path.lexists(path) or not os.path.exists(os.path.join(rd, "tdrive.log")) \
            or not os.path.exists(os.path.join(rd, "run.env")):
        return
    with runstate._FileLock(os.path.join(rd, ".run.env.lock")):
        if os.path.lexists(path):
            return
        try:
            n = write_backfill(run, rd, path)
        except TraceError as exc:
            if exc.code != 5:
                raise
            return
        log(rd, "legacy run: backfilled %d events before the first trace event" % n)


def emit(run, src, kind, data, refs=(), backfill=True):
    """Append one event to the trace of run. Returns the end offset of the
    written line, or None (dry-run, no run dir, invalid event, write error).
    Never raises."""
    rd = None
    try:
        if os.environ.get("TDRIVE_DRY_RUN") == "1":
            return None
        if not runstate.valid_run(run or ""):
            return None
        rd = runstate.run_dir(run)
        if not os.path.isdir(rd):
            return None
        path = os.path.join(rd, TRACE)
        now = runstate.now()
        obj = {"v": V, "ts": runstate.iso(now), "run": run, "src": src, "kind": kind, "data": dict(data)}
        reason = check_event(obj)
        if reason:
            log(rd, "event not written (%s): src=%s kind=%s" % (reason, src, kind))
            return None
        if backfill:
            _ensure_backfilled(run, rd, path)
        _resolve_refs(path, obj["data"], refs, now)
        line = shape(obj)
        if line is None:
            log(rd, "event not written (cannot fit %d bytes): kind=%s" % (LINE_MAX, kind))
            return None
        return _append(path, line)
    except TraceError as exc:
        log(rd, str(exc))
    except Exception as exc:  # a trace failure must never reach the caller
        log(rd, "cannot write the trace: %s: %s" % (type(exc).__name__, exc))
    return None


def use(run, src, feature, effect, detail=None):
    """One `use` event: feature fired, changed an outcome or was requested
    while switched off (blocked-off). Same guarantees as emit; an unknown
    effect is logged and not written."""
    if effect not in USE_EFFECTS:
        try:
            log(runstate.run_dir(run), "unknown use effect %r of %s (not written)" % (effect, feature))
        except runstate.RunStateError:
            pass
        return None
    data = {"feature": feature, "effect": effect}
    if detail:
        data["detail"] = detail
    return emit(run, src, "use", data)


# ---- machine-output parsers (live emitters and backfill share them) --------------

TARGET_RE = re.compile(r"^TARGET (\S+) exit=(-?[0-9]+) secs=([0-9]+) \| ?(.*)$")
TARGET_SKIP_RE = re.compile(r"^TARGET (\S+) SKIP reason=(\S+)")
PROBE_RE = re.compile(r"^PROBE (\S+) .*?got=(\S+) match=(\S+) (PASS|FAIL|SKIP)(?: reason=(\S+))?")
RESULT_RE = re.compile(r"^RESULT (PASS|FAIL|WEAK|DEFERRED)\b(?:.* reason=(\S+))?")
VERIFY_RE = re.compile(r"^VERIFY \S+ ([0-9a-f]{7,40}) ")


def verify_data(lines):
    """targets, probes, result, reason and sha7 from `tdrive verify` stdout."""
    d = {"targets": [], "probes": []}
    for line in lines:
        m = TARGET_RE.match(line)
        if m:
            summary = m.group(4).strip()
            d["targets"].append({"name": m.group(1), "exit": int(m.group(2)),
                                 "summary_empty": m.group(2) == "0" and summary in ("", "-"),
                                 "secs": int(m.group(3))})
            continue
        m = TARGET_SKIP_RE.match(line)
        if m:
            d["targets"].append({"name": m.group(1), "exit": None, "summary_empty": False,
                                 "reason": m.group(2)})
            continue
        m = PROBE_RE.match(line)
        if m:
            p = {"id": m.group(1), "got": m.group(2), "match": m.group(3), "verdict": m.group(4)}
            if m.group(5):
                p["reason"] = m.group(5)
            d["probes"].append(p)
            continue
        m = RESULT_RE.match(line)
        if m:
            d["result"] = m.group(1)
            if m.group(2):
                d["reason"] = m.group(2)
            continue
        m = VERIFY_RE.match(line)
        if m:
            d["sha7"] = m.group(1)
    return d


REPORT_HEAD_RE = re.compile(r"^REPORT (\S+) (\S+) stage=(\S+)")
DONE_VERIFY_RE = re.compile(r"\(verify (PASS|FAIL|WEAK|deferred)\b")
PENDING_RE = re.compile(r"\bverify DEFERRED ([0-9a-f]{7,40})\b.*\bretry pending")
HEADS_UP = "HEADS-UP — "
DONE = "DONE — "
SEP = " · "


def report_data(text, snapshot=None):
    """(iso, data) of a saved report; snapshot verify_sha is used when the
    snapshot was written with this report."""
    lines = text.split("\n")
    m = REPORT_HEAD_RE.match(lines[0]) if lines else None
    if not m:
        return None, None
    iso, d = m.group(2), {"stage": m.group(3)}
    done = []
    for line in lines[1:]:
        if line.startswith(DONE):
            done.append(line)
        elif done and line.startswith(" ") and line.strip():
            done.append(line)
        elif done:
            break
    if done:
        d["done_chars"] = len("\n".join(done))
        d["done_lines"] = len(done)
        d["verify_shown"] = DONE_VERIFY_RE.search(done[0]) is not None
    for line in lines:
        if line.startswith(HEADS_UP):
            body = line[len(HEADS_UP):]
            items = [] if body.strip() == "none detected" else [x.strip() for x in body.split(SEP) if x.strip()]
            d["heads_up"] = items
            for it in items:
                pm = PENDING_RE.search(it)
                if pm:
                    d["pending_sha"] = pm.group(1)
            break
    if isinstance(snapshot, dict) and isinstance(snapshot.get("ts"), int) and snapshot.get("verify_sha"):
        if runstate.iso(snapshot["ts"]) == iso:
            d["verify_sha"] = snapshot["verify_sha"]
    return iso, d


def read_text(path):
    try:
        with open(path, "rb") as fh:
            return fh.read().decode("utf-8", "replace")
    except (IOError, OSError):
        return None


def load_snapshot(rd):
    raw = read_text(os.path.join(rd, "report.snapshot"))
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        return None


RULE_RE = re.compile("^[\u2500-\u257f\\s]*$")


def region_text(path, bottom=25):
    """The pane's bottom region (the classifier's prompt region) without
    blank and box-drawing lines, its last 400 chars."""
    import pane_classify
    raw = read_text(path)
    if raw is None:
        return None
    region = pane_classify.bottom_region([x.rstrip() for x in raw.split("\n")], bottom)
    lines = [x.strip() for x in region.split("\n") if not RULE_RE.match(x)]
    return "\n".join(lines)[-STR_MAX:].strip()


def file_sha(path):
    try:
        with open(path, "rb") as fh:
            return hashlib.sha1(fh.read()).hexdigest()
    except (IOError, OSError):
        return None


TEST_DIRS = ("tests", "test", "spec", "__tests__")
IGNORED_PATHS_MAX = 5
IGNORED_TIMEOUT_S = 5


def ignored_test_files(repo):
    """{n, paths} of the git-ignored files under the test dirs of the work
    tree repo (a test that passes only with them is a dirty-tree pass), or
    None when git cannot tell within the bound."""
    import subprocess
    env = dict((k, v) for k, v in os.environ.items() if not k.startswith("GIT_"))
    try:
        p = subprocess.run(["git", "-C", repo, "ls-files", "--others", "--ignored", "--exclude-standard", "-z",
                            "--"] + list(TEST_DIRS), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           timeout=IGNORED_TIMEOUT_S, env=env)
    except (OSError, subprocess.SubprocessError):
        return None
    if p.returncode != 0:
        return None
    paths = sorted(x for x in p.stdout.decode("utf-8", "replace").split("\0") if x)
    return {"n": len(paths), "paths": paths[:IGNORED_PATHS_MAX]}


# ---- phases ----------------------------------------------------------------------

def parse_state(lines):
    st = {"done": [], "in_progress": [], "next": [], "names": {}}
    for line in lines:
        if line.startswith("IN_PROGRESS ") or line.startswith("NEXT "):
            key, ids = line.split(" ", 1)
            vals = [x.strip() for x in ids.split(",") if x.strip() and x.strip() != "-"]
            st["in_progress" if key == "IN_PROGRESS" else "next"] = vals
        elif line.startswith("PHASE "):
            parts = line[len("PHASE "):].split("\t")
            if len(parts) >= 3:
                st["names"][parts[0]] = parts[2]
                if parts[1] == "done":
                    st["done"].append(parts[0])
    return st


def _phase_index(path):
    """(open starts {id: (ts, start_src)}, last run action, phase after it)."""
    opened = {}
    last_run = None
    phase_after = False
    for _n, o in read(path):
        if o["kind"] == "run":
            last_run = o["data"].get("action")
            phase_after = False
        elif o["kind"] == "phase":
            phase_after = True
            pid, ev = str(o["data"]["id"]), o["data"]["event"]
            if ev == "start":
                opened[pid] = (o["ts"], o["data"].get("start_src"))
            elif ev == "done":
                opened.pop(pid, None)
    return opened, last_run, phase_after


def sync_phases(run, src, state_lines, next_src=None, annotate=None):
    """Emit the phase events the state implies; returns how many.
    annotate(data), when given, may add fields to each phase event before it
    is written and returns the (kind, data) events to append right after it
    (only when the phase event was written)."""
    try:
        path = trace_path(run)
    except runstate.RunStateError:
        return 0
    st = parse_state(state_lines)
    opened, last_run, phase_after = _phase_index(path)
    now = runstate.now()
    count = 0

    def put(data):
        follow = annotate(data) if annotate else None
        if emit(run, src, "phase", data) is None:
            return 0
        for kind, extra in follow or ():
            emit(run, src, kind, extra)
        return 1

    for pid in st["done"]:
        if pid in opened:
            ts, ssrc = opened.pop(pid)
            d = {"id": pid, "event": "done", "name": st["names"].get(pid)}
            t = epoch(ts)
            if t is not None:
                d["secs"] = max(0, now - t)
            if ssrc:
                d["start_src"] = ssrc
            count += put(dict((k, v) for k, v in d.items() if v is not None))
    done = set(st["done"])
    starts = [(pid, "in_progress") for pid in st["in_progress"]]
    if next_src == "resume" and not (last_run == "resume" and not phase_after):
        next_src = None
    if next_src:
        starts.extend((pid, next_src) for pid in st["next"])
    for pid, ssrc in starts:
        if pid in opened or pid in done:
            continue
        opened[pid] = ("", ssrc)
        d = {"id": pid, "event": "start", "start_src": ssrc}
        if st["names"].get(pid):
            d["name"] = st["names"][pid]
        count += put(d)
    return count


def resumed(run):
    _opened, last_run, phase_after = _phase_index(trace_path(run))
    return last_run == "resume" and not phase_after


# ---- backfill --------------------------------------------------------------------

LOG_RE = re.compile(r"^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z) (\S+) (.*)$")
SEND_KEYS_RE = re.compile(r"^sent keys to \S+: (.+)$")
SEND_TEXT_RE = re.compile(r"^sent (inline|pointer) message to \S+ \(([0-9]+) chars\)$")
START_SENT_RE = re.compile(r"^sent (\S+) to \S+$")
LOOP_EVENT_RE = re.compile(r"^event: (.+)$")
LOOP_WAKE_RE = re.compile(r"^WAKE .* stop=(\S+)$")
VERIFY_LOG_RE = re.compile(r"^verify ([0-9a-f]{7,40}) RESULT (PASS|FAIL|WEAK|DEFERRED)(?: reason=(\S+))?$")
COUNT_RE = re.compile(r" ([0-9]+)->([0-9]+)$")
QUESTION_LINE_RE = re.compile(r"^\s*- \[[ xX]\]\s+(\S+Z)\s+(.*)$")
DRIVER_LOCAL_RE = re.compile(r"^([0-9]{4}-[0-9]{2}-[0-9]{2})[ T]([0-9]{2}:[0-9]{2}:[0-9]{2})(Z?)\s+(.*)$")
DECIDED_RE = re.compile(r"^([A-Za-z0-9_.]+):\s*(.*)$")
NO_SESSION_EVENTS = ("DISK_LOW", "RESOURCE_HIGH", "BACKSTOP", "SIGNED", "CHAT_APPROVAL")


def _lines(path):
    text = read_text(path)
    return text.split("\n") if text else []


def _mtime_iso(path):
    try:
        return runstate.iso(runstate.mtime(path))
    except runstate.RunStateError:
        return None


def _compact(d):
    return dict((k, v) for k, v in d.items() if v is not None and v != "")


class _Backfill(object):
    def __init__(self, run, rd):
        self.run = run
        self.rd = rd
        self.events = []
        self.skipped = 0

    def add(self, ts, kind, data):
        if ts:
            self.events.append((ts, len(self.events), kind, _compact(data)))

    def from_run_env(self):
        env = dict(runstate.read_env(self.run))
        self.add(env.get("STARTED_AT"), "run", {"action": "start", "preset": env.get("PRESET"),
                                                "engine": env.get("ENGINE")})

    def from_tdrive_log(self, verify_files):
        starts = {}
        done_count = 0
        pending_next = None
        last_send = None
        for raw in _lines(os.path.join(self.rd, "tdrive.log")):
            m = LOG_RE.match(raw)
            if not m:
                if raw.strip():
                    self.skipped += 1
                continue
            ts, cmd, msg = m.groups()
            if cmd == "send":
                km = SEND_KEYS_RE.match(msg)
                tm = SEND_TEXT_RE.match(msg)
                if km:
                    self.add(ts, "send", {"mode": "keys", "result": "sent", "chars": len(km.group(1).split())})
                elif tm:
                    self.add(ts, "send", {"mode": tm.group(1), "result": "sent", "chars": int(tm.group(2))})
                else:
                    self.skipped += 1
                    continue
                last_send = self.events[-1]
                continue
            if cmd == "start":
                sm = START_SENT_RE.match(msg)
                if not sm:
                    self.skipped += 1
                    last_send = None
                    continue
                tpl = os.path.splitext(sm.group(1))[0]
                if last_send is not None and "template" not in last_send[3]:
                    last_send[3]["template"] = tpl
                if tpl == "cook":
                    pid = str(done_count + 1)
                    starts[pid] = (ts, "cook_sent")
                    self.add(ts, "phase", {"id": pid, "event": "start", "start_src": "cook_sent"})
                last_send = None
                continue
            last_send = None
            if cmd == "loop":
                em = LOOP_EVENT_RE.match(msg)
                if em:
                    line = em.group(1)
                    cm = COUNT_RE.search(line)
                    if line.startswith("PHASE_DONE ") and cm:
                        old, new = int(cm.group(1)), int(cm.group(2))
                        if pending_next and pending_next[1] not in starts and old < int(pending_next[1]) <= new:
                            starts[pending_next[1]] = (pending_next[0], "prev_done")
                            self.add(pending_next[0], "phase", {"id": pending_next[1], "event": "start",
                                                                "start_src": "prev_done"})
                        for i in range(old + 1, new + 1):
                            pid = str(i)
                            d = {"id": pid, "event": "done"}
                            if pid in starts:
                                sts, ssrc = starts.pop(pid)
                                d["secs"] = max(0, epoch(ts) - epoch(sts))
                                d["start_src"] = ssrc
                            self.add(ts, "phase", d)
                        done_count = max(done_count, new)
                        pending_next = (ts, str(new + 1))
                    continue
                if msg.startswith("stopped after "):
                    self.add(ts, "run", {"action": "end", "stop": "stop-after-phases"})
                    continue
                if msg.startswith("plan complete"):
                    self.add(ts, "run", {"action": "end", "stop": "plan-complete"})
                    continue
                wm = LOOP_WAKE_RE.match(msg)
                if wm:
                    self.add(ts, "run", {"action": "end", "stop": wm.group(1)})
                    continue
                self.skipped += 1
                continue
            if cmd == "verify":
                vm = VERIFY_LOG_RE.match(msg)
                if not vm:
                    self.skipped += 1
                    continue
                sha7, result = vm.group(1), vm.group(2)
                d = {"sha": sha7, "result": result, "reason": vm.group(3)}
                for f in sorted(verify_files):
                    if os.path.basename(f).startswith(sha7):
                        vd = verify_data(_lines(f))
                        if vd.get("result") == result:
                            d["sha"] = os.path.basename(f)[:-len(".txt")]
                            d["targets"], d["probes"] = vd["targets"], vd["probes"]
                            verify_files.discard(f)
                            break
                self.add(ts, "verify", d)
                continue
            self.skipped += 1

    def from_events_log(self):
        for raw in _lines(os.path.join(self.rd, "events.log")):
            parts = raw.split(" ", 1)
            if len(parts) != 2 or not ISO_RE.match(parts[0]):
                continue
            line = parts[1].strip()
            words = line.split()
            if not words:
                continue
            d = {"event": words[0], "line": line}
            if words[0] not in NO_SESSION_EVENTS and len(words) > 1 and words[1] != "-":
                d["session"] = words[1]
            self.add(parts[0], "watch_event", d)

    def from_govern(self):
        for raw in _lines(os.path.join(self.rd, "govern.jsonl")):
            try:
                row = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(row, dict) or "line" not in row:
                continue
            ts = row.pop("ts", None)
            self.add(ts if isinstance(ts, str) else None, "govern", row)

    def from_verify_files(self, verify_files):
        for f in sorted(verify_files):
            vd = verify_data(_lines(f))
            if not vd.get("result"):
                continue
            self.add(_mtime_iso(f), "verify", {"sha": os.path.basename(f)[:-len(".txt")], "result": vd["result"],
                                                "reason": vd.get("reason"), "targets": vd["targets"],
                                                "probes": vd["probes"]})

    def from_reports(self):
        d = os.path.join(self.rd, "reports")
        snap = load_snapshot(self.rd)
        try:
            names = sorted(n for n in os.listdir(d) if n.endswith(".md") and n != "last.md")
        except OSError:
            return
        for name in names:
            text = read_text(os.path.join(d, name))
            iso, data = report_data(text or "", snap)
            if iso and ISO_RE.match(iso):
                self.add(iso, "report", data)

    def from_questions(self):
        for raw in _lines(os.path.join(self.rd, "questions.md")):
            m = QUESTION_LINE_RE.match(raw)
            if not m:
                continue
            ts, text = m.groups()
            wm = re.match(r"^WAKE (.*) stop=(\S+)$", text)
            if wm:
                self.add(ts, "wake", {"stop": wm.group(2), "line": wm.group(1)})
            else:
                self.add(ts, "question", {"text": text})

    def from_decided(self):
        path = os.path.join(self.rd, "decided.yaml")
        ts = _mtime_iso(path) if os.path.exists(path) else None
        for raw in _lines(path):
            if raw.lstrip().startswith("#") or not raw.strip():
                continue
            m = DECIDED_RE.match(raw.strip())
            if m:
                self.add(ts, "decision", {"id": "-", "key": m.group(1), "value": m.group(2).strip().strip('"')})

    def from_driver_actions(self):
        if not self.events:
            return
        stamps = sorted(e[0] for e in self.events)
        lo, hi = epoch(stamps[0]), epoch(stamps[-1])
        for raw in _lines(os.path.join(runstate.state_dir(), "driver-actions.log")):
            m = DRIVER_LOCAL_RE.match(raw)
            if not m:
                continue
            day, clock, z, text = m.groups()
            try:
                st = time.strptime("%s %s" % (day, clock), "%Y-%m-%d %H:%M:%S")
            except ValueError:
                continue
            t = calendar.timegm(st) if z else int(time.mktime(st))
            if lo is None or hi is None or not lo <= t <= hi:
                continue
            if text.startswith("driver: "):
                text = text[len("driver: "):]
            self.add(runstate.iso(t), "intervention", {"text": text, "by": "driver"})

    def build(self):
        vdir = os.path.join(self.rd, "verify")
        try:
            verify_files = set(os.path.join(vdir, n) for n in os.listdir(vdir)
                               if n.endswith(".txt") and re.match(r"^[0-9a-f]{7,40}\.txt$", n))
        except OSError:
            verify_files = set()
        self.from_run_env()
        self.from_events_log()
        self.from_tdrive_log(verify_files)
        self.from_govern()
        self.from_verify_files(verify_files)
        self.from_reports()
        self.from_questions()
        self.from_decided()
        self.from_driver_actions()
        self.events.sort(key=lambda e: (e[0], e[1]))
        return self.events


def write_backfill(run, rd, path):
    """Write the backfilled trace; refuses (TraceError 5) when it exists."""
    bf = _Backfill(run, rd)
    lines = []
    for ts, _i, kind, data in bf.build():
        obj = {"v": V, "ts": ts, "run": run, "src": "backfill", "kind": kind, "data": data}
        if check_event(obj) is not None:
            bf.skipped += 1
            continue
        line = shape(obj)
        if line is None:
            bf.skipped += 1
            continue
        lines.append(line)
    old = os.umask(0o077)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except OSError as exc:
        if os.path.lexists(path):
            raise TraceError(5, "trace exists: %s" % path)
        raise TraceError(3, "cannot create %s: %s" % (path, exc.strerror))
    finally:
        os.umask(old)
    try:
        data = "".join(x + "\n" for x in lines).encode("utf-8")
        if data and os.write(fd, data) != len(data):
            raise TraceError(3, "short write to %s" % path)
    finally:
        os.close(fd)
    log(rd, "backfill: %d events written, %d source lines skipped" % (len(lines), bf.skipped))
    return len(lines)


# ---- CLI -------------------------------------------------------------------------

def _kv(text, opt):
    if "=" not in text or not text.split("=", 1)[0]:
        raise TraceError(2, "%s needs FIELD=VALUE: %r" % (opt, text))
    return text.split("=", 1)


def _coerce(k, v):
    if k in INT_FIELDS and re.match(r"^-?[0-9]+$", v):
        return int(v)
    if k in BOOL_FIELDS and v in ("true", "false"):
        return v == "true"
    return v


def cmd_emit(args):
    run = src = kind = None
    data = {}
    refs = []
    i = 0
    while i < len(args):
        a = args[i]
        if i + 1 >= len(args):
            raise TraceError(2, "%s needs a value" % a)
        v = args[i + 1]
        i += 2
        if a == "--run":
            run = v
        elif a == "--src":
            src = v
        elif a == "--kind":
            kind = v
        elif a == "--field":
            k, val = _kv(v, a)
            data[k] = _coerce(k, val)
        elif a == "--list-field":
            k, val = _kv(v, a)
            if not isinstance(data.get(k), list):
                data[k] = []
            data[k].append(val)
        elif a == "--json-field":
            k, val = _kv(v, a)
            try:
                data[k] = json.loads(val)
            except ValueError:
                raise TraceError(2, "--json-field %s is not JSON" % k)
        elif a in ("--ref-last", "--age-last"):
            k, val = _kv(v, a)
            refs.append((a[2:], k, val))
        elif a == "--age-since":
            k, val = _kv(v, a)
            if not re.match(r"^[0-9]+$", val):
                raise TraceError(2, "--age-since needs an epoch: %r" % val)
            refs.append(("age-since", k, int(val)))
        elif a == "--file-sha":
            k, val = _kv(v, a)
            sha = file_sha(val)
            if sha:
                data[k] = sha
        elif a == "--region-file":
            k, val = _kv(v, a)
            text = region_text(val)
            if text is not None:
                data[k] = text
        elif a == "--verify-file":
            vd = verify_data(_lines(v))
            for key in ("targets", "probes", "reason"):
                if vd.get(key) not in (None, []) and key not in data:
                    data[key] = vd[key]
        elif a == "--ignored-tests":
            ign = ignored_test_files(v)
            if ign is not None:
                data["ignored_test_files"] = ign
        elif a == "--report-file":
            text = read_text(v)
            if text is not None and run:
                try:
                    snap = load_snapshot(runstate.run_dir(run))
                except runstate.RunStateError:
                    snap = None
                _iso, rdata = report_data(text, snap)
                for key, val in (rdata or {}).items():
                    data.setdefault(key, val)
        else:
            raise TraceError(2, "unknown emit option: %s" % a)
    if not run or not src or not kind:
        raise TraceError(2, "emit needs --run, --src and --kind")
    emit(run, src, kind, data, refs)
    return 0


def _opts(args, names, flags=()):
    o = {}
    i = 0
    while i < len(args):
        a = args[i]
        if a in flags:
            o[a] = True
            i += 1
            continue
        if a not in names or i + 1 >= len(args):
            raise TraceError(2, "unknown or incomplete option: %s" % a)
        o[a] = args[i + 1]
        i += 2
    return o


def _run_dir_of(run):
    if not run or not runstate.valid_run(run):
        raise TraceError(2, "invalid run name: %r" % run)
    rd = runstate.run_dir(run)
    if not os.path.isdir(rd):
        raise TraceError(2, "no run dir for run %s: %s" % (run, rd))
    return rd


def cmd_check(args):
    if len(args) != 1:
        raise TraceError(2, "usage: trace.py check FILE")
    path = args[0]
    try:
        fh = open(path, "rb")
    except (IOError, OSError) as exc:
        raise TraceError(2, "cannot read %s: %s" % (path, exc.strerror))
    out = []
    bad = 0
    n = 0
    with fh:
        for n, raw in enumerate(fh, 1):
            try:
                obj = json.loads(raw.decode("utf-8"))
            except ValueError:
                obj = None
            if not isinstance(obj, dict):
                out.append("TRACE INVALID L%d reason=bad-json" % n)
                bad += 1
                continue
            v = obj.get("v")
            if isinstance(v, int) and not isinstance(v, bool) and v > V:
                out.append("TRACE UNSUPPORTED L%d v=%d" % (n, v))
                continue
            reason = check_event(obj)
            if reason is None and obj["v"] != V:
                reason = "bad-version:%s" % obj["v"]
            if reason:
                out.append("TRACE INVALID L%d reason=%s" % (n, reason))
                bad += 1
    if not bad:
        out.append("TRACE OK file=%s lines=%d v=%d" % (path, n, V))
    sys.stdout.write("".join(x + "\n" for x in out))
    return 1 if bad else 0


def cmd_backfill(args):
    o = _opts(args, ("--run",))
    run = o.get("--run")
    rd = _run_dir_of(run)
    path = os.path.join(rd, TRACE)
    if os.path.lexists(path):
        raise TraceError(5, "trace exists: %s (backfill only converts a run without one)" % path)
    with runstate._FileLock(os.path.join(rd, ".run.env.lock")):
        n = write_backfill(run, rd, path)
    sys.stdout.write("TRACED %s backfill lines=%d\n" % (run, n))
    return 0


def cmd_add(args):
    o = _opts(args, ("--run", "--kind", "--text", "--by", "--ref", "--class"))
    run, kind, text = o.get("--run"), o.get("--kind"), o.get("--text")
    by = o.get("--by", "driver")
    if kind not in ADD_KINDS:
        raise TraceError(2, "--kind must be one of %s" % ", ".join(ADD_KINDS))
    if not text or not text.strip():
        raise TraceError(2, "--text is required")
    if by not in ("driver", "operator"):
        raise TraceError(2, "--by must be driver or operator")
    if "--ref" in o and not LINE_ID_RE.match(o["--ref"]):
        raise TraceError(2, "--ref must be a line id L<n>: %r" % o["--ref"])
    if "--class" in o and not re.match(r"^[a-z0-9][a-z0-9-]*$", o["--class"]):
        raise TraceError(2, "--class must be a class id: %r" % o["--class"])
    if os.environ.get("TDRIVE_DRY_RUN") == "1":
        sys.stdout.write("DRY trace add %s kind=%s\n" % (run, kind))
        return 0
    rd = _run_dir_of(run)
    data = {"text": text, "by": by}
    if "--ref" in o:
        data["ref"] = o["--ref"]
    if "--class" in o:
        data["class"] = o["--class"]
    end = emit(run, by, kind, data)
    if end is None:
        raise TraceError(3, "the event was not written (see %s/tdrive.log)" % rd)
    sys.stdout.write("TRACED %s L%d kind=%s\n" % (run, line_id(os.path.join(rd, TRACE), end), kind))
    return 0


def cmd_phases(args):
    o = _opts(args, ("--run", "--src", "--next-src"))
    nxt = o.get("--next-src", "-")
    if nxt != "-" and nxt not in START_SRCS:
        raise TraceError(2, "--next-src must be one of %s or -" % ", ".join(START_SRCS))
    run = o.get("--run")
    if not run or o.get("--src") not in SRCS:
        raise TraceError(2, "phases needs --run and a valid --src")
    lines = sys.stdin.read().split("\n")
    try:
        sync_phases(run, o["--src"], lines, None if nxt == "-" else nxt)
    except Exception as exc:  # never fail the caller
        try:
            log(runstate.run_dir(run), "phase events not written: %s: %s" % (type(exc).__name__, exc))
        except runstate.RunStateError:
            pass
    return 0


def cmd_unanswered(args):
    o = _opts(args, ("--run",))
    run = o.get("--run")
    if not run or not runstate.valid_run(run):
        raise TraceError(2, "unanswered needs --run")
    open_q = False
    for _n, obj in read(trace_path(run)):
        if obj["kind"] == "question":
            open_q = True
        elif obj["kind"] == "answer":
            open_q = False
    return 0 if open_q else 1


def cmd_resumed(args):
    o = _opts(args, ("--run",))
    run = o.get("--run")
    if not run or not runstate.valid_run(run):
        raise TraceError(2, "resumed needs --run")
    return 0 if resumed(run) else 1


COMMANDS = {"emit": cmd_emit, "check": cmd_check, "backfill": cmd_backfill, "add": cmd_add,
            "phases": cmd_phases, "resumed": cmd_resumed, "unanswered": cmd_unanswered}


def main(argv):
    if len(argv) < 2 or argv[1] not in COMMANDS:
        sys.stderr.write("usage: trace.py %s ...\n" % "|".join(sorted(COMMANDS)))
        return 2
    cmd = argv[1]
    try:
        return COMMANDS[cmd](argv[2:])
    except TraceError as exc:
        sys.stderr.write("trace: %s\n" % exc)
        if cmd in ("emit", "phases"):
            return 0
        return exc.code
    except runstate.RunStateError as exc:
        sys.stderr.write("trace: %s\n" % exc)
        return 0 if cmd in ("emit", "phases") else exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
