"""Secret scrubbing for everything tdrive writes outside the engine pane:
reports, handoff briefs and the operate trace.

CLI: scrub.py < text  (stdin -> stdout with secrets masked)

A value already masked as *** is left alone, so scrubbing is idempotent.
Rules only ever get added here; an added rule must not change a report
that holds no secret.
"""
import re
import sys

MASK = "***"

SCRUB_RULES = (
    # URL credentials, token/secret/password/api key/authorization values,
    # OpenAI-style, GitHub and Slack tokens.
    (re.compile(r"://[^/:@\s]+:[^@/\s]+@"), "://***@"),
    (re.compile(r"(?i)(token|secret|password|passwd|api[_-]?key|authorization)\s*[=:]\s*"
                r"(?!\*\*\*)(?:(?:bearer|basic|token)\s+)?\S+"), lambda m: m.group(1) + "=***"),
    (re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{10,}"), MASK),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"), MASK),
    (re.compile(r"xox[abpr]-\S+"), MASK),
    # Environment-style assignments whose name holds KEY, TOKEN, SECRET or
    # PASSWORD (STRIPE_SECRET_KEY=..., AWS_SECRET_ACCESS_KEY: ...): the
    # value is masked, the name kept.
    (re.compile(r"\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*)(\s*[=:]\s*)(?!\*\*\*)\S+"),
     lambda m: m.group(1) + m.group(2) + MASK),
    # A bare bearer token (an HTTP header pasted without its name).
    (re.compile(r"\bBearer\s+(?!\*\*\*)\S{8,}"), "Bearer ***"),
    # Stripe-style live/test secret and restricted keys.
    (re.compile(r"\b[sr]k_(?:live|test)_\w+"), MASK),
    # AWS access key ids.
    (re.compile(r"AKIA[0-9A-Z]{16}"), MASK),
    # JSON web tokens.
    (re.compile(r"eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+"), MASK),
    # PEM private key blocks (to the end of the text when the END line is cut).
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|\Z)"),
     "-----BEGIN PRIVATE KEY----- *** -----END PRIVATE KEY-----"),
)


def scrub(text):
    for rx, repl in SCRUB_RULES:
        text = rx.sub(repl, text)
    return text


def main(argv):
    if len(argv) > 1:
        sys.stderr.write("usage: scrub.py < text\n")
        return 2
    data = sys.stdin.buffer.read().decode("utf-8", "replace")
    sys.stdout.buffer.write(scrub(data).encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
