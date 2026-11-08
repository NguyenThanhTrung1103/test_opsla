---
class: false-busy
severity: medium
fix: "Read a turn-end line with no live timer as IDLE; nudge or cook instead of waiting on a static BUSY screen."
promote_to: pane-regex
---

# Lesson: false-busy

The pane was read BUSY while its screen stayed unchanged for several watch ticks, so an idle orchestrator was left waiting.

## Fix
Read a turn-end line with no live timer as IDLE; nudge or cook instead of waiting on a static BUSY screen.
