#!/bin/bash
# tdrive lint: portability, bash 3.2, GNU-only, bare grep, shebang, no-eval,
# stable-artifact, python 3.8 and syntax checks. Rules are data in
# policies/portability.yaml.
set -u
TD_CMD=lint
case "${BASH_SOURCE[0]}" in */*) TD_HERE=${BASH_SOURCE[0]%/*} ;; *) TD_HERE=. ;; esac
. "$TD_HERE/lib/common.sh"

usage() {
  cat <<'EOF'
usage: tdrive lint [--root DIR] [--paths p1,p2]

Scans the shipped dirs (bin core adapters policies methods kits/tony-drive
VERSION) and tests/ under DIR (default: the tdrive root). --paths limits the
scan to the given files or dirs, relative to DIR. Besides the rules of
policies/portability.yaml, shipped files must not hold the current home dir
path or login name (personal-identity; the login when it has 4 or more
characters and is not a generic one: root user runner ubuntu admin).
Prints one "LINT <rule> <file>:<line> <message>" per finding, then
"LINT OK files=<n>" (exit 0) or "LINT FAIL findings=<n>" (exit 1).
EOF
}

root=$(td_root)
paths=""
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --root)
      [ $# -ge 2 ] || td_die 2 "--root needs a value"
      root=$2; shift 2 ;;
    --paths)
      [ $# -ge 2 ] || td_die 2 "--paths needs a value"
      paths=$2; shift 2 ;;
    *) td_die 2 "unknown argument: $1 (see tdrive lint --help)" ;;
  esac
done
[ -d "$root" ] || td_die 2 "lint root not found: $root"
root=$(cd "$root" && pwd)
rules="$(td_root)/policies/portability.yaml"
[ -f "$rules" ] || td_die 3 "rules file missing: $rules"

login=$(id -un 2>/dev/null) || login=""
python3 -E -s - "$TD_LIB_DIR" "$rules" "$root" "$paths" "${BASH:-/bin/bash}" "${HOME:-}" "$login" <<'PY'
import ast
import os
import py_compile
import re
import subprocess
import sys
import tempfile

lib_dir, rules_path, root, paths_arg, bash_bin, home_dir, login = sys.argv[1:8]
sys.dont_write_bytecode = True
sys.path.insert(0, lib_dir)
import yamlite  # noqa: E402

try:
    cfg = yamlite.load(rules_path)
except yamlite.YamlError as exc:
    sys.stderr.write("lint: %s\n" % exc)
    sys.exit(2)

shipped = cfg["shipped"]
code_also = cfg["code_also"]
exclude_prefixes = cfg["exclude_prefixes"]
exclude_files = set(cfg["exclude_files"])
skip_dirs = set(cfg["skip_dirs"])
prefixes = {
    "command": cfg["cmd_prefix"],
    "command-strict": cfg["cmd_prefix_strict"],
}
id_re = re.compile(cfg["id_pattern"])
case_line_re = re.compile(cfg["case_line_pattern"])
source_re = re.compile(cfg["source_pattern"])
source_ok_re = re.compile(cfg["source_allowed"])
comment_re = re.compile(r"(?:^|\s)#(?!!)(.*)$")

rules = []
for r in cfg["rules"]:
    pos = r["position"]
    pre = prefixes.get(pos, "")
    compiled = [re.compile(pre + p) for p in r["patterns"]]
    allow = set(r.get("allow_files") or [])
    rules.append((r["id"], r["scope"], r["files"], pos, r["message"], compiled, allow))

# personal-identity: the current home dir and login, never stored in a file.
GENERIC_LOGINS = ("root", "user", "runner", "ubuntu", "admin")
identity = []
home_dir = home_dir.rstrip("/")
if home_dir and os.path.basename(home_dir) not in GENERIC_LOGINS:
    identity.append(re.compile(re.escape(home_dir) + r"(?![A-Za-z0-9_.-])"))
if len(login) >= 4 and login not in GENERIC_LOGINS:
    identity.append(re.compile(r"(?<![A-Za-z0-9_-])" + re.escape(login) + r"(?![A-Za-z0-9_-])"))

findings = []


def add(rule, rel, lineno, msg):
    findings.append((rel, lineno, rule, msg))


def under(rel, entry):
    return rel == entry or rel.startswith(entry + "/")


def scope_of(rel):
    if any(under(rel, e) for e in shipped):
        return "shipped"
    return "code"


def excluded(rel):
    if rel in exclude_files:
        return True
    return any(rel.startswith(p) for p in exclude_prefixes)


def walk(rel_start):
    start = os.path.join(root, rel_start) if rel_start else root
    if os.path.isfile(start):
        yield rel_start
        return
    for dirpath, dirnames, filenames in os.walk(start):
        dirnames[:] = sorted(d for d in dirnames if d not in skip_dirs)
        for name in sorted(filenames):
            if name.endswith(".pyc") or name == ".DS_Store":
                continue
            full = os.path.join(dirpath, name)
            yield os.path.relpath(full, root)


targets = []
if paths_arg:
    for p in paths_arg.split(","):
        p = p.strip().strip("/")
        if not p:
            continue
        if not os.path.exists(os.path.join(root, p)):
            sys.stderr.write("lint: no such path under %s: %s\n" % (root, p))
            sys.exit(2)
        targets.append(p)
else:
    for e in shipped + code_also:
        if os.path.exists(os.path.join(root, e)):
            targets.append(e)

files = []
seen = set()
for t in targets:
    for rel in walk(t):
        if rel in seen or excluded(rel):
            continue
        seen.add(rel)
        files.append(rel)


def kind_of(rel, first_line):
    if rel.endswith(".py"):
        return "python"
    if rel.endswith(".sh"):
        return "shell"
    if first_line.startswith("#!") and re.search(r"\b(ba)?sh\b", first_line):
        return "shell"
    return "text"


def is_comment(line):
    return line.lstrip().startswith("#")


def check_zoneinfo(tree, rel):
    parents = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            parents[child] = node
    for node in ast.walk(tree):
        names = []
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            names = [node.module or ""]
        if not any(n == "zoneinfo" or n.startswith("zoneinfo.") for n in names):
            continue
        guarded = False
        cur = node
        while cur in parents:
            par = parents[cur]
            if isinstance(par, ast.Try) and cur in par.body:
                guarded = True
                break
            cur = par
        if not guarded:
            add("py38", rel, node.lineno, "unguarded zoneinfo import (wrap in try/except ImportError)")


pyc_dir = tempfile.mkdtemp(prefix="tdrive-lint-")
try:
    for rel in files:
        full = os.path.join(root, rel)
        try:
            with open(full, "rb") as fh:
                data = fh.read()
        except (IOError, OSError) as exc:
            add("read", rel, 0, "cannot read: %s" % exc.strerror)
            continue
        if b"\0" in data[:8192]:
            continue
        text = data.decode("utf-8", "replace")
        lines = text.split("\n")
        kind = kind_of(rel, lines[0] if lines else "")
        scope = scope_of(rel)
        in_tests = under(rel, "tests")

        for rule_id, rscope, rfiles, pos, msg, pats, allow in rules:
            if rscope == "shipped" and scope != "shipped":
                continue
            if rfiles != "text" and rfiles != kind:
                continue
            if rel in allow:
                continue
            for n, line in enumerate(lines, 1):
                if pos != "any" and is_comment(line):
                    continue
                for pat in pats:
                    m = pat.search(line)
                    if m:
                        add(rule_id, rel, n, "%s: %s" % (msg, m.group(0).strip()[:60]))
                        break

        if scope == "shipped" and identity:
            for n, line in enumerate(lines, 1):
                if any(rx.search(line) for rx in identity):
                    add("personal-identity", rel, n, "current home dir or login name in a shipped file")

        if kind in ("shell", "python") or rel.endswith((".yaml", ".yml")):
            for n, line in enumerate(lines, 1):
                if line.startswith("#!"):
                    continue
                m = comment_re.search(line)
                hit = id_re.search(m.group(1)) if m else None
                if not hit and in_tests and kind == "shell" and case_line_re.search(line):
                    hit = id_re.search(line)
                if hit:
                    add("stable-artifacts", rel, n, "plan/phase/decision id in comment or case name: %s" % hit.group(0))

        if kind == "shell":
            if not lines or lines[0].rstrip("\r") != "#!/bin/bash":
                add("shebang", rel, 1, "first line must be #!/bin/bash")
            for n, line in enumerate(lines, 1):
                if is_comment(line):
                    continue
                for m in source_re.finditer(line):
                    tok = m.group(1).strip("\"'")
                    if not source_ok_re.search(tok):
                        add("no-eval", rel, n, "source of a non-lib file: %s" % m.group(1)[:60])
            proc = subprocess.run([bash_bin, "-n", full], stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE)
            if proc.returncode != 0:
                err = proc.stderr.decode("utf-8", "replace").strip().split("\n")[0]
                m = re.search(r"line (\d+):", err)
                add("bash-n", rel, int(m.group(1)) if m else 0,
                    "syntax error: %s" % err.split(":", 2)[-1].strip()[:80])

        if kind == "python":
            try:
                tree = ast.parse(text, filename=rel, feature_version=(3, 8))
            except SyntaxError as exc:
                add("py38", rel, exc.lineno or 0, "not python 3.8 syntax: %s" % exc.msg)
                tree = None
            if tree is not None:
                check_zoneinfo(tree, rel)
            try:
                py_compile.compile(full, cfile=os.path.join(pyc_dir, "check.pyc"), doraise=True)
            except py_compile.PyCompileError as exc:
                ev = exc.exc_value
                lineno = getattr(ev, "lineno", 0) or 0
                add("py-compile", rel, lineno, "compile error: %s" % getattr(ev, "msg", exc.msg))
finally:
    for name in os.listdir(pyc_dir):
        os.unlink(os.path.join(pyc_dir, name))
    os.rmdir(pyc_dir)

findings.sort()
for rel, lineno, rule_id, msg in findings:
    sys.stdout.write("LINT %s %s:%d %s\n" % (rule_id, rel, lineno, msg))
if findings:
    sys.stdout.write("LINT FAIL findings=%d\n" % len(findings))
    sys.exit(1)
sys.stdout.write("LINT OK files=%d\n" % len(files))
sys.exit(0)
PY
