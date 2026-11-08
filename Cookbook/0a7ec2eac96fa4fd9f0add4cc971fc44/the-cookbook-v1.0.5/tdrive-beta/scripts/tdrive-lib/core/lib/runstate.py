"""Run-state helper: run resolution, run.env, index, locks, archive, clock.

State dir S = $TDRIVE_STATE_DIR or ~/.tdrive; run dir R = S/runs/<run>/.
All clock values honor TDRIVE_NOW (epoch seconds) when it is set.

CLI:
  resolve [--run R] [--repo P] [--session S]
  index-add RUN REPO
  get RUN KEY | set RUN KEY VALUE
  archive RUN
  lock-acquire RUN NAME [--wait S] [--pid P] | lock-release RUN NAME [--pid P]
  pid-alive RUN NAME
  now | iso [EPOCH] | local [EPOCH] | stamp [--pid P] | mtime PATH | age-min PATH
Exit codes: 0 ok, 1 negative answer, 2 usage/invalid, 5 lock timeout.
"""
import errno
import fcntl
import os
import re
import shutil
import sys
import tempfile
import time

RUN_ENV_KEYS = (
    "ENGINE", "REPO", "BRANCH", "SESSION", "PRESET", "STARTED_AT", "ROOT_SHA", "PLAN",
    "PLAN_SENT", "COOK_SENT", "STAGE_REPORTED", "PAUSED",
    "VERIFY_PENDING", "VERIFY_FAILED", "FAILS",
    "NUDGES_PLAN", "NUDGES_COOK", "IDLE_BACKSTOPS", "BUSY_BACKSTOPS",
    "TRUST_REPEAT", "LIMIT_EPISODE", "LIMIT_WAITING", "ACTIVE_S",
)
LOCK_STALE_S = 120
_RUN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


class RunStateError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def state_dir():
    s = os.environ.get("TDRIVE_STATE_DIR", "")
    if not s:
        s = os.path.join(os.path.expanduser("~"), ".tdrive")
    return s


def valid_run(run):
    return bool(run) and bool(_RUN_RE.match(run)) and ".." not in run


def check_run(run):
    if not valid_run(run):
        raise RunStateError(2, "invalid run name: %r" % run)
    return run


def run_dir(run):
    return os.path.join(state_dir(), "runs", check_run(run))


def ensure_dir(path):
    old = os.umask(0o077)
    try:
        os.makedirs(path, exist_ok=True)
    finally:
        os.umask(old)
    return path


def single_line(value, what):
    if "\n" in value or "\r" in value or "\0" in value:
        raise RunStateError(2, "%s must be a single line without NUL" % what)
    return value


def log(run, msg):
    """Append a diagnostic to stderr and, if the run dir exists, tdrive.log."""
    sys.stderr.write("runstate: %s\n" % msg)
    try:
        rd = run_dir(run)
    except RunStateError:
        return
    if os.path.isdir(rd):
        try:
            with open(os.path.join(rd, "tdrive.log"), "a") as fh:
                fh.write("%s runstate %s\n" % (iso(now()), msg))
        except (IOError, OSError):
            pass


# ---- clock -------------------------------------------------------------

def now():
    v = os.environ.get("TDRIVE_NOW", "")
    if v:
        try:
            return int(float(v))
        except ValueError:
            raise RunStateError(2, "TDRIVE_NOW is not a number: %r" % v)
    return int(time.time())


def iso(epoch=None):
    if epoch is None:
        epoch = now()
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def local(epoch=None):
    if epoch is None:
        epoch = now()
    lt = time.localtime(epoch)
    off = lt.tm_gmtoff if lt.tm_gmtoff is not None else 0
    sign = "+" if off >= 0 else "-"
    off = abs(off)
    return "%s%s%02d:%02d" % (time.strftime("%Y-%m-%dT%H:%M:%S", lt), sign, off // 3600, (off % 3600) // 60)


def stamp(pid=None):
    """<ts>-<pid>-<seq>: unique even under a fixed TDRIVE_NOW."""
    if pid is None:
        pid = os.getppid()
    s = ensure_dir(state_dir())
    seq_path = os.path.join(s, "stamp.seq")
    fd = os.open(seq_path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        raw = os.read(fd, 64).decode("ascii", "replace").strip()
        try:
            seq = int(raw) + 1
        except ValueError:
            seq = 1
        os.lseek(fd, 0, os.SEEK_SET)
        os.ftruncate(fd, 0)
        os.write(fd, ("%d\n" % seq).encode("ascii"))
    finally:
        os.close(fd)
    ts = time.strftime("%Y%m%d-%H%M%S", time.localtime(now()))
    return "%s-%d-%d" % (ts, pid, seq)


def mtime(path):
    try:
        return int(os.stat(path).st_mtime)
    except OSError:
        raise RunStateError(1, "no such path: %s" % path)


def age_min(path):
    return max(0, (now() - mtime(path)) // 60)


# ---- resolution and index ---------------------------------------------

def index_path():
    return os.path.join(state_dir(), "runs", "index.tsv")


def _read_index():
    rows = []
    try:
        with open(index_path()) as fh:
            for line in fh:
                line = line.rstrip("\n")
                if "\t" not in line:
                    continue
                repo, run = line.split("\t", 1)
                rows.append((repo, run))
    except (IOError, OSError):
        pass
    return rows


def resolve(run=None, repo=None, session=None):
    """Contracts order: --run, TDRIVE_RUN, index lookup of realpath(repo|cwd), session."""
    if run:
        return check_run(run)
    env_run = os.environ.get("TDRIVE_RUN", "")
    if env_run:
        return check_run(env_run)
    try:
        key = os.path.realpath(repo if repo else os.getcwd())
    except OSError:
        key = None
    if key:
        found = None
        for r_repo, r_run in _read_index():
            if r_repo == key and valid_run(r_run):
                found = r_run
        if found:
            return found
    if session:
        return check_run(session)
    return None


def atomic_write(path, text):
    d = os.path.dirname(path)
    ensure_dir(d)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=d)
    try:
        with os.fdopen(fd, "w") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


class _FileLock(object):
    def __init__(self, path):
        self.path = path
        self.fd = None

    def __enter__(self):
        ensure_dir(os.path.dirname(self.path))
        self.fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o600)
        fcntl.flock(self.fd, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        os.close(self.fd)
        return False


def index_add(run, repo):
    check_run(run)
    real = single_line(os.path.realpath(repo), "repo path")
    if "\t" in real:
        raise RunStateError(2, "repo path contains a tab")
    runs = ensure_dir(os.path.join(state_dir(), "runs"))
    with _FileLock(os.path.join(runs, ".index.lock")):
        rows = [r for r in _read_index() if r[0] != real]
        rows.append((real, run))
        atomic_write(index_path(), "".join("%s\t%s\n" % r for r in rows))
    return real


# ---- run.env -----------------------------------------------------------

def check_key(key):
    if key not in RUN_ENV_KEYS:
        raise RunStateError(2, "unknown run.env key: %s" % key)
    return key


def read_env(run):
    path = os.path.join(run_dir(run), "run.env")
    pairs = []
    try:
        with open(path) as fh:
            for line in fh:
                line = line.rstrip("\n")
                if "=" not in line:
                    continue
                k, v = line.split("=", 1)
                pairs.append((k, v))
    except (IOError, OSError):
        pass
    return pairs


def env_get(run, key):
    check_key(key)
    val = ""
    for k, v in read_env(run):
        if k == key:
            val = v
    return val


def env_set(run, key, value):
    check_key(key)
    single_line(value, "run.env value")
    rd = ensure_dir(run_dir(run))
    with _FileLock(os.path.join(rd, ".run.env.lock")):
        pairs = read_env(run)
        out = []
        done = False
        for k, v in pairs:
            if k == key:
                if not done:
                    out.append((k, value))
                    done = True
                continue
            out.append((k, v))
        if not done:
            out.append((key, value))
        atomic_write(os.path.join(rd, "run.env"), "".join("%s=%s\n" % p for p in out))


def archive(run):
    rd = run_dir(run)
    if not os.path.isdir(rd):
        raise RunStateError(1, "no run dir: %s" % rd)
    started = env_get(run, "STARTED_AT") or str(now())
    started = re.sub(r"[^A-Za-z0-9._-]", "-", started)
    base = os.path.join(state_dir(), "runs", "%s.%s" % (run, started))
    target = base
    n = 1
    while os.path.exists(target):
        n += 1
        target = "%s-%d" % (base, n)
    os.rename(rd, target)
    return target


# ---- locks and pids ----------------------------------------------------

def pid_alive(pid):
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError as exc:
        return exc.errno == errno.EPERM
    return True


def _read_lock(lockdir):
    try:
        with open(os.path.join(lockdir, "pid")) as fh:
            parts = fh.read().split()
        return int(parts[0]), int(parts[1])
    except (IOError, OSError, ValueError, IndexError):
        return None, None


def _lock_dir(run, name):
    if not _NAME_RE.match(name):
        raise RunStateError(2, "invalid lock name: %r" % name)
    return os.path.join(run_dir(run), "%s.lock" % name)


def lock_acquire(run, name, wait_s, pid):
    lockdir = _lock_dir(run, name)
    ensure_dir(os.path.dirname(lockdir))
    deadline = time.time() + max(0.0, wait_s)
    while True:
        try:
            os.mkdir(lockdir, 0o700)
        except OSError as exc:
            if exc.errno != errno.EEXIST:
                raise RunStateError(2, "cannot create lock %s: %s" % (lockdir, exc.strerror))
            owner, started = _read_lock(lockdir)
            stale = None
            if owner is None:
                # Owner may be between mkdir and writing the pid file.
                try:
                    age = time.time() - os.stat(lockdir).st_mtime
                except OSError:
                    age = 0
                if age > 2:
                    stale = "no owner pid"
            elif not pid_alive(owner):
                stale = "owner pid %d is dead" % owner
            elif now() - started > LOCK_STALE_S:
                stale = "lock older than %ds (pid %d)" % (LOCK_STALE_S, owner)
            if stale:
                grave = "%s.stale.%d.%d" % (lockdir, os.getpid(), int(time.time() * 1000))
                try:
                    os.rename(lockdir, grave)
                    shutil.rmtree(grave, ignore_errors=True)
                    log(run, "broke stale lock %s: %s" % (name, stale))
                except OSError:
                    pass
                continue
            if time.time() >= deadline:
                raise RunStateError(5, "lock %s held by pid %s; gave up after %ss" % (name, owner, wait_s))
            time.sleep(0.1)
            continue
        with open(os.path.join(lockdir, "pid"), "w") as fh:
            fh.write("%d %d\n" % (pid, now()))
        return lockdir


def lock_release(run, name, pid):
    lockdir = _lock_dir(run, name)
    if not os.path.isdir(lockdir):
        return True
    owner, _ = _read_lock(lockdir)
    if owner is not None and owner != pid:
        raise RunStateError(1, "lock %s is held by pid %d, not %d" % (name, owner, pid))
    shutil.rmtree(lockdir, ignore_errors=True)
    return True


def pid_file_alive(run, name):
    if not _NAME_RE.match(name):
        raise RunStateError(2, "invalid pid name: %r" % name)
    try:
        with open(os.path.join(run_dir(run), "%s.pid" % name)) as fh:
            pid = int(fh.read().strip().split()[0])
    except (IOError, OSError, ValueError, IndexError):
        return False
    return pid_alive(pid)


# ---- CLI ---------------------------------------------------------------

def _opts(args, names):
    """Parse --name VALUE options; returns (dict, positionals)."""
    opts = {}
    pos = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in names:
            if i + 1 >= len(args):
                raise RunStateError(2, "%s needs a value" % a)
            opts[a] = args[i + 1]
            i += 2
            continue
        if a.startswith("--"):
            raise RunStateError(2, "unknown option %s" % a)
        pos.append(a)
        i += 1
    return opts, pos


def _need(pos, n, usage):
    if len(pos) != n:
        raise RunStateError(2, "usage: runstate.py %s" % usage)


def _epoch_arg(pos):
    if not pos:
        return None
    try:
        return int(float(pos[0]))
    except ValueError:
        raise RunStateError(2, "not an epoch: %r" % pos[0])


def _pid_opt(opts):
    if "--pid" not in opts:
        return os.getppid()
    try:
        return int(opts["--pid"])
    except ValueError:
        raise RunStateError(2, "--pid must be an integer")


def run_cli(argv):
    if not argv:
        raise RunStateError(2, "usage: runstate.py <command> ...")
    cmd, args = argv[0], argv[1:]
    out = sys.stdout
    if cmd == "resolve":
        opts, pos = _opts(args, ("--run", "--repo", "--session"))
        _need(pos, 0, "resolve [--run R] [--repo P] [--session S]")
        run = resolve(opts.get("--run"), opts.get("--repo"), opts.get("--session"))
        if not run:
            raise RunStateError(2, "cannot resolve run; pass --run")
        out.write(run + "\n")
    elif cmd == "index-add":
        _need(args, 2, "index-add RUN REPO")
        index_add(args[0], args[1])
    elif cmd == "get":
        _need(args, 2, "get RUN KEY")
        out.write(env_get(args[0], args[1]) + "\n")
    elif cmd == "set":
        _need(args, 3, "set RUN KEY VALUE")
        env_set(args[0], args[1], args[2])
    elif cmd == "archive":
        _need(args, 1, "archive RUN")
        out.write(archive(args[0]) + "\n")
    elif cmd == "lock-acquire":
        opts, pos = _opts(args, ("--wait", "--pid"))
        _need(pos, 2, "lock-acquire RUN NAME [--wait S] [--pid P]")
        try:
            wait_s = float(opts.get("--wait", "0"))
        except ValueError:
            raise RunStateError(2, "--wait must be a number")
        lock_acquire(pos[0], pos[1], wait_s, _pid_opt(opts))
    elif cmd == "lock-release":
        opts, pos = _opts(args, ("--pid",))
        _need(pos, 2, "lock-release RUN NAME [--pid P]")
        lock_release(pos[0], pos[1], _pid_opt(opts))
    elif cmd == "pid-alive":
        _need(args, 2, "pid-alive RUN NAME")
        return 0 if pid_file_alive(args[0], args[1]) else 1
    elif cmd == "now":
        _need(args, 0, "now")
        out.write("%d\n" % now())
    elif cmd == "iso":
        out.write(iso(_epoch_arg(args)) + "\n")
    elif cmd == "local":
        out.write(local(_epoch_arg(args)) + "\n")
    elif cmd == "stamp":
        opts, pos = _opts(args, ("--pid",))
        _need(pos, 0, "stamp [--pid P]")
        out.write(stamp(_pid_opt(opts)) + "\n")
    elif cmd == "mtime":
        _need(args, 1, "mtime PATH")
        out.write("%d\n" % mtime(args[0]))
    elif cmd == "age-min":
        _need(args, 1, "age-min PATH")
        out.write("%d\n" % age_min(args[0]))
    else:
        raise RunStateError(2, "unknown command: %s" % cmd)
    return 0


def main(argv):
    try:
        return run_cli(argv[1:])
    except RunStateError as exc:
        sys.stderr.write("runstate: %s\n" % exc)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
