"""Gate requests in a Claude Code pane (Buildflow `GATE: <tag>` lines).

A gate counts only when it ends the agent's turn: the `GATE: <tag>` line sits
in the last transcript block above the input box (no later `⏺` block, no
later user prompt), so a gate named in narration before more work is never a
request. Each request has an occurrence fingerprint (tag, how many lines of
that gate the screen shows, the last block's text and the user prompt that
started the turn), so the same gate raised again after an amendment is a new
occurrence while an unchanged screen is not.

A gate-like ask is a turn whose last transcript block (an assistant text
block, not a tool call) asks the human without a `GATE:` line:
  approval  "Approve to sign fix-12", "fix-11 waits for your verdict"
            (wait(s|ing) on|for your verdict|approval|sign-off); tag: the gate
            named after "sign", else the last gate tag before the phrase,
            else "-"
  handoff   "Please type /clear" (Buildflow 3.4 law 10 handoff end)
A `GATE:` line ending the turn always wins over an ask.

CLI:
  scan --pane FILE [--run R]
      -> GATE tag=<t> fp=<12 hex> turn_end=<yes|no> seen=<yes|no>
      |  ASK kind=<approval|handoff> tag=<t|-> fp=<12 hex> turn_end=<yes|no> seen=<yes|no>
         (or nothing)
         turn_end: the input box is shown and no spinner runs (a `running
         Stop hooks` spinner still counts as the end). Background agents and
         shells do not matter. seen: R/gates.seen has this fingerprint.
  record --run R --tag T --fp F --outcome O     append to R/gates.seen
  pending --run R --gate G
      -> exit 0 when the run saw gate G raised (gates.seen, or a WAKE GATE G
         line in questions.md), else 1
Exit: 0 ok, 1 not pending, 2 usage.
"""
import hashlib
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pane_classify  # noqa: E402
import runstate  # noqa: E402
import signing  # noqa: E402

LINE_RE = re.compile(r"^\s*(?:⏺\s+)?(?:\*\*)?GATE:\s*(" + signing.GATE_RE.pattern + r")(?:\*\*)?\s*$")
BLOCK_RE = re.compile("^⏺")
PROMPT_ECHO_RE = re.compile("^❯ ")
STOP_HOOK_RE = re.compile(r"running Stop hooks?", re.I)
SEEN_FILE = "gates.seen"
TOOL_BLOCK_RE = re.compile(r"^⏺\s+[A-Za-z_][\w.:-]*\(")
GATE_TOKEN_RE = re.compile(r"(?<![\w-])(" + signing.GATE_RE.pattern + r")(?![\w-])")
ASK_SIGN_RE = re.compile(r"\bapprove\s+(?:to|and)\s+sign\b(?:\s+(\S+))?", re.I)
ASK_VERDICT_RE = re.compile(r"\bwait(?:s|ing)?\s+(?:on|for)\s+your\s+(?:verdict|approval|sign-?off)\b", re.I)
ASK_CLEAR_RE = re.compile(r"\btype\s+`?/clear\b", re.I)


class GateError(Exception):
    pass


def turn_ended(lines, input_idx):
    if input_idx < 0:
        return False
    text = "\n".join(lines)
    if "esc to interrupt" in text:
        return False
    for m in pane_classify.SPIN_RE.finditer(text):
        at = m.end() - 1  # SPIN_RE's leading \s* may start on an earlier blank line
        line_end = text.find("\n", at)
        line = text[text.rfind("\n", 0, at) + 1:line_end if line_end >= 0 else len(text)]
        if not STOP_HOOK_RE.search(line):
            return False
    return True


def scan_text(text):
    """(tag, fp, turn_end) of the gate that ends the turn, or None."""
    lines = text.split("\n")
    input_idx = pane_classify.input_line_index(lines)
    end = input_idx if input_idx >= 0 else len(lines)
    gate_idx, tag = -1, ""
    for i in range(end):
        m = LINE_RE.match(lines[i])
        if m:
            gate_idx, tag = i, m.group(1)
    if gate_idx < 0:
        return None
    # Narration: a later transcript block or user prompt means the turn went on.
    for i in range(gate_idx + 1, end):
        if BLOCK_RE.match(lines[i]) or PROMPT_ECHO_RE.match(lines[i]):
            return None
    block_start = gate_idx
    while block_start > 0 and not BLOCK_RE.match(lines[block_start]):
        block_start -= 1
    prompt = ""
    for i in range(block_start, -1, -1):
        if PROMPT_ECHO_RE.match(lines[i]):
            prompt = lines[i].rstrip()
            break
    count = 0
    for i in range(end):
        m = LINE_RE.match(lines[i])
        if m and m.group(1) == tag:
            count += 1
    block = "\n".join(ln.rstrip() for ln in lines[block_start:gate_idx + 1])
    fp = hashlib.sha1(("%s\0%d\0%s\0%s" % (tag, count, prompt, block)).encode("utf-8", "replace")).hexdigest()[:12]
    return tag, fp, turn_ended(lines, input_idx)


def _gate_token(word):
    w = word.strip("`*_.,;:!?()[]\"'")
    return w if signing.GATE_RE.fullmatch(w) else ""


def ask_text(text):
    """(kind, tag, fp, turn_end) of a gate-like ask that ends the turn, or None."""
    lines = text.split("\n")
    input_idx = pane_classify.input_line_index(lines)
    end = input_idx if input_idx >= 0 else len(lines)
    start = -1
    for i in range(end):
        if BLOCK_RE.match(lines[i]) or PROMPT_ECHO_RE.match(lines[i]):
            start = i
    if start < 0 or PROMPT_ECHO_RE.match(lines[start]) or TOOL_BLOCK_RE.match(lines[start]):
        return None
    body = " ".join(ln.strip() for ln in lines[start:end] if ln.strip())
    body = re.sub(r"^⏺\s*", "", body)
    kind, tag = "", "-"
    if ASK_CLEAR_RE.search(body):
        kind = "handoff"
    else:
        m = ASK_SIGN_RE.search(body)
        if m:
            kind = "approval"
            tag = _gate_token(m.group(1) or "") or "-"
            at = m.start()
        else:
            m = ASK_VERDICT_RE.search(body)
            if m:
                kind, at = "approval", m.start()
        if kind and tag == "-":
            before = GATE_TOKEN_RE.findall(body[:at])
            if before:
                tag = before[-1]
    if not kind:
        return None
    prompt = ""
    for i in range(start, -1, -1):
        if PROMPT_ECHO_RE.match(lines[i]):
            prompt = lines[i].rstrip()
            break
    block = "\n".join(ln.rstrip() for ln in lines[start:end])
    fp = hashlib.sha1(("ask\0%s\0%s\0%s" % (kind, prompt, block)).encode("utf-8", "replace")).hexdigest()[:12]
    return kind, tag, fp, turn_ended(lines, input_idx)


def seen_path(run):
    return os.path.join(runstate.run_dir(runstate.check_run(run)), SEEN_FILE)


def seen_rows(run):
    try:
        with open(seen_path(run)) as fh:
            return [ln.split() for ln in fh if ln.strip()]
    except (IOError, OSError):
        return []


def is_seen(run, fp):
    return any(len(r) >= 2 and r[1] == fp for r in seen_rows(run))


def record(run, tag, fp, outcome):
    for v, what in ((tag, "tag"), (fp, "fp"), (outcome, "outcome")):
        if not v or re.search(r"\s", v):
            raise GateError("%s must be one word" % what)
    path = seen_path(run)
    old = os.umask(0o077)
    try:
        with open(path, "a") as fh:
            fh.write("%s %s %s %s\n" % (tag, fp, runstate.iso(), outcome))
    finally:
        os.umask(old)


def pending(run, gate):
    if any(r and r[0] == gate for r in seen_rows(run)):
        return True
    q = os.path.join(runstate.run_dir(runstate.check_run(run)), "questions.md")
    try:
        with open(q) as fh:
            for ln in fh:
                if re.search(r"\bWAKE GATE %s tier=" % re.escape(gate), ln):
                    return True
    except (IOError, OSError):
        pass
    return False


def _opts(args, names):
    vals, i = {}, 0
    while i < len(args):
        if args[i] not in names or i + 1 >= len(args):
            raise GateError("bad argument: %s" % args[i])
        vals[args[i]] = args[i + 1]
        i += 2
    return vals


def main(argv):
    try:
        if len(argv) < 2:
            raise GateError("usage: gates.py scan|record|pending ...")
        cmd, args = argv[1], argv[2:]
        if cmd == "scan":
            o = _opts(args, ("--pane", "--run"))
            if "--pane" not in o:
                raise GateError("usage: gates.py scan --pane FILE [--run R]")
            try:
                with open(o["--pane"], "rb") as fh:
                    text = fh.read().decode("utf-8", "replace")
            except (IOError, OSError) as exc:
                raise GateError("cannot read %s: %s" % (o["--pane"], exc))
            res = scan_text(text)
            if res:
                tag, fp, ended = res
                seen = bool(o.get("--run")) and is_seen(o["--run"], fp)
                sys.stdout.write("GATE tag=%s fp=%s turn_end=%s seen=%s\n"
                                 % (tag, fp, "yes" if ended else "no", "yes" if seen else "no"))
                return 0
            ask = ask_text(text)
            if ask:
                kind, tag, fp, ended = ask
                seen = bool(o.get("--run")) and is_seen(o["--run"], fp)
                sys.stdout.write("ASK kind=%s tag=%s fp=%s turn_end=%s seen=%s\n"
                                 % (kind, tag, fp, "yes" if ended else "no", "yes" if seen else "no"))
            return 0
        if cmd == "record":
            o = _opts(args, ("--run", "--tag", "--fp", "--outcome"))
            if len(o) != 4:
                raise GateError("usage: gates.py record --run R --tag T --fp F --outcome O")
            record(o["--run"], o["--tag"], o["--fp"], o["--outcome"])
            return 0
        if cmd == "pending":
            o = _opts(args, ("--run", "--gate"))
            if len(o) != 2:
                raise GateError("usage: gates.py pending --run R --gate G")
            return 0 if pending(o["--run"], o["--gate"]) else 1
        raise GateError("unknown subcommand: %s" % cmd)
    except (GateError, runstate.RunStateError) as exc:
        sys.stderr.write("gates: %s\n" % exc)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
