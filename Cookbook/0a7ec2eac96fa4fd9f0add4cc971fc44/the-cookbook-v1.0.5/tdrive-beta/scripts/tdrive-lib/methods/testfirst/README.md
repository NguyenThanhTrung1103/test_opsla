# testfirst method pack

Test-first drive pattern: RED (strongest model writes the tests, `test(phase-NN): red …`) → GREEN (cheaper model implements; tests read-only; changes only via `test(phase-NN): fix …` with a reason) → GATE (`tdrive testlock run`, deterministic).

## Use

- `tdrive start <engine> <dir> "<brief>" --method testfirst`, or config `methods: [testfirst]`; `start` appends `directives.md` under `### Method: testfirst` in the BRIEF's orchestrator directives.
- Loop gate (opt-in): `gate.testlock: true` makes the loop run `tdrive testlock check` for each phase marked Done; a FAIL wakes `stop=testlock`.
- `gate.commands` (YAML list, e.g. `["go build ./...", "go vet ./...", "go test ./..."]`) are what `tdrive testlock run` runs; empty means the verify targets. `gate.test_globs` sets the locked files.

## Files

| File | Purpose |
|---|---|
| `directives.md` | the injected rules: phase shape, RED checklist, GREEN read-only rule, test-fix commits, GATE, commit subjects testlock relies on, metrics |
