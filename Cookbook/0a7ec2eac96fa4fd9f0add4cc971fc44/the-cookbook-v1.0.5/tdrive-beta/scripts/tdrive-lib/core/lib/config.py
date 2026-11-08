"""Layered config resolver for tdrive.

Layers, low to high: default (schema) < decay (the state dir's decay.yaml,
learnstore kind `decay`: features.* switches written by the decay scan) <
preset < user < repo < config (--config / TDRIVE_CONFIG) < decided (run
decided.yaml) < env (TDRIVE_<KEY>). Restricted keys are accepted only from
the default and user layers; the decay layer holds features.* keys only.

CLI (global options before the subcommand):
  config.py [--repo DIR] [--rundir DIR] dump --format tsv|json [--changed]
  config.py [--repo DIR] [--rundir DIR] get KEY [--explain]
  config.py validate KEY VALUE
  config.py set-decided RUNDIR KEY VALUE [--dry-run]
Exit codes: 0 ok, 2 usage/config error, 4 decision shadowed by env.
"""
import json
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
SCHEMA_PATH = os.path.join(ROOT, "policies", "schema.yaml")
PRESETS_DIR = os.path.join(ROOT, "policies", "presets")
LAYERS = ("default", "decay", "preset", "user", "repo", "config", "decided", "env")
RESTRICTED_OK = ("default", "user")
TYPES = ("int", "float", "bool", "string", "enum", "list")
XDG_TOKEN = "${XDG_CONFIG_HOME:-~/.config}"
_INT_RE = re.compile(r"^[-+]?[0-9]+$")
_PRESET_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


class ConfigError(Exception):
    def __init__(self, msg, code=2):
        Exception.__init__(self, msg)
        self.code = code


def env_suffix(key):
    return key.upper().replace(".", "_")


def env_name(key):
    return "TDRIVE_" + env_suffix(key)


def user_config_path():
    xdg = os.environ.get("XDG_CONFIG_HOME", "")
    if not xdg:
        xdg = os.path.join(os.path.expanduser("~"), ".config")
    return os.path.join(xdg, "tdrive", "config.yaml")


def _load_yaml(path):
    try:
        return yamlite.load(path)
    except yamlite.YamlError as exc:
        raise ConfigError(str(exc))


def load_schema():
    data = _load_yaml(SCHEMA_PATH)
    if not isinstance(data, dict) or not isinstance(data.get("keys"), dict):
        raise ConfigError("schema %s: missing 'keys' map" % SCHEMA_PATH)
    schema = data["keys"]
    for key, spec in schema.items():
        if not isinstance(spec, dict) or spec.get("type") not in TYPES:
            raise ConfigError("schema %s: key %s has no valid type" % (SCHEMA_PATH, key))
        if spec["type"] == "enum" and not isinstance(spec.get("values"), list):
            raise ConfigError("schema %s: enum key %s has no values" % (SCHEMA_PATH, key))
        spec["default"] = coerce_yaml(key, spec, spec.get("default"), "schema")
    return schema


# ---- typing --------------------------------------------------------------

def _bounds(key, spec, v, where):
    lo = spec.get("min")
    hi = spec.get("max")
    if lo is not None and v < lo:
        raise ConfigError("%s: %s must be >= %s (got %s)" % (where, key, lo, v))
    if hi is not None and v > hi:
        raise ConfigError("%s: %s must be <= %s (got %s)" % (where, key, hi, v))
    return v


def _bad(key, spec, v, where):
    t = spec["type"]
    if t == "enum":
        t = "one of %s" % "|".join(str(x) for x in spec["values"])
    return ConfigError("%s: %s expects %s, got %r" % (where, key, t, v))


def _scalar_text(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def coerce_yaml(key, spec, v, where):
    """Validate a value parsed from a YAML file."""
    t = spec["type"]
    if t == "int":
        if isinstance(v, bool) or not isinstance(v, int):
            raise _bad(key, spec, v, where)
        return _bounds(key, spec, v, where)
    if t == "float":
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise _bad(key, spec, v, where)
        return _bounds(key, spec, float(v), where)
    if t == "bool":
        if not isinstance(v, bool):
            raise _bad(key, spec, v, where)
        return v
    if t == "string":
        if not isinstance(v, str):
            raise _bad(key, spec, v, where)
        return v
    if t == "enum":
        if not isinstance(v, str) or v not in spec["values"]:
            raise _bad(key, spec, v, where)
        return v
    if not isinstance(v, list):
        raise _bad(key, spec, v, where)
    out = []
    for item in v:
        if item is None or isinstance(item, (list, dict)):
            raise _bad(key, spec, v, where)
        out.append(_scalar_text(item))
    return out


def coerce_str(key, spec, s, where):
    """Validate a value given as text (env, decide, validate)."""
    t = spec["type"]
    if t == "int":
        if not _INT_RE.match(s.strip()):
            raise _bad(key, spec, s, where)
        return _bounds(key, spec, int(s.strip()), where)
    if t == "float":
        try:
            f = float(s.strip())
        except ValueError:
            raise _bad(key, spec, s, where)
        if f != f or f in (float("inf"), float("-inf")):
            raise _bad(key, spec, s, where)
        return _bounds(key, spec, f, where)
    if t == "bool":
        low = s.strip().lower()
        if low in ("true", "1", "yes", "on"):
            return True
        if low in ("false", "0", "no", "off"):
            return False
        raise _bad(key, spec, s, where)
    if t == "string":
        return s
    if t == "enum":
        if s not in spec["values"]:
            raise _bad(key, spec, s, where)
        return s
    return [x.strip() for x in s.split(",") if x.strip() != ""]


def _expand_one(s):
    if XDG_TOKEN in s:
        xdg = os.environ.get("XDG_CONFIG_HOME", "") or os.path.join(os.path.expanduser("~"), ".config")
        s = s.replace(XDG_TOKEN, xdg)
    if s == "~" or s.startswith("~/"):
        s = os.path.expanduser("~") + s[1:]
    return s


def expand(spec, v):
    if spec["type"] == "string":
        return _expand_one(v)
    if spec["type"] == "list":
        return [_expand_one(x) for x in v]
    return v


def fmt(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, list):
        return ",".join(v)
    if isinstance(v, float):
        return repr(v)
    return str(v)


def yaml_value(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v) if isinstance(v, float) else str(v)
    if isinstance(v, list):
        return "[" + ", ".join(yaml_value(x) for x in v) + "]"
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"').replace("\t", "\\t") + '"'


# ---- layers ----------------------------------------------------------------

def flatten(obj, path, layer, prefix="", out=None):
    if out is None:
        out = {}
    if obj is None:
        return out
    if not isinstance(obj, dict):
        raise ConfigError("%s (%s): top level must be a map" % (path, layer))
    for k, v in obj.items():
        full = prefix + str(k)
        if isinstance(v, dict):
            flatten(v, path, layer, full + ".", out)
            continue
        if full in out:
            raise ConfigError("%s (%s): key %s set twice" % (path, layer, full))
        out[full] = v
    return out


def _check_keys(schema, flat, layer, path):
    for key in flat:
        if key not in schema:
            raise ConfigError("unknown key %s in layer %s (%s)" % (key, layer, path))
        if schema[key].get("restricted") and layer not in RESTRICTED_OK:
            raise ConfigError("restricted key %s cannot be set in layer %s (%s)" % (key, layer, path))


class Config(object):
    def __init__(self, repo=None, rundir=None):
        self.schema = load_schema()
        self.values = {}
        for key, spec in self.schema.items():
            self.values[key] = (expand(spec, spec["default"]), "default", "-")
        files = []
        upath = user_config_path()
        if os.path.isfile(upath):
            files.append(("user", upath))
        repo = repo or os.getcwd()
        rpath = os.path.join(repo, ".tdrive", "config.yaml")
        if os.path.isfile(rpath):
            files.append(("repo", rpath))
        cpath = os.environ.get("TDRIVE_CONFIG", "")
        if cpath:
            if not os.path.isfile(cpath):
                raise ConfigError("config file not found: %s" % cpath)
            files.append(("config", cpath))
        if rundir is None:
            try:
                run = runstate.resolve(None, repo, None)
            except runstate.RunStateError as exc:
                raise ConfigError(str(exc))
            if run:
                rundir = runstate.run_dir(run)
        if rundir:
            dpath = os.path.join(rundir, "decided.yaml")
            if os.path.isfile(dpath):
                files.append(("decided", dpath))

        layered = []
        for layer, path in files:
            flat = flatten(_load_yaml(path), path, layer)
            _check_keys(self.schema, flat, layer, path)
            typed = {}
            for key, v in flat.items():
                typed[key] = coerce_yaml(key, self.schema[key], v, "%s (%s)" % (path, layer))
            layered.append((layer, path, typed))

        env = {}
        for key, spec in self.schema.items():
            name = env_name(key)
            if name not in os.environ:
                continue
            if spec.get("restricted"):
                raise ConfigError("restricted key %s cannot be set in layer env (%s)" % (key, name))
            env[key] = coerce_str(key, spec, os.environ[name], "env %s" % name)

        self._load_decay()
        preset_name, preset_layer, preset_src = "", "default", "-"
        if "preset" in env:
            preset_name, preset_layer, preset_src = env["preset"], "env", env_name("preset")
        else:
            for layer, path, typed in layered:
                if "preset" in typed:
                    preset_name, preset_layer, preset_src = typed["preset"], layer, path

        if preset_name:
            ppath, typed = self._load_preset(preset_name)
            for key, v in typed.items():
                self.values[key] = (expand(self.schema[key], v), "preset", ppath)
        for layer, path, typed in layered:
            for key, v in typed.items():
                self.values[key] = (expand(self.schema[key], v), layer, path)
        for key, v in env.items():
            self.values[key] = (expand(self.schema[key], v), "env", env_name(key))
        self.values["preset"] = (preset_name, preset_layer, preset_src)

    def _load_decay(self):
        """The decay layer, just above the schema defaults."""
        path = learnstore.path_of("decay")
        if not os.path.isfile(path):
            return
        flat = flatten(_load_yaml(path), path, "decay")
        for key, v in flat.items():
            if not key.startswith("features.") or key not in self.schema:
                raise ConfigError("decay layer %s: only features.* keys, got %s" % (path, key))
            typed = coerce_yaml(key, self.schema[key], v, "%s (decay)" % path)
            self.values[key] = (expand(self.schema[key], typed), "decay", path)

    def _load_preset(self, name):
        if not _PRESET_RE.match(name):
            raise ConfigError("invalid preset name: %r" % name)
        path = os.path.join(PRESETS_DIR, name + ".yaml")
        if not os.path.isfile(path):
            raise ConfigError("unknown preset: %s" % name)
        data = _load_yaml(path)
        if not isinstance(data, dict):
            raise ConfigError("%s: preset must be a map" % path)
        extra = set(data) - set(("name", "description", "values"))
        if extra:
            raise ConfigError("%s: unknown preset field(s): %s" % (path, ", ".join(sorted(extra))))
        flat = flatten(data.get("values"), path, "preset")
        if "preset" in flat:
            raise ConfigError("%s: a preset cannot set the preset key" % path)
        _check_keys(self.schema, flat, "preset", path)
        typed = {}
        for key, v in flat.items():
            typed[key] = coerce_yaml(key, self.schema[key], v, "%s (preset)" % path)
        return path, typed

    def changed(self):
        out = []
        for key, spec in self.schema.items():
            v, layer, src = self.values[key]
            if v != expand(spec, spec["default"]):
                out.append((key, v, layer, src))
        return out


# ---- decided.yaml ------------------------------------------------------------

def set_decided(schema, rundir, key, value, dry_run):
    if key not in schema:
        raise ConfigError("unknown key %s" % key)
    spec = schema[key]
    if spec.get("restricted"):
        raise ConfigError("restricted key %s cannot be set in layer decided" % key)
    if env_name(key) in os.environ:
        raise ConfigError("shadowed-by-env: %s is set, so a decision on %s would not take effect"
                          % (env_name(key), key), code=4)
    if "\n" in value or "\r" in value or "\0" in value:
        raise ConfigError("value for %s must be a single line" % key)
    typed = coerce_str(key, spec, value, "decide")
    if dry_run:
        return typed
    path = os.path.join(rundir, "decided.yaml")
    current = {}
    if os.path.isfile(path):
        current = flatten(_load_yaml(path), path, "decided")
    current[key] = typed
    lines = ["# Typed config overrides written by tdrive decide.\n"]
    for k, v in current.items():
        lines.append("%s: %s\n" % (k, yaml_value(v)))
    runstate.ensure_dir(rundir)
    runstate.atomic_write(path, "".join(lines))
    return typed


# ---- CLI -------------------------------------------------------------------

def _tsv_line(key, v):
    text = fmt(v)
    if "\n" in text or "\r" in text or "\0" in text or "\t" in text:
        raise ConfigError("value of %s is not single-line (newline, tab or NUL)" % key)
    return "%s\t%s\n" % (env_suffix(key), text)


def run_cli(argv):
    repo = None
    rundir = None
    while argv and argv[0] in ("--repo", "--rundir"):
        if len(argv) < 2:
            raise ConfigError("%s needs a value" % argv[0])
        if argv[0] == "--repo":
            repo = argv[1]
        else:
            rundir = argv[1]
        argv = argv[2:]
    if not argv:
        raise ConfigError("usage: config.py [--repo DIR] [--rundir DIR] dump|get|validate|set-decided ...")
    cmd, args = argv[0], argv[1:]
    out = sys.stdout
    if cmd == "dump":
        form = None
        changed = False
        i = 0
        while i < len(args):
            if args[i] == "--format" and i + 1 < len(args):
                form = args[i + 1]
                i += 2
            elif args[i] == "--changed":
                changed = True
                i += 1
            else:
                raise ConfigError("usage: config.py dump --format tsv|json [--changed]")
        if form not in ("tsv", "json"):
            raise ConfigError("usage: config.py dump --format tsv|json [--changed]")
        cfg = Config(repo, rundir)
        if form == "tsv":
            if changed:
                rows = [(k, v) for k, v, _, _ in cfg.changed()]
            else:
                rows = [(k, cfg.values[k][0]) for k in cfg.schema]
            out.write("".join(_tsv_line(k, v) for k, v in rows))
        else:
            if changed:
                data = dict((k, {"value": v, "layer": layer}) for k, v, layer, _ in cfg.changed())
            else:
                data = dict((k, cfg.values[k][0]) for k in cfg.schema)
            out.write(json.dumps(data, indent=2) + "\n")
        return 0
    if cmd == "get":
        explain = "--explain" in args
        rest = [a for a in args if a != "--explain"]
        if len(rest) != 1:
            raise ConfigError("usage: config.py get KEY [--explain]")
        cfg = Config(repo, rundir)
        key = rest[0]
        if key not in cfg.schema:
            raise ConfigError("unknown key %s" % key)
        v, layer, src = cfg.values[key]
        if explain:
            out.write("%s\t%s\t%s\t%s\n" % (key, fmt(v), layer, src))
        else:
            out.write(fmt(v) + "\n")
        return 0
    if cmd == "validate":
        if len(args) != 2:
            raise ConfigError("usage: config.py validate KEY VALUE")
        schema = load_schema()
        key, value = args
        if key not in schema:
            raise ConfigError("unknown key %s" % key)
        out.write(fmt(coerce_str(key, schema[key], value, "validate")) + "\n")
        return 0
    if cmd == "set-decided":
        dry = "--dry-run" in args
        rest = [a for a in args if a != "--dry-run"]
        if len(rest) != 3:
            raise ConfigError("usage: config.py set-decided RUNDIR KEY VALUE [--dry-run]")
        typed = set_decided(load_schema(), rest[0], rest[1], rest[2], dry)
        out.write("%s\t%s\n" % (rest[1], fmt(typed)))
        return 0
    raise ConfigError("unknown command: %s" % cmd)


def main(argv):
    try:
        return run_cli(argv[1:])
    except ConfigError as exc:
        sys.stderr.write("config: %s\n" % exc)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
