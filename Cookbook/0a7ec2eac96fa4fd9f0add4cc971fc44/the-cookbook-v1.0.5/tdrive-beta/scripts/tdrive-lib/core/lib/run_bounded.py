"""Run a command with a wall-clock bound.

CLI: run_bounded.py --timeout S -- cmd [args...]
Output and exit code pass through. On timeout the whole process group is
terminated (TERM, then KILL after 2 s) and the exit code is 124. A command
that cannot be started exits 127; a signal death exits 128 + signal.
"""
import os
import signal
import subprocess
import sys

USAGE = "usage: run_bounded.py --timeout S -- cmd [args...]\n"


def _kill_group(proc):
    for sig, grace in ((signal.SIGTERM, 2.0), (signal.SIGKILL, 2.0)):
        try:
            os.killpg(proc.pid, sig)
        except OSError:
            return
        try:
            proc.wait(timeout=grace)
            # The leader exited; make sure no group member survives.
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except OSError:
                pass
            return
        except subprocess.TimeoutExpired:
            continue


def main(argv):
    args = argv[1:]
    if len(args) < 4 or args[0] != "--timeout" or args[2] != "--":
        sys.stderr.write(USAGE)
        return 2
    try:
        timeout = float(args[1])
    except ValueError:
        sys.stderr.write(USAGE)
        return 2
    if timeout <= 0:
        sys.stderr.write("run_bounded: --timeout must be > 0\n")
        return 2
    cmd = args[3:]
    try:
        proc = subprocess.Popen(cmd, start_new_session=True)
    except OSError as exc:
        sys.stderr.write("run_bounded: cannot run %s: %s\n" % (cmd[0], exc.strerror))
        return 127

    def forward(signum, _frame):
        try:
            os.killpg(proc.pid, signum)
        except OSError:
            pass

    signal.signal(signal.SIGTERM, forward)
    signal.signal(signal.SIGINT, forward)
    try:
        rc = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        _kill_group(proc)
        sys.stderr.write("run_bounded: timeout after %ss: %s\n" % (args[1], " ".join(cmd)))
        return 124
    if rc < 0:
        return 128 - rc
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv))
