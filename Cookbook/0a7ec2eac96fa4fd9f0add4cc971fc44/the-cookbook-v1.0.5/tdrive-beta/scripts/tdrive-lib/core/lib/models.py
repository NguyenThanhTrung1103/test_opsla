"""Model + effort policy (policies/models.yaml).

A task kind maps to a model tier and an effort per table (config
models.table). security, money and auth (plus any kind the policy adds to
`protected`) always resolve to the strongest tier with high effort. The
choice reaches the engine only through launch flags and directive text;
tdrive records the model it ASSIGNED (model_source=assigned).

CLI:
  resolve KIND [--table T]
      MODEL kind=<k> tier=<t> model=<alias|-> effort=<e|-> protected=<yes|no> table=<name>
  classify --repo R --branch B --phase ID [--plan P]
      KIND phase=<id> kind=<k> source=<protected|column|tags|title|paths|default>
      (source=column appends tier=<t>: the plan's Model column sets the tier)
      Protected only on evidence that the phase changes protected code: a
      protected tag, a protected keyword in the title (plan row name or
      phase title) or the first Goal/Overview/Scope sentence (code spans and
      HTML comments removed), or more than half of the owned paths with the
      keyword at a path-segment start; other prose and plan columns are
      context, never evidence. Then the Model column; then tags; then
      keywords on the title and first Goal/Overview sentence; then the kind
      matching more than half of the owned paths; then the default.
  assign --repo R --branch B --phase ID [--plan P] [--table T]
      the KIND line, then the MODEL line of the assigned model
  table [--format directive|message] [--table T]
      directive: per-kind bullets, the protected clause and keyword list;
      message: one line of at most 300 chars ending with the protected clause
  stats [--runs N]
      MODEL kind=<k> assigned_model=<m> effort=<e> samples=<n> first_pass=<pct|->
        rework=<avg> mean_min=<n|-> limit_hits=<n> recommend=<r>
      over the newest N (retro.max_runs) runs whose trace has `run action=start`;
      with features.model_recommend off (decay) every line says recommend=off
Internal (the drive loop and start):
  phases --run R --src S [--next-src X] --repo R --branch B [--table T] < state
      the trace phase events (core/lib/trace.py) with kind, assigned model and
      effort, and one dispatch event per phase start; always exits 0
  protected --run R --repo R --branch B --ids ID,... [--plan P]
      PROTECTED phase=<id> kind=<k> model=<alias> | <name>   for each listed
      protected phase not yet in R/protected.announced
  limit-episodes --run R          EPISODES <n>  (distinct usage-limit episodes)
  switch-pending --run R --table T
      exit 0 when the run decided models.table=T and has not sent
      models-switch since, else 1
Branch reads use the committed blobs at the branch head, never the working
tree. Exit: 0 ok, 1 (switch-pending: nothing pending), 2 usage, policy,
config, unknown kind, table or phase, 3 git or repo errors.
"""
import os
import posixpath
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import plan_table  # noqa: E402
import runstate  # noqa: E402
import trace  # noqa: E402
import yamlite  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
POLICY_PATH = os.path.join(ROOT, "policies", "models.yaml")
HARD_PROTECTED = ("security", "money", "auth")
TIER_ORDER = ("light", "standard", "strongest")
EFFORTS = ("low", "medium", "high", "xhigh", "max")
ORCHESTRATOR = "orchestrator"
ALIAS_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
KIND_RE = re.compile(r"^[a-z][a-z0-9-]*$")
MESSAGE_MAX = 300
ANNOUNCED = "protected.announced"
NO_COLUMN = ("", "-", "—", "–", "n/a", "none")
OVERVIEW_RE = re.compile(r"^#{1,6}\s*(overview|goals?|scope)\b", re.I)
SENTENCE_RE = re.compile(r"(?<=[.!?])\s")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
CODE_SPAN_RE = re.compile(r"`([^`]*)`")
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
LIST_ITEM_RE = re.compile(r"^(?:[-*+]|\d+[.)])\s+")
SEGMENT_START = "/._-"
# Phase file sections (second-level headings, compared lowercased without a
# parenthesised suffix): the scope a phase is classified from, the owned
# paths, and template sections that never count as scope evidence.
SCOPE_HEADS = ("goal", "goals", "overview", "scope")
OWNED_HEADS = ("files owned", "files to create / modify", "files to create/modify", "related code files")
IGNORED_HEADS = ("security", "security considerations", "risks", "risk assessment", "success criteria",
                 "next steps", "tests", "verification", "todo", "decisions to log", "red-team changes")


class ModelsError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def _join_or(items):
    items = list(items)
    if len(items) < 2:
        return "".join(items)
    return "%s or %s" % (", ".join(items[:-1]), items[-1])


# ---- policy ----------------------------------------------------------------------

class Policy(object):
    def __init__(self, path=POLICY_PATH):
        self.path = path
        try:
            data = yamlite.load(path)
        except yamlite.YamlError as exc:
            raise ModelsError(2, str(exc))
        except (IOError, OSError) as exc:
            raise ModelsError(2, "cannot read %s: %s" % (path, exc))
        if not isinstance(data, dict) or data.get("version") != 1:
            self._bad("version must be 1")
        self.tiers = self._tiers(data.get("tiers"))
        extra = data.get("protected", [])
        if not isinstance(extra, list) or not all(isinstance(k, str) and KIND_RE.match(k) for k in extra):
            self._bad("protected must be a list of kind names")
        self.protected = list(HARD_PROTECTED) + [k for k in extra if k not in HARD_PROTECTED]
        self.tables = self._tables(data.get("tables"))
        self.default_kind, self.keywords = self._classify(data.get("classify"))

    def _bad(self, msg):
        raise ModelsError(2, "%s: %s" % (self.path, msg))

    def _tiers(self, tiers):
        if not isinstance(tiers, dict):
            self._bad("tiers must be a map")
        for t in TIER_ORDER:
            alias = tiers.get(t)
            if not isinstance(alias, str) or not ALIAS_RE.match(alias):
                self._bad("tier %s needs an engine alias (letters, digits, . _ -)" % t)
        extra = set(tiers) - set(TIER_ORDER)
        if extra:
            self._bad("unknown tier(s): %s" % ", ".join(sorted(extra)))
        return dict(tiers)

    def _tables(self, tables):
        if not isinstance(tables, dict) or not tables:
            self._bad("tables must be a non-empty map")
        out = {}
        for name, rows in tables.items():
            if not isinstance(rows, dict):
                self._bad("table %s must be a map of kinds" % name)
            out[name] = {}
            for kind, row in rows.items():
                if not KIND_RE.match(str(kind)) or not isinstance(row, dict):
                    self._bad("table %s: bad row %r" % (name, kind))
                tier = row.get("tier")
                if tier != "none" and tier not in self.tiers:
                    self._bad("table %s: %s: tier %r is not none or one of %s"
                              % (name, kind, tier, ", ".join(TIER_ORDER)))
                effort = row.get("effort")
                if kind != ORCHESTRATOR and tier != "none" and effort not in EFFORTS:
                    self._bad("table %s: %s: effort %r is not one of %s" % (name, kind, effort, ", ".join(EFFORTS)))
                out[name][kind] = {"tier": tier, "effort": effort}
        return out

    def _classify(self, cl):
        if not isinstance(cl, dict):
            self._bad("classify must be a map")
        default = cl.get("default")
        if default not in self.kinds():
            self._bad("classify.default %r is not a kind of the tables" % default)
        kws = cl.get("keywords")
        if not isinstance(kws, dict):
            self._bad("classify.keywords must be a map")
        out = []
        for kind, pats in kws.items():
            if not isinstance(pats, list) or not all(isinstance(p, str) and p for p in pats):
                self._bad("classify.keywords.%s must be a list of regexes" % kind)
            try:
                out.append((kind, list(pats), [re.compile(p, re.I) for p in pats]))
            except re.error as exc:
                self._bad("classify.keywords.%s: bad regex: %s" % (kind, exc))
        return default, out

    def kinds(self):
        seen = []
        for rows in self.tables.values():
            for k in rows:
                if k != ORCHESTRATOR and k not in seen:
                    seen.append(k)
        for k in self.protected:
            if k not in seen:
                seen.append(k)
        return seen

    def table(self, name):
        if name not in self.tables:
            raise ModelsError(2, "unknown table: %s (one of %s)" % (name, ", ".join(sorted(self.tables))))
        return self.tables[name]

    def tier_of(self, alias):
        for t in TIER_ORDER:
            if self.tiers[t] == alias:
                return t
        return None

    def resolve(self, kind, table, tier=None):
        """{kind tier model effort protected table}; tier overrides a
        non-protected kind's tier (the plan's Model column)."""
        rows = self.table(table)
        if kind in self.protected:
            t, effort, prot = "strongest", "high", True
        else:
            if kind not in rows:
                raise ModelsError(2, "unknown kind: %s (table %s)" % (kind, table))
            row = rows[kind]
            t, effort, prot = row["tier"], row["effort"], False
            if tier and t != "none":
                t = tier
        if t == "none":
            model, effort = "-", "-"
        else:
            model = self.tiers[t]
        if kind == ORCHESTRATOR:
            effort = "-"
        return {"kind": kind, "tier": t, "model": model, "effort": effort or "-",
                "protected": prot, "table": table}

    def keyword_list(self, kind):
        for k, pats, _rx in self.keywords:
            if k == kind:
                return pats
        return []

    def matches(self, kind, text):
        for k, _pats, rxs in self.keywords:
            if k == kind:
                return any(rx.search(text) for rx in rxs)
        return False

    # ---- renderings --------------------------------------------------------------

    def clause(self, quote="`"):
        return ("Any subagent working on a phase whose scope touches %s uses %s%s%s with high effort, "
                "regardless of its kind." % (_join_or(self.protected), quote, self.tiers["strongest"], quote))

    def directive(self, table):
        rows = self.table(table)
        kinds = [k for k in rows if k != ORCHESTRATOR] + [k for k in self.protected if k not in rows]
        out = []
        for k in kinds:
            r = self.resolve(k, table)
            if r["tier"] == "none":
                out.append("  - %s: no model; run the command" % k)
            else:
                out.append("  - %s: model `%s`, effort %s" % (k, r["model"], r["effort"]))
        c = self.clause()
        out.append("  - Protected phases: %s%s" % (c[0].lower(), c[1:]))
        kw = ["%s: %s" % (k, ", ".join(self.keyword_list(k))) for k in self.protected if self.keyword_list(k)]
        if kw:
            out.append("  - Protected keywords (case-insensitive regexes): %s" % "; ".join(kw))
        return "\n".join(out)

    def message(self, table):
        rows = self.table(table)
        groups = []
        for k in rows:
            if k == ORCHESTRATOR or k in self.protected:
                continue
            r = self.resolve(k, table)
            key = (r["model"], r["effort"])
            for g in groups:
                if g[0] == key:
                    g[1].append(k)
                    break
            else:
                groups.append((key, [k]))
        parts = []
        for (model, effort), ks in groups:
            if model == "-":
                parts.append("%s: no model" % ", ".join(ks))
            else:
                parts.append("%s: %s, %s effort" % (", ".join(ks), model, effort))
        text = "%s. %s" % ("; ".join(parts), self.clause(quote=""))
        if len(text) > MESSAGE_MAX:
            raise ModelsError(2, "table %s: the message form is %d chars (max %d)" % (table, len(text), MESSAGE_MAX))
        return text


def model_line(r):
    return "MODEL kind=%s tier=%s model=%s effort=%s protected=%s table=%s" % (
        r["kind"], r["tier"], r["model"], r["effort"], "yes" if r["protected"] else "no", r["table"])


def config_values(*keys):
    import config
    try:
        cfg = config.Config()
    except config.ConfigError as exc:
        raise ModelsError(exc.code if exc.code in (2, 3) else 2, str(exc))
    return [cfg.values[k][0] for k in keys]


# ---- classification --------------------------------------------------------------

def _frontmatter(text):
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0].strip() != "---":
        return [], lines
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return lines[1:i], lines[i + 1:]
    return [], lines


def _tags(front):
    for i, line in enumerate(front):
        m = re.match(r"^tags:\s*(.*)$", line)
        if not m:
            continue
        rest = m.group(1).strip()
        if rest.startswith("["):
            return [t.strip().strip("\"'").lower() for t in rest.strip("[]").split(",") if t.strip()]
        out = []
        for item in front[i + 1:]:
            mi = re.match(r"^\s+-\s*(.+)$", item)
            if not mi:
                break
            out.append(mi.group(1).strip().strip("\"'").lower())
        return out
    return []


def _title(front, body):
    for line in front:
        m = re.match(r"^title:\s*(.*)$", line)
        if m:
            return m.group(1).strip().strip("\"'")
    for line in body:
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def _head_key(text):
    key = re.sub(r"\([^)]*\)", " ", text).lower()
    return " ".join(key.split()).rstrip(":")


def _sections(body):
    """[(key, lines)] of body split at second-level headings (deeper
    headings stay in their section; fenced code is never a heading). key is
    None before the first one."""
    out = [(None, [])]
    fenced = False
    for line in body:
        if FENCE_RE.match(line):
            fenced = not fenced
        m = None if fenced else HEADING_RE.match(line)
        if m and len(m.group(1)) == 2:
            out.append((_head_key(m.group(2)), []))
            continue
        if m and len(m.group(1)) == 1:
            continue
        out[-1][1].append(line)
    return out


def _owned_paths(text):
    return [p.strip() for p in CODE_SPAN_RE.findall(text) if "/" in p]


def scope_of(body):
    """(scope text, owned paths) of a phase body: the Goal, Overview and
    Scope sections, else every section that is neither a template section
    nor an owned-files section; paths are the code spans holding a `/` in
    the owned-files sections."""
    secs = _sections(body)
    owned = [k for k, _l in secs if k and k.startswith(OWNED_HEADS)]
    paths = []
    for k, lines in secs:
        if k in owned:
            paths.extend(_owned_paths("\n".join(lines)))
    chosen = [lines for k, lines in secs if k in SCOPE_HEADS]
    if not chosen:
        chosen = [lines for k, lines in secs if k not in owned and k not in IGNORED_HEADS]
    return "\n".join("\n".join(lines) for lines in chosen), paths


def _first_sentence(body):
    """First sentence of the first Goal/Overview/Scope heading's paragraph,
    HTML comments removed. A paragraph ends at a blank line, a heading or a
    list item; a leading list item stands alone, without its marker."""
    for i, line in enumerate(body):
        if not OVERVIEW_RE.match(line.strip()):
            continue
        para = []
        for nxt in body[i + 1:]:
            s = COMMENT_RE.sub(" ", nxt).strip()
            if s.startswith("#"):
                break
            if not s:
                if para:
                    break
                continue
            item = LIST_ITEM_RE.match(s)
            if item:
                if para:
                    break
                para.append(s[item.end():])
                break
            para.append(s)
        return SENTENCE_RE.split(" ".join(para), 1)[0] if para else ""
    return ""


def _path_hit(rxs, path):
    """True when a regex matches the path at a segment start (after /, ., _
    or -), so `internal/ledger/` counts and `src/beledgered.go` does not."""
    for rx in rxs:
        for m in rx.finditer(path):
            if m.start() == 0 or path[m.start() - 1] in SEGMENT_START:
                return True
    return False


def protected_evidence(policy, kind, tags, titles, sentence, paths):
    """The evidence that a phase changes `kind` code: tags, titles, sentence
    or paths; None without evidence."""
    if kind in tags:
        return "tags"
    rxs = [rx for k, _p, r in policy.keywords if k == kind for rx in r]
    if not rxs:
        return None
    if any(rx.search(t) for t in titles for rx in rxs):
        return "title"
    if sentence and any(rx.search(sentence) for rx in rxs):
        return "goal"
    if paths and 2 * sum(1 for p in paths if _path_hit(rxs, p)) > len(paths):
        return "paths"
    return None


def _column_tier(policy, value):
    v = value.replace("*", "").replace("`", "").strip().lower()
    if v in NO_COLUMN:
        return None, False
    for word, tier in (("fable", "strongest"), ("opus", "strongest"), ("sonnet", "standard"), ("haiku", "light")):
        if word in v:
            return tier, False
    if v in TIER_ORDER:
        return v, False
    for t in TIER_ORDER:
        if policy.tiers[t].lower() == v:
            return t, False
    return None, True


_PLANS = {}


def _read_plan(repo, branch, pin):
    """(head, plan path, parsed plan, plan text) at the branch head, read
    once per process."""
    key = (repo, branch, pin)
    if key not in _PLANS:
        try:
            head, plan, parsed = plan_table.read_plan(repo, branch, pin)
        except plan_table.PlanError as exc:
            raise ModelsError(exc.code, str(exc))
        if not plan:
            raise ModelsError(2, "no plan on %s in %s" % (branch, repo))
        _PLANS[key] = (head, plan, parsed, plan_table.blob(repo, head, plan) or "")
    return _PLANS[key]


def plan_row(repo, branch, pin, phase):
    """(row dict, row cells, model cell, phase file text or None, plan path)."""
    head, plan, parsed, text = _read_plan(repo, branch, pin)
    want = plan_table.norm_id(phase)
    for head_cells, rows in plan_table.find_tables(text.replace("\r\n", "\n").split("\n")):
        keys = [plan_table.header_key(c) for c in head_cells]
        if not any(k in ("phase", "phases") for k in keys) or "status" not in keys:
            continue
        mcol = keys.index("model") if "model" in keys else None
        cells_list = [c for c in rows if any(c)]
        for ph, cells in zip(parsed["phases"], cells_list):
            if plan_table.norm_id(ph["id"]) != want:
                continue
            ftext = None
            if ph["file"]:
                f = ph["file"]
                if not posixpath.isabs(f):
                    f = posixpath.normpath(posixpath.join(posixpath.dirname(plan), f))
                ftext = plan_table.blob(repo, head, f)
            mcell = plan_table.cell(cells, mcol) if mcol is not None else ""
            return ph, cells, mcell, ftext, plan
        break
    raise ModelsError(2, "phase %s not found in %s on %s" % (phase, plan, branch))


def classify(policy, repo, branch, phase, pin=None, warn=None):
    """{id kind source [tier] name}."""
    ph, _cells, mcell, ftext, _plan = plan_row(repo, branch, pin, phase)
    pid = ph["id"]
    front, body = _frontmatter(ftext or "")
    tags = _tags(front)
    _text, paths = scope_of(body)
    out = {"id": pid, "name": ph["name"]}
    # Protected only when the phase changes protected code: its title, its
    # first Goal/Overview sentence or most of its owned paths say so. Other
    # sections and plan columns are context (a money-domain plan mentions
    # payments everywhere), never evidence. Code spans are identifiers.
    titles = [CODE_SPAN_RE.sub(" ", t) for t in (ph["name"], _title(front, body)) if t]
    sentence = CODE_SPAN_RE.sub(" ", _first_sentence(body))
    for kind in policy.protected:
        if protected_evidence(policy, kind, tags, titles, sentence, paths):
            out.update(kind=kind, source="protected")
            return out
    known = policy.kinds()
    kind = source = None
    tier, unknown = _column_tier(policy, mcell)
    if unknown and warn:
        warn("phase %s: unknown Model column value '%s' ignored" % (pid, mcell.strip()))
    for t in tags:
        if t in known and t not in policy.protected:
            kind, source = t, "tags"
            break
    candidates = [(k, rxs) for k, _pats, rxs in policy.keywords
                  if k not in policy.protected and k != ORCHESTRATOR and k in known]
    if kind is None:
        # Code spans are paths and identifiers, not scope words.
        words = CODE_SPAN_RE.sub(" ", "%s %s %s" % (ph["name"], _title(front, body), _first_sentence(body)))
        for k, rxs in candidates:
            if any(rx.search(words) for rx in rxs):
                kind, source = k, "title"
                break
    if kind is None and paths:
        for k, rxs in candidates:
            if 2 * sum(1 for p in paths if any(rx.search(p) for rx in rxs)) > len(paths):
                kind, source = k, "paths"
                break
    if kind is None:
        kind, source = policy.default_kind, "default"
    if tier:
        out.update(kind=kind, source="column", tier=tier)
    else:
        out.update(kind=kind, source=source)
    return out


def kind_line(c):
    line = "KIND phase=%s kind=%s source=%s" % (c["id"], c["kind"], c["source"])
    if c["source"] == "column":
        line += " tier=%s" % c["tier"]
    return line


def assign(policy, repo, branch, phase, table, pin=None, warn=None):
    c = classify(policy, repo, branch, phase, pin, warn)
    return c, policy.resolve(c["kind"], table, c.get("tier"))


# ---- trace phases with the assigned model ------------------------------------------

def _state_plan(lines):
    for line in lines:
        if line.startswith("PLAN "):
            p = line[len("PLAN "):].strip()
            return None if p in ("", "none") else p
    return None


def sync_phases(run, src, lines, next_src, repo, branch, table):
    """trace.sync_phases, with kind and assigned model on every phase event
    and a dispatch event after each phase start."""
    rd = runstate.run_dir(run)
    path = os.path.join(rd, trace.TRACE)
    pin = _state_plan(lines)
    try:
        policy = Policy()
    except ModelsError as exc:
        trace.log(rd, "phase kinds not assigned: %s" % exc)
        policy = None
    last = {}
    for _n, o in trace.read(path):
        if o["kind"] == "dispatch":
            last[str(o["data"]["phase"])] = o["data"]
    cache = {}

    def assigned(pid):
        if pid not in cache:
            cache[pid] = None
            if policy is not None:
                try:
                    cache[pid] = assign(policy, repo, branch, pid, table, pin,
                                        warn=lambda m: trace.log(rd, m))[1]
                except Exception as exc:  # a classification failure never blocks the trace
                    trace.log(rd, "phase %s: no model assigned: %s" % (pid, exc))
        return cache[pid]

    def annotate(data):
        pid = str(data["id"])
        if data["event"] != "start":
            a = last.get(pid)
            if a:
                data.update((k, a[k]) for k in ("kind", "model", "effort", "model_source") if k in a)
            return None
        m = assigned(pid)
        if m is None:
            return None
        a = {"kind": m["kind"], "model": m["model"], "effort": m["effort"], "model_source": "assigned"}
        data.update(a)
        d = dict(a, phase=pid)
        last[pid] = d
        return [("dispatch", d)]

    trace.sync_phases(run, src, lines, next_src, annotate)


# ---- protected notices, limit episodes, budget switch -------------------------------

def announced(run):
    try:
        with open(os.path.join(runstate.run_dir(run), ANNOUNCED)) as fh:
            return set(x.strip() for x in fh if x.strip())
    except (IOError, OSError):
        return set()


def protected_notices(policy, run, repo, branch, ids, pin=None):
    done = set(plan_table.norm_id(x) for x in announced(run))
    out = []
    for pid in ids:
        if not pid or plan_table.norm_id(pid) in done:
            continue
        c = classify(policy, repo, branch, pid, pin)
        if c["source"] == "protected":
            name = re.sub(r"[\t\r\n]+", " ", c["name"]) or "-"
            out.append("PROTECTED phase=%s kind=%s model=%s | %s" % (c["id"], c["kind"],
                                                                    policy.tiers["strongest"], name))
    return out


def run_events(run):
    return trace.read(os.path.join(runstate.run_dir(run), trace.TRACE))


def limit_episodes(run):
    seen = set()
    for _n, o in run_events(run):
        if o["kind"] == "limit":
            seen.add((str(o["data"].get("reset")), str(o["data"].get("hash"))))
    return len(seen)


def switch_pending(run, table):
    pending = False
    for _n, o in run_events(run):
        d = o["data"]
        if o["kind"] == "decision" and d.get("key") == "models.table" and str(d.get("value")) == table:
            pending = True
        elif o["kind"] == "send" and d.get("template") == "models-switch" and d.get("result") == "sent":
            pending = False
    return pending


# ---- stats ---------------------------------------------------------------------------

def started_runs(limit):
    """[(start ts, trace path)] of the newest `limit` runs with a run start."""
    base = os.path.join(runstate.state_dir(), "runs")
    try:
        names = sorted(os.listdir(base))
    except OSError:
        return []
    found = []
    for name in names:
        path = os.path.join(base, name, trace.TRACE)
        if not os.path.isfile(path):
            continue
        for _n, o in trace.read(path):
            if o["kind"] == "run" and o["data"].get("action") == "start":
                found.append((o["ts"], path))
                break
    found.sort(reverse=True)
    return found[:limit]


def done_phases(events):
    """One entry per `phase done` event of events ((lineno, obj) pairs), in
    order: {id, secs (int or None), key ((kind, model, effort) assigned by
    the dispatch event, else the done event's own, or None), limits (usage
    limits while it was open), first (first verify result after it or
    None), fails (FAIL verifies after it)}. Consecutive done phases share
    the verifies that follow them."""
    assigned = {}
    open_limits = {}
    out = []
    group = None
    for _n, o in events:
        k, d = o["kind"], o["data"]
        if k == "dispatch":
            assigned[str(d["phase"])] = (d["kind"], str(d.get("model", "-")), str(d.get("effort", "-")))
        elif k == "limit":
            for pid in open_limits:
                open_limits[pid] += 1
        elif k == "phase":
            pid = str(d["id"])
            if d["event"] == "start":
                open_limits[pid] = 0
                continue
            limits = open_limits.pop(pid, 0)
            key = assigned.get(pid)
            if key is None and d.get("model_source") and d.get("kind"):
                key = (d["kind"], str(d.get("model", "-")), str(d.get("effort", "-")))
            if group is None or group["verifies"]:
                group = {"verifies": []}
            secs = d.get("secs")
            secs = secs if isinstance(secs, int) and not isinstance(secs, bool) else None
            out.append({"id": pid, "secs": secs, "key": key, "limits": limits, "group": group})
        elif k == "verify" and group is not None and d.get("result") in ("PASS", "FAIL", "WEAK"):
            group["verifies"].append(d["result"])
    for p in out:
        verifies = p.pop("group")["verifies"]
        p["first"] = verifies[0] if verifies else None
        p["fails"] = sum(1 for r in verifies if r == "FAIL")
    return out


def run_samples(path):
    """One sample per phase done with an assigned model:
    (key, secs or None, limit hits, first verify result or None, FAIL count)."""
    return [(p["key"], p["secs"], p["limits"], p["first"], p["fails"])
            for p in done_phases(trace.read(path)) if p["key"] is not None]


def _half_up(x):
    return int(x + 0.5)


def _step(policy, model, effort, up):
    tier = policy.tier_of(model)
    if tier is None or effort not in EFFORTS:
        return None
    ti, ei = TIER_ORDER.index(tier), EFFORTS.index(effort)
    if up:
        if ti < len(TIER_ORDER) - 1:
            return "%s/%s" % (TIER_ORDER[ti + 1], effort)
        if ei < len(EFFORTS) - 1:
            return "%s/%s" % (tier, EFFORTS[ei + 1])
    else:
        if ti > 0:
            return "%s/%s" % (TIER_ORDER[ti - 1], effort)
        if ei > 0:
            return "%s/%s" % (tier, EFFORTS[ei - 1])
    return None


def stats(policy, runs, min_samples, up_pct, down_pct, recommend=True, run=None):
    """MODEL lines. recommend=False (features.model_recommend off) prints
    recommend=off. With run, an upgrade or downgrade recommendation (made or
    withheld) is one `use model_recommend` event (fired or blocked-off)."""
    agg = {}
    for _ts, path in started_runs(runs):
        for key, secs, limits, first, fails in run_samples(path):
            a = agg.setdefault(key, {"n": 0, "fp": 0, "fpn": 0, "rework": 0, "secs": [], "limits": 0})
            a["n"] += 1
            if first is not None:
                a["fpn"] += 1
                a["fp"] += 1 if first == "PASS" else 0
            a["rework"] += fails
            if secs is not None:
                a["secs"].append(secs)
            a["limits"] += limits
    lines = []
    moved = False
    for (kind, model, effort) in sorted(agg):
        a = agg[(kind, model, effort)]
        fp = _half_up(100.0 * a["fp"] / a["fpn"]) if a["fpn"] else None
        mean = _half_up(sum(a["secs"]) / 60.0 / len(a["secs"])) if a["secs"] else None
        if a["n"] < min_samples:
            rec = "insufficient"
        elif kind in policy.protected:
            rec = "protected"
        elif model == "-" or fp is None:
            rec = "keep"
        elif fp < up_pct:
            step = _step(policy, model, effort, True)
            rec = "upgrade:%s" % step if step else "keep"
        elif fp >= down_pct and a["rework"] == 0:
            step = _step(policy, model, effort, False)
            rec = "downgrade:%s" % step if step else "keep"
        else:
            rec = "keep"
        if rec.startswith(("upgrade:", "downgrade:")):
            moved = True
        if not recommend:
            rec = "off"
        lines.append("MODEL kind=%s assigned_model=%s effort=%s samples=%d first_pass=%s rework=%.1f "
                     "mean_min=%s limit_hits=%d recommend=%s"
                     % (kind, model, effort, a["n"], "-" if fp is None else fp, float(a["rework"]) / a["n"],
                        "-" if mean is None else mean, a["limits"], rec))
    if run and moved:
        trace.use(run, "retro", "model_recommend", "fired" if recommend else "blocked-off")
    return lines


# ---- CLI -------------------------------------------------------------------------------

def _opts(args, names, npos=0):
    opts, pos = {}, []
    i = 0
    while i < len(args):
        a = args[i]
        if a in names:
            if i + 1 >= len(args):
                raise ModelsError(2, "%s needs a value" % a)
            opts[a] = args[i + 1]
            i += 2
            continue
        if a.startswith("--"):
            raise ModelsError(2, "unknown option %s" % a)
        pos.append(a)
        i += 1
    if len(pos) > npos:
        raise ModelsError(2, "unexpected arguments: %s" % " ".join(pos[npos:]))
    if len(pos) < npos:
        raise ModelsError(2, "missing argument")
    return opts, pos


def _need(opts, *names):
    for n in names:
        if not opts.get(n):
            raise ModelsError(2, "%s is required" % n)


def _table(opts):
    return opts.get("--table") or config_values("models.table")[0]


def _warn(msg):
    sys.stderr.write("models: %s\n" % msg)


def run_cli(argv):
    if not argv:
        raise ModelsError(2, "usage: models.py resolve|classify|assign|table|stats ...")
    cmd, args = argv[0], argv[1:]
    out = sys.stdout
    if cmd == "resolve":
        o, pos = _opts(args, ("--table",), 1)
        out.write(model_line(Policy().resolve(pos[0], _table(o))) + "\n")
    elif cmd in ("classify", "assign"):
        o, _pos = _opts(args, ("--repo", "--branch", "--phase", "--plan", "--table"))
        _need(o, "--repo", "--branch", "--phase")
        policy = Policy()
        if cmd == "classify":
            out.write(kind_line(classify(policy, o["--repo"], o["--branch"], o["--phase"], o.get("--plan"),
                                         _warn)) + "\n")
        else:
            c, r = assign(policy, o["--repo"], o["--branch"], o["--phase"], _table(o), o.get("--plan"), _warn)
            out.write(kind_line(c) + "\n" + model_line(r) + "\n")
    elif cmd == "table":
        o, _pos = _opts(args, ("--format", "--table"))
        fmt = o.get("--format", "directive")
        if fmt not in ("directive", "message"):
            raise ModelsError(2, "--format must be directive or message")
        policy = Policy()
        t = _table(o)
        out.write((policy.directive(t) if fmt == "directive" else policy.message(t)) + "\n")
    elif cmd == "stats":
        o, _pos = _opts(args, ("--runs",))
        max_runs, min_s, up, down, rec = config_values("retro.max_runs", "retro.min_samples",
                                                       "models.upgrade_below_pct", "models.downgrade_above_pct",
                                                       "features.model_recommend")
        if "--runs" in o:
            if not o["--runs"].isdigit() or int(o["--runs"]) < 1:
                raise ModelsError(2, "--runs must be a positive integer")
            max_runs = int(o["--runs"])
        for line in stats(Policy(), max_runs, min_s, up, down, rec is not False):
            out.write(line + "\n")
    elif cmd == "phases":
        o, _pos = _opts(args, ("--run", "--src", "--next-src", "--repo", "--branch", "--table"))
        nxt = o.get("--next-src", "-")
        if not runstate.valid_run(o.get("--run", "")) or o.get("--src") not in trace.SRCS \
                or (nxt != "-" and nxt not in trace.START_SRCS):
            raise ModelsError(2, "phases needs --run, a valid --src and --next-src")
        lines = sys.stdin.read().split("\n")
        try:
            sync_phases(o["--run"], o["--src"], lines, None if nxt == "-" else nxt, o.get("--repo", ""),
                        o.get("--branch", ""), o.get("--table") or "default")
        except Exception as exc:  # the trace never fails its caller
            trace.log(runstate.run_dir(o["--run"]), "phase events not written: %s: %s" % (type(exc).__name__, exc))
    elif cmd == "protected":
        o, _pos = _opts(args, ("--run", "--repo", "--branch", "--ids", "--plan"))
        _need(o, "--run", "--repo", "--branch")
        runstate.check_run(o["--run"])
        ids = [x.strip() for x in o.get("--ids", "").split(",") if x.strip() and x.strip() != "-"]
        for line in protected_notices(Policy(), o["--run"], o["--repo"], o["--branch"], ids, o.get("--plan")):
            out.write(line + "\n")
    elif cmd == "limit-episodes":
        o, _pos = _opts(args, ("--run",))
        _need(o, "--run")
        runstate.check_run(o["--run"])
        out.write("EPISODES %d\n" % limit_episodes(o["--run"]))
    elif cmd == "switch-pending":
        o, _pos = _opts(args, ("--run", "--table"))
        _need(o, "--run", "--table")
        runstate.check_run(o["--run"])
        return 0 if switch_pending(o["--run"], o["--table"]) else 1
    else:
        raise ModelsError(2, "unknown command: %s" % cmd)
    return 0


def main(argv):
    try:
        return run_cli(argv[1:])
    except ModelsError as exc:
        sys.stderr.write("models: %s\n" % exc)
        return exc.code
    except runstate.RunStateError as exc:
        sys.stderr.write("models: %s\n" % exc)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
