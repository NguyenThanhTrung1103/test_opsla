"""Feature registry of the automatic build-to-delete (policies/features.yaml).

Every command of `tdrive help`, incident class, govern cleanup guard, stop
condition and adapter is registered exactly once with a kind, a class and
the event selectors that count its uses in an operate trace:
  safety    exempt from decay: never a candidate, never switched off
  core      loop mechanics: reported as a candidate, never switched off
  optional  switched off automatically through its flag features.<name>
Selector: `<kinds> [<field>=<patterns>]...`, alternatives separated by `|`,
patterns are fnmatch globs; `src` matches the envelope src, other fields
the event data compared as text. fires_from "-" marks an untracked item.

Decay layer (learnstore kind `decay`, S/decay.yaml): `features.<name>: false`
lines written by the decay scan; config.py reads it just above the schema
defaults, so any other layer re-enables the feature.

CLI:
  check [--file F]   FEATURES OK entries=<n> commands=<n> detectors=<n>
                     guards=<n> stops=<n> adapters=<n>, or one
                     FEATURES MISSING <what>=<id> / FEATURES EXTRA <what>=<id>
                     line per coverage gap (exit 1)
Exit: 0 ok, 1 coverage gap, 2 usage or bad registry.
"""
import fnmatch
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import learnstore  # noqa: E402
import runstate  # noqa: E402
import yamlite  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
REGISTRY = os.path.join(ROOT, "policies", "features.yaml")
KINDS = ("module", "feature", "command", "guard", "detector", "policy-key")
CLASSES = ("safety", "core", "optional")
FIELDS = ("id", "kind", "class", "flag", "fires_from", "outcome_from", "files", "tests", "note")
FLAG_RE = re.compile(r"^features\.[a-z][a-z0-9_]*$")
USE_EFFECTS = ("fired", "changed", "blocked-off")
LAYER_HEAD = "# Features switched off by the decay scan of tdrive retro; any other config layer overrides.\n"


class FeatureError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


# ---- registry ----------------------------------------------------------------------

def _selectors(value, where):
    if not isinstance(value, list) or not value or not all(isinstance(s, str) and s.strip() for s in value):
        raise FeatureError(2, "%s must be a non-empty list of selectors" % where)
    return [parse_selector(s, where) for s in value]


def parse_selector(text, where="selector"):
    """(kinds, [(field, patterns)]) of a selector string."""
    words = text.split()
    kinds = words[0].split("|")
    conds = []
    for w in words[1:]:
        if "=" not in w or not w.split("=", 1)[0] or not w.split("=", 1)[1]:
            raise FeatureError(2, "%s: bad selector term %r in %r" % (where, w, text))
        k, v = w.split("=", 1)
        conds.append((k, v.split("|")))
    return kinds, conds


def load(path=None):
    """The validated entries of the registry."""
    path = path or REGISTRY
    try:
        data = yamlite.load(path)
    except yamlite.YamlError as exc:
        raise FeatureError(2, str(exc))
    except (IOError, OSError) as exc:
        raise FeatureError(2, "cannot read the feature registry %s: %s" % (path, exc))
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("features"), list):
        raise FeatureError(2, "%s: needs version: 1 and a features list" % path)
    seen, flags, out = set(), set(), []
    for e in data["features"]:
        if not isinstance(e, dict) or not isinstance(e.get("id"), str) or not e["id"]:
            raise FeatureError(2, "%s: every entry needs an id" % path)
        fid = e["id"]

        def bad(msg):
            return FeatureError(2, "%s: %s: %s" % (path, fid, msg))

        if fid in seen:
            raise bad("listed twice")
        seen.add(fid)
        extra = set(e) - set(FIELDS)
        if extra:
            raise bad("unknown field(s): %s" % ", ".join(sorted(extra)))
        if e.get("kind") not in KINDS:
            raise bad("kind must be one of %s" % ", ".join(KINDS))
        if e.get("class") not in CLASSES:
            raise bad("class must be one of %s" % ", ".join(CLASSES))
        if not isinstance(e.get("note"), str) or not e["note"].strip():
            raise bad("note must be a one-line string")
        if e["class"] == "optional":
            if not isinstance(e.get("flag"), str) or not FLAG_RE.match(e["flag"]):
                raise bad("an optional item needs a flag features.<name>")
            if e["flag"] in flags:
                raise bad("flag %s used twice" % e["flag"])
            flags.add(e["flag"])
        elif "flag" in e:
            raise bad("only optional items have a flag; safety and core items are never switched off")
        fires = e.get("fires_from")
        entry = dict(e)
        if fires == "-":
            entry["fires"] = None
        elif fires is None:
            entry["fires"] = _selectors(["use feature=%s effect=fired|changed" % fid], fid)
        else:
            entry["fires"] = _selectors(fires, "%s: fires_from" % fid)
        outcome = e.get("outcome_from")
        if entry["fires"] is None:
            if outcome is not None:
                raise bad("an untracked item has no outcome_from")
            entry["outcome"] = None
        elif outcome == "same":
            entry["outcome"] = entry["fires"]
        elif outcome is None:
            entry["outcome"] = _selectors(["use feature=%s effect=changed" % fid], fid)
        else:
            entry["outcome"] = _selectors(outcome, "%s: outcome_from" % fid)
        for key in ("files", "tests"):
            if key in e and (not isinstance(e[key], list) or not all(isinstance(x, str) for x in e[key])):
                raise bad("%s must be a list of strings" % key)
        out.append(entry)
    return out


def _text(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def matches(sel, obj):
    kinds, conds = sel
    if "*" not in kinds and obj["kind"] not in kinds:
        return False
    d = obj["data"]
    for field, pats in conds:
        if field == "src":
            v = obj["src"]
        elif field in d and d[field] is not None and not isinstance(d[field], (list, dict)):
            v = _text(d[field])
        else:
            return False
        if not any(fnmatch.fnmatchcase(v, p) for p in pats):
            return False
    return True


def count(entry, events):
    """(fires, changed, first fire line) of entry over events [(n, obj)]."""
    fires = changed = 0
    first = None
    if entry["fires"] is None:
        return 0, 0, None
    for n, o in events:
        if o["kind"] == "use" and o["data"].get("effect") == "blocked-off":
            continue
        if any(matches(s, o) for s in entry["fires"]):
            fires += 1
            if first is None:
                first = n
        if any(matches(s, o) for s in entry["outcome"]):
            changed += 1
    return fires, changed, first


# ---- coverage ---------------------------------------------------------------------

def _live_commands():
    path = os.path.join(ROOT, "bin", "tdrive")
    with open(path) as fh:
        for line in fh:
            m = re.match(r'^TD_COMMANDS="([^"]*)"', line)
            if m:
                return m.group(1).split()
    raise FeatureError(2, "%s: no TD_COMMANDS line" % path)


def _yaml_list(path, key):
    data = yamlite.load(path)
    items = data.get(key) if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise FeatureError(2, "%s: %s must be a list" % (path, key))
    return [x for x in items if isinstance(x, dict) and x.get("id")]


def live_lists():
    """{what: [ids]} of the live lists the registry must cover."""
    pol = os.path.join(ROOT, "policies")
    return {
        "command": ["cmd:%s" % c for c in _live_commands()],
        "detector": [c["id"] for c in _yaml_list(os.path.join(pol, "incidents.yaml"), "classes")],
        "guard": [e["id"] for e in _yaml_list(os.path.join(pol, "safe-cleanup.yaml"), "entries")
                  if e.get("guard") or e.get("items")],
        "stop": ["stop:%s" % c["id"] for c in _yaml_list(os.path.join(pol, "stop-conditions.yaml"), "conditions")],
        "adapter": sorted(d for d in os.listdir(os.path.join(ROOT, "adapters"))
                          if os.path.isfile(os.path.join(ROOT, "adapters", d, "adapter.yaml"))),
    }


def coverage(entries):
    """[(MISSING|EXTRA, what, id)]: live items not registered, registry
    commands, detectors or stops that are not live."""
    by_id = dict((e["id"], e) for e in entries)
    want_kind = {"command": "command", "detector": "detector", "guard": "guard", "stop": "feature",
                 "adapter": "module"}
    gaps = []
    live = live_lists()
    for what, ids in sorted(live.items()):
        for i in ids:
            e = by_id.get(i)
            if e is None or e["kind"] != want_kind[what]:
                gaps.append(("MISSING", what, i[4:] if what == "command" else i))
    for e in entries:
        if e["kind"] == "command" and e["id"] not in live["command"]:
            gaps.append(("EXTRA", "command", e["id"]))
        elif e["kind"] == "detector" and e["id"] not in live["detector"]:
            gaps.append(("EXTRA", "detector", e["id"]))
        elif e["id"].startswith("stop:") and e["id"] not in live["stop"]:
            gaps.append(("EXTRA", "stop", e["id"]))
    return gaps


# ---- flags and the decay layer --------------------------------------------------------

def flag_of(entries, fid):
    for e in entries:
        if e["id"] == fid:
            return e.get("flag")
    return None


def enabled(fid, values, entries=None):
    """True unless fid is an optional item whose flag is false in values (a
    config value map key -> (value, layer, source))."""
    flag = flag_of(entries if entries is not None else load(), fid)
    if not flag or flag not in values:
        return True
    return values[flag][0] is not False


def run_enabled(fid, run=None):
    """enabled() under the config of run (its REPO and decided layer), else
    of the current directory. A config error counts as enabled (logged by
    the caller's own config load)."""
    import config
    repo = rundir = None
    try:
        if run and runstate.valid_run(run):
            rundir = runstate.run_dir(run)
            repo = runstate.env_get(run, "REPO") or None
            if repo and not os.path.isdir(repo):
                repo = None
            if not os.path.isdir(rundir):
                rundir = None
        values = config.Config(repo, rundir).values
    except (config.ConfigError, runstate.RunStateError):
        return True
    return enabled(fid, values)


def layer_path():
    return learnstore.path_of("decay")


def read_layer(path=None):
    """{flag: bool} of the decay layer file; {} when absent."""
    path = path or layer_path()
    if not os.path.isfile(path):
        return {}
    try:
        data = yamlite.load(path)
    except yamlite.YamlError as exc:
        raise FeatureError(2, "decay layer %s: %s" % (path, exc))
    out = {}
    if data is None:
        return out
    if not isinstance(data, dict):
        raise FeatureError(2, "decay layer %s: top level must be a map" % path)
    stack = [("", data)]
    while stack:
        prefix, m = stack.pop()
        for k, v in m.items():
            key = prefix + str(k)
            if isinstance(v, dict):
                stack.append((key + ".", v))
            else:
                out[key] = v
    return out


def _check_optional(entries, ids):
    by_id = dict((e["id"], e) for e in entries)
    for i in ids:
        e = by_id.get(i)
        if e is None:
            raise FeatureError(2, "unknown feature: %s" % i)
        if e["class"] != "optional":
            raise FeatureError(2, "%s is a %s item: safety and core items are never switched off" % (i, e["class"]))
    return [by_id[i]["flag"] for i in ids]


def write_layer(flags_off, run=None):
    """Write the decay layer holding `<flag>: false` for flags_off (sorted);
    removes the file when empty. Guarded like every learn-store write."""
    path = learnstore.paths("decay", run)
    if not flags_off:
        if os.path.exists(path):
            os.unlink(path)
        return path
    text = LAYER_HEAD + "".join("%s: false\n" % f for f in sorted(flags_off))
    runstate.atomic_write(path, text)
    return path


def switch_off(entries, ids, run=None):
    """Add the flags of the optional items ids to the decay layer."""
    flags = _check_optional(entries, ids)
    layer = read_layer()
    off = set(k for k, v in layer.items() if v is False)
    return write_layer(sorted(off | set(flags)), run)


# ---- CLI -------------------------------------------------------------------------------

def main(argv):
    args = argv[1:]
    try:
        if not args or args[0] != "check" or len(args) not in (1, 3) or (len(args) == 3 and args[1] != "--file"):
            raise FeatureError(2, "usage: features.py check [--file F]")
        entries = load(args[2] if len(args) == 3 else None)
        gaps = coverage(entries)
    except FeatureError as exc:
        sys.stderr.write("features: %s\n" % exc)
        return exc.code
    except (yamlite.YamlError, IOError, OSError) as exc:
        sys.stderr.write("features: %s\n" % exc)
        return 2
    if gaps:
        sys.stdout.write("".join("FEATURES %s %s=%s\n" % g for g in gaps))
        return 1
    live = live_lists()
    sys.stdout.write("FEATURES OK entries=%d commands=%d detectors=%d guards=%d stops=%d adapters=%d\n"
                     % (len(entries), len(live["command"]), len(live["detector"]), len(live["guard"]),
                        len(live["stop"]), len(live["adapter"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
