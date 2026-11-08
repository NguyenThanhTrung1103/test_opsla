"""Signing policy engine for Buildflow gates (experimental engine).

Tiers: authorized (signed only under a valid signed standing authorization),
auto-notify (auto-signed with a heads-up) and halt (never signed by tdrive).
The halt tier is decided here in code: the business and world-evidence gates
below, with an optional -N suffix, and every name that is not a Buildflow gate
tag. policies/signing.yaml can only add halt gates.

CLI (these subcommands only; there is deliberately no authorization writer):
  tier GATE [--policy F] [--entry]
      -> TIER gate=<g> tier=<authorized|auto-notify|halt> reason=<r>   exit 0
      --entry classifies a standing-authorization entry: a gate name, or a
      pattern copied verbatim from the policy's tier lists.
  check-auth --repo R --gate G
      -> auth=valid sha12=<12 hex>                                     exit 0
      -> auth=invalid reason=<r>                                       exit 1
         (reason=allowed-signers-in-repo exits 2)
  tag-audit --repo R --branch B
      -> TAG <tag> tier=<T> signed_by=<x>        (every gate tag reachable from B)
      -> VIOLATION <tag> reason=halt-signed-by-<x>                     exit 0
  body-sha FILE
      -> sha256 of FILE without its body_sha256: line                  exit 0
  chat-check --approved-at ISO --quote Q
      -> exit 0 when the chat approval is well formed: a single-line quote
         of 3..500 chars, ISO UTC time at most 24 h old and not in the future
  approval-add --run R --gate G --tier T --decision D --approved-at ISO
               --quote Q --status approved|signed [--tag-sha SHA]
      -> append one JSON line to runs/R/approvals.jsonl                exit 0
Chat approvals: an operator's approval said in chat and relayed by the driver
(tdrive sign --chat-approval). A halt-tier tag signed operator-delegated is
not a violation when the run's approvals.jsonl holds a `signed` record for
that tag with the same tag object sha.
Exit codes: 0 ok, 1 invalid authorization, 2 usage/config/policy error,
3 environment (not a git repo, branch or tool missing).
"""
import calendar
import fnmatch
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import config  # noqa: E402
import runstate  # noqa: E402
import yamlite  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
POLICY_PATH = os.path.join(ROOT, "policies", "signing.yaml")

# Buildflow sign.sh tag grammar, matched with re.fullmatch (no `$`, so a
# trailing newline never matches).
GATE_RE = re.compile(
    r"(?:intent|spec|plan|proof|fix|tweak|distill)-[0-9]+(?:-[0-9]+)?"
    r"|(?:frame|look|mock|build|market|offer|wishlist|signal|launch-plan|launch)(?:-[0-9]+)?"
)
_BASE_RE = re.compile(r"launch-plan|[a-z]+")
AUTHORIZED, AUTO_NOTIFY, HALT = "authorized", "auto-notify", "halt"
HALT_GATES = frozenset(["frame", "market", "offer", "wishlist", "signal", "launch-plan", "launch"])
POLICY_KEYS = ("version", "halt_extra", "auto_notify", "authorized")

AUTH_REL = ".tdrive/standing-authorization.yaml"
SIG_REL = AUTH_REL + ".sig"
AUTH_FIELDS = ("signer", "issued", "expires", "project", "gates", "body_sha256")
SIG_NAMESPACE = "tdrive-auth"
_SIGNER_RE = re.compile(r"[A-Za-z0-9._%+][A-Za-z0-9._%+-]*(?:@[A-Za-z0-9.-]+)?")
_SHA_RE = re.compile(r"[0-9a-f]{64}")
_DATE_RE = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})(?:T([0-9]{2}):([0-9]{2}):([0-9]{2})Z)?")
_SIGNED_BY_RE = re.compile(r"signed-by:[ \t]*([A-Za-z0-9._-]+)")
# Variables that would point git at another repository than the one asked about.
_GIT_ENV_DROP = ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
                 "GIT_COMMON_DIR", "GIT_NAMESPACE", "GIT_CEILING_DIRECTORIES",
                 "GIT_DISCOVERY_ACROSS_FILESYSTEM", "GIT_ALTERNATE_OBJECT_DIRECTORIES")
VERIFY_TIMEOUT_S = 30
GIT_TIMEOUT_S = 60


class SignError(Exception):
    def __init__(self, code, msg):
        Exception.__init__(self, msg)
        self.code = code


def display(gate):
    """Single-line, printable form of an untrusted gate argument."""
    out = gate.encode("unicode_escape").decode("ascii")
    return out.replace(" ", "\\x20") if out else "''"


# ---- policy and tiers --------------------------------------------------------

def _pattern_list(data, key, path):
    v = data.get(key)
    if not isinstance(v, list):
        raise SignError(2, "%s: %s must be a list" % (path, key))
    for item in v:
        if not isinstance(item, str) or not item or item != item.strip():
            raise SignError(2, "%s: %s entries must be non-empty strings, got %r" % (path, key, item))
    return v


def load_policy(path=None):
    path = path or POLICY_PATH
    if not os.path.isfile(path):
        raise SignError(2, "signing policy not found: %s" % path)
    try:
        data = yamlite.load(path)
    except yamlite.YamlError as exc:
        raise SignError(2, str(exc))
    if not isinstance(data, dict):
        raise SignError(2, "%s: top level must be a map" % path)
    extra = sorted(set(data) - set(POLICY_KEYS))
    if extra:
        raise SignError(2, "%s: unknown key(s): %s" % (path, ", ".join(extra)))
    if data.get("version") != 1:
        raise SignError(2, "%s: version must be 1" % path)
    return {
        "halt_extra": _pattern_list(data, "halt_extra", path),
        "auto_notify": _pattern_list(data, "auto_notify", path),
        "authorized": _pattern_list(data, "authorized", path),
    }


def _matches(gate, patterns):
    for p in patterns:
        if fnmatch.fnmatchcase(gate, p):
            return True
    return False


def gate_base(gate):
    return _BASE_RE.match(gate).group(0)


def tier(gate, policy):
    """(tier, reason). Halt checks run first and cannot be overridden."""
    if not isinstance(gate, str) or not GATE_RE.fullmatch(gate):
        return HALT, "unknown-gate"
    if gate_base(gate) in HALT_GATES:
        return HALT, "business-or-world-evidence"
    if _matches(gate, policy["halt_extra"]):
        return HALT, "halt-extra"
    if _matches(gate, policy["auto_notify"]):
        return AUTO_NOTIFY, "auto-notify"
    if _matches(gate, policy["authorized"]):
        return AUTHORIZED, "authorized"
    return HALT, "unlisted"


def entry_tier(entry, policy):
    """Tier of a standing-authorization entry: a gate, or a verbatim policy pattern."""
    if isinstance(entry, str) and GATE_RE.fullmatch(entry):
        return tier(entry, policy)
    if isinstance(entry, str) and entry in policy["authorized"] and not _could_be_halt(entry):
        return AUTHORIZED, "authorized-pattern"
    if isinstance(entry, str) and entry in policy["auto_notify"]:
        return AUTO_NOTIFY, "auto-notify-pattern"
    return HALT, "unknown-gate"


def _could_be_halt(pattern):
    """A pattern that also covers a halt gate never counts as an authorized entry."""
    for base in HALT_GATES:
        for cand in (base, base + "-2"):
            if fnmatch.fnmatchcase(cand, pattern):
                return True
    return False


# ---- body sha ----------------------------------------------------------------

def body_sha(data):
    kept = [ln for ln in data.splitlines(True) if not ln.startswith(b"body_sha256:")]
    return hashlib.sha256(b"".join(kept)).hexdigest()


# ---- git helpers ---------------------------------------------------------------

def _git_env():
    env = dict(os.environ)
    for k in _GIT_ENV_DROP:
        env.pop(k, None)
    return env


def git(repo, args, check=False):
    try:
        p = subprocess.run(["git", "-C", repo] + list(args), stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, env=_git_env(), timeout=GIT_TIMEOUT_S)
    except OSError as exc:
        raise SignError(3, "cannot run git: %s" % exc)
    except subprocess.TimeoutExpired:
        raise SignError(3, "git %s timed out after %ds" % (" ".join(args), GIT_TIMEOUT_S))
    if check and p.returncode != 0:
        raise SignError(3, "git %s failed: %s" % (" ".join(args), p.stderr.decode("utf-8", "replace").strip()))
    return p.returncode, p.stdout


def repo_toplevel(repo):
    if not os.path.isdir(repo):
        raise SignError(3, "repo dir not found: %s" % repo)
    rc, out = git(repo, ["rev-parse", "--show-toplevel"])
    if rc != 0:
        raise SignError(3, "not a git repo: %s" % repo)
    return os.path.realpath(out.decode("utf-8", "replace").strip())


def head_blob(top, rel):
    """Content of rel at HEAD as a regular file, or None (absent, link or submodule)."""
    rc, out = git(top, ["ls-tree", "HEAD", "--", rel])
    if rc != 0 or not out.strip():
        return None
    mode = out.split(b" ", 1)[0]
    if mode not in (b"100644", b"100755"):
        return None
    rc, data = git(top, ["cat-file", "blob", "HEAD:" + rel])
    return data if rc == 0 else None


def is_clean(top, rel):
    rc, out = git(top, ["status", "--porcelain", "--untracked-files=no", "--", rel])
    return rc == 0 and not out.strip()


def in_git_tree(path):
    """True when path (a file) sits inside a git work tree or git dir."""
    d = os.path.dirname(path)
    if not os.path.isdir(d):
        return False
    rc, out = git(d, ["rev-parse", "--is-inside-work-tree", "--is-inside-git-dir"])
    if rc != 0:
        return False
    return b"true" in out.split()


# ---- config --------------------------------------------------------------------

def load_config(repo):
    try:
        return config.Config(repo=repo)
    except config.ConfigError as exc:
        raise SignError(exc.code, "config: %s" % exc)
    except runstate.RunStateError as exc:
        raise SignError(exc.code, "config: %s" % exc)


# ---- standing authorization ------------------------------------------------------

class AuthInvalid(Exception):
    def __init__(self, reason, code=1, detail=""):
        Exception.__init__(self, reason)
        self.reason = reason
        self.code = code
        self.detail = detail


def parse_time(v):
    if not isinstance(v, str):
        return None
    m = _DATE_RE.fullmatch(v)
    if not m:
        return None
    parts = [int(x) if x is not None else 0 for x in m.groups()]
    try:
        tm = time.struct_time((parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], 0, 1, 0))
        epoch = calendar.timegm(tm)
    except (ValueError, OverflowError):
        return None
    # Reject dates that do not round-trip (2026-02-31 and the like).
    if time.gmtime(epoch)[:6] != tuple(parts):
        return None
    return epoch


def parse_auth(data):
    try:
        text = data.decode("utf-8")
        doc = yamlite.loads(text, AUTH_REL)
    except (UnicodeDecodeError, yamlite.YamlError):
        raise AuthInvalid("parse")
    if not isinstance(doc, dict) or set(doc) != set(AUTH_FIELDS):
        raise AuthInvalid("parse", detail="fields must be exactly: %s" % ", ".join(AUTH_FIELDS))
    signer, project, gates, sha = doc["signer"], doc["project"], doc["gates"], doc["body_sha256"]
    if not isinstance(signer, str) or not _SIGNER_RE.fullmatch(signer):
        raise AuthInvalid("parse", detail="bad signer")
    if not isinstance(project, str) or not project or "\n" in project:
        raise AuthInvalid("parse", detail="bad project")
    if not isinstance(gates, list) or not gates or not all(isinstance(g, str) and g for g in gates):
        raise AuthInvalid("parse", detail="gates must be a non-empty list of strings")
    if not isinstance(sha, str) or not _SHA_RE.fullmatch(sha):
        raise AuthInvalid("parse", detail="bad body_sha256")
    issued, expires = parse_time(doc["issued"]), parse_time(doc["expires"])
    if issued is None or expires is None or expires <= issued:
        raise AuthInvalid("parse", detail="issued/expires must be YYYY-MM-DD[THH:MM:SSZ] with issued < expires")
    return {"signer": signer, "project": project, "gates": gates, "body_sha256": sha,
            "issued": issued, "expires": expires}


def gate_listed(gate, gates, policy):
    if tier(gate, policy)[0] != AUTHORIZED:
        return False
    for entry in gates:
        if entry_tier(entry, policy)[0] != AUTHORIZED:
            continue  # Halt (and auto-notify) entries never authorize anything.
        if fnmatch.fnmatchcase(gate, entry):
            return True
    return False


def ssh_verify(allowed, signer, sig_data, body):
    fd, sig_path = tempfile.mkstemp(prefix="tdrive-auth-", suffix=".sig")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(sig_data)
        cmd = ["ssh-keygen", "-Y", "verify", "-f", allowed, "-I", signer,
               "-n", SIG_NAMESPACE, "-s", sig_path]
        try:
            p = subprocess.run(cmd, input=body, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               timeout=VERIFY_TIMEOUT_S)
        except OSError as exc:
            raise SignError(3, "cannot run ssh-keygen -Y verify: %s" % exc)
        except subprocess.TimeoutExpired:
            return False, "ssh-keygen -Y verify timed out"
        msg = (p.stderr + p.stdout).decode("utf-8", "replace").strip()
        return p.returncode == 0, msg
    finally:
        try:
            os.unlink(sig_path)
        except OSError:
            pass


def check_auth(repo, gate, cfg=None, policy=None):
    """Return (sha12, signer) for a valid authorization; raise AuthInvalid otherwise."""
    top = repo_toplevel(repo)
    if cfg is None:
        cfg = load_config(top)
    if policy is None:
        policy = load_policy()
    driver = cfg.values["signing.driver_identity"][0]
    allowed = cfg.values["signing.allowed_signers"][0]
    max_days = cfg.values["signing.max_auth_days"][0]

    if not os.path.isfile(os.path.join(top, AUTH_REL)):
        raise AuthInvalid("missing")
    body = head_blob(top, AUTH_REL)
    if body is None:
        raise AuthInvalid("untracked")
    if not is_clean(top, AUTH_REL):
        raise AuthInvalid("dirty")
    auth = parse_auth(body)
    if body_sha(body) != auth["body_sha256"]:
        raise AuthInvalid("sha-mismatch")
    now = runstate.now()
    if now < auth["issued"]:
        raise AuthInvalid("not-yet-valid")
    if now >= auth["expires"]:
        raise AuthInvalid("expired")
    if auth["expires"] - auth["issued"] > max_days * 86400:
        raise AuthInvalid("too-long")
    if auth["project"] != os.path.basename(top):
        raise AuthInvalid("wrong-project")
    if auth["signer"].lower() == driver.strip().lower():
        raise AuthInvalid("signer-is-driver")
    if not gate_listed(gate, auth["gates"], policy):
        raise AuthInvalid("gate-not-listed")
    sig = head_blob(top, SIG_REL)
    if not allowed or not os.path.isfile(allowed):
        raise AuthInvalid("unsigned", detail="allowed_signers file not found: %s" % allowed)
    if sig is None:
        raise AuthInvalid("unsigned", detail="%s is missing or not committed" % SIG_REL)
    real_allowed = os.path.realpath(allowed)
    if in_git_tree(real_allowed):
        raise AuthInvalid("allowed-signers-in-repo", code=2,
                          detail="%s is inside a git work tree; keep it in the user config dir" % real_allowed)
    ok, msg = ssh_verify(real_allowed, auth["signer"], sig, body)
    if not ok:
        raise AuthInvalid("sig-invalid", detail=msg)
    return auth["body_sha256"][:12], auth["signer"]


# ---- chat approvals -----------------------------------------------------------------

APPROVALS = "approvals.jsonl"
CHAT_MAX_AGE_S = 24 * 3600
CHAT_FUTURE_S = 300
QUOTE_MIN, QUOTE_MAX = 3, 500


def chat_check(approved_at, quote):
    """None when the chat approval is well formed, else the refusal reason."""
    if not isinstance(quote, str) or "\n" in quote or "\r" in quote:
        return "quote-not-single-line"
    q = quote.strip()
    if len(q) < QUOTE_MIN or len(q) > QUOTE_MAX:
        return "quote-length"
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", approved_at or ""):
        return "approved-at-format"
    at = parse_time(approved_at)
    if at is None:
        return "approved-at-format"
    now = runstate.now()
    if at > now + CHAT_FUTURE_S:
        return "approved-at-future"
    if now - at > CHAT_MAX_AGE_S:
        return "approved-at-too-old"
    return None


def approvals_path(run):
    return os.path.join(runstate.run_dir(runstate.check_run(run)), APPROVALS)


def approval_add(run, rec):
    import json
    path = approvals_path(run)
    old = os.umask(0o077)
    try:
        with open(path, "a") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")
    finally:
        os.umask(old)


def chat_signed(top, tag, tag_sha):
    """True when the run of repo top recorded a chat-approved signing of tag at tag_sha."""
    import json
    try:
        run = runstate.resolve(repo=top)
    except runstate.RunStateError:
        return False
    if not run:
        return False
    try:
        with open(approvals_path(run)) as fh:
            for line in fh:
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if rec.get("gate") == tag and rec.get("status") == "signed" and rec.get("tag_sha") == tag_sha:
                    return True
    except (IOError, OSError, runstate.RunStateError):
        return False
    return False


# ---- tag audit ---------------------------------------------------------------------

def operator_present(cfg):
    value, layer, src = cfg.values["run.operator_present"]
    if value and layer == "repo":
        sys.stderr.write("signing: run.operator_present from the driven repo's config (%s) is ignored\n" % src)
        return False
    return bool(value)


def signed_by(objtype, contents):
    """Signer from a gate tag annotation; lightweight tags carry no signer."""
    if objtype != "tag":
        return "none"
    for line in contents.splitlines():
        if not line.strip():
            continue
        m = _SIGNED_BY_RE.match(line.strip())
        return m.group(1) if m else "none"
    return "none"


def tag_audit(repo, branch):
    top = repo_toplevel(repo)
    cfg = load_config(top)
    policy = load_policy()
    present = operator_present(cfg)
    if branch.startswith("-"):
        raise SignError(2, "invalid branch: %s" % branch)
    ref = branch
    if not branch.startswith("refs/") and git(top, ["show-ref", "--verify", "--quiet", "refs/heads/" + branch])[0] == 0:
        ref = "refs/heads/" + branch  # the branch, even when a gate tag has its name
    rc, _ = git(top, ["rev-parse", "--verify", "--quiet", ref + "^{commit}"])
    if rc != 0:
        raise SignError(3, "branch not found: %s" % branch)
    _, out = git(top, ["tag", "--merged", ref], check=True)
    names = sorted(set(n for n in out.decode("utf-8", "replace").splitlines() if GATE_RE.fullmatch(n)))
    tags, violations = [], []
    for name in names:
        _, raw = git(top, ["for-each-ref", "--format=%(objectname)%00%(objecttype)%00%(contents)",
                           "refs/tags/" + name], check=True)
        objname, _, rest = raw.decode("utf-8", "replace").partition("\0")
        objtype, _, contents = rest.partition("\0")
        who = signed_by(objtype.strip(), contents)
        t = tier(name, policy)[0]
        tags.append("TAG %s tier=%s signed_by=%s" % (name, t, who))
        chat = who == "operator-delegated" and t == HALT and chat_signed(top, name, objname.strip())
        if t == HALT and not (who == "operator" or (who == "operator-delegated" and (present or chat))):
            violations.append("VIOLATION %s reason=halt-signed-by-%s" % (name, who))
    return tags + violations


# ---- CLI -------------------------------------------------------------------------

USAGE = ("usage: signing.py tier GATE [--policy F] [--entry] | check-auth --repo R --gate G"
         " | tag-audit --repo R --branch B | body-sha FILE | chat-check ... | approval-add ...")


def _opts(args, names, flags=()):
    vals, pos, i = {}, [], 0
    while i < len(args):
        a = args[i]
        if a in names:
            if i + 1 >= len(args):
                raise SignError(2, "%s needs a value" % a)
            vals[a] = args[i + 1]
            i += 2
        elif a in flags:
            vals[a] = True
            i += 1
        elif a.startswith("--"):
            raise SignError(2, "unknown option: %s (%s)" % (a, USAGE))
        else:
            pos.append(a)
            i += 1
    return vals, pos


def run_cli(argv):
    out = sys.stdout
    if not argv:
        raise SignError(2, USAGE)
    cmd, args = argv[0], argv[1:]
    if cmd == "tier":
        vals, pos = _opts(args, ("--policy",), ("--entry",))
        if len(pos) != 1:
            raise SignError(2, "usage: signing.py tier GATE [--policy F] [--entry]")
        policy = load_policy(vals.get("--policy"))
        fn = entry_tier if vals.get("--entry") else tier
        t, reason = fn(pos[0], policy)
        out.write("TIER gate=%s tier=%s reason=%s\n" % (display(pos[0]), t, reason))
        return 0
    if cmd == "check-auth":
        vals, pos = _opts(args, ("--repo", "--gate"))
        if pos or "--repo" not in vals or "--gate" not in vals:
            raise SignError(2, "usage: signing.py check-auth --repo R --gate G")
        try:
            sha12, signer = check_auth(vals["--repo"], vals["--gate"])
        except AuthInvalid as exc:
            if exc.detail:
                sys.stderr.write("signing: %s: %s\n" % (exc.reason, exc.detail))
            out.write("auth=invalid reason=%s\n" % exc.reason)
            return exc.code
        out.write("auth=valid sha12=%s\n" % sha12)
        sys.stderr.write("signing: standing authorization by %s is valid for %s\n" % (signer, display(vals["--gate"])))
        return 0
    if cmd == "tag-audit":
        vals, pos = _opts(args, ("--repo", "--branch"))
        if pos or "--repo" not in vals or "--branch" not in vals:
            raise SignError(2, "usage: signing.py tag-audit --repo R --branch B")
        lines = tag_audit(vals["--repo"], vals["--branch"])
        out.write("".join(ln + "\n" for ln in lines))
        return 0
    if cmd == "body-sha":
        if len(args) != 1:
            raise SignError(2, "usage: signing.py body-sha FILE")
        try:
            with open(args[0], "rb") as fh:
                data = fh.read()
        except (IOError, OSError) as exc:
            raise SignError(2, "cannot read %s: %s" % (args[0], exc))
        out.write(body_sha(data) + "\n")
        return 0
    if cmd == "chat-check":
        vals, pos = _opts(args, ("--approved-at", "--quote"))
        if pos or len(vals) != 2:
            raise SignError(2, "usage: signing.py chat-check --approved-at ISO --quote Q")
        why = chat_check(vals["--approved-at"], vals["--quote"])
        if why:
            out.write("chat=invalid reason=%s\n" % why)
            return 1
        out.write("chat=valid\n")
        return 0
    if cmd == "approval-add":
        names = ("--run", "--gate", "--tier", "--decision", "--approved-at", "--quote", "--status", "--tag-sha")
        vals, pos = _opts(args, names)
        if pos or any(n not in vals for n in names[:7]) or vals["--status"] not in ("approved", "signed"):
            raise SignError(2, "usage: signing.py approval-add --run R --gate G --tier T --decision D"
                               " --approved-at ISO --quote Q --status approved|signed [--tag-sha SHA]")
        rec = {"ts": runstate.iso(), "gate": vals["--gate"], "tier": vals["--tier"],
               "decision": vals["--decision"], "approved_at": vals["--approved-at"],
               "quote": vals["--quote"], "status": vals["--status"], "by": "driver", "channel": "chat"}
        if vals.get("--tag-sha"):
            rec["tag_sha"] = vals["--tag-sha"]
        approval_add(vals["--run"], rec)
        return 0
    raise SignError(2, "unknown subcommand: %s (%s)" % (cmd, USAGE))


def main(argv):
    try:
        return run_cli(argv[1:])
    except SignError as exc:
        sys.stderr.write("signing: %s\n" % exc)
        return exc.code
    except runstate.RunStateError as exc:
        sys.stderr.write("signing: %s\n" % exc)
        return exc.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
