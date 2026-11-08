# J-xx <job title>

- Actor: <actor> · Frequency: <frequency> · Stakes: <stakes>
- Trigger: <what happens in the world>
- Outcome (world-state): <observable end state>

## Steps

1. Screen <name> (mockup: <path#anchor>)
   - SEE: <facts the user needs to decide> -> fields (`op.field`)
   - DO: <action> -> `op` + required inputs
   - STATES: loading · empty (<copy>) · error (<code> -> <copy>) · denied (`_actions` reason) · success (-> next step)
2. Screen <name> (mockup: <path#anchor>)
   - SEE: ...
   - DO: ...
   - STATES: ...

## Edge cases

- <refund mid-flow, partial data, offline mobile, ...>

## Acceptance

- Given <context>, when <action>, then <result>.
- E2E script: `<e2e/flows/J-xx.spec>` (runs on the mock first, then unchanged on the real backend)

Rule: if a step needs a fact no op returns, change the contract; never compute it client-side.
