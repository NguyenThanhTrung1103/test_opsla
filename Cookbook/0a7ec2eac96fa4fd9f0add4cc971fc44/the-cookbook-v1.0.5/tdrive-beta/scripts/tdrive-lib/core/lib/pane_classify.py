"""Classify a Claude Code tmux pane capture.

CLI: pane_classify.py --plain FILE|- [--ansi FILE] [--bottom N]

FILE is `tmux capture-pane -p`; the optional ansi file is the same screen
captured with `-e`. Prints `STATE <TRUST|QUESTION|LIMIT|BUSY|READY|IDLE>`, then
optional lines:
  DIALOG <trust|bypass|settings>
  SUGGESTION <yes|no>                (needs --ansi)
  PENDING_INPUT <yes|no|unknown>     (unknown: text present, no --ansi)
  INPUT_TEXT <first 40 chars of the pending text>
  LIMIT_RESET <iso|unknown>
  LIMIT_HASH <sha1 of the matched limit line>
  AGENTS <n>                         (running agents shown, nested included;
                                      printed only when n > 0)
  SHELLS <n>                         (background shells, from the status
                                      line's `\u00b7 <n> shell(s) \u00b7`; printed
                                      only when shown)

Order: TRUST, QUESTION (input box absent), LIMIT (no spinner), BUSY (a
spinner, a busy timer, running agents (AGENTS > 0) or background shells),
READY (effort banner + input box + empty transcript), IDLE. A screen with
running agents or background shells is never READY or IDLE; one that never
ends (a hung agent, a dev server) is caught by the watch stall backstop.
A turn-end line (`<glyph> <Word> for <duration>[ \u00b7 done
<time>]`) is never a busy signal.
TRUST, QUESTION and LIMIT look only at the bottom N non-blank-trailing lines
(default 25). The input box is the prompt
glyph followed by a no-break space; a dim (SGR 2) text after it is a prompt
suggestion, any other visible text is pending input.

LIMIT_RESET is the next future occurrence (after TDRIVE_NOW or the clock) of
`resets <h>[:<mm>]am|pm [(<tz>)]` or `resets in [<n>h] [<m>m]`, as UTC ISO.
AGENTS is the larger of the running agent rows in the agent panel (a large
circle, the agent type, two spaces, its task; nested rows are indented
deeper; a row whose task is a check mark or Done/Completed/Failed/Stopped/
Cancelled has finished) and the largest `<n> background agent(s)` count on
the screen. The agent history line (small circles, `(<n> done)`) is not
counted.
Exit 0 on success, 2 on usage or unreadable input.
"""
import calendar
import hashlib
import os
import re
import sys
import time

PROMPT = "\u276f"
NBSP = "\u00a0"
INPUT_RE = re.compile("^" + PROMPT + NBSP)

TRUST_RE = re.compile(r"Yes, I trust this folder|Bypass Permissions mode|Yes, I trust these settings")
QUESTION_RE = re.compile(
    r"Do you want to (proceed|continue|allow|use)|Enter to select|\(y/n\)|tell Claude what to do differently")
LIMIT_RE = re.compile(r"You've hit your|You've reached your|You're out of usage")
# Spinner glyphs: middle dot, four-teardrop asterisks and `*`. Live 2.1.295
# spinners also read bare `Thundering…` and `Boogieing… (running ... hooks…)`,
# so a capitalized word ending in an ellipsis is the signal; the turn-end line
# (`✻ Cooked for 10s`) has no ellipsis.
SPIN_RE = re.compile("^\\s*[\u00b7\u2722\u2733\u2736\u273b\u273d*] [A-Z][a-z]+\u2026(?:\\s|$)", re.M)
BG_RE = re.compile(
    "Waiting for [0-9]+ background agents? to finish"
    "|[0-9]+[smh] \u00b7 \u2193 [0-9.]+k? tokens"
    "|\u00b7 [0-9]+ shells? \u00b7")
LEGACY_BUSY_RE = re.compile(
    "\\([0-9]+[smh] \u00b7|[0-9]+m [0-9]+s \u00b7|[0-9]+s \u00b7 \u2193|esc to interrupt|Running\u2026")
# Turn-end line: `\u273b Cogitated for 4m 49s \u00b7 done 12:12 AM` (older builds end
# after the duration). It reports a finished turn, so whole lines of this shape
# are removed before the BG and legacy busy patterns run; otherwise a turn of a
# minute or more reads as `<n>m <n>s \u00b7`.
TURN_END_RE = re.compile(
    "^\\s*[\u00b7\u2722\u2733\u2736\u273b\u273d*] [A-Z][a-z]+ for [0-9]+[hms](?: [0-9]+[hms])*"
    "(?: \u00b7 done [0-9]{1,2}:[0-9]{2}(?: ?[AaPp][Mm])?)?[ \t]*$", re.M)
READY_RE = re.compile(r"with (low|medium|high|xhigh|max) effort")
# The boot banner stays on screen after the first turn; READY also needs an
# empty transcript (no assistant line, no echoed user line).
TRANSCRIPT_RE = re.compile("^(?:\u23fa|\u276f )", re.M)
AGENT_ROW_RE = re.compile("^\\s*[\u25ef\u25cf] \\S+  +(\\S.*)$", re.M)
# A finished agent row shows a check mark or a final word instead of its
# running task.
AGENT_FINISHED_RE = re.compile("^(?:[\u2713\u2714\u2717\u2718]|(?:Done|Completed|Failed|Stopped|Cancelled)\\b)")
AGENT_COUNT_RE = re.compile(r"\b([0-9]+) background agents?\b")
SHELLS_RE = re.compile("\u00b7 ([0-9]+) shells? \u00b7")

RESET_AT_RE = re.compile(r"resets (?:at )?([0-9]{1,2})(?::([0-9]{2}))?\s*(am|pm)(?:\s*\(([^)\s]+)\))?", re.I)
RESET_IN_RE = re.compile(r"resets in\s+(?:([0-9]+)\s*h)?\s*(?:([0-9]+)\s*m)?", re.I)
TZ_NAME_RE = re.compile(r"^[A-Za-z0-9_+-]+(?:/[A-Za-z0-9_+-]+)*$")

SGR_RE = re.compile(r"\x1b\[([0-9;:]*)m")
ESC_SEQ_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]")

INPUT_TEXT_MAX = 40


class UsageError(Exception):
    pass


def read_text(path):
    try:
        if path == "-":
            data = sys.stdin.buffer.read()
        else:
            with open(path, "rb") as fh:
                data = fh.read()
    except (IOError, OSError) as exc:
        raise UsageError("cannot read %s: %s" % (path, exc.strerror))
    return data.decode("utf-8", "replace")


def bottom_region(lines, n):
    end = len(lines)
    while end > 0 and not lines[end - 1].strip():
        end -= 1
    return "\n".join(lines[max(0, end - n):end])


def strip_escapes(line):
    return ESC_SEQ_RE.sub("", line)


def input_line_index(lines):
    """Index of the last line that is the input box, or -1."""
    for i in range(len(lines) - 1, -1, -1):
        if INPUT_RE.match(lines[i]):
            return i
    return -1


def parse_input_ansi(line):
    """Split the input-box line of an -e capture into (dim text, normal text)."""
    dim = False
    seen_prompt = False
    skip_nbsp = False
    dim_text = []
    norm_text = []
    i = 0
    while i < len(line):
        if line[i] == "\x1b":
            m = SGR_RE.match(line, i)
            if m:
                for p in (re.split(r"[;:]", m.group(1)) if m.group(1) else ["0"]):
                    if p in ("", "0", "22"):
                        dim = False
                    elif p == "2":
                        dim = True
                i = m.end()
                continue
            m = ESC_SEQ_RE.match(line, i)
            i = m.end() if m else i + 1
            continue
        ch = line[i]
        i += 1
        if not seen_prompt:
            if ch == PROMPT:
                seen_prompt = True
                skip_nbsp = True
            continue
        if skip_nbsp:
            skip_nbsp = False
            if ch == NBSP:
                continue
        (dim_text if dim else norm_text).append(ch)
    return "".join(dim_text), "".join(norm_text)


def classify_input(plain_lines, ansi_text):
    """Return (suggestion, pending, input_text) for the input box, or None."""
    idx = input_line_index(plain_lines)
    if idx < 0:
        return None
    plain_after = plain_lines[idx][2:]
    if ansi_text is None:
        if not plain_after.strip():
            return (None, "no", None)
        return (None, "unknown", None)
    ansi_lines = ansi_text.split("\n")
    a_idx = -1
    for i in range(len(ansi_lines) - 1, -1, -1):
        if INPUT_RE.match(strip_escapes(ansi_lines[i])):
            a_idx = i
            break
    if a_idx < 0:
        return (None, "unknown", None)
    dim_text, norm_text = parse_input_ansi(ansi_lines[a_idx])
    suggestion = "yes" if dim_text.strip() else "no"
    if norm_text.strip():
        return (suggestion, "yes", norm_text.strip()[:INPUT_TEXT_MAX])
    return (suggestion, "no", None)


def _zone_epoch(tz, y, mo, d, h, mi):
    """Epoch of the wall time y-mo-d h:mi in zone tz (None = local), or None."""
    if tz:
        try:
            from zoneinfo import ZoneInfo
            import datetime
            try:
                z = ZoneInfo(tz)
            except Exception:
                return None
            dt = datetime.datetime(y, mo, d, h, mi, tzinfo=z)
            return int(dt.timestamp())
        except ImportError:
            pass
        if not os.path.exists(os.path.join("/usr/share/zoneinfo", tz)):
            return None
        old = os.environ.get("TZ")
        os.environ["TZ"] = tz
        time.tzset()
        try:
            return int(time.mktime((y, mo, d, h, mi, 0, 0, 0, -1)))
        finally:
            if old is None:
                del os.environ["TZ"]
            else:
                os.environ["TZ"] = old
            time.tzset()
    return int(time.mktime((y, mo, d, h, mi, 0, 0, 0, -1)))


def _zone_date(tz, epoch):
    """(y, mo, d) of epoch in zone tz (None = local)."""
    if tz:
        try:
            from zoneinfo import ZoneInfo
            import datetime
            dt = datetime.datetime.fromtimestamp(epoch, ZoneInfo(tz))
            return dt.year, dt.month, dt.day
        except ImportError:
            pass
        old = os.environ.get("TZ")
        os.environ["TZ"] = tz
        time.tzset()
        try:
            lt = time.localtime(epoch)
        finally:
            if old is None:
                del os.environ["TZ"]
            else:
                os.environ["TZ"] = old
            time.tzset()
        return lt.tm_year, lt.tm_mon, lt.tm_mday
    lt = time.localtime(epoch)
    return lt.tm_year, lt.tm_mon, lt.tm_mday


def now_epoch():
    v = os.environ.get("TDRIVE_NOW", "")
    if v:
        try:
            return int(float(v))
        except ValueError:
            raise UsageError("TDRIVE_NOW is not a number: %r" % v)
    return int(time.time())


def iso(epoch):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def limit_reset(text, now):
    m = RESET_IN_RE.search(text)
    if m and (m.group(1) or m.group(2)):
        hours = int(m.group(1) or 0)
        mins = int(m.group(2) or 0)
        return iso(now + hours * 3600 + mins * 60)
    m = RESET_AT_RE.search(text)
    if not m:
        return "unknown"
    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    if hour < 1 or hour > 12 or minute > 59:
        return "unknown"
    hour = hour % 12 + (12 if m.group(3).lower() == "pm" else 0)
    tz = m.group(4)
    if tz and (not TZ_NAME_RE.match(tz) or ".." in tz):
        return "unknown"
    try:
        y, mo, d = _zone_date(tz, now)
    except Exception:
        return "unknown"
    base = calendar.timegm((y, mo, d, 0, 0, 0))
    for day in range(0, 3):
        yy, mm, dd = time.gmtime(base + day * 86400)[:3]
        epoch = _zone_epoch(tz, yy, mm, dd, hour, minute)
        if epoch is None:
            return "unknown"
        if epoch > now:
            return iso(epoch)
    return "unknown"


def agent_count(plain):
    """Running agents shown in the pane, nested included: agent rows whose
    task is not finished, or the largest `<n> background agents` count."""
    rows = len([t for t in AGENT_ROW_RE.findall(plain) if not AGENT_FINISHED_RE.match(t)])
    said = [int(n) for n in AGENT_COUNT_RE.findall(plain)]
    return max([rows] + said)


def classify(plain, ansi=None, bottom=25, now=None):
    """Return the classifier output lines for one capture."""
    lines = plain.split("\n")
    region = bottom_region(lines, bottom)
    has_input = input_line_index(lines) >= 0
    spin = SPIN_RE.search(plain) is not None
    busy_text = TURN_END_RE.sub("", plain)
    agents = agent_count(plain)
    out = []
    extra = []

    if TRUST_RE.search(region):
        state = "TRUST"
        if "Yes, I trust these settings" in region:
            dialog = "settings"
        elif "Bypass Permissions mode" in region:
            dialog = "bypass"
        else:
            dialog = "trust"
        extra.append("DIALOG " + dialog)
    elif QUESTION_RE.search(region) and not has_input:
        state = "QUESTION"
    elif LIMIT_RE.search(region) and not spin:
        state = "LIMIT"
        limit_line = ""
        for line in region.split("\n"):
            if LIMIT_RE.search(line):
                limit_line = line.strip()
        if now is None:
            now = now_epoch()
        extra.append("LIMIT_RESET " + limit_reset(region, now))
        extra.append("LIMIT_HASH " + hashlib.sha1(limit_line.encode("utf-8")).hexdigest())
    elif spin or agents > 0 or BG_RE.search(busy_text) or LEGACY_BUSY_RE.search(busy_text):
        state = "BUSY"
    elif READY_RE.search(plain) and has_input and not TRANSCRIPT_RE.search(plain):
        state = "READY"
    else:
        state = "IDLE"

    out.append("STATE " + state)
    if state == "TRUST":
        out.extend(extra)
    inp = classify_input(lines, ansi)
    if inp is not None:
        suggestion, pending, text = inp
        if suggestion is not None:
            out.append("SUGGESTION " + suggestion)
        out.append("PENDING_INPUT " + pending)
        if text is not None:
            out.append("INPUT_TEXT " + text)
    if state == "LIMIT":
        out.extend(extra)
    if agents > 0:
        out.append("AGENTS %d" % agents)
    shells = [int(n) for n in SHELLS_RE.findall(plain)]
    if shells:
        out.append("SHELLS %d" % max(shells))
    return out


def main(argv):
    plain_path = None
    ansi_path = None
    bottom = 25
    args = argv[1:]
    i = 0
    try:
        while i < len(args):
            a = args[i]
            if a in ("--plain", "--ansi", "--bottom"):
                if i + 1 >= len(args):
                    raise UsageError("%s needs a value" % a)
                v = args[i + 1]
                if a == "--plain":
                    plain_path = v
                elif a == "--ansi":
                    ansi_path = v
                else:
                    try:
                        bottom = int(v)
                    except ValueError:
                        raise UsageError("--bottom must be an integer")
                    if bottom < 1:
                        raise UsageError("--bottom must be >= 1")
                i += 2
                continue
            raise UsageError("usage: pane_classify.py --plain FILE|- [--ansi FILE] [--bottom N]")
        if plain_path is None:
            raise UsageError("usage: pane_classify.py --plain FILE|- [--ansi FILE] [--bottom N]")
        plain = read_text(plain_path)
        ansi = read_text(ansi_path) if ansi_path else None
        lines = classify(plain, ansi, bottom)
    except UsageError as exc:
        sys.stderr.write("pane_classify: %s\n" % exc)
        return 2
    sys.stdout.buffer.write(("\n".join(lines) + "\n").encode("utf-8", "replace"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
