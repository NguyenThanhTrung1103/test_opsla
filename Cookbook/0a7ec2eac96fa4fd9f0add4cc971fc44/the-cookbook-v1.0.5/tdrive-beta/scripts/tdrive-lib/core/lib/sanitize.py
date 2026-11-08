"""Sanitize text before it is typed into a terminal pane or written to a row.

Strips ANSI CSI/OSC/other escape sequences, C0 controls (tab becomes a
space), DEL and C1 controls. Appends a space when the text ends with `;`
(tmux treats a trailing `;` as a command separator).

Newlines are C0 controls and are stripped unless keep_newlines is set
(for multi-line files such as outbox payloads).

CLI: sanitize.py [--keep-newlines] [--text T | -]   (default: stdin)
"""
import re
import sys

_OSC = re.compile(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)")
_CSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
_ESC_OTHER = re.compile(r"\x1b[ -/]*[0-~]?")
_C1_CSI = re.compile(r"\x9b[0-?]*[ -/]*[@-~]")
_CTRL = re.compile(r"[\x00-\x09\x0b-\x1f\x7f-\x9f]")
_CTRL_NL = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def sanitize(text, keep_newlines=False):
    if not isinstance(text, str):
        text = str(text)
    text = text.replace("\t", " ")
    text = text.replace("\r\n", "\n")
    text = _OSC.sub("", text)
    text = _CSI.sub("", text)
    text = _C1_CSI.sub("", text)
    text = _ESC_OTHER.sub("", text)
    text = (_CTRL if keep_newlines else _CTRL_NL).sub("", text)
    if text.endswith(";"):
        text += " "
    return text


def _read_stdin():
    data = sys.stdin.buffer.read()
    return data.decode("utf-8", "replace")


def main(argv):
    keep = False
    text = None
    args = argv[1:]
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--keep-newlines":
            keep = True
        elif a == "--text":
            if i + 1 >= len(args):
                sys.stderr.write("sanitize.py: --text needs a value\n")
                return 2
            text = args[i + 1]
            i += 1
        elif a == "-":
            text = None
        else:
            sys.stderr.write("usage: sanitize.py [--keep-newlines] [--text T | -]\n")
            return 2
        i += 1
    if text is None:
        text = _read_stdin()
    out = sanitize(text, keep_newlines=keep)
    if not out.endswith("\n"):
        out += "\n"
    sys.stdout.buffer.write(out.encode("utf-8", "replace"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
