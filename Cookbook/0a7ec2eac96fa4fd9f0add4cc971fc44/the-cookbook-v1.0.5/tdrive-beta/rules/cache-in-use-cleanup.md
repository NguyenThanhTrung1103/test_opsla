---
class: cache-in-use-cleanup
severity: high
fix: "Skip the cache while a process references its root; add that process to the entry's process_args_absent."
promote_to: govern-guard
---

# Lesson: cache-in-use-cleanup

Cleanup would remove (or removed) a cache while a running process referenced its root.

## Fix
Skip the cache while a process references its root; add that process to the entry's process_args_absent.
