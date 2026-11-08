---
class: report-contradiction
severity: medium
fix: "Do not show verify DEFERRED retry pending when a saved verify result already covers that sha."
promote_to: message-template
---

# Lesson: report-contradiction

A report showed verify PASS and also flagged the same sha as verify DEFERRED with a retry pending.

## Fix
Do not show verify DEFERRED retry pending when a saved verify result already covers that sha.
