---
class: nested-fanout-over-cap
severity: high
fix: "Count nested agents against the cap; tell the orchestrator to run at most the cap including nested agents."
promote_to: message-template
---

# Lesson: nested-fanout-over-cap

More agents ran (nested included) than the run's concurrency cap.

## Fix
Count nested agents against the cap; tell the orchestrator to run at most the cap including nested agents.
