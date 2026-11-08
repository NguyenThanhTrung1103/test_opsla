"""Govern: disk floor, resource level, docker attribution, allowlist cleanup
and keep-awake. Nothing here stops a container or kills a process; docker
volumes and containers are only ever reported.

CLI (every printed machine line is also appended to --jsonl as one JSON row
{"ts", "cmd", "line": <first word>, <key>: <value>...}):
  check     --repo R [--rundir D] [--path P] [--agents N] [--pane-pid P]... [--jsonl F]
            -> DISK ..., then RESOURCE ... (unless resources.check is false)
  attribute --repo R [--rundir D] [--project NAME] [--pane-pid P]... [--jsonl F]
            -> ATTRIB ... (size desc), ATTRIB_SUMMARY ..., DSTAT ..., TOP ...
  clean     --repo R [--rundir D] [--path P] [--mode dry-run|apply|auto]
            [--only id,...] [--until-free-gb N] [--all] [--policy F]
            [--project NAME] [--jsonl F]
            -> ATTRIB_SUMMARY ..., CLEAN ... per entry, CLEAN_SUMMARY ...
               (an entry whose cache a running process uses is skipped
               with reason=in-use:<pid>:<cmd>)
  awake     --pid P [--jsonl F]
            -> AWAKE pid=<n> method=<caffeinate|systemd-inhibit|none>
               status=<started|exists|skipped>   (exit 3 when P is not running)
  roots     [--policy F]
            -> ROOT id=<id> root=<dir> / TARGET id=<id> path=<p> (read-only)
TDRIVE_DRY_RUN=1 forces clean into dry-run and awake into a DRY line. A
--policy other than the shipped one or a file under
${XDG_CONFIG_HOME:-~/.config}/tdrive/ forces dry-run (reason=untrusted-policy).
With TDRIVE_TEST=1 every cleanup target must lie under TDRIVE_TEST_ROOT.
Exit codes: 0 ok, 2 usage or config error, 3 environment (df failed, dead pid).
"""
import fcntl
import fnmatch
import glob
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import config  # noqa: E402
import disk  # noqa: E402
import resources  # noqa: E402
import runstate  # noqa: E402
import trace  # noqa: E402
import yamlite  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
SHIPPED_POLICY = os.path.join(ROOT, "policies", "safe-cleanup.yaml")
DOCKER_TIMEOUT_S = 30
DU_TIMEOUT_S = 30
CMD_TIMEOUT_S = 600
GIT_TIMEOUT_S = 120
ROOT_CMD_TIMEOUT_S = 30
INSPECT_BATCH = 50
AWAKE_SETTLE_S = 3
DISK_ADVICE = {"one-implementer": "max_implementers=1", "pause": "pause-dispatch", "alert": "alert"}
_SI = {"B": 1, "KB": 1000, "MB": 1000 ** 2, "GB": 1000 ** 3, "TB": 1000 ** 4, "PB": 1000 ** 5}
_SI_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*([kKMGTP]?B)\s*$")
_RECLAIMED_RE = re.compile(r"^Total(?: reclaimed space)?:\s*([0-9]+(?:\.[0-9]+)?\s*[kKMGTP]?B)\s*$", re.M)
_VERSION_RE = re.compile(r"([0-9]+)\.")
_PROJECT_RE = re.compile(r"[^a-z0-9_-]")
ENTRY_KEYS = set((
    "id", "platform", "requires", "root", "root_darwin", "root_linux", "root_cmd", "target_self",
    "root_env", "root_env_children", "match", "paths", "find", "source", "max_age_min", "clean",
    "clean_cmd", "version_cmd", "clean_cmd_min_major", "measure", "guard", "items"))
ITEM_KEYS = set(("name", "platform", "process", "bundle_id", "root", "paths", "match"))
GUARD_KEYS = set(("process_absent", "exact_process_absent", "process_args_absent", "targets_not_in_use",
                  "app_not_running", "docker"))
PS_ARGS_CMD = ["ps", "-Aww", "-o", "pid,ppid,etime,args"]


class GovernError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def log(msg):
    sys.stderr.write("govern: %s\n" % msg)


# ---- output -----------------------------------------------------------------

class Emitter(object):
    """Print machine lines and append each one to govern.jsonl; when that
    file is a run's govern.jsonl, each row is also a `govern` trace event
    (with the trace-only extra fields)."""

    def __init__(self, cmd, jsonl):
        self.cmd = cmd
        self.jsonl = jsonl
        self.run = None
        if jsonl:
            d = os.path.dirname(os.path.abspath(jsonl))
            run = os.path.basename(d)
            try:
                if runstate.valid_run(run) and os.path.abspath(runstate.run_dir(run)) == d:
                    self.run = run
            except runstate.RunStateError:
                self.run = None

    @property
    def tracing(self):
        return self.run is not None

    def __call__(self, kind, fields, extra=None):
        sys.stdout.write(resources.render(kind, fields) + "\n")
        sys.stdout.flush()
        if not self.jsonl:
            return
        row = {"ts": runstate.iso(), "cmd": self.cmd, "line": kind}
        for k, v in fields:
            row[k] = v
        if self.run:
            data = dict((k, v) for k, v in row.items() if k != "ts")
            for k, v in (extra or {}).items():
                if v is not None:
                    data[k] = v
            trace.emit(self.run, "govern", "govern", data)
        data = (json.dumps(row, sort_keys=False) + "\n").encode("utf-8")
        try:
            old = os.umask(0o077)
            try:
                fd = os.open(self.jsonl, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            finally:
                os.umask(old)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX)
                os.write(fd, data)
            finally:
                os.close(fd)
        except OSError as exc:
            log("cannot append to %s: %s" % (self.jsonl, exc.strerror))


# ---- helpers -----------------------------------------------------------------

def si_bytes(text):
    """Bytes from a docker SI size (`4.163GB`, `242.8kB`, `0B`), or None."""
    m = _SI_RE.match(text or "")
    if not m:
        return None
    return int(round(float(m.group(1)) * _SI[m.group(2).upper()]))


def parse_labels(text):
    """docker's comma-joined labels: split on `,`, then on the first `=`."""
    out = {}
    for part in (text or "").split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v
    return out


def normalize_project(name):
    return _PROJECT_RE.sub("", name.lower())


def compose_project(cfg, repo):
    p = cfg.values["govern.compose_project"][0]
    return p if p else normalize_project(os.path.basename(os.path.abspath(repo)))


def which(tool):
    return shutil.which(tool) is not None


def home():
    return os.path.realpath(os.path.expanduser("~"))


def tmpdir():
    return os.environ.get("TMPDIR", "") or "/tmp"


def expand_path(p):
    if p == "~" or p.startswith("~/"):
        p = os.path.expanduser("~") + p[1:]
    for var, val in (("$TMPDIR", tmpdir()), ("$HOME", os.path.expanduser("~"))):
        if p == var or p.startswith(var + "/"):
            p = val.rstrip("/") + p[len(var):]
    return p


def pid_alive(pid):
    """True when pid exists. Signal 0 only checks; it never signals."""
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError as exc:
        return exc.errno == 1  # EPERM: alive, owned by someone else
    return True


def running(args):
    """pgrep ARGS: True unless pgrep says no match (fail-safe)."""
    rc, _out, _err = resources.quick(["pgrep"] + list(args))
    return rc != 1


def args_table():
    """[(pid, args)] of every process except this one and its ancestors (whose
    args hold our own --repo path), or None when ps fails."""
    rc, out, err = resources.quick(PS_ARGS_CMD)
    if rc != 0:
        log("ps failed (exit %d): %s" % (rc, err.strip()[:200]))
        return None
    rows = []
    for line in out.splitlines():
        parts = line.split(None, 3)
        if len(parts) == 4 and parts[0].isdigit() and parts[1].isdigit():
            rows.append((int(parts[0]), int(parts[1]), parts[3].strip()))
    parent = dict((pid, ppid) for pid, ppid, _a in rows)
    mine = set()
    cur = os.getpid()
    while cur > 0 and cur not in mine:
        mine.add(cur)
        cur = parent.get(cur, 0)
    return [(pid, args) for pid, _pp, args in rows if pid not in mine]


def path_in_args(args, path):
    """True when args name path or something below it."""
    return re.search(r"(^|[\s=:])" + re.escape(path.rstrip(os.sep)) + r"(/|\s|$)", args) is not None


def du_kb(path):
    if not os.path.lexists(path):
        return 0
    if os.path.islink(path):
        return 0
    rc, out, _err = resources.bounded(["du", "-sk", path], DU_TIMEOUT_S)
    if rc != 0:
        return None
    first = out.split()[:1]
    return int(first[0]) if first and first[0].isdigit() else None


def du_sum(paths):
    total = 0
    for p in paths:
        kb = du_kb(p)
        if kb is None:
            return None
        total += kb
    return total


def load_config(repo, rundir):
    try:
        return config.Config(repo, rundir)
    except config.ConfigError as exc:
        raise GovernError(exc.code, str(exc))


def disk_path(cfg, repo, path):
    p = path or cfg.values["govern.disk_path"][0] or repo
    return os.path.abspath(p)


def disk_state(cfg, path):
    """(level, rank, free_kb) at path."""
    floors = (cfg.values["floors.one_implementer_gb"][0], cfg.values["floors.pause_gb"][0],
              cfg.values["floors.alert_gb"][0])
    try:
        kb = disk.free_kb(path)
    except disk.DiskError as exc:
        raise GovernError(3, str(exc))
    level, rank = disk.level_for(kb, *floors)
    return level, rank, kb


# ---- check ---------------------------------------------------------------------

def cmd_check(o, emit):
    cfg = load_config(o["repo"], o["rundir"])
    path = disk_path(cfg, o["repo"], o["path"])
    level, rank, kb = disk_state(cfg, path)
    advice = DISK_ADVICE.get(level, "max_implementers=%d" % cfg.values["run.max_implementers"][0])
    emit("DISK", [("path", path), ("free_gb", "%.1f" % disk.gb(kb)), ("level", level), ("advice", advice)])
    if cfg.values["resources.check"][0]:
        kind, fields, detail = resources.check_detail(cfg.values, o["agents"], o["pids"], rank)
        emit(kind, fields, detail)
    return 0


# ---- attribution -----------------------------------------------------------------

def docker_json_lines(args):
    rc, out, err = resources.bounded(["docker"] + args, DOCKER_TIMEOUT_S)
    if rc != 0:
        log("docker %s failed (exit %d): %s" % (args[0], rc, err.strip()[:200]))
        return None
    rows = []
    for line in out.splitlines():
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except ValueError:
                log("unparsable docker line: %s" % line[:120])
    return rows


def attribution(project):
    """(ATTRIB entries, (ours, other), docker_ok, container name -> project)."""
    if not which("docker"):
        return [], (0, 0), False, {}
    containers = docker_json_lines(["ps", "-a", "--format", "{{json .}}"])
    if containers is None:
        return [], (0, 0), False, {}
    volumes = docker_json_lines(["volume", "ls", "--format", "{{json .}}"]) or []
    names = [v.get("Name", "") for v in volumes if v.get("Name")]
    inspected = {}
    for i in range(0, len(names), INSPECT_BATCH):
        rc, out, _err = resources.bounded(["docker", "volume", "inspect"] + names[i:i + INSPECT_BATCH],
                                          DOCKER_TIMEOUT_S)
        try:
            for v in json.loads(out) if out.strip() else []:
                inspected[v.get("Name")] = v.get("Labels") or {}
        except ValueError:
            log("unparsable docker volume inspect output (exit %d)" % rc)
    sizes = {"volume": {}, "container": {}}
    rc, out, _err = resources.bounded(["docker", "system", "df", "-v", "--format", "{{json .}}"],
                                      DOCKER_TIMEOUT_S)
    if rc == 0:
        try:
            df = json.loads(out)
        except ValueError:
            df = {}
        for v in df.get("Volumes") or []:
            sizes["volume"][v.get("Name")] = si_bytes(v.get("Size"))
        for c in df.get("Containers") or []:
            sizes["container"][c.get("Names")] = si_bytes(c.get("Size"))
    entries = []
    project_of = {}
    for kind, rows, key in (("volume", volumes, "Name"), ("container", containers, "Names")):
        for row in rows:
            name = row.get(key) or "?"
            labels = inspected.get(name) if kind == "volume" and name in inspected else parse_labels(row.get("Labels"))
            proj = (labels or {}).get("com.docker.compose.project") or None
            if kind == "container":
                project_of[name] = proj
            entries.append((kind, name, proj, sizes[kind].get(name)))
    entries.sort(key=lambda e: (-(e[3] if e[3] is not None else -1), e[0], e[1]))
    ours = other = 0
    lines = []
    for kind, name, proj, size in entries:
        mine = proj is not None and proj == project
        if size is not None:
            if mine:
                ours += size
            else:
                other += size
        lines.append(("ATTRIB", [("kind", kind), ("name", name), ("project", proj or "-"),
                                 ("owner", "ours" if mine else "other"),
                                 ("size_bytes", "?" if size is None else size)]))
    return lines, (ours, other), True, project_of


def summary_fields(totals, ok):
    return [("ours_bytes", totals[0]), ("other_bytes", totals[1]), ("docker", "ok" if ok else "unavailable")]


def cmd_attribute(o, emit):
    cfg = load_config(o["repo"], o["rundir"])
    project = o["project"] or compose_project(cfg, o["repo"])
    lines, totals, ok, project_of = attribution(project)
    for kind, fields in lines:
        emit(kind, fields)
    emit("ATTRIB_SUMMARY", summary_fields(totals, ok))
    if ok:
        for kind, fields in resources.dstat_lines(project_of, project) or []:
            emit(kind, fields)
    for kind, fields in resources.top_lines(resources.process_table(), o["pids"]):
        emit(kind, fields)
    return 0


# ---- policy ------------------------------------------------------------------------

def policy_trusted(path):
    real = os.path.realpath(path)
    if real == os.path.realpath(SHIPPED_POLICY):
        return True
    xdg = os.environ.get("XDG_CONFIG_HOME", "") or os.path.join(os.path.expanduser("~"), ".config")
    udir = os.path.realpath(os.path.join(xdg, "tdrive"))
    return real.startswith(udir + os.sep)


def _str_list(v, what):
    if v is None:
        return []
    if not isinstance(v, list) or not all(isinstance(x, (str, int, float)) for x in v):
        raise GovernError(2, "%s must be a list of strings" % what)
    return [str(x) for x in v]


def load_policy(path, plat):
    """Entries in order; app-caches items become entries `<id>:<name>`, and
    items for another platform are dropped (they are per-platform variants)."""
    try:
        data = yamlite.load(path)
    except yamlite.YamlError as exc:
        raise GovernError(2, str(exc))
    except (IOError, OSError) as exc:
        raise GovernError(2, "cannot read policy %s: %s" % (path, exc.strerror))
    if not isinstance(data, dict) or not isinstance(data.get("entries"), list):
        raise GovernError(2, "%s: top level needs an `entries` list" % path)
    entries = []
    seen = set()
    for e in data["entries"]:
        if not isinstance(e, dict) or not e.get("id"):
            raise GovernError(2, "%s: every entry needs an id" % path)
        extra = set(e) - ENTRY_KEYS
        if extra:
            raise GovernError(2, "%s: entry %s has unknown field(s): %s" % (path, e["id"], ", ".join(sorted(extra))))
        guard = e.get("guard") or {}
        if not isinstance(guard, dict) or set(guard) - GUARD_KEYS:
            raise GovernError(2, "%s: entry %s has a bad guard" % (path, e["id"]))
        for key in ("requires", "root_cmd", "paths", "clean_cmd", "version_cmd"):
            e[key] = _str_list(e.get(key), "%s.%s" % (e["id"], key))
        for key in ("process_absent", "exact_process_absent", "process_args_absent"):
            guard[key] = _str_list(guard.get(key), "%s.guard.%s" % (e["id"], key))
        try:
            guard["args_rx"] = [re.compile(x) for x in guard["process_args_absent"]]
        except re.error as exc:
            raise GovernError(2, "%s: entry %s: bad process_args_absent regex: %s" % (path, e["id"], exc))
        if not isinstance(guard.get("targets_not_in_use", False), bool):
            raise GovernError(2, "%s: entry %s: targets_not_in_use must be true or false" % (path, e["id"]))
        e["guard"] = guard
        if e.get("clean", "remove-paths") not in ("remove-paths", "remove-worktrees"):
            raise GovernError(2, "%s: entry %s: clean must be remove-paths or remove-worktrees" % (path, e["id"]))
        if e.get("measure", "du") not in ("du", "docker-reclaimed"):
            raise GovernError(2, "%s: entry %s: measure must be du or docker-reclaimed" % (path, e["id"]))
        items = e.get("items")
        if items is None:
            subs = [e]
        else:
            if not isinstance(items, list):
                raise GovernError(2, "%s: entry %s: items must be a list" % (path, e["id"]))
            subs = []
            for it in items:
                if not isinstance(it, dict) or not it.get("name") or set(it) - ITEM_KEYS:
                    raise GovernError(2, "%s: entry %s has a bad item" % (path, e["id"]))
                if it.get("platform", "any") not in ("any", plat):
                    continue
                sub = dict(e)
                sub.pop("items")
                sub.update({"id": "%s:%s" % (e["id"], it["name"]), "group": e["id"],
                            "platform": it.get("platform", e.get("platform", "any")),
                            "root": it.get("root"), "paths": _str_list(it.get("paths"), "item paths"),
                            "match": it.get("match", "*"), "item": it})
                subs.append(sub)
        for sub in subs:
            sub.setdefault("group", sub["id"])
            key = (sub["id"], sub.get("platform", "any"))
            if key in seen:
                raise GovernError(2, "%s: duplicate entry %s" % (path, sub["id"]))
            seen.add(key)
            entries.append(sub)
    return entries


# ---- targets and safety ------------------------------------------------------------

def _under(path, root):
    return path.startswith(root.rstrip(os.sep) + os.sep)


def unsafe_reason(target, root, match, allow_git_file=False):
    """None when target may be removed, else a short reason."""
    parent = os.path.realpath(os.path.dirname(os.path.abspath(target)))
    loc = os.path.join(parent, os.path.basename(os.path.abspath(target)))
    if not os.path.islink(loc):
        loc = os.path.realpath(loc)
    rroot = os.path.realpath(root)
    if not _under(loc, rroot):
        return "outside-root"
    if not fnmatch.fnmatchcase(os.path.basename(loc), match):
        return "no-match"
    h = home()
    if loc in (os.sep, h, os.path.join(h, "Library"), os.path.join(h, "Library", "Caches")) \
            or os.path.dirname(loc) == h:
        return "denylisted"
    gitp = os.path.join(loc, ".git")
    if not os.path.islink(loc) and os.path.lexists(gitp):
        if not (allow_git_file and os.path.isfile(gitp) and not os.path.islink(gitp)):
            return "repo-root"
    if os.environ.get("TDRIVE_TEST") == "1":
        troot = os.path.realpath(os.environ.get("TDRIVE_TEST_ROOT", "") or "/nonexistent")
        if not _under(loc, troot):
            return "outside-test-root"
    return None


def worktree_records(e):
    """[(path, repo, tsv)] of recorded verify worktrees with a dead pid that
    are older than max_age_min."""
    now = runstate.now()
    max_age = int(e.get("max_age_min", 120)) * 60
    out = []
    for tsv in sorted(glob.glob(os.path.join(glob.escape(runstate.state_dir()), "runs", "*", "verify",
                                             "worktrees.tsv"))):
        try:
            with open(tsv) as fh:
                lines = [ln.rstrip("\n") for ln in fh if ln.strip()]
        except (IOError, OSError):
            continue
        for ln in lines:
            parts = ln.split("\t")
            if len(parts) != 4 or not parts[2].isdigit() or not parts[3].isdigit():
                log("skipping a malformed line in %s" % tsv)
                continue
            path, repo, pid, started = parts[0], parts[1], int(parts[2]), int(parts[3])
            if pid_alive(pid) or now - started <= max_age:
                continue
            out.append((path, repo, tsv))
    return out


def resolve_root(e, plat):
    """(root, targets, error_reason). targets may be [] (nothing to clean)."""
    if e.get("source") == "recorded-worktrees":
        root = expand_path(e.get("root") or "$TMPDIR")
        return root, worktree_records(e), None
    root = None
    paths = e["paths"]
    env_name = e.get("root_env")
    if env_name and os.environ.get(env_name):
        cand = os.environ[env_name]
        try:
            kids = os.listdir(cand)
        except OSError:
            kids = None
        rx = re.compile(e.get("root_env_children") or "^$")
        if kids and all(rx.search(k) for k in kids):
            return cand, [os.path.join(cand, k) for k in sorted(kids)], None
        log("%s=%s does not look like a browser dir; using the default root" % (env_name, cand))
    if e.get("root_cmd"):
        if e["root_cmd"][0] and not which(e["root_cmd"][0]):
            return None, [], "tool-absent"
        rc, out, _err = resources.bounded(e["root_cmd"], ROOT_CMD_TIMEOUT_S, cwd=os.path.expanduser("~"))
        lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
        if rc != 0 or len(lines) != 1 or not os.path.isabs(expand_path(lines[0])):
            return None, [], "root-unresolved"
        root = expand_path(lines[0])
        if e.get("target_self"):
            if not os.path.isdir(root):
                return os.path.dirname(root.rstrip(os.sep)), [], None
            return os.path.dirname(root.rstrip(os.sep)), [root.rstrip(os.sep)], None
    else:
        root = e.get("root_%s" % plat) or e.get("root")
        if not root:
            return None, [], None
        root = expand_path(root)
    if not os.path.isdir(root):
        return root, [], None
    targets = []
    if e.get("find"):
        f = e["find"]
        cutoff = runstate.now() - int(f.get("min_age_min", 0)) * 60
        for name in sorted(os.listdir(root)):
            p = os.path.join(root, name)
            if os.path.isdir(p) and not os.path.islink(p) and fnmatch.fnmatchcase(name, f.get("name", "*")):
                try:
                    if int(os.lstat(p).st_mtime) < cutoff:
                        targets.append(p)
                except OSError:
                    continue
    for pat in paths:
        for p in sorted(glob.glob(os.path.join(glob.escape(root), pat))):
            if p not in targets:
                targets.append(p)
    return root, targets, None


# ---- clean ------------------------------------------------------------------------

def app_running(bundle_id, process, plat):
    """True when the app may be running (fail-safe)."""
    if plat == "darwin" and bundle_id and which("lsappinfo"):
        rc, out, _err = resources.quick(["lsappinfo", "find", "bundleid=%s" % bundle_id])
        return rc != 0 or bool(out.strip())
    if process:
        return running(["-x", process])
    return True


def tool_major(cmd):
    rc, out, _err = resources.bounded(cmd, ROOT_CMD_TIMEOUT_S, cwd=os.path.expanduser("~"))
    m = _VERSION_RE.search(out) if rc == 0 else None
    return int(m.group(1)) if m else None


def remove_target(p):
    if os.path.islink(p) or not os.path.isdir(p):
        os.unlink(p)
    else:
        shutil.rmtree(p)


def drop_worktree_record(tsv, path):
    fd = os.open(tsv + ".lock", os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        with open(tsv) as fh:
            lines = [ln.rstrip("\n") for ln in fh if ln.strip()]
        keep = [ln for ln in lines if ln.split("\t", 1)[0] != path]
        tmp = "%s.tmp.%d" % (tsv, os.getpid())
        with open(tmp, "w") as fh:
            fh.write("".join(ln + "\n" for ln in keep))
        os.replace(tmp, tsv)
    finally:
        os.close(fd)


class Cleaner(object):
    def __init__(self, cfg, o, mode, reason, docker_ok):
        self.cfg = cfg
        self.o = o
        self.mode = mode
        self.reason = reason
        self.docker_ok = docker_ok
        self.plat = resources.platform()
        self.dpath = disk_path(cfg, o["repo"], o["path"])
        tgt = o["until_free_gb"]
        self.target_gb = cfg.values["govern.target_free_gb"][0] if tgt is None else tgt
        self.last_root = None
        self._args = None

    def consumers(self, root):
        """[{pid, cmd}] of the processes whose args reference root (for the
        trace; one process table per clean), or None when ps is unreadable."""
        if self._args is None:
            rows = args_table()
            self._args = rows if rows is not None else False
        if self._args is False:
            return None
        paths = []
        for p in (os.path.abspath(root), os.path.realpath(root)):
            if p not in paths:
                paths.append(p)
        out = []
        for pid, args in self._args:
            if any(path_in_args(args, p) for p in paths):
                out.append({"pid": pid, "cmd": resources.comm_name(args.split(None, 1)[0]) if args else "?"})
        return out

    def line(self, e, status, reason="-", before="-", after="-", freed=0):
        return ("CLEAN", [("id", e["id"]), ("mode", self.mode), ("status", status), ("reason", reason),
                          ("before_kb", "?" if before is None else before),
                          ("after_kb", "?" if after is None else after), ("freed_kb", freed)])

    def target_reached(self):
        try:
            kb = disk.free_kb(self.dpath)
        except disk.DiskError as exc:
            log("cannot measure free space: %s" % exc)
            return False
        return disk.gb(kb) >= self.target_gb

    def guard_blocks(self, e, targets=()):
        g = e["guard"]
        if g.get("docker") and not self.docker_ok:
            return "docker-unavailable"
        for pat in g["process_absent"]:
            if running(["-f", pat]):
                return "guard:process_absent"
        for name in g["exact_process_absent"]:
            if running(["-x", name]):
                return "guard:exact_process_absent"
        item = e.get("item")
        if item and app_running(item.get("bundle_id"), item.get("process"), self.plat):
            return "guard:app_not_running"
        return self.in_use(e, targets)

    def in_use(self, e, targets):
        """`in-use:<pid>:<cmd>` for the first process whose args match a
        process_args_absent regex or name a target (targets_not_in_use), a
        guard reason when the process table is unreadable, else None."""
        g = e["guard"]
        paths = []
        if g.get("targets_not_in_use"):
            for t in targets:
                for p in (os.path.abspath(t), os.path.realpath(t)):
                    if p not in paths:
                        paths.append(p)
        if not g["args_rx"] and not paths:
            return None
        rows = args_table()
        if rows is None:
            return "guard:process_args_absent" if g["args_rx"] else "guard:targets_not_in_use"
        for pid, args in rows:
            if any(rx.search(args) for rx in g["args_rx"]) or any(path_in_args(args, p) for p in paths):
                cmd = resources.comm_name(args.split(None, 1)[0]) if args else "?"
                log("%s: in use by pid %d (%s)" % (e["id"], pid, cmd))
                return "in-use:%d:%s" % (pid, cmd)
        return None

    def run(self, e):
        self.last_root = None
        plat = e.get("platform", "any")
        if plat not in ("any", self.plat):
            return self.line(e, "skipped", "platform")
        for tool in e["requires"]:
            if not which(tool):
                return self.line(e, "skipped", "tool-absent")
        if self.mode == "apply" and not self.o["all"] and self.target_reached():
            return self.line(e, "skipped", "target-reached")
        if e.get("measure") == "docker-reclaimed":
            return self.run_docker(e)
        root, recs, err = resolve_root(e, self.plat)
        if err:
            return self.line(e, "skipped" if err == "tool-absent" else "failed", err)
        self.last_root = root
        worktrees = e.get("source") == "recorded-worktrees"
        targets = [r[0] for r in recs] if worktrees else recs
        if not targets:
            return self.line(e, "skipped", "no-targets")
        match = e.get("match", "*")
        if e.get("root_env") and root == os.environ.get(e["root_env"]):
            match = "*"
        for t in targets:
            why = unsafe_reason(t, root, match, allow_git_file=worktrees)
            if why:
                log("%s: refusing %s (%s)" % (e["id"], t, why))
                return self.line(e, "failed", "unsafe-path")
        blocked = self.guard_blocks(e, targets)
        if blocked:
            return self.line(e, "skipped", blocked)
        if e["guard"].get("app_not_running"):
            targets = [t for t in targets
                       if not app_running(os.path.basename(t)[:-len(".ShipIt")] if t.endswith(".ShipIt")
                                          else os.path.basename(t), None, self.plat)]
            if not targets:
                return self.line(e, "skipped", "guard:app_not_running")
        before = du_sum(targets)
        if self.mode != "apply":
            return self.line(e, "would-clean", self.reason, before)
        failed = None
        if worktrees:
            failed = self.remove_worktrees([r for r in recs if r[0] in targets])
        elif e["clean_cmd"] and self.use_clean_cmd(e):
            rc, _out, err = resources.bounded(e["clean_cmd"], CMD_TIMEOUT_S, cwd=os.path.expanduser("~"))
            if rc != 0:
                log("%s: %s exited %d: %s" % (e["id"], " ".join(e["clean_cmd"]), rc, err.strip()[:200]))
                failed = "cmd-exit-%d" % rc
        else:
            for t in targets:
                try:
                    remove_target(t)
                except OSError as exc:
                    log("%s: cannot remove %s: %s" % (e["id"], t, exc.strerror))
                    failed = "remove-failed"
        after = du_sum(targets)
        freed = max(0, before - after) if before is not None and after is not None else 0
        return self.line(e, "failed" if failed else "ok", failed or "-", before, after, freed)

    def use_clean_cmd(self, e):
        if not e.get("clean_cmd_min_major"):
            return True
        major = tool_major(e["version_cmd"]) if e["version_cmd"] else None
        return major is not None and major >= int(e["clean_cmd_min_major"])

    def remove_worktrees(self, recs):
        failed = None
        repos = []
        for path, repo, tsv in recs:
            if os.path.lexists(path):
                rc, _out, err = resources.bounded(["git", "-C", repo, "worktree", "remove", "--force", path],
                                                  GIT_TIMEOUT_S)
                if rc != 0:
                    log("git worktree remove %s failed (exit %d): %s" % (path, rc, err.strip()[:200]))
                    failed = "git-failed"
                    continue
            if repo not in repos:
                repos.append(repo)
            try:
                drop_worktree_record(tsv, path)
            except (IOError, OSError) as exc:
                log("cannot update %s: %s" % (tsv, exc.strerror))
        for repo in repos:
            rc, _out, err = resources.bounded(["git", "-C", repo, "worktree", "prune"], GIT_TIMEOUT_S)
            if rc != 0:
                log("git worktree prune in %s failed (exit %d): %s" % (repo, rc, err.strip()[:200]))
        return failed

    def run_docker(self, e):
        blocked = self.guard_blocks(e)
        if blocked:
            return self.line(e, "skipped", blocked)
        if self.mode != "apply":
            return self.line(e, "would-clean", self.reason)
        rc, out, err = resources.bounded(e["clean_cmd"], CMD_TIMEOUT_S)
        if rc != 0:
            log("%s: %s exited %d: %s" % (e["id"], " ".join(e["clean_cmd"]), rc, err.strip()[:200]))
            return self.line(e, "failed", "cmd-exit-%d" % rc)
        m = _RECLAIMED_RE.search(out)
        freed = (si_bytes(m.group(1)) or 0) // 1024 if m else 0
        return self.line(e, "ok", "-", "-", "-", freed)


def select_entries(entries, only):
    if not only:
        return entries
    want = [x.strip() for x in only.split(",") if x.strip()]
    known = set(e["id"] for e in entries) | set(e["group"] for e in entries)
    bad = [w for w in want if w not in known]
    if bad:
        raise GovernError(2, "unknown cleanup id(s): %s" % ", ".join(bad))
    return [e for e in entries if e["id"] in want or e["group"] in want]


def cmd_clean(o, emit):
    cfg = load_config(o["repo"], o["rundir"])
    policy = o["policy"] or SHIPPED_POLICY
    entries = select_entries(load_policy(policy, resources.platform()), o["only"])
    mode = o["mode"] or cfg.values["govern.mode"][0]
    reason = "-"
    if mode == "auto":
        _lvl, rank, _kb = disk_state(cfg, disk_path(cfg, o["repo"], o["path"]))
        mode = "apply" if rank >= 2 else "dry-run"
    if os.environ.get("TDRIVE_DRY_RUN") == "1":
        mode = "dry-run"
    if not policy_trusted(policy):
        mode, reason = "dry-run", "untrusted-policy"
    project = o["project"] or compose_project(cfg, o["repo"])
    _lines, totals, docker_ok, _p = attribution(project)
    emit("ATTRIB_SUMMARY", summary_fields(totals, docker_ok))
    cl = Cleaner(cfg, o, mode, reason, docker_ok)
    freed = 0
    for e in entries:
        kind, fields = cl.run(e)
        freed += dict(fields)["freed_kb"]
        extra = None
        if emit.tracing and cl.last_root:
            cons = cl.consumers(cl.last_root)
            if cons is not None:
                extra = {"consumers": cons}
        emit(kind, fields, extra)
    emit("CLEAN_SUMMARY", [("mode", mode), ("freed_kb", freed), ("entries", len(entries))])
    return 0


def cmd_roots(o, emit):
    plat = resources.platform()
    for e in load_policy(o["policy"] or SHIPPED_POLICY, plat):
        if e.get("platform", "any") not in ("any", plat) or e.get("measure") == "docker-reclaimed":
            continue
        root, recs, err = resolve_root(e, plat)
        if err or not root:
            continue
        emit("ROOT", [("id", e["id"]), ("root", os.path.realpath(root))])
        for t in recs:
            emit("TARGET", [("id", e["id"]), ("path", t[0] if isinstance(t, tuple) else t)])
    return 0


# ---- awake -----------------------------------------------------------------------

def cmd_awake(o, emit):
    pid = o["pid"]
    if pid is None:
        raise GovernError(2, "awake needs --pid")
    if not pid_alive(pid):
        raise GovernError(3, "pid %d is not running" % pid)
    plat = resources.platform()
    if plat == "darwin":
        method, pattern = "caffeinate", "caffeinate -i -w %d$" % pid
        argv = ["caffeinate", "-i", "-w", str(pid)]
    else:
        method, pattern = "systemd-inhibit", "tail --pid=%d -f /dev/null$" % pid
        argv = ["systemd-inhibit", "--what=idle:sleep", "--who=tdrive", "--why=tdrive orchestrator %d" % pid,
                "--mode=block", "tail", "--pid=%d" % pid, "-f", "/dev/null"]
    if not which(argv[0]):
        emit("AWAKE", [("pid", pid), ("method", "none"), ("status", "skipped")])
        return 0
    if running(["-f", pattern]):
        emit("AWAKE", [("pid", pid), ("method", method), ("status", "exists")])
        return 0
    if os.environ.get("TDRIVE_DRY_RUN") == "1":
        sys.stdout.write("DRY %s\n" % " ".join(argv))
        emit("AWAKE", [("pid", pid), ("method", method), ("status", "skipped")])
        return 0
    devnull = open(os.devnull, "r+b")
    try:
        proc = subprocess.Popen(argv, stdin=devnull, stdout=devnull, stderr=devnull, start_new_session=True,
                                cwd="/")
    except OSError as exc:
        raise GovernError(3, "cannot start %s: %s" % (argv[0], exc.strerror))
    finally:
        devnull.close()
    try:
        rc = proc.wait(timeout=AWAKE_SETTLE_S)
    except subprocess.TimeoutExpired:
        rc = 0
    if rc != 0:
        raise GovernError(3, "%s exited %d" % (argv[0], rc))
    emit("AWAKE", [("pid", pid), ("method", method), ("status", "started")])
    return 0


# ---- CLI -------------------------------------------------------------------------

COMMANDS = {"check": cmd_check, "attribute": cmd_attribute, "clean": cmd_clean, "awake": cmd_awake,
            "roots": cmd_roots}
VALUE_OPTS = ("--repo", "--rundir", "--path", "--agents", "--pane-pid", "--project", "--mode", "--only",
              "--until-free-gb", "--policy", "--pid", "--jsonl")


def parse_args(args):
    o = {"repo": os.getcwd(), "rundir": None, "path": "", "agents": 0, "pids": [], "project": "",
         "mode": "", "only": "", "until_free_gb": None, "all": False, "policy": "", "pid": None, "jsonl": ""}
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--all":
            o["all"] = True
            i += 1
            continue
        if a not in VALUE_OPTS or i + 1 >= len(args):
            raise GovernError(2, "bad argument: %s" % a)
        v = args[i + 1]
        i += 2
        if a in ("--agents", "--pane-pid", "--pid"):
            if not v.isdigit():
                raise GovernError(2, "%s must be a non-negative integer: %r" % (a, v))
            if a == "--agents":
                o["agents"] = int(v)
            elif a == "--pid":
                o["pid"] = int(v)
            else:
                o["pids"].append(int(v))
        elif a == "--until-free-gb":
            try:
                o["until_free_gb"] = float(v)
            except ValueError:
                raise GovernError(2, "--until-free-gb must be a number: %r" % v)
        elif a == "--mode":
            if v not in ("dry-run", "apply", "auto"):
                raise GovernError(2, "--mode must be dry-run, apply or auto: %r" % v)
            o["mode"] = v
        else:
            o[a[2:].replace("-", "_")] = v
    if not os.path.isdir(o["repo"]):
        raise GovernError(3, "repo dir not found: %s" % o["repo"])
    o["repo"] = os.path.abspath(o["repo"])
    return o


def main(argv):
    if len(argv) < 2 or argv[1] not in COMMANDS:
        sys.stderr.write("usage: govern.py check|attribute|clean|awake|roots [options]\n")
        return 2
    try:
        o = parse_args(argv[2:])
        return COMMANDS[argv[1]](o, Emitter(argv[1], o["jsonl"]))
    except GovernError as exc:
        log(str(exc))
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
