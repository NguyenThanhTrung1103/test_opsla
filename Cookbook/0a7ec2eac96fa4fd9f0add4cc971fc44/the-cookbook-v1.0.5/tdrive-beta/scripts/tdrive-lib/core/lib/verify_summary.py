"""Summarize a verify target log in one sanitized line.

Picks the last (up to three) lines that look like a result summary (pass,
fail, error, test counts; go/TAP style ok/FAIL lines), strips ANSI and
control characters, and joins them with " ; ". Without a summary-looking
line it falls back to the last non-empty line, and prints "-" for an empty
log.

CLI: verify_summary.py LOGFILE
Exit codes: 0 ok, 2 usage, 3 unreadable log.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import sanitize  # noqa: E402

MAX_LINES = 3
MAX_CHARS = 200
_WORDS = r"(?:tests?|pass(?:ed|es|ing)?|fail(?:ed|s|ing|ures?)?|errors?|ok|skipped|warnings?|problems?)"
SUMMARY_RE = re.compile(
    r"(?i)"
    r"\b" + _WORDS + r"\b\s*[=:]\s*\d"
    r"|\b\d+\s+" + _WORDS + r"\b"
    r"|^\s*(?:ok|FAIL|PASS)\b"
    r"|^\s*TESTS\b"
)


def summarize(text):
    lines = []
    for raw in text.splitlines():
        line = sanitize.sanitize(raw).strip()
        if line:
            lines.append(line[:MAX_CHARS])
    if not lines:
        return "-"
    picked = [ln for ln in lines if SUMMARY_RE.search(ln)][-MAX_LINES:]
    if not picked:
        picked = lines[-1:]
    return " ; ".join(picked)


def main(argv):
    if len(argv) != 2:
        sys.stderr.write("usage: verify_summary.py LOGFILE\n")
        return 2
    try:
        with open(argv[1], "rb") as fh:
            text = fh.read().decode("utf-8", "replace")
    except (IOError, OSError) as exc:
        sys.stderr.write("verify_summary: cannot read %s: %s\n" % (argv[1], exc))
        return 3
    sys.stdout.write(summarize(text) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
