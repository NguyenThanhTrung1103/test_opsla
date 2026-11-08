---
class: false-idle
severity: medium
fix: "Treat a turn end with a running background shell or agent as BUSY, not IDLE."
promote_to: pane-regex
---

# Lesson: false-idle

The pane was read IDLE while background shells or agents ran, or it turned BUSY again with nothing sent.

## Fix
Treat a turn end with a running background shell or agent as BUSY, not IDLE.
