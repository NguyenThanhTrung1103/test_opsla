"""Mutation probe planning and planting for `tdrive verify`.

Probe files (core/probes/registry.yaml documents the schema and the source
rules): builtin registry < driver --driver-probes files (may override builtin
fields; later files win) ; repo <worktree>/.tdrive/probes.yaml may only add
new ids (a reused id is ignored and logged).

CLI:
  plan --worktree W --targets-file T [--driver-probes FILE]... [--timeout-s N]
       [--log FILE]
      T holds `<name>\\t<command>[\\t<passed|failed>]` lines (the targets verify
      ran). Prints one JSON object per probe:
        {id, src, kind, gate_name, gate_cmd, expect_regex, [compile_cmd],
         action, baseline_passed, timeout_s}
      or {id, src, kind, gate_name, skip} with skip one of
      no-generated-file | no-gate | baseline-failed.
  fields JSON
      KEY<TAB>value lines of a planned probe for run-probe.sh.
  plant --worktree W --json JSON
      Apply an append, write or patch action (plant_cmd runs in run-probe.sh).
  match --json JSON --log FILE
      Exit 0 when expect_regex matches the log, 1 otherwise.
Exit codes: 0 ok, 1 negative answer or plant failed, 2 usage or invalid probe.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import runstate  # noqa: E402
import yamlite  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
REGISTRY = os.path.join(ROOT, "core", "probes", "registry.yaml")
REPO_PROBES = os.path.join(".tdrive", "probes.yaml")
KINDS = ("generated-drift", "arch-import", "custom")
FIELDS = {
    "kind": str, "expect_regex": str, "gate": str, "gate_targets": list, "auto": bool,
    "compile_cmd": str, "note": str, "header_regex": str, "file": str, "content": str,
    "plant_cmd": str, "patch": str,
}
SKIP_DIRS = (".git", "node_modules", "vendor", "dist", "build")
COMMENT = {}
for _ext in ("go", "ts", "tsx", "js", "jsx", "java", "kt", "rs", "c", "h", "cpp", "cs", "swift"):
    COMMENT[_ext] = "//"
for _ext in ("py", "sh", "rb", "yaml", "yml", "toml"):
    COMMENT[_ext] = "#"
COMMENT["sql"] = "--"
PROBE_TEXT = "tdrive mutation probe"
DEFAULT_TIMEOUT_S = 1200
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
_TARGET_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
FIELD_KEYS = ("id", "src", "kind", "gate_name", "gate_cmd", "expect_regex", "compile_cmd",
              "skip", "baseline_passed", "timeout_s", "action_type", "plant_cmd")


class ProbeError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def _single_line(value, what):
    if "\n" in value or "\r" in value or "\t" in value or "\0" in value:
        raise ProbeError(2, "%s must be a single line without tabs" % what)
    return value


# ---- loading ---------------------------------------------------------------

def load_file(path, src):
    """Ordered list of (id, entry) from a probes file; entry gets _src/_base."""
    try:
        data = yamlite.load(path)
    except yamlite.YamlError as exc:
        raise ProbeError(2, str(exc))
    except (IOError, OSError) as exc:
        raise ProbeError(2, "cannot read probes file %s: %s" % (path, exc))
    if data is None:
        return []
    if not isinstance(data, dict) or set(data) - set(("probes",)):
        raise ProbeError(2, "%s: top level must be a map with only `probes`" % path)
    probes = data.get("probes")
    if probes is None:
        return []
    if not isinstance(probes, dict):
        raise ProbeError(2, "%s: probes must be a map of id -> fields" % path)
    out = []
    for pid, entry in probes.items():
        if not isinstance(pid, str) or not _ID_RE.match(pid):
            raise ProbeError(2, "%s: invalid probe id %r" % (path, pid))
        if not isinstance(entry, dict):
            raise ProbeError(2, "%s: probe %s must be a map" % (path, pid))
        for key, val in entry.items():
            want = FIELDS.get(key)
            if want is None:
                raise ProbeError(2, "%s: probe %s: unknown field %s" % (path, pid, key))
            if not isinstance(val, want):
                raise ProbeError(2, "%s: probe %s: %s must be a %s" % (path, pid, key, want.__name__))
        if "auto" in entry and src != "builtin":
            raise ProbeError(2, "%s: probe %s: auto is only valid in the builtin registry" % (path, pid))
        entry = dict(entry)
        entry["_src"] = src
        entry["_base"] = os.path.dirname(os.path.abspath(path))
        out.append((pid, entry))
    return out


def merge(builtin, drivers, repo, log):
    """Ordered dict id -> entry after applying the source rules."""
    merged = {}
    for pid, entry in builtin:
        merged[pid] = entry
    for pid, entry in drivers:
        if pid in merged:
            base = dict(merged[pid])
            base.update(entry)
            base["_src"] = "driver"
            merged[pid] = base
        else:
            merged[pid] = entry
    for pid, entry in repo:
        if pid in merged:
            log("repo probe %s ignored: the repo under test may only add new probe ids "
                "(it reuses a %s id)" % (pid, merged[pid]["_src"]))
            continue
        merged[pid] = entry
    return merged


def validate(pid, e):
    kind = e.get("kind")
    if kind not in KINDS:
        raise ProbeError(2, "probe %s: kind must be one of %s" % (pid, "|".join(KINDS)))
    rx = e.get("expect_regex")
    if not isinstance(rx, str) or not rx.strip():
        raise ProbeError(2, "probe %s: expect_regex is required" % pid)
    _single_line(rx, "probe %s: expect_regex" % pid)
    for key in ("expect_regex", "header_regex"):
        if key in e:
            try:
                re.compile(e[key], re.MULTILINE)
            except re.error as exc:
                raise ProbeError(2, "probe %s: %s is not a valid regex: %s" % (pid, key, exc))
    for key in ("compile_cmd", "plant_cmd", "gate"):
        if key in e:
            _single_line(e[key], "probe %s: %s" % (pid, key))
    if "gate" not in e and not e.get("gate_targets"):
        raise ProbeError(2, "probe %s: needs gate or gate_targets" % pid)
    for t in e.get("gate_targets", []):
        if not isinstance(t, str) or not _TARGET_RE.match(t):
            raise ProbeError(2, "probe %s: invalid gate target %r" % (pid, t))
    if kind == "generated-drift" and not e.get("header_regex"):
        raise ProbeError(2, "probe %s: generated-drift needs header_regex" % pid)
    if kind == "arch-import":
        if not e.get("file") or "content" not in e:
            raise ProbeError(2, "probe %s: arch-import needs file and content" % pid)
        _rel_path(pid, e["file"])
    if kind == "custom" and (("plant_cmd" in e) == ("patch" in e)):
        raise ProbeError(2, "probe %s: custom needs exactly one of plant_cmd or patch" % pid)


def _rel_path(pid, rel):
    parts = rel.split("/")
    if rel.startswith("/") or ".." in parts or (parts and parts[0] == ".git") or "\0" in rel:
        raise ProbeError(2, "probe %s: file must be a worktree-relative path: %r" % (pid, rel))
    return rel


# ---- planning --------------------------------------------------------------

def read_targets(path):
    """Ordered list of (name, cmd, status)."""
    rows = []
    try:
        with open(path) as fh:
            for line in fh:
                line = line.rstrip("\n")
                if not line:
                    continue
                cols = line.split("\t")
                if cols[0] in ("SETUP", "NEEDS_SETUP"):
                    continue
                if len(cols) < 2 or not _TARGET_RE.match(cols[0]) or not cols[1]:
                    raise ProbeError(2, "%s: bad target line: %r" % (path, line))
                status = cols[2] if len(cols) > 2 else ""
                rows.append((cols[0], cols[1], status))
    except (IOError, OSError) as exc:
        raise ProbeError(2, "cannot read targets file %s: %s" % (path, exc))
    return rows


def tracked_files(worktree):
    try:
        proc = subprocess.run(["git", "-C", worktree, "ls-files", "-z"], stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE)
    except OSError as exc:
        raise ProbeError(3, "cannot run git: %s" % exc.strerror)
    if proc.returncode != 0:
        raise ProbeError(3, "git ls-files failed in %s: %s" % (
            worktree, proc.stderr.decode("utf-8", "replace").strip()))
    names = [n for n in proc.stdout.decode("utf-8", "replace").split("\0") if n]
    return sorted(names)


def find_generated(worktree, header_regex):
    rx = re.compile(header_regex, re.MULTILINE)
    for rel in tracked_files(worktree):
        parts = rel.split("/")
        if any(p in SKIP_DIRS for p in parts[:-1]):
            continue
        ext = parts[-1].rsplit(".", 1)[-1] if "." in parts[-1] else ""
        if ext not in COMMENT:
            continue
        path = os.path.join(worktree, rel)
        if os.path.islink(path) or not os.path.isfile(path):
            continue
        head = []
        try:
            with open(path, "rb") as fh:
                for _ in range(5):
                    line = fh.readline()
                    if not line:
                        break
                    head.append(line.decode("utf-8", "replace"))
        except (IOError, OSError):
            continue
        if rx.search("".join(head)):
            return rel, COMMENT[ext]
    return None, None


def plan_one(pid, e, worktree, targets, timeout_s):
    src, kind = e["_src"], e["kind"]
    names = [e["gate"]] if "gate" in e else list(e.get("gate_targets", []))
    gate = None
    for name in names:
        for t in targets:
            if t[0] == name:
                gate = t
                break
        if gate:
            break
    out = {"id": pid, "src": src, "kind": kind, "gate_name": gate[0] if gate else "-"}
    action = None
    if kind == "generated-drift":
        rel, comment = find_generated(worktree, e["header_regex"])
        if rel is None:
            out["skip"] = "no-generated-file"
            return out
        action = {"type": "append", "file": rel, "text": "\n%s %s\n" % (comment, PROBE_TEXT)}
    elif kind == "arch-import":
        action = {"type": "write", "file": e["file"], "content": e["content"]}
    elif "plant_cmd" in e:
        action = {"type": "cmd", "cmd": e["plant_cmd"]}
    else:
        patch = e["patch"]
        if not os.path.isabs(patch):
            patch = os.path.join(e["_base"], patch)
        if src == "repo":
            real_wt = os.path.realpath(worktree)
            if not os.path.realpath(patch).startswith(real_wt + os.sep):
                raise ProbeError(2, "probe %s: a repo probe patch must stay inside the worktree" % pid)
        if not os.path.isfile(patch):
            raise ProbeError(2, "probe %s: patch file not found: %s" % (pid, patch))
        action = {"type": "patch", "file": os.path.abspath(patch)}
    if gate is None:
        out["skip"] = "no-gate"
        return out
    if gate[2] == "failed":
        out["skip"] = "baseline-failed"
        return out
    out.update({"gate_cmd": gate[1], "expect_regex": e["expect_regex"]})
    if e.get("compile_cmd"):
        out["compile_cmd"] = e["compile_cmd"]
    out.update({"action": action, "baseline_passed": gate[2] == "passed", "timeout_s": timeout_s})
    return out


def plan(worktree, targets_file, driver_files, timeout_s, log):
    if not os.path.isdir(worktree):
        raise ProbeError(3, "worktree not found: %s" % worktree)
    targets = read_targets(targets_file)
    builtin = load_file(REGISTRY, "builtin")
    drivers = []
    for path in driver_files:
        if not os.path.isfile(path):
            raise ProbeError(2, "driver probes file not found: %s" % path)
        drivers.extend(load_file(path, "driver"))
    repo_path = os.path.join(worktree, REPO_PROBES)
    repo = load_file(repo_path, "repo") if os.path.isfile(repo_path) else []
    merged = merge(builtin, drivers, repo, log)
    lines = []
    for pid, e in merged.items():
        if e["_src"] == "builtin" and not e.get("auto"):
            # Documentation defaults; a driver entry with this id activates it.
            continue
        validate(pid, e)
        lines.append(json.dumps(plan_one(pid, e, worktree, targets, timeout_s), sort_keys=True))
    return lines


# ---- run-probe helpers -----------------------------------------------------

def parse_json(text):
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise ProbeError(2, "probe JSON is invalid: %s" % exc)
    if not isinstance(data, dict) or not isinstance(data.get("id"), str) or not _ID_RE.match(data["id"]):
        raise ProbeError(2, "probe JSON needs a valid id")
    return data


def fields(data):
    vals = dict((k, data[k]) for k in FIELD_KEYS if k in data)
    action = data.get("action")
    if isinstance(action, dict):
        vals["action_type"] = action.get("type", "")
        if action.get("type") == "cmd":
            vals["plant_cmd"] = action.get("cmd", "")
    if "baseline_passed" in vals:
        vals["baseline_passed"] = "true" if vals["baseline_passed"] is True else "false"
    out = []
    for k in FIELD_KEYS:
        if k in vals:
            v = vals[k]
            if isinstance(v, bool) or not isinstance(v, (str, int)):
                raise ProbeError(2, "probe %s: field %s has a bad type" % (data["id"], k))
            out.append("%s\t%s\n" % (k, _single_line(str(v), "probe %s: %s" % (data["id"], k))))
    return "".join(out)


def _inside(worktree, rel):
    real_wt = os.path.realpath(worktree)
    path = os.path.join(real_wt, rel)
    parent = os.path.realpath(os.path.dirname(path))
    if parent != real_wt and not parent.startswith(real_wt + os.sep):
        raise ProbeError(2, "plant target escapes the worktree: %s" % rel)
    if os.path.islink(path):
        raise ProbeError(2, "plant target is a symlink: %s" % rel)
    return path


def plant(worktree, data):
    action = data.get("action")
    if not isinstance(action, dict):
        raise ProbeError(2, "probe %s: no action" % data["id"])
    kind = action.get("type")
    if kind in ("append", "write"):
        rel = _rel_path(data["id"], str(action.get("file", "")))
        if kind == "write":
            # Check the deepest existing ancestor before creating directories,
            # so a symlinked directory cannot redirect the plant outside W.
            real_wt = os.path.realpath(worktree)
            parent = os.path.dirname(os.path.join(real_wt, rel))
            probe = parent
            while not os.path.exists(probe):
                probe = os.path.dirname(probe)
            real_probe = os.path.realpath(probe)
            if real_probe != real_wt and not real_probe.startswith(real_wt + os.sep):
                raise ProbeError(2, "plant target escapes the worktree: %s" % rel)
            os.makedirs(parent, exist_ok=True)
        path = _inside(worktree, rel)
        text = action.get("text" if kind == "append" else "content")
        if not isinstance(text, str):
            raise ProbeError(2, "probe %s: action text must be a string" % data["id"])
        with open(path, "a" if kind == "append" else "w") as fh:
            fh.write(text)
        return 0
    if kind == "patch":
        proc = subprocess.run(["git", "-C", worktree, "apply", "--whitespace=nowarn",
                               str(action.get("file", ""))],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0:
            sys.stderr.write("probes: git apply failed: %s\n" % proc.stderr.decode("utf-8", "replace").strip())
            return 1
        return 0
    raise ProbeError(2, "probe %s: plant cannot apply action type %r" % (data["id"], kind))


def match(data, log_path):
    rx = data.get("expect_regex")
    if not isinstance(rx, str) or not rx:
        raise ProbeError(2, "probe %s: expect_regex is required" % data["id"])
    try:
        with open(log_path, "rb") as fh:
            text = fh.read().decode("utf-8", "replace")
    except (IOError, OSError) as exc:
        raise ProbeError(2, "cannot read gate log %s: %s" % (log_path, exc))
    try:
        return 0 if re.search(rx, text, re.MULTILINE) else 1
    except re.error as exc:
        raise ProbeError(2, "probe %s: bad expect_regex: %s" % (data["id"], exc))


# ---- CLI -------------------------------------------------------------------

def _opts(args, single, multi=()):
    opts = {}
    i = 0
    while i < len(args):
        a = args[i]
        if (a in single or a in multi) and i + 1 < len(args):
            if a in multi:
                opts.setdefault(a, []).append(args[i + 1])
            else:
                opts[a] = args[i + 1]
            i += 2
            continue
        raise ProbeError(2, "unknown or incomplete option: %s" % a)
    return opts


def _logger(log_file):
    def log(msg):
        sys.stderr.write("probes: %s\n" % msg)
        if log_file:
            try:
                with open(log_file, "a") as fh:
                    fh.write("%s verify %s\n" % (runstate.iso(), msg))
            except (IOError, OSError, runstate.RunStateError):
                pass
    return log


def run_cli(argv):
    if not argv:
        raise ProbeError(2, "usage: probes.py plan|fields|plant|match ...")
    cmd, args = argv[0], argv[1:]
    if cmd == "plan":
        opts = _opts(args, ("--worktree", "--targets-file", "--timeout-s", "--log"), ("--driver-probes",))
        if "--worktree" not in opts or "--targets-file" not in opts:
            raise ProbeError(2, "usage: probes.py plan --worktree W --targets-file T "
                                "[--driver-probes FILE]... [--timeout-s N] [--log FILE]")
        try:
            timeout_s = int(opts.get("--timeout-s", DEFAULT_TIMEOUT_S))
        except ValueError:
            raise ProbeError(2, "--timeout-s must be an integer")
        if timeout_s < 1:
            raise ProbeError(2, "--timeout-s must be >= 1")
        for line in plan(opts["--worktree"], opts["--targets-file"], opts.get("--driver-probes", []),
                         timeout_s, _logger(opts.get("--log"))):
            sys.stdout.write(line + "\n")
        return 0
    if cmd == "fields":
        if len(args) != 1:
            raise ProbeError(2, "usage: probes.py fields JSON")
        sys.stdout.write(fields(parse_json(args[0])))
        return 0
    if cmd == "plant":
        opts = _opts(args, ("--worktree", "--json"))
        if "--worktree" not in opts or "--json" not in opts:
            raise ProbeError(2, "usage: probes.py plant --worktree W --json JSON")
        return plant(opts["--worktree"], parse_json(opts["--json"]))
    if cmd == "match":
        opts = _opts(args, ("--json", "--log"))
        if "--json" not in opts or "--log" not in opts:
            raise ProbeError(2, "usage: probes.py match --json JSON --log FILE")
        return match(parse_json(opts["--json"]), opts["--log"])
    raise ProbeError(2, "unknown command: %s" % cmd)


def main(argv):
    try:
        return run_cli(argv[1:])
    except ProbeError as exc:
        sys.stderr.write("probes: %s\n" % exc)
        return exc.code
    except (IOError, OSError) as exc:
        sys.stderr.write("probes: %s\n" % exc)
        return 3


if __name__ == "__main__":
    sys.exit(main(sys.argv))
