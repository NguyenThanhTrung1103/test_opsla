"""Single-pass {{key}} template renderer.

Substituted values are never re-scanned. An unknown placeholder is left
literal with a warning on stderr. Every value is sanitized. --single-line
collapses newlines to spaces and sanitizes the result for typing.

CLI:
  render.py TEMPLATE [--var k=v]... [--vars-json FILE] [--single-line]
  render.py --list-placeholders TEMPLATE
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from sanitize import sanitize  # noqa: E402

PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}")
_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")


class RenderError(Exception):
    pass


def _text(v):
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return ""
    return str(v)


def render(template, variables, single_line=False, warn=None):
    clean = dict((k, sanitize(_text(v), keep_newlines=True)) for k, v in variables.items())

    def repl(m):
        key = m.group(1)
        if key in clean:
            return clean[key]
        if warn is not None:
            warn(key)
        return m.group(0)

    out = PLACEHOLDER.sub(repl, template)
    if single_line:
        out = out.replace("\r\n", "\n").rstrip("\n").replace("\n", " ")
        out = sanitize(out)
        if "\n" in out:
            raise RenderError("single-line output contains a newline")
    return out


def placeholders(template):
    seen = []
    for m in PLACEHOLDER.finditer(template):
        if m.group(1) not in seen:
            seen.append(m.group(1))
    return seen


def _read(path):
    try:
        with open(path, "rb") as fh:
            return fh.read().decode("utf-8", "replace")
    except (IOError, OSError) as exc:
        raise RenderError("cannot read %s: %s" % (path, exc.strerror))


def run_cli(argv):
    if len(argv) == 2 and argv[0] == "--list-placeholders":
        for name in placeholders(_read(argv[1])):
            sys.stdout.write(name + "\n")
        return 0
    template_path = None
    variables = {}
    json_vars = {}
    single = False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--var" and i + 1 < len(argv):
            kv = argv[i + 1]
            if "=" not in kv:
                raise RenderError("--var expects k=v, got %r" % kv)
            k, v = kv.split("=", 1)
            if not _KEY_RE.match(k):
                raise RenderError("invalid variable name %r" % k)
            variables[k] = v
            i += 2
        elif a == "--vars-json" and i + 1 < len(argv):
            try:
                data = json.loads(_read(argv[i + 1]))
            except ValueError as exc:
                raise RenderError("--vars-json %s: %s" % (argv[i + 1], exc))
            if not isinstance(data, dict):
                raise RenderError("--vars-json must hold a JSON object")
            for k, v in data.items():
                if isinstance(v, (dict, list)):
                    raise RenderError("--vars-json value for %r must be a scalar" % k)
                json_vars[k] = v
            i += 2
        elif a == "--single-line":
            single = True
            i += 1
        elif a.startswith("--") or template_path is not None:
            raise RenderError("usage: render.py TEMPLATE [--var k=v]... [--vars-json FILE] [--single-line]")
        else:
            template_path = a
            i += 1
    if template_path is None:
        raise RenderError("usage: render.py TEMPLATE [--var k=v]... [--vars-json FILE] [--single-line]")
    merged = dict(json_vars)
    merged.update(variables)

    def warn(key):
        sys.stderr.write("render: unknown placeholder {{%s}} in %s left literal\n" % (key, template_path))

    out = render(_read(template_path), merged, single_line=single, warn=warn)
    if single or not out.endswith("\n"):
        out += "\n"
    sys.stdout.buffer.write(out.encode("utf-8", "replace"))
    return 0


def main(argv):
    try:
        return run_cli(argv[1:])
    except RenderError as exc:
        sys.stderr.write("render: %s\n" % exc)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
