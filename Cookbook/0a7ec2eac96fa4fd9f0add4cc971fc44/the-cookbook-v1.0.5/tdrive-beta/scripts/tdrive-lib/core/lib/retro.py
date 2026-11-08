"""Retro of one run: metrics, phase rows, incident classes, lessons, the
assigned-model table, the automatic ROI, the decay scan with its automatic
build-to-delete action, and proposal markdown files, all saved in the
learning store (learnstore kinds `retros`, `proposals`, `decay`), never
inside a project repo.

CLI:
  run --run R [--since ISO]
      The run's trace (a run without one is backfilled first), events at or
      after --since. The incident scan runs first (source=retro). Prints:
        RETRO <run> path=<p> events=<n> since=<iso|->
        METRIC name=<m> value=<v>           (METRICS, in this order)
        PHASE id=<id> secs=<n|-> rework=<n> first_pass=<yes|no|-> kind=<k|->
              model=<m|-> effort=<e|->      (per done phase)
        INCIDENT class=<c> severity=<s> count=<n> runs=<n> first=L<n>
              (per class seen in the window; runs = ledger runs of the class)
        LESSON class=<c> severity=<s> status=<st> seen=<n> runs=<n> last=<iso>
              path=<p>                      (lessons of those classes)
        MODEL ... assigned_model=...        (models.py stats, retro.max_runs)
        ROI run=<r> value=<v> catches=<c>/<verify runs> avoided=<a>
            false=<f> incidents=<i> operator=<o> cost=wakes:<w>,tokens:<t|->,
            verify_min:<m>,wall_min:<x> ratio=<n>   (the whole run)
        ROI total runs=<n> ...              (newest retro.max_runs started runs)
        DECAY id=<id> kind=<k> class=<c> runs=<k> fires=<n> changed=<n>
              candidate=<retire|demote|exempt> action=<off|report|none>
              | <evidence>
        or DECAY insufficient runs=<n> need=<K>
        PROPOSAL id=<id> kind=<lesson|delete> path=<p>
      and appends a `retro` trace event (path, since, proposals, roi, off, on).
Metrics: phases_done (phase done events); mean_phase_min (mean secs of the
done phases with a known start, minutes, one decimal); rework_rounds
(verify FAIL); stalls (BACKSTOP watch events outside a usage-limit wait);
nudges (sent nudge messages); interventions (intervention events and every
send by the driver, i.e. a hand-run send); false_events (incidents of the
false-* classes); limit_hits (distinct usage-limit episodes);
resource_pauses (sent pause messages and resource-high messages that stop
dispatch); wakes (wake events); driver_response_min (mean minutes from a
wake to the next driver or operator event).
ROI (trace data only): value = verify_catches (a FAIL or WEAK at a done
count followed by a PASS at that count on another sha) + interventions
avoided (handled keys, limit-resume, resource-resume, resume, a handoff
clear; a govern
handling after a CLEAN ok; a nudge followed by a BUSY pane or PHASE_DONE
within 10 min; none of these when an incident of a false-* class names a
line of its wake's watch window: those count as false actions) + resource
incidents handled (RESOURCE high/critical and DISK pause/alert episodes
with a pause/resume/cap message or a CLEAN ok;
resource-leak-foreign incidents followed by an intervention or alert);
ratio = value / max(1, wakes + operator interventions).
Decay (policies/features.yaml, core/lib/features.py): over the newest
decay.runs started runs, an item with no fires is a retire candidate, one
that fired but never changed an outcome a demote candidate. Safety items
are exempt; core items are reported; an optional retire candidate is
switched off in the decay layer. A switched-off item unrequested
(no blocked-off use) for decay.delete_after_runs started runs gets a
deletion proposal. Code is never deleted.
Proposals: one markdown per lesson (not retired, ledger count >=
lessons.min_count) and per deletion, id <class>-<sha8>, rewritten in place.
Nothing applies a proposal.
Exit: 0 ok, 2 usage, unknown run, bad registry or store inside a project
repo, 3 write error.
"""
import hashlib
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import features  # noqa: E402
import incidents  # noqa: E402
import learnstore  # noqa: E402
import lessons  # noqa: E402
import models  # noqa: E402
import runstate  # noqa: E402
import trace  # noqa: E402
from scrub import scrub  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
METRICS = ("phases_done", "mean_phase_min", "rework_rounds", "stalls", "nudges", "interventions", "false_events",
           "limit_hits", "resource_pauses", "wakes", "driver_response_min")
AVOID_ACTIONS = ("keys", "send:limit-resume", "send:resource-resume", "send:resume", "send:clear")
# Incident classes that mark a wake as a false positive (false-idle,
# false-busy, ...). The registry has no marker field; its ids carry the
# prefix.
FALSE_PREFIX = "false-"
PROGRESS_S = 600
RESOURCE_TEMPLATES = ("resource-high", "resource-resume", "pause", "resume", "one-implementer")
BAD_LEVELS = {"RESOURCE": ("high", "critical"), "DISK": ("pause", "alert")}
ROI_ROWS = ("verify_catches", "verify_runs", "interventions_avoided", "false_actions", "resource_incidents_handled",
            "operator_interventions", "wakes", "tokens", "verify_min", "wall_min", "value", "ratio")
HUMAN_SRCS = ("driver", "operator")
STOP_DISPATCH_RE = re.compile(r"(?i)no new agents|pause")
MODEL_SECTION = "Assigned model choice (engine use not observed)"


class RetroError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def _mean(values, scale=1.0):
    if not values:
        return "-"
    return "%.1f" % (sum(values) / scale / len(values))


def _sent(d, *templates):
    return d.get("result") == "sent" and d.get("template") in templates


# ---- metrics and rows ------------------------------------------------------------

def metrics(events, incident_rows):
    m = dict((k, 0) for k in METRICS)
    secs = []
    responses = []
    episodes = set()
    in_limit = False
    open_wakes = []
    for _n, o in events:
        k, d, src = o["kind"], o["data"], o["src"]
        if src in HUMAN_SRCS and open_wakes:
            t = trace.epoch(o["ts"])
            responses.extend(t - w for w in open_wakes if t is not None and w is not None)
            open_wakes = []
        if k == "phase" and d.get("event") == "done":
            m["phases_done"] += 1
            s = d.get("secs")
            if isinstance(s, int) and not isinstance(s, bool):
                secs.append(s)
        elif k == "verify" and d.get("result") == "FAIL":
            m["rework_rounds"] += 1
        elif k == "limit":
            episodes.add((str(d.get("reset")), str(d.get("hash"))))
            in_limit = True
        elif k == "run":
            in_limit = False
        elif k == "watch_event" and d.get("event") == "BACKSTOP" and not in_limit:
            m["stalls"] += 1
        elif k == "intervention":
            m["interventions"] += 1
        elif k == "wake":
            m["wakes"] += 1
            open_wakes.append(trace.epoch(o["ts"]))
        elif k == "send":
            if src == "driver":
                m["interventions"] += 1
            if _sent(d, "nudge"):
                m["nudges"] += 1
            if _sent(d, "limit-resume"):
                in_limit = False
            if _sent(d, "pause") or (_sent(d, "resource-high")
                                     and STOP_DISPATCH_RE.search(str(d.get("dispatch_rule") or ""))):
                m["resource_pauses"] += 1
    m["limit_hits"] = len(episodes)
    m["false_events"] = sum(r["count"] for r in incident_rows if r["class"].startswith(FALSE_PREFIX))
    m["mean_phase_min"] = _mean(secs, 60.0)
    m["driver_response_min"] = _mean(responses, 60.0)
    return [(k, m[k]) for k in METRICS]


def phase_lines(events):
    out = []
    for p in models.done_phases(events):
        kind, model, effort = p["key"] or ("-", "-", "-")
        first = {"PASS": "yes", None: "-"}.get(p["first"], "no")
        out.append("PHASE id=%s secs=%s rework=%d first_pass=%s kind=%s model=%s effort=%s"
                   % (p["id"], "-" if p["secs"] is None else p["secs"], p["fails"], first, kind, model, effort))
    return out


def incident_rows(run, events, ledger_rows):
    """[{class severity count runs first}] of the ledger rows of run whose
    anchor line lies in events, most seen first."""
    window = set("L%d" % n for n, _o in events)
    runs_of = {}
    for r in ledger_rows:
        runs_of.setdefault(r["class"], set()).add(r["run"])
    by_class = {}
    for r in ledger_rows:
        a = lessons._anchor(r)
        if r["run"] != run or a not in window:
            continue
        c = by_class.setdefault(r["class"], {"class": r["class"], "severity": r.get("severity"), "count": 0,
                                             "first": a})
        c["count"] += 1
        if int(a[1:]) < int(c["first"][1:]):
            c["first"] = a
    out = sorted(by_class.values(), key=lambda c: (-c["count"], int(c["first"][1:]), c["class"]))
    for c in out:
        c["runs"] = len(runs_of.get(c["class"], ()))
    return out


def incident_line(c):
    return "INCIDENT class=%s severity=%s count=%d runs=%d first=%s" % (c["class"], c["severity"], c["count"],
                                                                      c["runs"], c["first"])


def lesson_lines(lesson_dir, classes):
    out = []
    by_class = dict((cls, (head, path)) for cls, head, path in lessons.all_lessons(lesson_dir))
    for cls in classes:
        if cls not in by_class:
            continue
        head, path = by_class[cls]
        out.append("LESSON class=%s severity=%s status=%s seen=%s runs=%s last=%s path=%s"
                   % (cls, head.get("severity"), head.get("status"), lessons._n(head.get("seen")),
                      lessons._n(head.get("runs")), head.get("last_seen") or "-", path))
    return out


# ---- ROI --------------------------------------------------------------------------

def _int(v):
    return v if isinstance(v, int) and not isinstance(v, bool) else None


def _false_wakes(events):
    """Line numbers of the watch events whose watch window (after the watch
    start or the previous watch event, up to the event) holds a line named
    by an incident of a false-* class."""
    named = set()
    for _n, o in events:
        if o["kind"] == "incident" and str(o["data"].get("class") or "").startswith(FALSE_PREFIX):
            for ref in o["data"].get("lines") or []:
                if isinstance(ref, str) and ref[:1] == "L" and ref[1:].isdigit():
                    named.add(int(ref[1:]))
    out = set()
    lo = 0
    for n, o in events:
        if o["kind"] == "watch" and o["data"].get("action") == "start":
            lo = n
        elif o["kind"] == "watch_event":
            if any(lo < x <= n for x in named):
                out.add(n)
            lo = n
    return out


def _avoided(events):
    """(avoided, false actions): handled events that avoided an
    intervention, and those that would have but answered a false wake."""
    n = false = 0
    prev = -1
    wake = None
    false_wakes = _false_wakes(events)
    for i, (line, o) in enumerate(events):
        if o["kind"] == "watch_event":
            wake = line
        if o["kind"] != "handled":
            continue
        action = o["data"].get("action")
        hit = False
        if action in AVOID_ACTIONS:
            hit = True
        elif action == "govern":
            hit = any(e["kind"] == "govern" and e["data"].get("line") == "CLEAN" and e["data"].get("status") == "ok"
                      for _m, e in events[prev + 1:i])
        elif action == "send:nudge":
            t0 = trace.epoch(o["ts"])
            for _m, e in events[i + 1:]:
                t = trace.epoch(e["ts"])
                if t is None or t0 is None or t - t0 > PROGRESS_S:
                    break
                if (e["kind"] == "pane" and e["data"].get("state") == "BUSY") or \
                        (e["kind"] == "watch_event" and e["data"].get("event") == "PHASE_DONE"):
                    hit = True
                    break
        if hit and wake in false_wakes:
            false += 1
        elif hit:
            n += 1
        prev = i
    return n, false


def _catches(events):
    fails = {}
    caught = set()
    for _n, o in events:
        if o["kind"] != "verify":
            continue
        d = o["data"]
        c = _int(d.get("count"))
        if c is None:
            continue
        if d.get("result") in ("FAIL", "WEAK"):
            fails.setdefault(c, set()).add(d.get("sha"))
        elif d.get("result") == "PASS" and any(f != d.get("sha") for f in fails.get(c, ())):
            caught.add(c)
    return len(caught)


def _resource_action(o):
    d = o["data"]
    if o["kind"] == "send":
        return d.get("result") == "sent" and d.get("template") in RESOURCE_TEMPLATES
    return o["kind"] == "govern" and d.get("line") == "CLEAN" and d.get("status") == "ok"


def _incidents_handled(events):
    n = 0
    for line, bad in sorted(BAD_LEVELS.items()):
        open_ep = acted = False
        for _m, o in events:
            if o["kind"] == "govern" and o["data"].get("line") == line:
                if o["data"].get("level") in bad:
                    if not open_ep:
                        open_ep, acted = True, False
                elif open_ep:
                    n += 1 if acted else 0
                    open_ep = False
            elif open_ep and _resource_action(o):
                acted = True
        n += 1 if open_ep and acted else 0
    leaks = [i for i, (_m, o) in enumerate(events)
             if o["kind"] == "incident" and o["data"].get("class") == "resource-leak-foreign"]
    for i in leaks:
        if any(o["kind"] in ("intervention", "alert") for _m, o in events[i + 1:]):
            n += 1
    return n


def _minutes(secs):
    return "%.1f" % (secs / 60.0)


def roi(events):
    """The ROI fields of one run's events [(lineno, obj)]."""
    tokens = [t for _n, o in events if o["kind"] in ("wake", "handled")
              for t in [_int(o["data"].get("tokens"))] if t is not None]
    verify_secs = sum(t for _n, o in events if o["kind"] == "verify" for x in (o["data"].get("targets") or [])
                      if isinstance(x, dict) for t in [_int(x.get("secs"))] if t is not None)
    stamps = [trace.epoch(o["ts"]) for _n, o in events]
    starts = [trace.epoch(o["ts"]) for _n, o in events
              if o["kind"] == "run" and o["data"].get("action") in ("start", "resume")]
    ends = [trace.epoch(o["ts"]) for _n, o in events if o["kind"] == "run" and o["data"].get("action") == "end"]
    stamps = [x for x in stamps if x is not None]
    avoided, false = _avoided(events)
    begin = starts[0] if starts and starts[0] is not None else (min(stamps) if stamps else 0)
    finish = ends[-1] if ends and ends[-1] is not None else (max(stamps) if stamps else 0)
    r = {
        "catches": _catches(events),
        "verify_runs": sum(1 for _n, o in events if o["kind"] == "verify"),
        "avoided": avoided,
        "false_actions": false,
        "incidents": _incidents_handled(events),
        "operator": sum(1 for _n, o in events if o["kind"] == "intervention"),
        "wakes": sum(1 for _n, o in events if o["kind"] == "wake"),
        "tokens": sum(tokens) if tokens else "-",
        "verify_secs": verify_secs,
        "wall_secs": max(0, finish - begin),
    }
    return _finish(r)


def _finish(r):
    r["value"] = r["catches"] + r["avoided"] + r["incidents"]
    r["ratio"] = round(float(r["value"]) / max(1, r["wakes"] + r["operator"]), 2)
    r["verify_min"] = _minutes(r["verify_secs"])
    r["wall_min"] = _minutes(r["wall_secs"])
    return r


def roi_total(rois):
    t = {"catches": 0, "verify_runs": 0, "avoided": 0, "false_actions": 0, "incidents": 0, "operator": 0, "wakes": 0,
         "verify_secs": 0, "wall_secs": 0}
    toks = []
    for r in rois:
        for k in t:
            t[k] += r[k]
        if r["tokens"] != "-":
            toks.append(r["tokens"])
    t["tokens"] = sum(toks) if toks else "-"
    return _finish(t)


def roi_line(label, r):
    return ("ROI %s value=%d catches=%d/%d avoided=%d false=%d incidents=%d operator=%d "
            "cost=wakes:%d,tokens:%s,verify_min:%s,wall_min:%s ratio=%.2f"
            % (label, r["value"], r["catches"], r["verify_runs"], r["avoided"], r["false_actions"], r["incidents"],
               r["operator"], r["wakes"], r["tokens"], r["verify_min"], r["wall_min"], r["ratio"]))


def roi_table(r):
    vals = {"verify_catches": r["catches"], "verify_runs": r["verify_runs"],
            "interventions_avoided": r["avoided"], "false_actions": r["false_actions"],
            "resource_incidents_handled": r["incidents"],
            "operator_interventions": r["operator"], "wakes": r["wakes"], "tokens": r["tokens"],
            "verify_min": r["verify_min"], "wall_min": r["wall_min"], "value": r["value"],
            "ratio": "%.2f" % r["ratio"]}
    return ["| metric | value |", "|---|---|"] + ["| %s | %s |" % (k, vals[k]) for k in ROI_ROWS]


# ---- decay --------------------------------------------------------------------------

def store_history():
    """One pass over every run trace in the state dir (archived runs too):
    started [(start ts, run, path)], switches [(ts, off|on, id, run)],
    blocked [(ts, feature, run, line)]."""
    base = os.path.join(runstate.state_dir(), "runs")
    try:
        names = sorted(os.listdir(base))
    except OSError:
        names = []
    started, switches, blocked = [], [], []
    for name in names:
        path = os.path.join(base, name, trace.TRACE)
        if not os.path.isfile(path):
            continue
        seen_start = False
        for n, o in trace.read(path):
            k, d = o["kind"], o["data"]
            if k == "run" and d.get("action") == "start" and not seen_start:
                started.append((o["ts"], name, path))
                seen_start = True
            elif k == "retro":
                for act in ("off", "on"):
                    for fid in d.get(act) or []:
                        switches.append((o["ts"], act, fid, name))
            elif k == "use" and d.get("effect") == "blocked-off":
                blocked.append((o["ts"], d.get("feature"), name, n))
    started.sort()
    switches.sort()
    blocked.sort()
    return {"started": started, "switches": switches, "blocked": blocked}


def _mtime_iso(path):
    try:
        return runstate.iso(int(os.path.getmtime(path)))
    except (OSError, runstate.RunStateError):
        return "-"


def _sha8(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


def delete_proposal(e, since, runs_since, window, hist, layer_path, flag):
    """(id, text) of the deletion proposal of entry e."""
    pid = "delete-%s-%s" % (e["id"].replace(":", "-"), _sha8("delete\n%s\n%s" % (e["id"], flag)))
    history = ["- %s at %s (run=%s retro)" % ("switched off" if act == "off" else "back on", ts, run)
               for ts, act, fid, run in hist["switches"] if fid == e["id"]]
    history += ["- blocked-off at %s (run=%s trace=L%d)" % (ts, run, n)
                for ts, feat, run, n in hist["blocked"] if feat == e["id"]]
    evidence = ["- switched off at %s by the decay scan (%s=false in %s)" % (since, flag, layer_path),
                "- %d started runs since without a request: %s" % (len(runs_since), ", ".join(runs_since)),
                "- no fires in runs %s (decay.runs window)" % ",".join(window),
                "- re-enable history:"] + (["  " + h for h in history] or ["  none"])
    files = ["- %s" % f for f in e.get("files") or []] or ["- (none listed in policies/features.yaml)"]
    tests = ["- %s" % f for f in e.get("tests") or []] or ["- (none listed)"]
    body = {
        "Evidence": evidence,
        "Gap": ["%s (%s, %s). It was not asked for once since it was switched off, yet it keeps costing "
                "maintenance and suite time." % (e["note"], e["kind"], e["id"])],
        "Suggested change": ["Delete these files and tests (by hand, after review; tdrive never deletes code):",
                             "Files:"] + files + ["Tests:"] + tests +
                            ["Then remove the %s entry from policies/features.yaml and %s from "
                             "policies/schema.yaml." % (e["id"], flag)],
        "Failing test to add": ["A case in tests/decay/test_registry_coverage.sh that fails while %s is still "
                                "registered or any file above still exists; it passes once the deletion "
                                "is complete." % e["id"]],
    }
    return pid, e["id"], body


def decay(entries, cfg, run, k, delete_after, hist):
    """{lines, report, off, on, proposals} of the decay scan; hist is
    store_history()."""
    started = hist["started"]
    window = started[-k:] if k else []
    out = {"lines": [], "report": [], "off": [], "on": [], "proposals": []}
    if len(window) < k:
        out["lines"] = ["DECAY insufficient runs=%d need=%d" % (len(window), k)]
        out["report"] = list(out["lines"])
        return out
    names = [name for _ts, name, _p in window]
    per_run = [(name, list(trace.read(path))) for _ts, name, path in window]
    layer_path = learnstore.path_of("decay")
    try:
        layer = features.read_layer(layer_path)
    except features.FeatureError as exc:
        raise RetroError(exc.code, str(exc))
    layer_off = set(f for f, v in layer.items() if v is False)
    untracked = []
    new_off = []
    still_off = set(layer_off)

    def line(e, fires, changed, cand, action, ev):
        out["lines"].append("DECAY id=%s kind=%s class=%s runs=%d fires=%d changed=%d candidate=%s action=%s | %s"
                            % (e["id"], e["kind"], e["class"], k, fires, changed, cand, action, ev))

    for e in entries:
        if e["fires"] is None:
            if e["class"] == "safety":
                line(e, 0, 0, "exempt", "none", "safety, exempt from decay (untracked)")
            else:
                untracked.append(e["id"])
            continue
        fires = changed = 0
        first = None
        for name, events in per_run:
            f, c, n = features.count(e, events)
            fires += f
            changed += c
            if first is None and n is not None:
                first = (name, n)
        cand = "retire" if fires == 0 else ("demote" if changed == 0 else None)
        fired_ev = "fired %dx (first run=%s trace=L%d), never changed an outcome" % (fires, first[0], first[1]) \
            if first else ""
        quiet_ev = "no fires in runs %s" % ",".join(names)
        if e["class"] == "safety":
            if cand:
                line(e, fires, changed, "exempt", "none", "safety, exempt from decay (%s)"
                     % ("no fires" if cand == "retire" else "fired, never changed"))
            continue
        if e["class"] == "core":
            if cand:
                line(e, fires, changed, cand, "report", quiet_ev if cand == "retire" else fired_ev)
            continue
        flag = e["flag"]
        if cand != "retire":
            if flag in layer_off:
                still_off.discard(flag)
                out["on"].append(e["id"])
            if cand == "demote":
                line(e, fires, changed, cand, "report", fired_ev)
            continue
        if flag not in layer_off:
            new_off.append(e["id"])
            still_off.add(flag)
            line(e, fires, changed, cand, "off", "%s; switched off: %s=false in %s" % (quiet_ev, flag, layer_path))
            continue
        offs = [ts for ts, act, fid, _r in hist["switches"] if fid == e["id"] and act == "off"]
        since = offs[-1] if offs else _mtime_iso(layer_path)
        blocked = [b for b in hist["blocked"] if b[1] == e["id"] and b[0] >= since]
        anchor = max([since] + [b[0] for b in blocked])
        runs_since = [name for ts, name, _p in started if ts > anchor]
        ev = "off since %s; %d of %d started runs since without a request" % (since, len(runs_since), delete_after)
        if blocked:
            ev += "; re-enable suggested: %d blocked-off since %s (last run=%s trace=L%d)" \
                  % (len(blocked), since, blocked[-1][2], blocked[-1][3])
        value, src = cfg[flag][0], cfg[flag][1]
        if value is not False:
            ev += "; on by %s" % src
        if len(runs_since) >= delete_after:
            pid, cls, body = delete_proposal(e, since, runs_since, names, hist, layer_path, flag)
            out["proposals"].append((pid, cls, "delete", len(runs_since), 0, body))
            ev += "; deletion proposal %s" % pid
        line(e, fires, changed, cand, "off", ev)
    if new_off or out["on"]:
        try:
            features.write_layer(sorted(still_off), run)
        except features.FeatureError as exc:
            raise RetroError(exc.code, str(exc))
        except learnstore.StoreError as exc:
            raise RetroError(exc.code, str(exc))
    out["off"] = new_off
    out["report"] = list(out["lines"])
    if new_off:
        by_id = dict((e["id"], e) for e in entries)
        out["report"].append("Switched off: %s (in %s; `tdrive decide --key <flag> --value true` re-enables "
                             "one for a run)" % (", ".join(by_id[i]["flag"] for i in new_off), layer_path))
    if out["on"]:
        out["report"].append("Back on (fired again): %s" % ", ".join(out["on"]))
    if untracked:
        out["report"].append("Untracked (no trace footprint): %s" % ", ".join(untracked))
    return out


# ---- proposals ----------------------------------------------------------------------

def lesson_proposals(registry, lesson_dir, ledger_rows, min_count):
    """[(id, class, kind, runs, count, body)] of the actionable lessons."""
    by_id = dict((c["id"], c) for c in registry)
    out = []
    for cls, head, _path in lessons.all_lessons(lesson_dir):
        c = by_id.get(cls)
        rows = [r for r in ledger_rows if r["class"] == cls]
        if c is None or head.get("status") == "retired" or len(rows) < min_count:
            continue
        pid = "%s-%s" % (cls, _sha8("%s\n%s" % (cls, c["fix_hint"])))
        runs = sorted(set(r["run"] for r in rows))
        evidence = ["- run=%s trace=%s count=1 source=%s ts=%s | %s"
                    % (r["run"], ",".join(r.get("lines") or []) or lessons._anchor(r) or "-", r.get("source"),
                       r.get("ts") or "-", r.get("summary", "")) for r in rows]
        evidence.append("- seen %dx in %d runs (%s); lesson %s" % (len(rows), len(runs), ", ".join(runs), _path))
        promote = c["promote"]
        change = ["- target: %s (recipe %s)" % (promote["target"], promote["recipe"])]
        for key in sorted(promote):
            if key not in ("target", "recipe", "test_hint"):
                v = promote[key]
                change.append("- %s: %s" % (key, ", ".join(str(x) for x in v) if isinstance(v, list) else v))
        change.append("- fix: %s" % c["fix_hint"])
        test = promote.get("test_hint") or ("A trace replaying run=%s trace=%s no longer yields a %s incident."
                                            % (rows[0]["run"], ",".join(rows[0].get("lines") or []), cls))
        body = {
            "Evidence": evidence,
            "Gap": ["%s Seen %d times in %d runs (severity %s); nothing in the kit prevents it yet."
                    % (c["description"], len(rows), len(runs), c["severity"])],
            "Suggested change": change,
            "Failing test to add": [test],
        }
        out.append((pid, cls, "lesson", len(runs), len(rows), body))
    return out


def _q(s):
    return '"%s"' % str(s).replace("\\", "\\\\").replace('"', '\\"')


def write_proposal(pdir, prop, now_iso):
    pid, cls, kind, runs, count, body = prop
    path = os.path.join(pdir, pid + ".md")
    old = lessons.read_header(path) if os.path.exists(path) else None
    created = (old or {}).get("created") or now_iso
    head = ["---", "id: %s" % pid, "class: %s" % _q(cls), "kind: %s" % kind, "status: open",
            "created: %s" % _q(created), "updated: %s" % _q(now_iso), "runs: %d" % runs, "count: %d" % count, "---"]
    text = head + ["", "# Proposal: %s (%s)" % (cls, kind)]
    for title in ("Evidence", "Gap", "Suggested change", "Failing test to add"):
        text += ["", "## %s" % title, ""] + body[title]
    runstate.atomic_write(path, scrub("\n".join(text) + "\n"))
    return path


# ---- run ------------------------------------------------------------------------

def _events(run, rd):
    path = os.path.join(rd, trace.TRACE)
    if not os.path.lexists(path):
        with runstate._FileLock(os.path.join(rd, ".run.env.lock")):
            try:
                n = trace.write_backfill(run, rd, path)
                trace.log(rd, "retro: backfilled %d events of a run without a trace" % n)
            except trace.TraceError as exc:
                if exc.code != 5:
                    raise RetroError(exc.code, str(exc))
    return list(trace.read(path))


def report_text(run, head, sections):
    out = ["# Retro: %s" % run, "", head]
    for title, lines in sections:
        out += ["", "## %s" % title, ""]
        out += lines or ["None."]
    return scrub("\n".join(out) + "\n")


def retro(run, since=None, out=sys.stdout):
    if not runstate.valid_run(run or ""):
        raise RetroError(2, "invalid run name: %r" % run)
    if since is not None and trace.epoch(since) is None:
        raise RetroError(2, "--since must be an ISO UTC time (YYYY-MM-DDTHH:MM:SSZ): %r" % since)
    rd = runstate.run_dir(run)
    if not os.path.isdir(rd):
        raise RetroError(2, "no run dir for run %s: %s" % (run, rd))
    try:
        retros = learnstore.paths("retros", run)
        ledger = learnstore.paths("ledger", run)
        lesson_dir = learnstore.paths("lessons", run)
        pdir = learnstore.paths("proposals", run)
    except learnstore.StoreError as exc:
        raise RetroError(exc.code, str(exc))
    all_events = _events(run, rd)
    events = [(n, o) for n, o in all_events if since is None or o["ts"] >= since]
    try:
        registry = incidents.load_registry()
        entries = features.load()
        incidents.scan(run, None, "retro", out=io.StringIO())
    except incidents.IncidentError as exc:
        raise RetroError(exc.code, str(exc))
    except features.FeatureError as exc:
        raise RetroError(exc.code, str(exc))
    cfg = incidents._config(run, rd)
    ledger_rows = lessons.read_ledger(ledger)
    inc = incident_rows(run, events, ledger_rows)
    mlines = ["METRIC name=%s value=%s" % kv for kv in metrics(events, inc)]
    plines = phase_lines(events)
    ilines = [incident_line(c) for c in inc]
    llines = lesson_lines(lesson_dir, [c["class"] for c in inc])
    try:
        policy = models.Policy()
    except models.ModelsError as exc:
        raise RetroError(exc.code, str(exc))
    model_lines = models.stats(policy, cfg["retro.max_runs"][0], cfg["retro.min_samples"][0],
                               cfg["models.upgrade_below_pct"][0], cfg["models.downgrade_above_pct"][0],
                               features.enabled("model_recommend", cfg, entries), run)
    hist = store_history()
    this_roi = roi(all_events)
    newest = hist["started"][-cfg["retro.max_runs"][0]:]
    total = roi_total([roi(list(trace.read(path))) for _ts, _name, path in newest])
    rlines = [roi_line("run=%s" % run, this_roi), roi_line("total runs=%d" % len(newest), total)]
    d = decay(entries, cfg, run, cfg["decay.runs"][0], cfg["decay.delete_after_runs"][0], hist)
    now_iso = runstate.iso()
    props = lesson_proposals(registry, lesson_dir, ledger_rows, cfg["lessons.min_count"][0]) + d["proposals"]
    plist = []
    for p in props:
        plist.append((p[0], p[2], write_proposal(pdir, p, now_iso)))
    prop_lines = ["PROPOSAL id=%s kind=%s path=%s" % x for x in plist]
    path = os.path.join(retros, "%s-%s.md" % (run, runstate.stamp(os.getpid())))
    head = "%s · since %s · events %d" % (now_iso, since or "-", len(events))
    sections = [("Summary", mlines), ("Phases", plines), ("Incidents", ilines), ("Lessons", llines),
                (MODEL_SECTION, model_lines), ("ROI", roi_table(this_roi) + [""] + rlines), ("Decay", d["report"])]
    if prop_lines:
        sections.append(("Proposals", prop_lines))
    runstate.atomic_write(path, report_text(run, head, sections))
    rdata = dict((k, this_roi[k]) for k in ("value", "catches", "verify_runs", "avoided", "incidents", "operator",
                                             "wakes", "tokens", "verify_min", "wall_min", "ratio"))
    rdata["line"] = rlines[0]
    data = {"path": path, "proposals": [x[0] for x in plist], "roi": rdata, "off": d["off"], "on": d["on"]}
    if since:
        data["since"] = since
    trace.emit(run, "retro", "retro", data)
    lines = ["RETRO %s path=%s events=%d since=%s" % (run, path, len(events), since or "-")]
    lines += mlines + plines + ilines + llines + model_lines + rlines + d["lines"] + prop_lines
    out.write("".join(x + "\n" for x in lines))
    return path


def main(argv):
    args = argv[1:]
    usage = "usage: retro.py run --run R [--since ISO]"
    try:
        if not args or args[0] != "run":
            raise RetroError(2, usage)
        o = {}
        i = 1
        while i < len(args):
            if args[i] not in ("--run", "--since") or i + 1 >= len(args):
                raise RetroError(2, "%s (bad option %s)" % (usage, args[i]))
            o[args[i]] = args[i + 1]
            i += 2
        if not o.get("--run"):
            raise RetroError(2, usage)
        retro(o["--run"], o.get("--since"))
    except RetroError as exc:
        sys.stderr.write("retro: %s\n" % exc)
        return exc.code
    except runstate.RunStateError as exc:
        sys.stderr.write("retro: %s\n" % exc)
        return exc.code
    except (IOError, OSError) as exc:
        sys.stderr.write("retro: %s\n" % exc)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
