"""Resource pressure: memory free %, load per cpu and agent fan-out.

Primary signals (they drive the level):
  mem_free_pct   darwin `memory_pressure -Q`; linux <proc>/meminfo
                 MemAvailable / MemTotal
  load_per_cpu   darwin `sysctl -n vm.loadavg` / `hw.ncpu`; linux
                 <proc>/loadavg / os.cpu_count()
  agents         max(pane AGENTS, nested `claude` processes under the
                 orchestrator pane pids)
Context only (reported, never drives the level): swap used % (macOS swap is
sized dynamically, so a full swap file is normal) and the kernel pressure
level (darwin kern.memorystatus_vm_pressure_level, linux PSI some avg10).

<proc> is $TDRIVE_PROC_ROOT (default /proc). An unavailable source makes
that field `unknown`, never an alert. Nothing here stops or signals a process.

CLI:
  check [--repo R] [--rundir D] [--agents N] [--pane-pid P]... [--disk-rank K]
      -> RESOURCE mem_free_pct=<n|unknown> load_per_cpu=<n.nn|unknown>
         ncpu=<n|unknown> agents=<n> level=<ok|high|critical>
         advice=<max_implementers=N|reduce-fanout|pause-dispatch>
         swap_used_pct=<n|unknown> kernel_pressure=<normal|warn|critical|unknown>
  top [--pane-pid P]...
      -> TOP by=<cpu|rss> pid=<n> cpu=<n.n> rss_mb=<n> owner=<ours|other> cmd=<basename> ppid=<n>
Exit codes: 0 ok, 2 usage or config error.
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

RUN_BOUNDED = os.path.join(HERE, "run_bounded.py")
PROBE_TIMEOUT_S = 10
DOCKER_TIMEOUT_S = 30
LEVELS = ("ok", "high", "critical")
TOP_N = 5
PS_ARGS = ["ps", "-Ao", "pid,ppid,pcpu,rss,comm"]

_MP_RE = re.compile(r"System-wide memory free percentage:\s*([0-9]+(?:\.[0-9]+)?)%")
_LOADAVG_RE = re.compile(r"([0-9]+(?:\.[0-9]+)?)")
_SWAP_RE = re.compile(r"total\s*=\s*([0-9.]+)([KMGT]?)\s+used\s*=\s*([0-9.]+)([KMGT]?)")
_PSI_RE = re.compile(r"^some\s+avg10=([0-9.]+)", re.M)
_BIN_UNITS = {"": 1, "B": 1, "KIB": 1024, "MIB": 1024 ** 2, "GIB": 1024 ** 3, "TIB": 1024 ** 4,
              "KB": 1000, "MB": 1000 ** 2, "GB": 1000 ** 3, "TB": 1000 ** 4}
_MEM_RE = re.compile(r"^\s*([0-9.]+)\s*([A-Za-z]*)")
DARWIN_PRESSURE = {"1": "normal", "2": "warn", "4": "critical"}


class ResourceError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def bounded(cmd, timeout, cwd=None):
    """Run cmd through run_bounded.py; (rc, stdout, stderr) as text.
    rc 127 when the tool cannot be started, 124 on timeout."""
    argv = [sys.executable, "-E", "-s", RUN_BOUNDED, "--timeout", str(timeout), "--"] + list(cmd)
    try:
        proc = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd)
    except OSError as exc:
        return 127, "", str(exc)
    return (proc.returncode, proc.stdout.decode("utf-8", "replace"),
            proc.stderr.decode("utf-8", "replace"))


def quick(cmd, timeout=PROBE_TIMEOUT_S):
    """Run a fast read-only probe directly; (rc, stdout, stderr). rc 127 when
    the tool is missing, 124 on timeout (the child is killed by subprocess)."""
    try:
        proc = subprocess.run(list(cmd), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              stdin=subprocess.DEVNULL, timeout=timeout)
    except OSError as exc:
        return 127, "", str(exc)
    except subprocess.TimeoutExpired:
        return 124, "", "timeout after %ss: %s" % (timeout, " ".join(cmd))
    return (proc.returncode, proc.stdout.decode("utf-8", "replace"),
            proc.stderr.decode("utf-8", "replace"))


def platform():
    p = os.environ.get("TDRIVE_PLATFORM", "")
    if p:
        return p
    return "darwin" if sys.platform == "darwin" else "linux"


def proc_root():
    """The linux proc root, or None when the test sandbox would read the host."""
    root = os.environ.get("TDRIVE_PROC_ROOT", "") or "/proc"
    if os.environ.get("TDRIVE_TEST") == "1":
        test_root = os.path.realpath(os.environ.get("TDRIVE_TEST_ROOT", "") or "/nonexistent")
        if not os.path.realpath(root).startswith(test_root + os.sep):
            return None
    return root


def _read(path):
    try:
        with open(path) as fh:
            return fh.read()
    except (IOError, OSError):
        return None


def _probe(cmd):
    rc, out, _err = quick(cmd)
    return out if rc == 0 else None


def _size_mb(num, unit):
    mult = {"": 1.0, "K": 1.0 / 1024, "M": 1.0, "G": 1024.0, "T": 1024.0 * 1024}[unit]
    return float(num) * mult


def parse_memory_pressure(text):
    m = _MP_RE.search(text or "")
    return int(float(m.group(1))) if m else None


def parse_loadavg(text):
    m = _LOADAVG_RE.search(text or "")
    return float(m.group(1)) if m else None


def parse_swapusage(text):
    m = _SWAP_RE.search(text or "")
    if not m:
        return None
    total = _size_mb(m.group(1), m.group(2))
    used = _size_mb(m.group(3), m.group(4))
    if total <= 0:
        return 0
    return int(round(used * 100.0 / total))


def parse_meminfo(text):
    vals = {}
    for line in (text or "").splitlines():
        parts = line.replace(":", " ").split()
        if len(parts) >= 2 and parts[1].isdigit():
            vals[parts[0]] = int(parts[1])
    mem = None
    if vals.get("MemTotal") and "MemAvailable" in vals:
        mem = int(vals["MemAvailable"] * 100 // vals["MemTotal"])
    swap = None
    if "SwapTotal" in vals and "SwapFree" in vals:
        swap = 0 if vals["SwapTotal"] == 0 else int(round(
            (vals["SwapTotal"] - vals["SwapFree"]) * 100.0 / vals["SwapTotal"]))
    return mem, swap


def psi_level(text):
    m = _PSI_RE.search(text or "")
    if not m:
        return "unknown"
    v = float(m.group(1))
    if v >= 40:
        return "critical"
    if v >= 10:
        return "warn"
    return "normal"


def measure():
    """Dict with mem_free_pct, load (1-min), ncpu, swap_used_pct, kernel_pressure."""
    r = {"mem_free_pct": None, "load": None, "ncpu": None, "swap_used_pct": None,
         "kernel_pressure": "unknown"}
    if platform() == "darwin":
        r["mem_free_pct"] = parse_memory_pressure(_probe(["memory_pressure", "-Q"]))
        r["load"] = parse_loadavg(_probe(["sysctl", "-n", "vm.loadavg"]))
        ncpu = (_probe(["sysctl", "-n", "hw.ncpu"]) or "").strip()
        r["ncpu"] = int(ncpu) if ncpu.isdigit() and int(ncpu) > 0 else None
        r["swap_used_pct"] = parse_swapusage(_probe(["sysctl", "-n", "vm.swapusage"]))
        lvl = (_probe(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"]) or "").strip()
        r["kernel_pressure"] = DARWIN_PRESSURE.get(lvl, "unknown")
        return r
    root = proc_root()
    if root is None:
        return r
    r["mem_free_pct"], r["swap_used_pct"] = parse_meminfo(_read(os.path.join(root, "meminfo")))
    r["load"] = parse_loadavg(_read(os.path.join(root, "loadavg")))
    r["ncpu"] = os.cpu_count() or None
    r["kernel_pressure"] = psi_level(_read(os.path.join(root, "pressure", "memory")))
    return r


# ---- process table ------------------------------------------------------

def parse_ps(text):
    """[(pid, ppid, pcpu, rss_kb, comm)] from `ps -Ao pid,ppid,pcpu,rss,comm`."""
    rows = []
    for line in (text or "").splitlines():
        parts = line.split(None, 4)
        if len(parts) < 5 or not parts[0].isdigit() or not parts[1].isdigit():
            continue
        try:
            rows.append((int(parts[0]), int(parts[1]), float(parts[2]), int(parts[3]), parts[4].strip()))
        except ValueError:
            continue
    return rows


def process_table():
    rc, out, _err = quick(PS_ARGS)
    return parse_ps(out) if rc == 0 else []


def comm_name(comm):
    base = comm.rstrip("/").rsplit("/", 1)[-1] or comm
    return re.sub(r"\s+", "_", base.lstrip("-")) or "?"


def ours_set(rows, pane_pids):
    """Pids of the pane processes and all their descendants."""
    children = {}
    for pid, ppid, _c, _r, _n in rows:
        children.setdefault(ppid, []).append(pid)
    seen = set()
    stack = [p for p in pane_pids if p > 0]
    while stack:
        p = stack.pop()
        if p in seen:
            continue
        seen.add(p)
        stack.extend(children.get(p, ()))
    return seen


def nested_agents(rows, pane_pids):
    """Count `claude` processes under the pane pids whose ancestry (up to the
    pane pid) holds another `claude`: the agents an orchestrator spawned."""
    ours = ours_set(rows, pane_pids)
    by_pid = dict((r[0], r) for r in rows)
    roots = set(pane_pids)
    n = 0
    for pid in ours:
        row = by_pid.get(pid)
        if row is None or pid in roots or comm_name(row[4]) != "claude":
            continue
        cur = row[1]
        hops = 0
        while cur in by_pid and hops < 4096:
            if comm_name(by_pid[cur][4]) == "claude":
                n += 1
                break
            if cur in roots:
                break
            cur = by_pid[cur][1]
            hops += 1
    return n


def top_lines(rows, pane_pids):
    ours = ours_set(rows, pane_pids)
    out = []
    for by, key in (("cpu", lambda r: (-r[2], r[0])), ("rss", lambda r: (-r[3], r[0]))):
        for pid, ppid, cpu, rss, comm in sorted(rows, key=key)[:TOP_N]:
            out.append(("TOP", [("by", by), ("pid", pid), ("cpu", "%.1f" % cpu),
                                ("rss_mb", int(round(rss / 1024.0))),
                                ("owner", "ours" if pid in ours else "other"),
                                ("cmd", comm_name(comm)), ("ppid", ppid)]))
    return out


# ---- docker stats ------------------------------------------------------------

def mem_bytes(text):
    m = _MEM_RE.match(text or "")
    if not m:
        return None
    unit = m.group(2).upper()
    if unit not in _BIN_UNITS:
        return None
    return float(m.group(1)) * _BIN_UNITS[unit]


def dstat_lines(project_of, compose_project):
    """DSTAT entries from `docker stats --no-stream`, or None when docker is
    unavailable. project_of maps container name -> compose project or None."""
    rc, out, _err = bounded(["docker", "stats", "--no-stream", "--format", "{{json .}}"], DOCKER_TIMEOUT_S)
    if rc != 0:
        return None
    rows = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except ValueError:
            continue
        name = row.get("Name") or row.get("Container") or "?"
        try:
            cpu = float((row.get("CPUPerc") or "0").rstrip("%") or 0)
        except ValueError:
            cpu = 0.0
        mb = mem_bytes((row.get("MemUsage") or "").split("/")[0])
        project = project_of.get(name)
        rows.append((cpu, name, project, mb))
    rows.sort(key=lambda r: (-r[0], r[1]))
    out_lines = []
    for cpu, name, project, mb in rows:
        out_lines.append(("DSTAT", [("name", name), ("project", project or "-"),
                                    ("owner", "ours" if project and project == compose_project else "other"),
                                    ("cpu_pct", "%.1f" % cpu),
                                    ("mem_mb", "?" if mb is None else int(round(mb / 1048576.0)))]))
    return out_lines


# ---- assessment --------------------------------------------------------------

def thresholds(cfg_values):
    return {
        "mem_high": cfg_values["resources.mem_free_high_pct"][0],
        "mem_alert": cfg_values["resources.mem_free_alert_pct"][0],
        "load_high": cfg_values["resources.load_high_per_cpu"][0],
        "load_critical": cfg_values["resources.load_critical_per_cpu"][0],
        "cap": cfg_values["run.max_implementers"][0],
    }


def assess(m, agents, th, disk_rank=0):
    """(level, advice, load_per_cpu) from a measure() dict. Swap and kernel
    pressure are deliberately ignored here."""
    mem = m["mem_free_pct"]
    lpc = None
    if m["load"] is not None and m["ncpu"]:
        lpc = m["load"] / float(m["ncpu"])
    level = "ok"
    if (mem is not None and mem < th["mem_alert"]) or (lpc is not None and lpc >= th["load_critical"]):
        level = "critical"
    elif ((mem is not None and mem < th["mem_high"]) or (lpc is not None and lpc >= th["load_high"])
          or agents > th["cap"]):
        level = "high"
    if level == "critical":
        advice = "pause-dispatch"
    elif level == "high" and agents > th["cap"]:
        advice = "reduce-fanout"
    elif level == "high":
        advice = "max_implementers=1"
    else:
        advice = "max_implementers=%d" % th["cap"]
    if disk_rank >= 2:
        advice = "pause-dispatch"
    elif disk_rank == 1 and advice.startswith("max_implementers="):
        advice = "max_implementers=1"
    return level, advice, lpc


def resource_fields(m, agents, level, advice, lpc):
    def opt(v):
        return "unknown" if v is None else v
    return [("mem_free_pct", opt(m["mem_free_pct"])),
            ("load_per_cpu", "unknown" if lpc is None else "%.2f" % lpc),
            ("ncpu", opt(m["ncpu"])), ("agents", agents), ("level", level), ("advice", advice),
            ("swap_used_pct", opt(m["swap_used_pct"])), ("kernel_pressure", m["kernel_pressure"])]


def check_detail(cfg_values, pane_agents=0, pane_pids=(), disk_rank=0):
    """("RESOURCE", fields, detail) for the current machine; detail holds the
    two agent counts behind `agents`: agents_pane (from the pane) and
    agents_ps (nested claude processes, None without pane pids)."""
    pane = max(0, pane_agents)
    nested = nested_agents(process_table(), pane_pids) if pane_pids else None
    agents = pane if nested is None else max(pane, nested)
    m = measure()
    level, advice, lpc = assess(m, agents, thresholds(cfg_values), disk_rank)
    detail = {"agents_pane": pane, "agents_ps": nested}
    return ("RESOURCE", resource_fields(m, agents, level, advice, lpc), detail)


def check(cfg_values, pane_agents=0, pane_pids=(), disk_rank=0):
    """("RESOURCE", fields) for the current machine."""
    kind, fields, _detail = check_detail(cfg_values, pane_agents, pane_pids, disk_rank)
    return (kind, fields)


def render(kind, fields):
    return kind + "".join(" %s=%s" % (k, v) for k, v in fields)


# ---- CLI ---------------------------------------------------------------------

def _int_arg(name, v):
    try:
        n = int(v)
    except ValueError:
        raise ResourceError(2, "%s must be an integer: %r" % (name, v))
    if n < 0:
        raise ResourceError(2, "%s must be >= 0: %r" % (name, v))
    return n


def run_cli(argv):
    if not argv or argv[0] not in ("check", "top"):
        raise ResourceError(2, "usage: resources.py check|top [options]")
    cmd, args = argv[0], argv[1:]
    repo = rundir = None
    agents = disk_rank = 0
    pids = []
    i = 0
    while i < len(args):
        a = args[i]
        if a not in ("--repo", "--rundir", "--agents", "--pane-pid", "--disk-rank") or i + 1 >= len(args):
            raise ResourceError(2, "usage: resources.py check [--repo R] [--rundir D] [--agents N] "
                                   "[--pane-pid P]... [--disk-rank K] | top [--pane-pid P]...")
        v = args[i + 1]
        if a == "--repo":
            repo = v
        elif a == "--rundir":
            rundir = v
        elif a == "--agents":
            agents = _int_arg(a, v)
        elif a == "--disk-rank":
            disk_rank = _int_arg(a, v)
        elif v:
            pids.append(_int_arg(a, v))
        i += 2
    if cmd == "top":
        for kind, fields in top_lines(process_table(), pids):
            sys.stdout.write(render(kind, fields) + "\n")
        return 0
    import config
    try:
        cfg = config.Config(repo, rundir)
    except config.ConfigError as exc:
        raise ResourceError(exc.code, str(exc))
    kind, fields = check(cfg.values, agents, pids, disk_rank)
    sys.stdout.write(render(kind, fields) + "\n")
    return 0


def main(argv):
    try:
        return run_cli(argv[1:])
    except ResourceError as exc:
        sys.stderr.write("resources: %s\n" % exc)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
