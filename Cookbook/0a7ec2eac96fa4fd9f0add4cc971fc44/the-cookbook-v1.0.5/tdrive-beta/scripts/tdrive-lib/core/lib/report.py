"""Drive reports (DONE / NEXT / HEADS-UP / PROGRESS), secret scrubbing and
the driver handoff brief.

CLI:
  render --run RUN --rundir D --repo R --branch B --stage S --state FILE
         [--check FILE] [--top FILE] [--heads-up TEXT]... [--save-stamp STAMP]
         [--verify-sha SHA]
      Prints the report; --verify-sha reads D/verify/SHA.txt instead of the
      verify named by D/verify/last. With --save-stamp it also writes
      D/reports/STAMP.md, D/reports/last.md and D/report.snapshot.
  scrub                       stdin -> stdout with secrets masked
  brief --run RUN --rundir D --repo R --branch B --engine E --state FILE
        --report FILE --out FILE [--session S] [--classify FILE]
      Writes the driver handoff brief (scrubbed) to --out.
Inputs of render: the `tdrive state` lines (--state), the snapshot of the
previous report, verify/last, `govern check` lines (--check) or else the
latest DISK/RESOURCE rows of govern.jsonl, TOP lines (--top) or else the
latest TOP rows of govern.jsonl, events.log, questions.md, run.env and the
repo's docs/decisions.md. The final stage also reads the run's last retro
trace event: its ROI line goes after PROGRESS and the features it switched
off (decay) are a HEADS-UP item; without one, neither appears.
Exit codes: 0 ok, 2 usage, 3 unreadable input or git failure.
"""
import calendar
import json
import os
import posixpath
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import plan_table  # noqa: E402
import render  # noqa: E402
import runstate  # noqa: E402
import trace  # noqa: E402
from sanitize import sanitize  # noqa: E402
from scrub import scrub  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
DASH = "\u2014"
SEP = " \u00b7 "
STAGES = ("phase", "bootstrapped", "booted", "plan-sent", "plan-committed", "cook-sent",
          "wake", "handoff", "final")
# Fixed DONE wording for stage reports: (what happened, so what).
STAGE_TEXT = {
    "bootstrapped": ("project bootstrapped on {branch}", "the engine can boot on a committed brief"),
    "booted": ("engine session booted", "the orchestrator is ready for the plan command"),
    "plan-sent": ("plan command sent", "the orchestrator is writing the plan"),
    "plan-committed": ("plan committed on {branch}", "cook can start"),
    "cook-sent": ("cook command sent", "the orchestrator is implementing phases"),
    "wake": ("driver woken", "the operator or AI driver must act on the HEADS-UP"),
    "handoff": ("handoff started", "a fresh driver can resume from the brief"),
    "final": ("plan complete on {branch}", "final acceptance can run"),
}
EVENT_KINDS = ("LIMIT", "QUESTION", "TRUST", "SESSION_GONE", "SIGNED", "CHAT_APPROVAL", "GATE", "PLAN_CHANGED",
               "DONE_REGRESSED", "POLICY_VIOLATION")
VERIFY_FLAG = ("FAIL", "WEAK", "DEFERRED")
OVERVIEW_MAX = 160
# DONE block: one line per newly done phase (at most DONE_LINES_MAX, the
# latest ones), then a `+<k> more` line; continuation lines are indented
# under the text after "DONE — ".
DONE_LINES_MAX = 3
DONE_INDENT = " " * 7
SO_MAX = 120
TITLE_MAX = 80
MORE_MAX = 160
SO_MIN_WORDS = 4
SUMMARY_MAX = 160
QUESTION_MAX = 120
TOP_OTHER = 3
DECISION_RE = re.compile(r"^\|\s*([A-Za-z][A-Za-z0-9]*-[0-9]+)\s*\|")
QUESTION_RE = re.compile(r"^\s*- \[ \]\s+(?:\S+Z\s+)?(.*)$")
# Sections whose first sentence becomes a phase's "so" clause, best first.
OVERVIEW_HEADS = (re.compile(r"^##\s+Overview\b", re.I), re.compile(r"^##\s+Goal\b", re.I),
                  re.compile(r"^##\s+(?:Summary|Purpose)\b", re.I))
SKIP_OVERVIEW_RE = re.compile(r"^[*_`]*(priority|status)\b", re.I)
LIST_MARK_RE = re.compile(r"^(?:[-*+]|[0-9]+\.)\s+")
# A sentence ends at . ! or ? followed by a capitalised word, so "incl. x" or
# "e.g. y" do not end it.
SENTENCE_END_RE = re.compile(r"[.!?](?=\s+[A-Z])")
MD_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
MD_BOLD_RE = re.compile(r"(\*\*|__)(.+?)\1")
PHASE_NUM_RE = re.compile(r"^0*([0-9]+)(.*)$")

class ReportError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def one_line(text, limit=None):
    s = re.sub(r"\s+", " ", sanitize(text, keep_newlines=True)).strip()
    if limit is not None and len(s) > limit:
        s = s[:limit - 1].rstrip() + "\u2026"
    return s


def keep_indent(line):
    """one_line(line) with a DONE continuation indent kept."""
    if line.startswith(DONE_INDENT):
        return DONE_INDENT + one_line(line)
    return one_line(line)


def clip_words(text, limit):
    """text cut to at most limit chars at a word boundary, ending in an
    ellipsis when cut; a single word longer than the limit is cut hard."""
    if len(text) <= limit:
        return text
    at = text.rfind(" ", 0, limit)
    head = text[:at] if at > 0 else text[:limit - 1]
    return head.rstrip(" ,;:-") + "\u2026"


def read_text(path):
    if not path:
        return None
    try:
        with open(path, "rb") as fh:
            return fh.read().decode("utf-8", "replace")
    except (IOError, OSError):
        return None


def read_lines(path):
    text = read_text(path)
    return text.splitlines() if text else []


TRAILING_PPID_RE = re.compile(r" ppid=([0-9]+)$")


def fields_of(line):
    """key=value pairs of a machine line; a `cmd=` field takes the rest,
    except a trailing ` ppid=<n>` (TOP lines append it after cmd)."""
    out = {}
    rest = line.split(" ", 1)[1] if " " in line else ""
    cmd_at = rest.find(" cmd=")
    if rest.startswith("cmd="):
        cmd_at = -1
        out["cmd"] = rest[4:]
        rest = ""
    elif cmd_at >= 0:
        out["cmd"] = rest[cmd_at + 5:]
        rest = rest[:cmd_at]
    m = TRAILING_PPID_RE.search(out.get("cmd", ""))
    if m:
        out["ppid"] = m.group(1)
        out["cmd"] = out["cmd"][:m.start()]
    for w in rest.split(" "):
        if "=" in w:
            k, v = w.split("=", 1)
            out[k] = v
    return out


# ---- state -----------------------------------------------------------------

def parse_state(lines):
    st = {"engine": "-", "stage": "unknown", "plan": None, "done": 0, "total": 0, "pct": 0,
          "in_progress": [], "next": [], "eta": None, "phases": []}
    for raw in lines:
        key, _, rest = raw.partition(" ")
        if key == "PHASE":
            cols = (rest.split("\t") + ["", "", "", ""])[:4]
            st["phases"].append({"id": cols[0], "status": cols[1], "name": cols[2] if cols[2] != "-" else cols[0],
                                 "file": None if cols[3] in ("", "-") else cols[3]})
        elif key in ("DONE", "TOTAL", "PCT"):
            try:
                st[key.lower()] = int(rest.strip())
            except ValueError:
                raise ReportError(3, "bad state line: %s" % raw)
        elif key in ("IN_PROGRESS", "NEXT"):
            v = rest.strip()
            st[key.lower()] = [] if v in ("", "-") else [x for x in v.split(",") if x]
        elif key == "PLAN":
            st["plan"] = None if rest.strip() in ("", "none", "-") else rest.strip()
        elif key == "ETA":
            v = rest.split(" ")[0]
            st["eta"] = None if v in ("", "unknown", "-") else v
        elif key in ("ENGINE", "STAGE"):
            st[key.lower()] = rest.strip()
    return st


def plan_extras(repo, branch, plan):
    """(title, {norm id: [norm deps]}, has_deps) from the plan at the branch."""
    if not plan:
        return "", {}, False
    try:
        text = plan_table.blob(repo, branch, plan)
    except plan_table.PlanError:
        text = None
    if text is None:
        return posixpath.basename(posixpath.dirname(plan)) or plan, {}, False
    parsed = plan_table.parse_text(text, plan)
    deps = {}
    has = False
    for ph in parsed["phases"]:
        d = [plan_table.norm_id(x) for x in ph["depends"]]
        if d:
            has = True
        deps[plan_table.norm_id(ph["id"])] = d
    title = parsed["title"] or posixpath.basename(posixpath.dirname(plan)) or plan
    return title, deps, has


def overview_of(text):
    """First qualifying sentence under `## Overview`, else `## Goal`, else
    `## Summary` or `## Purpose`; when none qualifies, the first qualifying
    list intro (its ":" removed) in the same section order; else None.
    See _first_sentence."""
    lines = text.replace("\r\n", "\n").split("\n")
    intro = None
    for head in OVERVIEW_HEADS:
        s, i = _first_sentence(lines, head)
        if s:
            return s
        intro = intro or i
    return intro


def _blocks(lines, head):
    """(is_list_item, text) paragraphs and list items of the first section
    whose heading matches head. Wrapped lines join their block; fenced code,
    comments and Priority/Status lines are dropped."""
    blocks = []
    cur = None
    inside = False
    fenced = False
    for line in lines:
        s = line.strip()
        if not inside:
            inside = bool(head.match(s))
            continue
        if s.startswith("```") or s.startswith("~~~"):
            fenced = not fenced
            cur = None
            continue
        if fenced:
            continue
        if s.startswith("#"):
            break
        if not s or s.startswith("<!--") or SKIP_OVERVIEW_RE.match(s):
            cur = None
            continue
        item = LIST_MARK_RE.match(s)
        if item or cur is None:
            cur = [bool(item), LIST_MARK_RE.sub("", s)]
            blocks.append(cur)
        else:
            cur[1] += " " + s
    return blocks


def _plain(text):
    text = MD_LINK_RE.sub(r"\1", text)
    text = MD_BOLD_RE.sub(r"\2", text)
    return text.replace("`", "")


def _first_sentence(lines, head):
    """(sentence, intro) of the section. sentence: the first full sentence
    with at least four words that is not a list intro (ending with ":"); the
    list items under an intro are skipped too. intro: the first list-intro
    sentence with at least four words, its ":" removed. Markdown is
    stripped; each is cut at a word boundary within OVERVIEW_MAX chars;
    None when absent."""
    after_intro = False
    intro = None
    for is_item, raw in _blocks(lines, head):
        if is_item and after_intro:
            continue
        after_intro = False
        text = one_line(_plain(raw))
        end = SENTENCE_END_RE.search(text)
        sent = (text[:end.start()] if end else text).strip()
        if text.endswith(":"):
            after_intro = True
            if intro is None:
                last = SENTENCE_END_RE.split(text)[-1].strip().rstrip(" :").rstrip(" .;,")
                if len(last.split()) >= SO_MIN_WORDS:
                    intro = clip_words(last, OVERVIEW_MAX)
        if sent.endswith(":") or len(sent.split()) < SO_MIN_WORDS:
            continue
        sent = sent.rstrip(" .;,")
        return clip_words(sent, OVERVIEW_MAX), intro
    return None, intro


def phase_overview(repo, branch, phase):
    if phase["file"]:
        try:
            text = plan_table.blob(repo, branch, phase["file"])
        except plan_table.PlanError:
            text = None
        if text:
            ov = overview_of(text)
            if ov:
                return ov
    return phase["name"]


# ---- inputs ----------------------------------------------------------------

def load_snapshot(rundir):
    text = read_text(os.path.join(rundir, "report.snapshot"))
    if not text:
        return None
    try:
        data = json.loads(text)
    except ValueError:
        sys.stderr.write("report: ignoring unreadable report.snapshot\n")
        return None
    return data if isinstance(data, dict) else None


def last_verify(rundir, sha=None):
    """(sha, lines) of the verify of sha, else of the latest verify, or
    (None, [])."""
    vdir = os.path.join(rundir, "verify")
    if sha is None:
        sha = (read_text(os.path.join(vdir, "last")) or "").strip()
    if not sha or not re.match(r"^[0-9a-fA-F]{7,64}$", sha):
        return None, []
    return sha, read_lines(os.path.join(vdir, "%s.txt" % sha))


def verify_result(lines):
    for line in reversed(lines):
        if line.startswith("RESULT "):
            parts = line.split(" ")
            f = fields_of(line)
            return parts[1] if len(parts) > 1 else "?", f
    return None, {}


def jsonl_rows(path):
    rows = []
    for line in read_lines(path):
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def row_line(row):
    fields = [(k, v) for k, v in row.items() if k not in ("ts", "cmd", "line")]
    return row.get("line", "?") + "".join(" %s=%s" % (k, v) for k, v in fields)


def decisions(repo):
    ids = []
    for line in read_lines(os.path.join(repo, "docs", "decisions.md")):
        m = DECISION_RE.match(line)
        if m:
            ids.append(m.group(1))
    return ids


# ---- report ----------------------------------------------------------------

def progress_text(st):
    return "%d/%d phases done (%d%%)" % (st["done"], st["total"], st["pct"])


def names_of(st, ids):
    by_id = dict((p["id"], p["name"]) for p in st["phases"])
    return [by_id.get(i, i) for i in ids]


def phase_order(phase, index):
    """Sort key: the numeric part of the id, then its suffix (7 < 7a < 7b < 10),
    then table order; ids without a number sort first."""
    m = PHASE_NUM_RE.match(phase["id"].strip())
    if not m:
        return (0, -1, "", index)
    return (1, int(m.group(1)), m.group(2).lower(), index)


def verify_text(verify_lines):
    """`verify <RESULT> targets <p>/<n> probes <p>/<n>`, `verify deferred
    (<reason>)` or `verify none`."""
    res, f = verify_result(verify_lines)
    if not res:
        return "verify none"
    if res == "DEFERRED":
        return "verify deferred (%s)" % f.get("reason", "unknown")
    return "verify %s targets %s probes %s" % (res, f.get("targets", "?"), f.get("probes", "?"))


def phase_clause(o, phase):
    """`<title>, so <so clause>`, title and so clause cut at word boundaries."""
    so = phase_overview(o["repo"], o["branch"], phase)
    return "%s, so %s" % (clip_words(one_line(phase["name"]), TITLE_MAX), clip_words(one_line(so), SO_MAX))


def done_line(o, st, snap, verify_lines):
    """(lines, done ids) of the DONE block.
    No snapshot (a takeover's first report) with phases done: one baseline
    line. Phases done since the snapshot: one line per phase in phase order,
    the latest DONE_LINES_MAX of them, the first carrying the verify result,
    then `+<k> more: <titles>` for the earlier ones. Else the stage label, or
    nothing completed. The last line ends with the progress."""
    then = progress_text(st)
    done = [(i, p) for i, p in enumerate(st["phases"]) if p["status"] == "done"]
    done_ids = [p["id"] for _, p in done]
    vtext = verify_text(verify_lines)
    if snap is None and done:
        latest = max(done, key=lambda x: phase_order(x[1], x[0]))[1]
        so = clip_words(one_line(phase_overview(o["repo"], o["branch"], latest)), SO_MAX)
        return ["DONE %s takeover baseline: %d/%d phases done (latest: %s), so %s (%s)"
                % (DASH, st["done"], st["total"], clip_words(one_line(latest["name"]), TITLE_MAX), so, vtext)], done_ids
    base = []
    if snap and snap.get("plan") == st["plan"] and isinstance(snap.get("done_ids"), list):
        base = snap["done_ids"]
    new = sorted((x for x in done if x[1]["id"] not in base), key=lambda x: phase_order(x[1], x[0]))
    if new:
        shown = [p for _, p in new[-DONE_LINES_MAX:]]
        rest = [p for _, p in new[:-DONE_LINES_MAX]]
        lines = ["DONE %s %s (%s)" % (DASH, phase_clause(o, shown[0]), vtext)]
        lines.extend(DONE_INDENT + phase_clause(o, p) for p in shown[1:])
        if rest:
            names = clip_words(", ".join(one_line(p["name"]) for p in rest), MORE_MAX)
            lines.append("%s+%d more: %s" % (DONE_INDENT, len(rest), names))
        lines[-1] += ", then %s" % then
        return lines, done_ids
    stage = o["stage"]
    if stage != "phase":
        label, meaning = STAGE_TEXT[stage]
        return ["DONE %s %s, so %s, then %s" % (DASH, label.format(branch=o["branch"]), meaning, then)], done_ids
    if snap and isinstance(snap.get("ts"), int):
        since = runstate.local(snap["ts"])
    else:
        since = "run start"
    return ["DONE %s no phase completed since %s, so nothing new to verify, then %s" % (DASH, since, then)], done_ids


def next_line(o, st, title, deps, has_deps):
    if st["stage"] == "complete":
        return "NEXT %s none, for %s, then final acceptance" % (DASH, title)
    if not st["plan"] or st["total"] == 0:
        return "NEXT %s plan, for %s, then cook" % (DASH, title)
    nxt = list(st["next"])
    label = " + ".join(names_of(st, nxt))
    if not nxt and st["in_progress"]:
        nxt = list(st["in_progress"])
        label = " + ".join(names_of(st, nxt)) + " (in progress)"
    pending = [p for p in st["phases"] if p["status"] == "pending" and p["id"] not in nxt]
    if has_deps:
        ready = set(plan_table.norm_id(p["id"]) for p in st["phases"] if p["status"] == "done")
        ready.update(plan_table.norm_id(i) for i in nxt)
        after = [p for p in pending if all(d in ready for d in deps.get(plan_table.norm_id(p["id"]), []))]
    else:
        after = pending[:1]
    if after:
        then = " + ".join(p["name"] for p in after)
    elif pending:
        then = "%d more phase%s once in-flight work lands" % (len(pending), "" if len(pending) == 1 else "s")
    else:
        then = "plan complete"
    if not label:
        label = "none ready"
    return "NEXT %s %s, for %s, then %s" % (DASH, label, title, then)


def verify_covers(rundir, psha, res, verify_sha):
    """True when a saved result covers the pending sha: it is the shown
    result (a DEFERRED one is already a verify item), or a saved verify of
    it finished (VERIFY_PENDING stays set until the loop acks)."""
    if not psha:
        return False
    if res and verify_sha and verify_sha.startswith(psha[:7]):
        return True
    _, lines = last_verify(rundir, psha)
    pres, _ = verify_result(lines)
    return pres is not None and pres != "DEFERRED"


def verify_items(run, rundir, verify_sha, verify_lines):
    items = []
    res, f = verify_result(verify_lines)
    sha7 = (verify_sha or "")[:7]
    if res in VERIFY_FLAG:
        text = "verify %s %s targets %s probes %s" % (res, sha7, f.get("targets", "?"), f.get("probes", "?"))
        if f.get("reason"):
            text += " reason=%s" % f["reason"]
        failed = []
        for line in verify_lines:
            m = re.match(r"^TARGET (\S+) exit=([0-9]+) secs=[0-9]+ \| ?(.*)$", line)
            if m and m.group(2) != "0":
                failed.append("%s exit=%s | %s" % (m.group(1), m.group(2), one_line(scrub(m.group(3)), SUMMARY_MAX)))
        if failed:
            text += " (%s)" % "; ".join(failed)
        items.append(text)
    skipped = []
    for line in verify_lines:
        if line.startswith("PROBE ") and " SKIP" in line:
            pid = line.split(" ")[1]
            reason = fields_of(line).get("reason", "-")
            skipped.append("%s (%s)" % (pid, reason))
    if skipped:
        items.append("probes skipped: %s" % ", ".join(skipped))
    pending = runstate.env_get(run, "VERIFY_PENDING")
    if pending and ":" in pending:
        count, psha = pending.split(":", 1)
        if not verify_covers(rundir, psha, res, verify_sha):
            items.append("verify DEFERRED %s at done=%s, retry pending" % (psha[:7], count))
    failed = runstate.env_get(run, "VERIFY_FAILED")
    if failed and ":" in failed:
        count, fsha = failed.split(":", 1)
        if not (res == "FAIL" and verify_sha and verify_sha.startswith(fsha[:7])):
            items.append("verify FAIL %s at done=%s not yet fixed" % (fsha[:7], count))
    return items


def latest_rows(rows, kind):
    for row in reversed(rows):
        if row.get("line") == kind:
            return row
    return None


def govern_items(o, run, rows):
    items = []
    check = read_lines(o.get("check"))
    disk = next((fields_of(x) for x in check if x.startswith("DISK ")), None)
    res_line = next((x for x in check if x.startswith("RESOURCE ")), None)
    if disk is None:
        row = latest_rows(rows, "DISK")
        disk = dict((k, str(v)) for k, v in row.items()) if row else None
    if res_line is None:
        row = latest_rows(rows, "RESOURCE")
        res_line = row_line(row) if row else None
    if disk and disk.get("level", "ok") != "ok":
        items.append("disk %s free_gb=%s advice=%s" % (disk.get("level"), disk.get("free_gb", "?"),
                                                       disk.get("advice", "?")))
    if runstate.env_get(run, "PAUSED") == "1":
        items.append("dispatch paused")
    if res_line:
        level = fields_of(res_line).get("level", "ok")
        if level != "ok":
            text = "resource %s: %s" % (level, res_line)
            others = top_others(o, rows)
            if others:
                text += "; top other: " + ", ".join(others)
            items.append(text)
    return items


def top_others(o, rows):
    lines = [x for x in read_lines(o.get("top")) if x.startswith("TOP ")]
    if not lines:
        tops = [r for r in rows if r.get("line") == "TOP"][-10:]
        lines = [row_line(r) for r in tops]
    out = []
    seen = set()
    ordered = [x for x in lines if " by=cpu " in x] + [x for x in lines if " by=cpu " not in x]
    for line in ordered:
        f = fields_of(line)
        if f.get("owner") != "other" or f.get("pid") in seen:
            continue
        seen.add(f.get("pid"))
        out.append("%s pid=%s cpu=%s rss_mb=%s" % (f.get("cmd", "?"), f.get("pid", "?"), f.get("cpu", "?"),
                                                    f.get("rss_mb", "?")))
        if len(out) >= TOP_OTHER:
            break
    return out


def freed_item(rows, offset):
    kb = 0
    for row in rows[offset:]:
        if row.get("line") == "CLEAN_SUMMARY" and row.get("mode") != "dry-run":
            try:
                kb += int(row.get("freed_kb", 0))
            except (TypeError, ValueError):
                continue
    if kb <= 0:
        return None
    gb = kb / 1048576.0
    if gb >= 0.1:
        return "cleanup freed %.1f GB" % gb
    return "cleanup freed %d MB" % max(1, int(round(kb / 1024.0)))


def question_item(rundir):
    qs = []
    for line in read_lines(os.path.join(rundir, "questions.md")):
        m = QUESTION_RE.match(line)
        if m:
            qs.append(one_line(m.group(1), QUESTION_MAX))
    if not qs:
        return None
    return "%d open question%s: %s" % (len(qs), "" if len(qs) == 1 else "s", "; ".join(qs))


def event_item(lines):
    seen = []
    counts = {}
    for line in lines:
        parts = line.split(" ", 1)
        ev = parts[1] if len(parts) == 2 else ""
        if ev.split(" ", 1)[0] not in EVENT_KINDS:
            continue
        ev = one_line(ev)
        if ev not in counts:
            seen.append(ev)
            counts[ev] = 0
        counts[ev] += 1
    if not seen:
        return None
    return "events: " + "; ".join(e if counts[e] == 1 else "%s (x%d)" % (e, counts[e]) for e in seen)


def last_retro(rundir):
    """The data of the run's last `retro` trace event, or None."""
    found = None
    for _n, ev in trace.read(os.path.join(rundir, trace.TRACE)):
        if ev["kind"] == "retro":
            found = ev["data"]
    return found


def decay_item(retro):
    """HEADS-UP item naming the features the retro switched off, or None."""
    off = [x for x in (retro or {}).get("off") or [] if isinstance(x, str)]
    if not off:
        return None
    try:
        import features
        entries = features.load()
        flags = [features.flag_of(entries, i) or i for i in off]
    except Exception:  # the report never fails on the registry
        flags = off
    return "switched off by decay: %s (tdrive decide --key <flag> --value true re-enables)" % ", ".join(flags)


def build(o):
    run, rundir = o["run"], o["rundir"]
    if o["stage"] not in STAGES:
        raise ReportError(2, "unknown stage: %s" % o["stage"])
    state_lines = read_lines(o["state"])
    if not state_lines:
        raise ReportError(3, "no state lines in %s" % o["state"])
    st = parse_state(state_lines)
    snap = load_snapshot(rundir)
    title, deps, has_deps = plan_extras(o["repo"], o["branch"], st["plan"])
    if not title:
        title = os.path.basename(os.path.realpath(o["repo"]))
    if o.get("verify_sha") and not re.match(r"^[0-9a-fA-F]{7,64}$", o["verify_sha"]):
        raise ReportError(2, "invalid --verify-sha: %r" % o["verify_sha"])
    verify_sha, verify_lines = last_verify(rundir, o.get("verify_sha"))

    dlines, done_ids = done_line(o, st, snap, verify_lines)
    nline = next_line(o, st, title, deps, has_deps)

    rows = jsonl_rows(os.path.join(rundir, "govern.jsonl"))
    events = read_lines(os.path.join(rundir, "events.log"))
    dec = decisions(o["repo"])
    g_off = snap.get("govern_rows", 0) if snap else 0
    e_off = snap.get("events_lines", 0) if snap else 0
    g_off = g_off if isinstance(g_off, int) and 0 <= g_off <= len(rows) else 0
    e_off = e_off if isinstance(e_off, int) and 0 <= e_off <= len(events) else 0
    seen_dec = set(snap.get("decision_ids", [])) if snap and isinstance(snap.get("decision_ids"), list) else set()

    items = verify_items(run, rundir, verify_sha, verify_lines)
    items.extend(govern_items(o, run, rows))
    for it in (freed_item(rows, g_off), question_item(rundir), event_item(events[e_off:])):
        if it:
            items.append(it)
    new_dec = [d for d in dec if d not in seen_dec]
    if new_dec:
        items.append("%d decision%s logged: %s" % (len(new_dec), "" if len(new_dec) == 1 else "s",
                                                   ", ".join(new_dec)))
    retro = last_retro(rundir) if o["stage"] == "final" else None
    it = decay_item(retro)
    if it:
        items.append(it)
    for text in o["heads_up"]:
        t = one_line(text)
        if t:
            items.append(t)
    hline = "HEADS-UP %s %s" % (DASH, SEP.join(items) if items else "none detected")

    eta = "unknown"
    if st["eta"]:
        try:
            eta = runstate.local(calendar.timegm(time.strptime(st["eta"], "%Y-%m-%dT%H:%M:%SZ")))
        except ValueError:
            eta = "unknown"
    pline = "PROGRESS %d/%d (%d%%)%sETA %s" % (st["done"], st["total"], st["pct"], SEP, eta)

    now = runstate.now()
    lines = ["REPORT %s %s stage=%s" % (run, runstate.iso(now), o["stage"])] + dlines + [nline, hline, pline]
    roi = (retro or {}).get("roi")
    if isinstance(roi, dict) and isinstance(roi.get("line"), str) and roi["line"].startswith("ROI run="):
        lines.append(one_line(roi["line"]))
    text = scrub("\n".join(keep_indent(x) for x in lines) + "\n")
    snapshot = {
        "ts": now,
        "stage": o["stage"],
        "plan": st["plan"],
        "done_ids": done_ids,
        "done": st["done"],
        "total": st["total"],
        "events_lines": len(events),
        "govern_rows": len(rows),
        "decision_ids": dec,
        "verify_sha": verify_sha,
    }
    return text, snapshot


def save(o, text, snapshot):
    rd = o["rundir"]
    stamp = o["save_stamp"]
    if not re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]*$", stamp):
        raise ReportError(2, "invalid stamp: %r" % stamp)
    try:
        runstate.atomic_write(os.path.join(rd, "reports", stamp + ".md"), text)
        runstate.atomic_write(os.path.join(rd, "reports", "last.md"), text)
        runstate.atomic_write(os.path.join(rd, "report.snapshot"), json.dumps(snapshot, indent=2) + "\n")
    except (IOError, OSError) as exc:
        raise ReportError(3, "cannot save the report: %s" % exc)


# ---- handoff brief -----------------------------------------------------------

def bullets(items, empty="none"):
    return "\n".join("- %s" % x for x in items) if items else empty


def fenced(lines, empty="none"):
    if not lines:
        return empty
    return "```\n%s\n```" % "\n".join(lines)


def brief(o):
    import config
    import yamlite
    run, rundir, repo, branch = o["run"], o["rundir"], o["repo"], o["branch"]
    st = parse_state(read_lines(o["state"]))

    scope = ["%s: %s" % (k, v) for k, v in runstate.read_env(run) if v != ""]
    try:
        changed = config.Config(repo, rundir).changed()
    except config.ConfigError as exc:
        raise ReportError(exc.code, str(exc))
    cfg = ["%s: %s (%s)" % (k, config.fmt(v), layer) for k, v, layer, _ in changed]
    scope_text = bullets(scope, "no run.env values") + "\n\nConfig changed from defaults:\n" + bullets(cfg)

    try:
        stop = yamlite.load(os.path.join(ROOT, "policies", "stop-conditions.yaml"))
    except yamlite.YamlError as exc:
        raise ReportError(3, str(exc))
    conds = []
    for c in (stop or {}).get("conditions", []) or []:
        if isinstance(c, dict):
            conds.append("%s: %s -> %s" % (c.get("id", "?"), c.get("trigger", "?"), c.get("action", "?")))

    session = o.get("session") or "-"
    cls = read_lines(o.get("classify"))
    sessions = bullets(["session: %s" % session,
                        "watch spec: %s:%s:%s" % (session, repo, branch),
                        "engine: %s" % o["engine"]])
    sessions += "\n\nClassified pane state:\n" + fenced(cls, "unknown (no session or tmux)")

    def named(ids):
        return ", ".join("%s (%s)" % (i, n) for i, n in zip(ids, names_of(st, ids))) or "none"

    flight = bullets(["plan: %s" % (st["plan"] or "none"),
                      "stage: %s, %s" % (st["stage"], progress_text(st)),
                      "in progress: %s" % named(st["in_progress"]),
                      "next: %s" % named(st["next"])])

    vsha, vlines = last_verify(rundir)
    verify = ("sha %s\n\n" % vsha + fenced(vlines)) if vsha else "no verify recorded"

    qs = []
    for line in read_lines(os.path.join(rundir, "questions.md")):
        if QUESTION_RE.match(line):
            qs.append(line.strip()[2:].strip())
    resume_cmd = "tdrive start %s %s --resume --run %s" % (o["engine"], repo, run)
    resume = "1. Read this brief fully; do not re-ask settled decisions.\n" \
             "2. Run: `%s`\n" \
             "3. Continue the drive loop from the in-flight state above." % resume_cmd

    values = {
        "run": run,
        "generated": runstate.local(),
        "scope": scope_text,
        "stop_conditions": bullets(conds),
        "sessions": sessions,
        "in_flight": flight,
        "verify": verify,
        "report": fenced(read_lines(o["report"]), "no report"),
        "questions": bullets(qs),
        "resume": resume,
    }
    tpl = read_text(os.path.join(ROOT, "core", "templates", "handoff-driver.md"))
    if tpl is None:
        raise ReportError(3, "missing template core/templates/handoff-driver.md")

    def warn(key):
        sys.stderr.write("report: unknown placeholder {{%s}} in handoff-driver.md\n" % key)

    text = scrub(render.render(tpl, values, warn=warn))
    if not text.endswith("\n"):
        text += "\n"
    try:
        runstate.ensure_dir(os.path.dirname(o["out"]))
        runstate.atomic_write(o["out"], text)
    except (IOError, OSError) as exc:
        raise ReportError(3, "cannot write %s: %s" % (o["out"], exc))
    return resume_cmd


# ---- CLI -------------------------------------------------------------------

VALUE_OPTS = ("--run", "--rundir", "--repo", "--branch", "--stage", "--state", "--check", "--top",
              "--save-stamp", "--engine", "--report", "--out", "--session", "--classify", "--verify-sha")


def parse(args):
    o = {"heads_up": []}
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--heads-up" and i + 1 < len(args):
            o["heads_up"].append(args[i + 1])
        elif a in VALUE_OPTS and i + 1 < len(args):
            o[a[2:].replace("-", "_")] = args[i + 1]
        else:
            raise ReportError(2, "unknown or incomplete option: %s" % a)
        i += 2
    return o


def need(o, *names):
    for n in names:
        if not o.get(n):
            raise ReportError(2, "--%s is required" % n.replace("_", "-"))


def run_cli(argv):
    if not argv:
        raise ReportError(2, "usage: report.py render|scrub|brief ...")
    cmd, args = argv[0], argv[1:]
    if cmd == "scrub":
        if args:
            raise ReportError(2, "usage: report.py scrub < text")
        data = sys.stdin.buffer.read().decode("utf-8", "replace")
        sys.stdout.buffer.write(scrub(data).encode("utf-8"))
        return 0
    o = parse(args)
    try:
        if cmd == "render":
            need(o, "run", "rundir", "repo", "branch", "stage", "state")
            text, snapshot = build(o)
            if o.get("save_stamp"):
                save(o, text, snapshot)
            sys.stdout.buffer.write(text.encode("utf-8"))
            return 0
        if cmd == "brief":
            need(o, "run", "rundir", "repo", "branch", "engine", "state", "report", "out")
            brief(o)
            return 0
    except runstate.RunStateError as exc:
        raise ReportError(exc.code, str(exc))
    raise ReportError(2, "unknown command: %s" % cmd)


def main(argv):
    try:
        return run_cli(argv[1:])
    except ReportError as exc:
        sys.stderr.write("report: %s\n" % exc)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
