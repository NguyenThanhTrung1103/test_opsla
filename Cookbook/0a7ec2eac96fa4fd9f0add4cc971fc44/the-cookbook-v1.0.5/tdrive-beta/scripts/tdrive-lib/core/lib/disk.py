"""Disk free space and floor levels, measured only with `df -Pk <dir>`.

CLI:
  free  --path P
      -> free_kb=<n> free_gb=<n.n>
  level --path P [--floors ONE,PAUSE,ALERT] [--repo R] [--rundir D]
      -> level=<ok|one-implementer|pause|alert> rank=<0-3> free_kb=<n> free_gb=<n.n>
Floors are GB (1 GB = 1048576 KB): alert below floors.alert_gb, pause below
floors.pause_gb, one-implementer at or below floors.one_implementer_gb.
Without --floors they come from config (--repo/--rundir select the layers).
Exit codes: 0 ok, 2 usage or config error, 3 df missing or failed.
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

KB_PER_GB = 1048576.0
DF_TIMEOUT_S = 60
LEVELS = ("ok", "one-implementer", "pause", "alert")
_CAP_RE = re.compile(r"^[0-9]+%$")


class DiskError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def parse_df(text):
    """Available KB from `df -Pk` output (last data line)."""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if len(lines) < 2:
        raise DiskError(3, "unexpected df output: %r" % text[:200])
    toks = lines[-1].split()
    for i in range(3, len(toks)):
        if _CAP_RE.match(toks[i]) and toks[i - 1].isdigit():
            return int(toks[i - 1])
    raise DiskError(3, "cannot find the Available column in: %r" % lines[-1][:200])


def free_kb(path):
    try:
        proc = subprocess.run(["df", "-Pk", path], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              timeout=DF_TIMEOUT_S)
    except OSError as exc:
        raise DiskError(3, "cannot run df: %s" % exc.strerror)
    except subprocess.TimeoutExpired:
        raise DiskError(3, "df -Pk %s timed out after %ds" % (path, DF_TIMEOUT_S))
    if proc.returncode != 0:
        raise DiskError(3, "df -Pk %s failed (exit %d): %s" % (
            path, proc.returncode, proc.stderr.decode("utf-8", "replace").strip()))
    return parse_df(proc.stdout.decode("utf-8", "replace"))


def gb(kb):
    return kb / KB_PER_GB


def level_for(kb, one_gb, pause_gb, alert_gb):
    """(level name, rank) for kb free under the given floors."""
    g = gb(kb)
    if g < alert_gb:
        name = "alert"
    elif g < pause_gb:
        name = "pause"
    elif g <= one_gb:
        name = "one-implementer"
    else:
        name = "ok"
    return name, LEVELS.index(name)


def floors_from_config(repo=None, rundir=None):
    import config
    try:
        cfg = config.Config(repo, rundir)
    except config.ConfigError as exc:
        raise DiskError(exc.code, str(exc))
    return (cfg.values["floors.one_implementer_gb"][0], cfg.values["floors.pause_gb"][0],
            cfg.values["floors.alert_gb"][0])


def parse_floors(text):
    parts = text.split(",")
    try:
        vals = tuple(float(p) for p in parts)
    except ValueError:
        vals = ()
    if len(vals) != 3:
        raise DiskError(2, "--floors needs ONE,PAUSE,ALERT numbers, got %r" % text)
    return vals


def run_cli(argv):
    if not argv or argv[0] not in ("free", "level"):
        raise DiskError(2, "usage: disk.py free|level --path P ...")
    cmd, args = argv[0], argv[1:]
    names = ("--path",) if cmd == "free" else ("--path", "--floors", "--repo", "--rundir")
    opts = {}
    i = 0
    while i < len(args):
        if args[i] not in names or i + 1 >= len(args):
            raise DiskError(2, "usage: disk.py %s --path P%s" % (
                cmd, "" if cmd == "free" else " [--floors ONE,PAUSE,ALERT] [--repo R] [--rundir D]"))
        opts[args[i]] = args[i + 1]
        i += 2
    if not opts.get("--path"):
        raise DiskError(2, "--path is required")
    if "--floors" in opts:
        floors = parse_floors(opts["--floors"])
    elif cmd == "level":
        floors = floors_from_config(opts.get("--repo"), opts.get("--rundir"))
    kb = free_kb(opts["--path"])
    if cmd == "free":
        sys.stdout.write("free_kb=%d free_gb=%.1f\n" % (kb, gb(kb)))
    else:
        name, rank = level_for(kb, *floors)
        sys.stdout.write("level=%s rank=%d free_kb=%d free_gb=%.1f\n" % (name, rank, kb, gb(kb)))
    return 0


def main(argv):
    try:
        return run_cli(argv[1:])
    except DiskError as exc:
        sys.stderr.write("disk: %s\n" % exc)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
