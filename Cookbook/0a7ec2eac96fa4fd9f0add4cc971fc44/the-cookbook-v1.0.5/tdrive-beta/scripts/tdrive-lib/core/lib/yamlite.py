"""Restricted YAML subset loader (python3 stdlib only).

Supported: block maps, nested indentation (spaces only), block lists
(including lists of maps), scalars (int, float, true/false, null/~, plain,
single-quoted, double-quoted with \\n \\t \\" \\\\ escapes), single-line flow
lists, and `#` comments outside quotes.

Rejected with exit 2 and `yamlite: <file>:<line>: <msg>`: tabs, anchors and
aliases, block scalars (| and >), flow maps, tags, duplicate keys and bad
indentation.

CLI: yamlite.py load FILE   -> prints JSON
"""
import json
import re
import sys

_INT_RE = re.compile(r"^[-+]?[0-9]+$")
_FLOAT_RE = re.compile(r"^[-+]?([0-9]+\.[0-9]*|\.[0-9]+|[0-9]+)([eE][-+]?[0-9]+)?$")
_ESCAPES = {"n": "\n", "t": "\t", '"': '"', "\\": "\\"}


class YamlError(Exception):
    def __init__(self, name, lineno, msg):
        Exception.__init__(self, "yamlite: %s:%d: %s" % (name, lineno, msg))
        self.name = name
        self.lineno = lineno
        self.msg = msg


class _Line(object):
    __slots__ = ("indent", "text", "lineno")

    def __init__(self, indent, text, lineno):
        self.indent = indent
        self.text = text
        self.lineno = lineno


def _strip_comment(raw, name, lineno):
    """Remove a trailing comment outside quotes; reject tabs."""
    out = []
    quote = None
    i = 0
    n = len(raw)
    while i < n:
        c = raw[i]
        if c == "\t":
            raise YamlError(name, lineno, "tab character not allowed")
        if quote is None:
            if c == "#" and (i == 0 or raw[i - 1] == " "):
                break
            if c in ("'", '"'):
                # A quote only opens a string at a token start.
                prev = raw[:i].rstrip()
                if prev == "" or prev.endswith((":", "-", "[", ",")):
                    quote = c
        elif quote == '"':
            if c == "\\" and i + 1 < n:
                out.append(c)
                out.append(raw[i + 1])
                i += 2
                continue
            if c == '"':
                quote = None
        elif quote == "'":
            if c == "'":
                if i + 1 < n and raw[i + 1] == "'":
                    out.append("''")
                    i += 2
                    continue
                quote = None
        out.append(c)
        i += 1
    return "".join(out).rstrip()


def _tokenize(text, name):
    lines = []
    for idx, raw in enumerate(text.split("\n"), 1):
        raw = raw.rstrip("\r")
        body = _strip_comment(raw, name, idx)
        if body.strip() == "":
            continue
        indent = len(body) - len(body.lstrip(" "))
        lines.append(_Line(indent, body[indent:], idx))
    return lines


def _parse_double(s, name, lineno):
    """Parse a double-quoted string starting at s[0] == '"'. Returns (value, rest)."""
    out = []
    i = 1
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            if i + 1 >= n:
                break
            e = s[i + 1]
            if e not in _ESCAPES:
                raise YamlError(name, lineno, "unsupported escape \\%s" % e)
            out.append(_ESCAPES[e])
            i += 2
            continue
        if c == '"':
            return "".join(out), s[i + 1:]
        out.append(c)
        i += 1
    raise YamlError(name, lineno, "unterminated double-quoted string")


def _parse_single(s, name, lineno):
    out = []
    i = 1
    n = len(s)
    while i < n:
        c = s[i]
        if c == "'":
            if i + 1 < n and s[i + 1] == "'":
                out.append("'")
                i += 2
                continue
            return "".join(out), s[i + 1:]
        out.append(c)
        i += 1
    raise YamlError(name, lineno, "unterminated single-quoted string")


def _plain(s):
    if s in ("true", "True", "TRUE"):
        return True
    if s in ("false", "False", "FALSE"):
        return False
    if s in ("null", "Null", "NULL", "~"):
        return None
    if _INT_RE.match(s):
        return int(s)
    if _FLOAT_RE.match(s):
        return float(s)
    return s


def _check_plain_start(s, name, lineno):
    c = s[0]
    if c in "&*":
        raise YamlError(name, lineno, "anchors and aliases are not supported")
    if c == "!":
        raise YamlError(name, lineno, "tags are not supported")
    if c in "|>":
        raise YamlError(name, lineno, "block scalars (| and >) are not supported")
    if c == "{":
        raise YamlError(name, lineno, "flow maps are not supported")


def _scalar(s, name, lineno, in_flow=False):
    s = s.strip()
    if s == "":
        return None
    if s[0] == '"':
        val, rest = _parse_double(s, name, lineno)
    elif s[0] == "'":
        val, rest = _parse_single(s, name, lineno)
    else:
        _check_plain_start(s, name, lineno)
        if s[0] == "[":
            if in_flow:
                raise YamlError(name, lineno, "nested flow lists are not supported")
            return _flow_list(s, name, lineno)
        return _plain(s)
    if rest.strip() != "":
        raise YamlError(name, lineno, "unexpected text after quoted string")
    return val


def _flow_list(s, name, lineno):
    if not s.endswith("]"):
        raise YamlError(name, lineno, "flow list must close on the same line")
    inner = s[1:-1]
    items = []
    buf = []
    quote = None
    i = 0
    while i < len(inner):
        c = inner[i]
        if quote:
            buf.append(c)
            if quote == '"' and c == "\\" and i + 1 < len(inner):
                buf.append(inner[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in ("'", '"'):
            quote = c
            buf.append(c)
        elif c == ",":
            items.append("".join(buf))
            buf = []
        elif c in "[]{":
            raise YamlError(name, lineno, "nested flow collections are not supported")
        else:
            buf.append(c)
        i += 1
    if quote:
        raise YamlError(name, lineno, "unterminated string in flow list")
    tail = "".join(buf)
    if tail.strip() != "" or items:
        items.append(tail)
    out = []
    for it in items:
        if it.strip() == "":
            raise YamlError(name, lineno, "empty flow list item")
        out.append(_scalar(it, name, lineno, in_flow=True))
    return out


def _split_key(text, name, lineno):
    """Return (key, rest) if text is a `key: value` entry, else None."""
    if text[0] in ("'", '"'):
        if text[0] == '"':
            key, rest = _parse_double(text, name, lineno)
        else:
            key, rest = _parse_single(text, name, lineno)
        if rest == ":" or rest.startswith(": "):
            return key, rest[1:]
        return None
    if text[0] in "[{&*!|>":
        return None
    m = re.search(r":( |$)", text)
    if not m:
        return None
    key = text[:m.start()].rstrip()
    if key == "":
        return None
    return key, text[m.start() + 1:]


def _is_item(text):
    return text == "-" or text.startswith("- ")


class _Parser(object):
    def __init__(self, lines, name):
        self.lines = lines
        self.name = name
        self.pos = 0

    def peek(self):
        if self.pos < len(self.lines):
            return self.lines[self.pos]
        return None

    def err(self, line, msg):
        raise YamlError(self.name, line.lineno, msg)

    def parse_block(self, indent):
        line = self.peek()
        if _is_item(line.text):
            return self.parse_list(indent)
        return self.parse_map(indent)

    def parse_value_after_key(self, line, indent, rest):
        """Value for `key:` with rest text; may consume nested lines."""
        if rest.strip() != "":
            return _scalar(rest, self.name, line.lineno)
        nxt = self.peek()
        if nxt is None:
            return None
        if nxt.indent > indent:
            return self.parse_block(nxt.indent)
        if nxt.indent == indent and _is_item(nxt.text):
            return self.parse_list(indent)
        return None

    def parse_map(self, indent):
        result = {}
        while True:
            line = self.peek()
            if line is None or line.indent < indent:
                return result
            if line.indent > indent:
                self.err(line, "bad indentation")
            if _is_item(line.text):
                self.err(line, "unexpected list item in a map")
            kv = _split_key(line.text, self.name, line.lineno)
            if kv is None:
                self.err(line, "expected 'key: value'")
            key, rest = kv
            if key in result:
                self.err(line, "duplicate key '%s'" % key)
            self.pos += 1
            result[key] = self.parse_value_after_key(line, indent, rest)

    def parse_list(self, indent):
        result = []
        while True:
            line = self.peek()
            if line is None or line.indent < indent:
                return result
            if line.indent > indent:
                self.err(line, "bad indentation")
            if not _is_item(line.text):
                return result
            body = line.text[1:]
            stripped = body.lstrip(" ")
            if stripped == "":
                self.pos += 1
                nxt = self.peek()
                if nxt is not None and nxt.indent > indent:
                    result.append(self.parse_block(nxt.indent))
                else:
                    result.append(None)
                continue
            child_indent = indent + 1 + (len(body) - len(stripped))
            if _is_item(stripped) or _split_key(stripped, self.name, line.lineno) is not None:
                # Re-read the item body as a virtual line at its own column.
                self.lines[self.pos] = _Line(child_indent, stripped, line.lineno)
                result.append(self.parse_block(child_indent))
                continue
            self.pos += 1
            result.append(_scalar(stripped, self.name, line.lineno))


def loads(text, name="<string>"):
    lines = _tokenize(text, name)
    if not lines:
        return None
    first = lines[0]
    if first.indent != 0:
        raise YamlError(name, first.lineno, "bad indentation")
    p = _Parser(lines, name)
    value = p.parse_block(0)
    if p.pos < len(lines):
        raise YamlError(name, lines[p.pos].lineno, "bad indentation")
    return value


def load(path):
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except (IOError, OSError) as exc:
        raise YamlError(path, 0, "cannot read file: %s" % exc.strerror)
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise YamlError(path, 0, "file is not valid UTF-8")
    return loads(text, path)


def main(argv):
    if len(argv) != 3 or argv[1] != "load":
        sys.stderr.write("usage: yamlite.py load FILE\n")
        return 2
    try:
        value = load(argv[2])
    except YamlError as exc:
        sys.stderr.write(str(exc) + "\n")
        return 2
    sys.stdout.write(json.dumps(value, indent=2, sort_keys=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
