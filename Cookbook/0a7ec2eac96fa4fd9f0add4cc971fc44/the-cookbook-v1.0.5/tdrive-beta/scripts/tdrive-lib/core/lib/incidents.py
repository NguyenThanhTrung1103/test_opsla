"""Pattern catcher: incident registry, detectors and the scan of a run.

Registry: policies/incidents.yaml (closed, extensible). Every class names
its detector `detect_<id>` here; an unknown detector or a bad field is
refused (exit 2). A detector is pure and deterministic:
    detect_<id>(events, params, ctx) -> [Incident]
events = [(lineno, obj)] of one run's trace (trace.read), ctx = {run, cap,
tick_s, now}; Incident = {class, anchor: "L<n>", lines: ["L<n>", ...],
summary (<= 120 chars)}. The anchor is the line that dedupes the incident
in the ledger: (run, class, anchor).

CLI:
  scan --run R [--session S] [--source live|retro|backfill]
      Runs every detector on R/trace.jsonl; `intervention` events carrying
      a registry class are occurrences too (source=intervention). Under the
      ledger lock: dedupe, append new ledger rows, rewrite lessons. Then one
      `incident` trace event and one line per new detected incident:
        INCIDENT class=<c> severity=<s> line=L<n> | <summary>
      A detector switched off by the decay scan (features.<class> false)
      records nothing; its class gets one blocked-off use per run instead.
      A new incident of a `capture: true` class in a live scan with a
      session saves a scrubbed, bounded `tmux capture-pane` copy as
      R/captures/<ts>-<pid>-<seq>.txt (its path goes in the ledger row).
Exit: 0 ok, 2 usage, unknown run, bad registry or store inside a project
repo, 3 write error.
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
import features  # noqa: E402
import learnstore  # noqa: E402
import lessons  # noqa: E402
import runstate  # noqa: E402
import trace  # noqa: E402
import yamlite  # noqa: E402
from scrub import scrub  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
REGISTRY = os.path.join(ROOT, "policies", "incidents.yaml")
SEVERITIES = ("low", "medium", "high")
TARGETS = ("pane-regex", "watch-trigger", "govern-guard", "verify-probe", "message-template", "preset-default",
           "model-policy")
RECIPES = ("ready", "draft")
SOURCES = ("live", "retro", "backfill")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SUMMARY_MAX = 120
CAPTURE_TIMEOUT_S = 5
CAPTURE_MAX = 200000


class IncidentError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


# ---- registry ---------------------------------------------------------------------

def load_registry(path=None):
    """The validated class list of the registry; IncidentError(2) when a
    class is malformed or names a detector that does not exist."""
    path = path or REGISTRY
    try:
        data = yamlite.load(path)
    except yamlite.YamlError as exc:
        raise IncidentError(2, str(exc))
    except (IOError, OSError) as exc:
        raise IncidentError(2, "cannot read the incident registry %s: %s" % (path, exc))
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("classes"), list):
        raise IncidentError(2, "%s: needs version: 1 and a classes list" % path)
    seen = set()
    out = []
    for c in data["classes"]:
        if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not ID_RE.match(c["id"]):
            raise IncidentError(2, "%s: every class needs an id of lowercase words and dashes" % path)
        cid = c["id"]

        def bad(msg):
            return IncidentError(2, "%s: class %s: %s" % (path, cid, msg))

        if cid in seen:
            raise bad("listed twice")
        seen.add(cid)
        if c.get("severity") not in SEVERITIES:
            raise bad("severity must be one of %s" % ", ".join(SEVERITIES))
        for key in ("description", "fix_hint", "detector"):
            if not isinstance(c.get(key), str) or not c[key].strip() or "\n" in c[key]:
                raise bad("%s must be a one-line string" % key)
        fn = globals().get(c["detector"])
        if not c["detector"].startswith("detect_") or not callable(fn):
            raise bad("unknown detector %s" % c["detector"])
        params = c.get("params")
        if params is None:
            params = {}
        if not isinstance(params, dict):
            raise bad("params must be a map")
        wm = c.get("wake_match")
        if not isinstance(wm, list) or not all(isinstance(x, str) and x for x in wm):
            raise bad("wake_match must be a list of stop ids or events")
        promote = c.get("promote")
        if not isinstance(promote, dict) or promote.get("target") not in TARGETS:
            raise bad("promote.target must be one of %s" % ", ".join(TARGETS))
        if promote.get("recipe") not in RECIPES:
            raise bad("promote.recipe must be one of %s" % ", ".join(RECIPES))
        if not isinstance(c.get("capture"), bool):
            raise bad("capture must be true or false")
        seeds = c.get("seeds")
        if not isinstance(seeds, list) or not seeds:
            raise bad("seeds must be a non-empty list")
        for s in seeds:
            if not isinstance(s, dict) or not all(isinstance(s.get(k), str) and s[k] for k in
                                                  ("date", "provenance", "fixture")):
                raise bad("every seed needs date, provenance and fixture")
        extra = set(c) - set(("id", "severity", "description", "detector", "params", "wake_match", "promote",
                              "fix_hint", "capture", "seeds"))
        if extra:
            raise bad("unknown field(s): %s" % ", ".join(sorted(extra)))
        entry = dict(c)
        entry["params"] = params
        out.append(entry)
    return out


# ---- detector helpers ---------------------------------------------------------------

def _data(o):
    return o["data"]


def _t(o):
    return trace.epoch(o["ts"])


def _gov(o, line):
    return o["kind"] == "govern" and _data(o).get("line") == line


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _int(v):
    if isinstance(v, bool):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _lid(n):
    return "L%d" % n


def _inc(cls, anchor, lines, summary):
    ls = sorted(set(lines + [anchor]))
    summary = " ".join(str(summary).split())
    if len(summary) > SUMMARY_MAX:
        summary = summary[:SUMMARY_MAX - 1] + trace.ELLIPSIS
    return {"class": cls, "anchor": _lid(anchor), "lines": [_lid(n) for n in ls], "summary": summary}


def _sha7(s):
    return str(s or "")[:7]


def _same_sha(a, b):
    a, b = str(a or ""), str(b or "")
    if len(a) < 7 or len(b) < 7:
        return False
    return a.startswith(b) or b.startswith(a)


def _text_send(o):
    return o["kind"] == "send" and _data(o).get("mode") in ("inline", "pointer") and _data(o).get("result") == "sent"


# ---- detectors (one per class, pure) ----------------------------------------------

def detect_false_busy(events, params, ctx):
    """A BUSY pane whose screen stayed unchanged for min_static_ticks ticks."""
    need = _int(params.get("min_static_ticks")) or 3
    out = []
    first = {}
    for n, o in events:
        if o["kind"] != "pane":
            continue
        d = _data(o)
        key = (d.get("session"), d.get("screen_sha"))
        if d.get("state") != "BUSY":
            first.pop(key, None)
            continue
        first.setdefault(key, n)
        ticks = _int(d.get("static_ticks"))
        if ticks is not None and ticks >= need:
            out.append(_inc("false-busy", n, [first[key]], "BUSY with an unchanged screen for %d ticks (sha %s)"
                            % (ticks, _sha7(d.get("screen_sha")))))
    return out


def detect_pause_not_lifted(events, params, ctx):
    """A pause message, then min_checks non-critical RESOURCE checks and no
    resource-resume."""
    rule = re.compile(params.get("pause_rule") or r"(?i)pause")
    need = _int(params.get("min_checks")) or 3
    out = []
    pause = None
    checks = []
    for n, o in events:
        d = _data(o)
        if o["kind"] == "send" and d.get("result") == "sent":
            tpl = d.get("template")
            if tpl == "resource-resume":
                pause, checks = None, []
            elif tpl == "resource-high" and pause is None and rule.search(str(d.get("dispatch_rule") or "")):
                pause, checks = n, []
            continue
        if pause is not None and _gov(o, "RESOURCE") and d.get("level") not in ("critical", None):
            checks.append(n)
            if len(checks) == need:
                out.append(_inc("pause-not-lifted", pause, [n],
                                "pause sent, then %d checks below critical (level %s, load %s) and no resume"
                                % (need, d.get("level"), d.get("load_per_cpu"))))
    return out


def detect_report_contradiction(events, params, ctx):
    """A report showing verify for a sha that it also flags as verify DEFERRED
    retry pending."""
    out = []
    verified = []
    for n, o in events:
        d = _data(o)
        if o["kind"] == "verify" and d.get("result") in ("PASS", "WEAK", "FAIL"):
            verified.append((n, d.get("sha")))
            continue
        if o["kind"] != "report" or not d.get("pending_sha"):
            continue
        pend = d["pending_sha"]
        hit = None
        for vn, vsha in verified:
            if _same_sha(vsha, pend):
                hit = vn
        if _same_sha(d.get("verify_sha"), pend) or (hit is not None and d.get("verify_shown")):
            out.append(_inc("report-contradiction", n, [hit] if hit else [],
                            "report shows verify PASS and verify DEFERRED %s retry pending" % _sha7(pend)
                            if d.get("verify_shown") else
                            "report flags verify DEFERRED %s retry pending for a verified sha" % _sha7(pend)))
    return out


def detect_report_overflow(events, params, ctx):
    cap = _int(params.get("max_done_chars")) or 400
    out = []
    for n, o in events:
        d = _data(o)
        chars = _int(d.get("done_chars")) if o["kind"] == "report" else None
        if chars is not None and chars > cap:
            out.append(_inc("report-overflow", n, [], "DONE line of %d chars (cap %d)" % (chars, cap)))
    return out


def detect_count_mismatch(events, params, ctx):
    """RESOURCE pane-agent count != the nearest pane event's agents within
    window_s; one incident per mismatch episode."""
    window = _int(params.get("window_s")) or 60
    panes = [(n, _t(o), _int(_data(o).get("agents")) or 0) for n, o in events
             if o["kind"] == "pane" and _data(o).get("state") not in ("SESSION_GONE",)]
    out = []
    open_ep = False
    for n, o in events:
        if not _gov(o, "RESOURCE"):
            continue
        d = _data(o)
        res = _int(d.get("agents_pane"))
        if res is None:
            res = _int(d.get("agents"))
        t = _t(o)
        best = None
        for pn, pt, pa in panes:
            if t is None or pt is None or abs(pt - t) > window:
                continue
            if best is None or abs(pt - t) < abs(best[1] - t) or (abs(pt - t) == abs(best[1] - t) and pn > best[0]):
                best = (pn, pt, pa)
        if res is None or best is None:
            continue
        if best[2] == res:
            open_ep = False
            continue
        if not open_ep:
            out.append(_inc("count-mismatch", n, [best[0]],
                            "RESOURCE agents=%d while the pane showed %d agents" % (res, best[2])))
        open_ep = True
    return out


def detect_cache_in_use_cleanup(events, params, ctx):
    statuses = params.get("statuses") or ["would-clean", "ok"]
    out = []
    for n, o in events:
        d = _data(o)
        if not _gov(o, "CLEAN") or d.get("status") not in statuses:
            continue
        cons = [c for c in (d.get("consumers") or []) if isinstance(c, dict)]
        if cons:
            out.append(_inc("cache-in-use-cleanup", n, [],
                            "%s %s while %s pid %s uses it (%d process%s)"
                            % (d.get("id"), d.get("status"), cons[0].get("cmd"), cons[0].get("pid"), len(cons),
                               "" if len(cons) == 1 else "es")))
    return out


def detect_resource_leak_foreign(events, params, ctx):
    """TOP rows of another owner's orphan (ppid 1) at >= min_cpu, one pid
    seen at least min_gap_min apart; one incident per command."""
    ignore = set(params.get("ignore_cmds") or [])
    min_cpu = _num(params.get("min_cpu"))
    min_cpu = 50.0 if min_cpu is None else min_cpu
    gap = (_int(params.get("min_gap_min")) or 10) * 60
    groups = {}
    order = []
    for n, o in events:
        if not _gov(o, "TOP"):
            continue
        d = _data(o)
        cpu = _num(d.get("cpu"))
        cmd = d.get("cmd")
        if d.get("owner") != "other" or _int(d.get("ppid")) != 1 or cpu is None or cpu < min_cpu \
                or not cmd or cmd in ignore:
            continue
        if cmd not in groups:
            groups[cmd] = []
            order.append(cmd)
        groups[cmd].append((n, _t(o), _int(d.get("pid")), cpu))
    out = []
    for cmd in order:
        rows = groups[cmd]
        first_seen = {}
        proof = None
        for n, t, pid, _cpu in rows:
            if pid not in first_seen:
                first_seen[pid] = t
            elif t is not None and first_seen[pid] is not None and t - first_seen[pid] >= gap:
                proof = n
                break
        if proof is None:
            continue
        pids = sorted(set(r[2] for r in rows))
        stamps = [r[1] for r in rows if r[1] is not None]
        mins = (max(stamps) - min(stamps)) // 60 if stamps else 0
        out.append(_inc("resource-leak-foreign", rows[0][0], [proof],
                        "%s x%d owner=other ppid=1 cpu>=%s%% seen over %d min"
                        % (cmd, len(pids), ("%.1f" % min(r[3] for r in rows)), mins)))
    return out


def detect_nested_fanout_over_cap(events, params, ctx):
    """RESOURCE agents above the run's cap; one incident per episode."""
    cap = ctx.get("cap")
    out = []
    open_ep = False
    for n, o in events:
        d = _data(o)
        if o["kind"] == "run" and _int(d.get("cap")) is not None:
            cap = _int(d.get("cap"))
            continue
        if not _gov(o, "RESOURCE"):
            continue
        agents = _int(d.get("agents"))
        if cap is None or agents is None or agents <= cap:
            open_ep = False
            continue
        if not open_ep:
            out.append(_inc("nested-fanout-over-cap", n, [],
                            "%d agents (nested included) over cap %d, level %s" % (agents, cap, d.get("level"))))
        open_ep = True
    return out


def detect_probe_miss(events, params, ctx):
    got = params.get("got") or "exit0"
    out = []
    for n, o in events:
        if o["kind"] != "verify":
            continue
        for p in _data(o).get("probes") or []:
            if isinstance(p, dict) and p.get("verdict") == "FAIL" and p.get("got") == got:
                out.append(_inc("probe-miss", n, [], "probe %s missed: gate %s with the plant in place (verify %s)"
                                % (p.get("id"), got, _sha7(_data(o).get("sha")))))
                break
    return out


def detect_false_resource_alarm(events, params, ctx):
    rx = re.compile(params.get("alarm_regex") or r"(?i)\b(swap|mem|load|resource)")
    window = _int(params.get("window_s")) or 120
    oks = [(n, _t(o)) for n, o in events if _gov(o, "RESOURCE") and _data(o).get("level") == "ok"]
    out = []
    for n, o in events:
        if o["kind"] != "alert" or not rx.search(str(_data(o).get("text") or "")):
            continue
        t = _t(o)
        near = [(abs(ot - t), on) for on, ot in oks if t is not None and ot is not None and abs(ot - t) <= window]
        if near:
            dt, on = min(near)
            out.append(_inc("false-resource-alarm", n, [on], "alert %s while RESOURCE level=ok within %d s"
                            % (_data(o).get("text"), dt)))
    return out


def detect_false_question(events, params, ctx):
    """A QUESTION pane that moved on with no send or answer in between."""
    out = []
    pending = {}
    for n, o in events:
        d = _data(o)
        if o["kind"] in ("send", "answer"):
            pending.clear()
            continue
        if o["kind"] != "pane":
            continue
        s, st = d.get("session"), d.get("state")
        if st == "QUESTION":
            pending.setdefault(s, n)
            continue
        q = pending.pop(s, None)
        if q is not None and st != "SESSION_GONE":
            out.append(_inc("false-question", q, [n], "pane read QUESTION, then %s with no keys or answer sent" % st))
    return out


def detect_false_idle(events, params, ctx):
    """An IDLE pane with background shells or agents, or IDLE then BUSY with
    nothing sent."""
    out = []
    open_idle = {}  # session -> [idle line, background text or None, sent since]

    def close(entry, busy_line):
        n0, bg, sent = entry
        if busy_line is not None and not sent:
            out.append(_inc("false-idle", n0, [busy_line], "pane read IDLE%s, then BUSY with nothing sent"
                            % (" with " + bg if bg else "")))
        elif bg:
            out.append(_inc("false-idle", n0, [], "pane read IDLE with %s" % bg))

    for n, o in events:
        d = _data(o)
        if o["kind"] == "send" and d.get("result") == "sent":
            for entry in open_idle.values():
                entry[2] = True
            continue
        if o["kind"] != "pane":
            continue
        s, st = d.get("session"), d.get("state")
        prev = open_idle.pop(s, None)
        if prev is not None:
            close(prev, n if st == "BUSY" else None)
        if st == "IDLE":
            shells, agents = _int(d.get("shells")) or 0, _int(d.get("agents")) or 0
            bg = "%d background shell(s) and %d agent(s)" % (shells, agents) if shells + agents else None
            open_idle[s] = [n, bg, False]
    for entry in open_idle.values():
        close(entry, None)
    return sorted(out, key=lambda i: int(i["anchor"][1:]))


def detect_limit_hit(events, params, ctx):
    out = []
    seen = set()
    for n, o in events:
        if o["kind"] != "limit":
            continue
        key = (_data(o).get("reset"), _data(o).get("hash"))
        if key in seen:
            continue
        seen.add(key)
        out.append(_inc("limit-hit", n, [], "usage limit, resets %s" % _data(o).get("reset")))
    return out


def detect_watch_lapse(events, params, ctx):
    """A wake with the pane BUSY, then no run resume or watch start within
    max_gap_min (to the next one, else to ctx now)."""
    gap = (_int(params.get("max_gap_min")) or 15) * 60
    out = []
    last_state = None
    for i, (n, o) in enumerate(events):
        d = _data(o)
        if o["kind"] == "pane":
            last_state = d.get("state")
            continue
        if o["kind"] != "wake" or last_state != "BUSY":
            continue
        t0 = _t(o)
        rearm = None
        for n2, o2 in events[i + 1:]:
            d2 = _data(o2)
            if (o2["kind"] == "run" and d2.get("action") == "resume") or \
                    (o2["kind"] == "watch" and d2.get("action") == "start"):
                rearm = (n2, _t(o2))
                break
        end = rearm[1] if rearm else ctx.get("now")
        if t0 is None or end is None or end - t0 <= gap:
            continue
        out.append(_inc("watch-lapse", n, [rearm[0]] if rearm else [],
                        "wake stop=%s with the pane BUSY, re-armed after %d min" % (d.get("stop"), (end - t0) // 60)
                        if rearm else "wake stop=%s with the pane BUSY, not re-armed for %d min"
                        % (d.get("stop"), (end - t0) // 60)))
    return out


def detect_send_garbled(events, params, ctx):
    """A sent message, then the next pane event shows pending input."""
    window = _int(params.get("window_s")) or 120
    out = []
    last = None
    for n, o in events:
        if _text_send(o):
            last = (n, _t(o), _data(o).get("template"))
            continue
        if o["kind"] != "pane" or last is None:
            continue
        t = _t(o)
        if t is not None and last[1] is not None and t - last[1] <= window \
                and _data(o).get("pending_input") in ("yes", True):
            out.append(_inc("send-garbled", last[0], [n], "sent %s, then the input box still held text"
                            % (last[2] or "a message")))
        last = None
    return out


def detect_rework_cascade(events, params, ctx):
    """min_fails FAIL verifies at one done count."""
    need = _int(params.get("min_fails")) or 3
    out = []
    done = 0
    fails = {}
    for n, o in events:
        d = _data(o)
        if o["kind"] == "phase" and d.get("event") == "done":
            done += 1
            continue
        if o["kind"] != "verify" or d.get("result") != "FAIL":
            continue
        count = _int(d.get("count"))
        key = done if count is None else count
        fails.setdefault(key, []).append(n)
        if len(fails[key]) == need:
            out.append(_inc("rework-cascade", n, fails[key][:-1], "%d failed verifies at done count %d"
                            % (need, key)))
    return out


def detect_flake_rerun_pass(events, params, ctx):
    out = []
    failed = {}
    for n, o in events:
        d = _data(o)
        if o["kind"] != "verify":
            continue
        k = _sha7(d.get("sha"))
        if d.get("result") == "FAIL":
            failed.setdefault(k, n)
        elif d.get("result") == "PASS" and k in failed:
            out.append(_inc("flake-rerun-pass", n, [failed.pop(k)], "verify %s failed, then passed unchanged" % k))
    return out


def detect_empty_verify_output(events, params, ctx):
    names = set(params.get("test_targets") or ["test", "tests"])
    out = []
    for n, o in events:
        if o["kind"] != "verify":
            continue
        hits = [t.get("name") for t in _data(o).get("targets") or [] if isinstance(t, dict)
                and t.get("name") in names and t.get("exit") == 0 and t.get("summary_empty") is True]
        if hits:
            out.append(_inc("empty-verify-output", n, [], "target %s exit 0 with no test summary (verify %s %s)"
                            % (",".join(hits), _data(o).get("result"), _sha7(_data(o).get("sha")))))
    return out


def detect_passes_only_in_dirty_tree(events, params, ctx):
    """A verify FAIL while the source work tree holds git-ignored test files."""
    out = []
    for n, o in events:
        d = _data(o)
        if o["kind"] != "verify" or d.get("result") != "FAIL":
            continue
        ign = d.get("ignored_test_files")
        cnt = _int(ign.get("n")) if isinstance(ign, dict) else None
        if cnt:
            paths = [p for p in ign.get("paths") or [] if isinstance(p, str)]
            out.append(_inc("passes-only-in-dirty-tree", n, [],
                            "verify %s FAIL with %d git-ignored test file(s) in the source tree: %s"
                            % (_sha7(d.get("sha")), cnt, ", ".join(paths[:2]) or "-")))
    return out


# ---- running ------------------------------------------------------------------------

def make_ctx(run, events, cap=None, tick_s=None, now=None):
    """ctx for the detectors: the last run event's cap wins over cap; now
    defaults to the last event time."""
    for _n, o in events:
        if o["kind"] == "run" and _int(_data(o).get("cap")) is not None:
            cap = _int(_data(o).get("cap"))
    if now is None:
        stamps = [_t(o) for _n, o in events]
        stamps = [s for s in stamps if s is not None]
        now = max(stamps) if stamps else None
    return {"run": run, "cap": cap, "tick_s": tick_s, "now": now}


def run_detectors(registry, events, ctx, errors=None):
    """Every incident of every class, ordered by anchor line. A detector that
    raises is reported in errors (when given) and skipped."""
    out = []
    for c in registry:
        fn = globals()[c["detector"]]
        try:
            found = fn(events, c["params"], ctx)
        except Exception as exc:  # one broken detector must not hide the others
            if errors is not None:
                errors.append("detector %s failed: %s: %s" % (c["detector"], type(exc).__name__, exc))
            continue
        for inc in found:
            if inc.get("class") == c["id"]:
                inc["severity"] = c["severity"]
                out.append(inc)
    out.sort(key=lambda i: (int(i["anchor"][1:]), i["class"]))
    return out


def occurrences(registry, events):
    """`intervention` events carrying a registry class, as occurrences."""
    known = dict((c["id"], c) for c in registry)
    out = []
    for n, o in events:
        d = _data(o)
        if o["kind"] == "intervention" and d.get("class") in known:
            text = " ".join(str(d.get("text") or "").split())
            if len(text) > SUMMARY_MAX:
                text = text[:SUMMARY_MAX - 1] + trace.ELLIPSIS
            out.append({"class": d["class"], "severity": known[d["class"]]["severity"], "anchor": _lid(n),
                        "lines": [_lid(n)], "summary": text, "ts": o["ts"], "source": "intervention"})
    return out


def _log(rd, msg):
    sys.stderr.write("incidents: %s\n" % msg)
    if not rd or not os.path.isdir(rd):
        return
    try:
        with open(os.path.join(rd, "tdrive.log"), "a") as fh:
            fh.write("%s incidents %s\n" % (runstate.iso(), msg.replace("\n", " ")))
    except (IOError, OSError, runstate.RunStateError):
        pass


def _config(run, rd):
    repo = runstate.env_get(run, "REPO") or None
    if repo and not os.path.isdir(repo):
        repo = None
    try:
        return config.Config(repo, rd).values
    except config.ConfigError as exc:
        _log(rd, "config not loaded (%s); schema defaults used" % exc)
        cfg = {}
        for key, spec in config.load_schema().items():
            cfg[key] = (spec.get("default"), "default", "-")
        return cfg


def _capture(rd, session):
    """Path of a scrubbed pane capture of session under R/captures, or None."""
    try:
        p = subprocess.run(["tmux", "capture-pane", "-p", "-t", "=%s:" % session], stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, timeout=CAPTURE_TIMEOUT_S)
    except (OSError, subprocess.SubprocessError) as exc:
        _log(rd, "no pane capture of %s: %s" % (session, exc))
        return None
    if p.returncode != 0:
        _log(rd, "no pane capture of %s (tmux exit %d)" % (session, p.returncode))
        return None
    text = scrub(p.stdout[-CAPTURE_MAX:].decode("utf-8", "replace"))
    path = os.path.join(runstate.ensure_dir(os.path.join(rd, "captures")),
                        "%s.txt" % runstate.stamp(os.getpid()))
    runstate.atomic_write(path, text)
    os.chmod(path, 0o600)
    return path


def _switched_off(run, rd, found, events, cfg):
    """found minus the incidents of detectors switched off by the decay scan
    (features.<class> false); each such class gets one blocked-off use per
    run (the detector would have fired)."""
    try:
        entries = features.load()
    except features.FeatureError as exc:
        _log(rd, "feature registry not loaded (%s); every detector on" % exc)
        return found
    off = set(c for c in set(i["class"] for i in found) if not features.enabled(c, cfg, entries))
    if not off:
        return found
    told = set(o["data"].get("feature") for _n, o in events
               if o["kind"] == "use" and o["data"].get("effect") == "blocked-off")
    for cls in sorted(off - told):
        trace.use(run, "incidents", cls, "blocked-off")
    return [i for i in found if i["class"] not in off]


def scan(run, session=None, source="live", out=sys.stdout):
    if not runstate.valid_run(run or ""):
        raise IncidentError(2, "invalid run name: %r" % run)
    rd = runstate.run_dir(run)
    if not os.path.isdir(rd):
        raise IncidentError(2, "no run dir for run %s: %s" % (run, rd))
    try:
        registry = load_registry()
    except IncidentError as exc:
        _log(rd, str(exc))
        raise
    try:
        ledger = learnstore.paths("ledger", run)
        lock = learnstore.paths("ledger_lock", run)
        lesson_dir = learnstore.paths("lessons", run)
    except learnstore.StoreError as exc:
        _log(rd, str(exc))
        raise IncidentError(exc.code, str(exc))
    cfg = _config(run, rd)
    events = list(trace.read(os.path.join(rd, trace.TRACE)))
    ctx = make_ctx(run, events, cap=cfg["run.max_implementers"][0], tick_s=cfg["watch.tick_s"][0],
                   now=runstate.now())
    errors = []
    found = run_detectors(registry, events, ctx, errors)
    for e in errors:
        _log(rd, e)
    found = _switched_off(run, rd, found, events, cfg)
    ts_of = dict((_lid(n), o["ts"]) for n, o in events)
    rows = []
    for inc in found:
        rows.append({"class": inc["class"], "severity": inc["severity"], "anchor": inc["anchor"],
                     "lines": inc["lines"], "summary": inc["summary"], "ts": ts_of.get(inc["anchor"]),
                     "source": source, "capture": None})
    rows.extend(dict(o, capture=None) for o in occurrences(registry, events))

    # Captures are taken before the lock (bounded tmux), only for incidents
    # not yet in the ledger; a capture that loses a race is removed.
    capture_cls = set(c["id"] for c in registry if c["capture"])
    captures = []
    if source == "live" and session:
        known = lessons.ledger_keys(ledger)
        want = [r for r in rows if r["source"] != "intervention" and r["class"] in capture_cls
                and (run, r["class"], r["anchor"]) not in known]
        if want:
            path = _capture(rd, session)
            if path:
                captures.append(path)
                for r in want:
                    r["capture"] = path
    added = lessons.record(run, rows, registry, cfg["lessons.min_count"][0], ledger, lock, lesson_dir,
                           cfg.get("features.lessons", (True,))[0] is not False)
    used = set(r["capture"] for r in added if r["capture"])
    for path in captures:
        if path not in used:
            try:
                os.unlink(path)
            except OSError:
                pass
    for r in added:
        if r["source"] == "intervention":
            continue
        data = {"class": r["class"], "severity": r["severity"], "lines": r["lines"], "summary": r["summary"]}
        if r["capture"]:
            data["capture"] = r["capture"]
        trace.emit(run, "incidents", "incident", data)
        out.write("INCIDENT class=%s severity=%s line=%s | %s\n" % (r["class"], r["severity"], r["anchor"],
                                                                  r["summary"]))
    return added


def main(argv):
    args = argv[1:]
    try:
        if not args or args[0] != "scan":
            raise IncidentError(2, "usage: incidents.py scan --run R [--session S] [--source live|retro|backfill]")
        o = {}
        i = 1
        while i < len(args):
            a = args[i]
            if a not in ("--run", "--session", "--source") or i + 1 >= len(args):
                raise IncidentError(2, "usage: incidents.py scan --run R [--session S] "
                                       "[--source live|retro|backfill] (bad option %s)" % a)
            o[a] = args[i + 1]
            i += 2
        if not o.get("--run"):
            raise IncidentError(2, "usage: incidents.py scan --run R [--session S] [--source live|retro|backfill]")
        source = o.get("--source", "live")
        if source not in SOURCES:
            raise IncidentError(2, "--source must be one of %s" % ", ".join(SOURCES))
        scan(o["--run"], o.get("--session") or None, source)
    except IncidentError as exc:
        sys.stderr.write("incidents: %s\n" % exc)
        return exc.code
    except runstate.RunStateError as exc:
        sys.stderr.write("incidents: %s\n" % exc)
        return exc.code
    except (IOError, OSError) as exc:
        sys.stderr.write("incidents: %s\n" % exc)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
