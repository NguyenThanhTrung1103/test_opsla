# Output adapter: generic build brief

Input: INTENT.md (intent/v1.x). Output: BRIEF.md for any AI coding agent. Use only the INTENT headings. Never add a requirement or a value that is not in INTENT.

```
# Brief: {name}
## Goal              Need + Problem in ≤ 3 lines
## Scope             INTENT Scope In (numbered) · Out
## User journey      INTENT Journey steps marked In
## Rules (binding)   INTENT Decisions, verbatim · PROFILE standing policy if supplied
## Owner keys        every Open business value: name — owner — no default in code; production refuses placeholders
## Definition of done  INTENT Done, each with "show the command or screen that proves it"
## Recipes           attach each recipe file named in INTENT Recipes; its decisions already answered in INTENT are binding, the rest use the recipe defaults at your approval gate; its proof section runs before done
## Out of scope      INTENT Out + "anything needing an invented value: stop and ask"
```
