---
workbook: booking
version: "1.0"
kind: feature
risk: high
requires: []
pairs_with: [auth-roles, payments, monitor]
provides:
  - "POST create-reservation (public)"
  - "GET availability (public)"
  - "GET reservation-by-code (public, no PII)"
  - "staff list/reschedule/cancel endpoints"
  - "events: booking.created, booking.cancelled"
status: stable
---

<!-- This is a WORKBOOK — one recipe of the AI App Cookbook, in the Workbook System format (see FRAMEWORK.md). The human attaches this file to Claude Code and says "build this workbook." Everything below §1 is Claude's contract, not learner reading. -->

# Booking · Workbook

## §1 START HERE (for you, the human)

**What you get:** your customers reserve your scarce thing — a seat, a room, a staff member's hour, a table, a unit of stock — and the system NEVER gives the same slot to two people, even when two people click at the exact same second.

**What to say:** "Build this workbook: @booking.workbook.md" — or just attach it and say "build this". (VN: "Xây workbook này.")

**What you'll see:** Claude first prints a short Stack Report (what it found in your project, whether it's building NEW or INTEGRATING into your existing app, and what it will build — ≤12 lines) and waits for your OK. Then it builds and tests itself — including firing ten simultaneous bookings at one slot to prove only one wins. At the end it hands you a short checklist of things to click in your running app — when you've seen them all, it's done.

## §2 THE CONTRACT

**The job:** a customer picks a {service}, a {resource}, and a time window; the system confirms the reservation with a code — and guarantees that no {resource} is ever double-booked.

**Vocabulary mapping** (adapt these words to the human's business — detect from their app/brief; ask only if truly ambiguous):

| Word in this workbook | Means in the human's app |
|---|---|
| {resource} | the scarce thing being reserved — technician, room, table, seat, court, vehicle, stock unit |
| {service} | what's being booked on the resource — it defines the DURATION and the PRICE (a 60-min massage, a 2-hour court rental, an overnight stay) |
| {window} | the reserved time span: start + end, where end is DERIVED from the service, never sent by the client |
| {code} | the opaque public reference the customer holds — their only handle; no customer account exists in this workbook |

**Invariants — each one is testable and each one maps to a check in §7:**

- **I1 (the promise):** two confirmed reservations for the same {resource} never overlap in time — overlap tested on half-open intervals `[start, end)`, so back-to-back is always legal.
- **I2 (server authority):** the server derives `end` (from the service's duration) and the price from its OWN data; any client-sent end, duration, or price is ignored.
- **I3 (cancel frees):** cancelling is a soft status change (the row survives for history), it is idempotent, and the slot becomes bookable again immediately.
- **I4 (the code is the handle):** every reservation gets an opaque, unguessable {code}; the public status endpoint answers to the code alone and returns zero PII.
- **I5 (only real slots):** a reservation must fit inside the resource's availability (working hours minus blocked time) and the resource must actually offer the service — enforced server-side.

**Out of scope (do not build, even if tempting):** taking payment (the `payments` workbook listens for `booking.created`) · reminder messages (the `notify` layer here is a seam + one best-effort email/log, nothing more) · customer accounts/login · waitlists · recurring bookings · multi-resource bundles.

**About the OTHER recipes named here (`payments`, `auth-roles`, `monitor`):** these are SEPARATE workbooks you may not have yet — this workbook NEVER requires them to build. If absent, you ship the defined stub: staff endpoints ship DISABLED with a clear message (§6 fail-closed, `auth-roles` flips them on later) · the `payment_ref` slot stays null (`payments` fills it later) · `booking.created`/`booking.cancelled` still emit to a log-line listener even if nothing else subscribes (`monitor`/`payments` subscribe later). Build booking standalone; the seams wait.

**Slots the human MAY customize before attaching** (edit these lines, nothing else): the {resource}/{service} words above · the grid size (default **15 minutes** — every start time snaps to it) · whether creating a reservation is public (default) or staff-only · the availability window shown to customers (default next **31 days**).

## §2a THE DOMAIN MODEL (the real entities + how they relate)

**Entities** (the nouns booking really has):

| Entity | Key fields | What it is |
|---|---|---|
| resource | id, name, active | the scarce thing being reserved — only ONE reservation may hold a given time window on it |
| service | id, name, duration_minutes, price | what's booked on a resource; it DEFINES duration + price (the server's source of truth for both) |
| resource_service | resource_id, service_id | which services each resource offers — a reservation is only legal if this pairing exists |
| availability_hours | resource_id, weekday, open, close | the recurring working hours a resource can be booked within |
| block | resource_id, start, end, reason | a one-off unavailable span (holiday, maintenance) subtracted from availability |
| reservation | id, code, resource_id, service_id, start, end, status, customer_name, customer_contact, payment_ref | the booking itself; `end` derived from service; `code` is the customer's public handle; `payment_ref` reserved for the payments workbook |
| slot_claim | resource_id, unit_start | (rungs B/C only) one row per grid unit a reservation occupies; the UNIQUE index here is what closes the race |
| audit_entry | reservation_id, actor, action, old, new, at | append-only history of create/reschedule/cancel |

**Relationships:**

- resource has-many reservations; reservation belongs-to exactly one resource and one service.
- resource has-many services THROUGH resource_service (a reservation's service must be in this set — I5).
- resource has-many availability_hours and has-many blocks (together they define the bookable windows — I5).
- reservation has-many slot_claims (rungs B/C); cancelling a reservation deletes its claims but soft-keeps the reservation row.
- reservation has-many audit_entries.

**Lifecycle / state:**

- reservation.status: `confirmed` → `cancelled` (soft; the row survives for history — I3) · `confirmed` → `rescheduled` re-runs all §2 checks against the new window excluding itself. Cancel is one-way and idempotent; a cancelled slot is immediately bookable again. Times stored in ONE zone (UTC or the business's explicit local zone — fixed at detect time, never mixed — see §9).

## §2b DECISIONS & TRADE-OFFS (surfaced at the gate — never silently guessed)

| Decision | Options | When to pick which | Default |
|---|---|---|---|
| Buffer time between reservations | none / fixed N min / per-service | none for back-to-back businesses (courts, desks); fixed if every booking needs cleanup/turnover; per-service when turnover depends on the service (a deep-clean vs a quick cut) | none (back-to-back legal via half-open intervals) |
| Overbooking policy | never / allow N / waitlist | never for physical single-capacity resources (a table, a room); allow N only if the resource genuinely has N interchangeable units; waitlist is a separate feature (out of scope here) | never — the whole point of I1 |
| Cancellation window | free-until-X / always-free / non-refundable | free-until-X when a payment/no-show cost exists (pairs with payments); always-free for zero-cost bookings; non-refundable only with payments installed | always-free (this workbook takes no money — the payments workbook owns refund policy) |
| Grid size | 5 / 15 / 30 / 60 min | finer grid = more precise starts but more claim rows; match the business's real booking granularity | 15 min |
| Who creates reservations | public / staff-only | public for self-serve customer booking; staff-only for phone/in-person businesses that book on the customer's behalf | public |

Claude states each of these at the §3 gate with its default and asks the human to confirm or change — none is guessed silently.

## §2c GOTCHAS / HOW IT GOES WRONG (this domain's classic mistakes)

- **Modeling duration/price on the reservation instead of the service** → clients can tamper them; derive both from the service record, always (I2). Store the true minutes on the reservation only for display.
- **One giant `bookings` table with a text "resource" column** → no way to enforce a resource offers a service, no availability model, no clean double-book constraint. Model resource / service / resource_service / availability as real entities (§2a).
- **Treating availability as free-text hours** → can't compute free slots or subtract blocks. Model recurring hours + one-off blocks as data, compute availability from them (I5).
- **Hard-deleting a cancelled reservation** → destroys history, audit trail, and any payment_ref pointing at it. Soft-cancel only (I3).
- **No `code` handle, exposing the numeric id** → customers can enumerate other people's bookings. The public handle is an opaque unguessable code (I4).
- **Mixing storage of local and UTC times** → a DST boundary makes the system double-book "impossibly". Pick ONE zone at detect time, write it in the Stack Report, never mix (see §9).

## §3 DETECT (do this before touching any file)

<!-- FIXED boilerplate — identical in every workbook. -->

1. **Inspect:** manifest files (`package.json`, `go.mod`, `requirements.txt`, `Gemfile`, `composer.json`…), lockfiles, platform config (`wrangler.toml`, `next.config.*`, `Dockerfile`…), existing migrations/schema, the existing auth pattern, the test runner, the folder layout — and `WORKBOOKS.md` at project root if it exists (workbooks already installed). For Mode INTEGRATE, ALSO read any existing resource/customer/schedule models this booking feature must relate to or extend.
2. **Decide the build mode:** **NEW** (no booking surface exists — scaffold resources, services, availability, reservations fresh) or **INTEGRATE** (the app already has resources/customers/a schedule — read them, state where booking attaches to the existing models, extend rather than duplicate). Print which mode and what it means.
3. **Print the Stack Report** — one small table: language · runtime · framework · database · migration tool · auth · hosting · test runner · conventions observed · build mode (NEW / INTEGRATE). Name unknowns as unknown; never guess.
4. **Confirm the decisions** in §2b — state each with its default (buffer, overbooking, cancellation window, grid, public-vs-staff) and ask the human to confirm or change.
5. **Choose your rung** from the guarantee ladder below. The ladder is written against CAPABILITIES, never brand names — an unfamiliar stack still lands on a rung.
6. **Gate:** print the Stack Report (with build mode) + confirmed decisions + chosen rung + a plain-words build plan (≤12 lines total) and WAIT for the human's OK before writing any code.

**Iron rules:** extend, never replace (no new framework/DB/ORM into an existing app; in INTEGRATE mode, plug into the existing resource/customer models, don't duplicate them) · match the house style (naming, folders, error shapes) · missing capability = propose the smallest honest addition native to the detected hosting, and wait.

**Adaptation ladder — the double-book guarantee (I1). The rung decides WHERE the guarantee lives; higher rungs put it in the database, where a race cannot slip past it. A check in application code narrows a race; only the storage layer closes it.**

- **Rung A — DB supports range/exclusion constraints (e.g. detected Postgres):** one `reservations` table + an EXCLUSION constraint over `(resource_id, time_range)` restricted to non-cancelled rows; a losing concurrent insert violates the constraint → map to 409. Variable durations need no grid at the storage layer.
- **Rung B — DB supports transactions + unique indexes (most SQL engines):** reservations claim their window as grid units: alongside `reservations`, a `slot_claims` table with `UNIQUE(resource_id, unit_start)`; creating a reservation inserts the reservation row AND one claim row per grid unit of its window, all inside ONE transaction; any unique violation rolls the whole thing back → 409. Cancel deletes the claims (the reservation row soft-survives).
- **Rung C — no interactive transactions, but atomic batch writes exist (e.g. detected Cloudflare D1, some serverless SQL):** same `slot_claims` design as Rung B, written via the platform's atomic batch — the unique index still closes the race because the batch fails or lands as a unit → 409.
- **Rung D — storage can enforce no uniqueness at all (KV-only, spreadsheet-backed, flat files):** check-then-insert with a re-check immediately before write — and print this WARNING in plain words: "Your storage cannot enforce the never-double-book guarantee; under simultaneous clicks a double-book remains possible. I recommend adding {the lightest capable DB native to the detected hosting}." Proceed only if the human types "accept the risk".

**Grid rule (rungs B/C):** every service duration is snapped UP to whole grid units (default 15 min) for claiming purposes; the reservation row keeps the true minutes for display.

## §4 THE LAYERS (build in this order; one responsibility per layer)

| Layer | This feature puts here |
|---|---|
| route | `POST /reservations` (create) · `GET /availability?resource&from&to` · `GET /reservations/{code}` (public status) · `GET /reservations` + `PATCH /reservations/{id}` (reschedule/status) + `DELETE /reservations/{id}` (soft-cancel) for staff — thin handlers, zero logic |
| validation | edge schema checks: required fields, types, date/time formats, grid alignment of `start`; reject unknown fields; NO business rules here |
| auth | per-endpoint guards per the §6 matrix; staff endpoints wired to the project's existing auth — or shipped disabled (see §6 fail-closed) |
| command | `createReservation` orchestrates: load service + resource → derive `end` + price (I2) → run domain checks → persist via the §3 rung → emit `booking.created` → return code. **On rungs C/B the domain overlap/availability checks are ADVISORY (fast-fail for a nice message + UX); the ONLY thing that closes the race is the storage-layer UNIQUE violation → 409. Do NOT wrap the persist in a retry loop to "handle" the conflict — a 409 is the correct final answer, not a transient error (§9).** Sibling commands: `cancelReservation`; `rescheduleReservation` — re-runs all checks against the new window EXCLUDING itself, which on rungs B/C means: inside ONE batch, DELETE this reservation's own `slot_claims` first, THEN insert the new claims (otherwise the reservation's old claims collide with its own new ones and self-409) |
| domain | PURE functions, no framework/DB imports: `overlaps(a, b)` on half-open intervals · `fitsAvailability(window, hours, blocks)` · `offersService(resource, service)` · `snapToGrid(window, gridMin)` · `deriveEnd(start, service)` — each unit-testable in isolation |
| persistence | repository functions — the ONLY place queries live; the §3 rung (constraint / claims+txn / claims+batch / re-check) lives HERE; also `findReservationsInRange(resource, from, to)` as the single availability read |
| event | `booking.created` and `booking.cancelled` emitted through one small in-process dispatcher — the seam exists even if today's only listener is a log line |
| listener | one best-effort notification listener on `booking.created` (email/log to the resource owner) — never throws into the request path; fire-and-forget per platform idiom |
| adapter | the outbound email/notify call wrapped in ONE module; credentials from env; a missing credential means "log and skip", never "crash the booking" |
| audit | append-only record for create / reschedule / cancel: who (staff id or "customer"), what, old/new values, when |

**Rules:** domain functions stay pure · all queries behind persistence functions · a layer that truly doesn't apply is declared n/a with one line of why — never silently skipped, never faked · follow the project's existing layout for where these files live.

## §5 HOLD THE LOAD (implement silently; verified in §7)

- Staff list endpoint paginated by default (cap 50, cursor or offset per house convention) and filterable by date range + resource.
- Indexes ship with the schema: `(resource_id, start)` on reservations (or the rung's claims index, which doubles as the lookup path) + `UNIQUE(code)`.
- Availability for a range is computed from ONE `findReservationsInRange` query + one hours/blocks read — never a query per slot, never "fetch all reservations ever" (no N+1, bounded reads). **The free-slot algorithm (the hardest piece — here is the recipe, don't leave it to guess):** for each day in `[from, to]`: (1) start from that weekday's `availability_hours` as the day's open window(s); (2) SUBTRACT every `block` overlapping the day; (3) SUBTRACT every non-cancelled reservation's window for that resource — leaving a set of free `[start, end)` gaps; (4) within each gap, emit the bookable START times by stepping the grid (default 15 min) from the gap start while a full `service.duration` still fits before the gap end. Output = a list of free start-instants (or free `[start,end)` windows) per day. All interval math is half-open `[start, end)` (§9). This is a pure function over (hours, blocks, reservations, service, grid) — unit-test it in isolation.
- `POST /reservations` accepts an idempotency key (header or field, per house convention); a replay with the same key returns the ORIGINAL reservation, never a duplicate — a double-tapped submit button must not become two bookings. **The contract, spelled out (do not ship this vague):** store the key in its own table `idempotency_key(key PRIMARY KEY, request_hash, reservation_id, created_at)`; the key's uniqueness scope is the key STRING alone (the client owns generating a unique one, e.g. a UUID per submit); on replay, if the stored `request_hash` matches the new body → return the stored reservation, if it MISMATCHES (same key, different body) → `422` (a reused key for a different booking is a client bug, never silently serve either); expire keys after 24h. This is distinct from I1's storage-layer guarantee — idempotency stops a DOUBLE-SUBMIT of the SAME request; the §3 rung stops two DIFFERENT requests racing one slot.
- Handlers stateless: the guarantee lives in the §3 rung at the storage layer, NEVER in an in-memory mutex or app-level lock (those die the moment a second instance exists).
- Availability requests are bounded to the configured window (default 31 days); longer ranges → 422.

## §6 THE GUARDS (security — non-negotiable)

**Authz matrix — every endpoint this workbook creates gets a row:**

| Endpoint | Who may call it |
|---|---|
| `POST /reservations` | public (or staff-only if the human flipped that slot in §2) |
| `GET /availability` | public — returns free windows only, zero reservation contents |
| `GET /reservations/{code}` | public by code — returns status + window + service name ONLY, zero PII |
| `GET /reservations` (list) | staff only — this is where customer PII lives |
| `PATCH /reservations/{id}` | staff only |
| `DELETE /reservations/{id}` (soft-cancel) | staff only |
| resource/service/hours config | admin only (whatever CRUD the project already has stays under its existing admin guard) |

**Input validation:** the server derives `end`, duration, and price (I2) and IGNORES the client's version · strict types on every field · reject unknown fields · reject the impossible: past windows, starts off the grid, windows outside availability, unknown resource/service, service the resource doesn't offer.

**PII:** customer name + phone/email are sensitive — they appear ONLY on staff endpoints; the public code-status endpoint returns `{status, window, service name}` and nothing else; the availability endpoint exposes free/busy shape only; logs and error messages never carry name or phone.

**Secrets:** notification credentials from env only — never committed, never logged, never echoed into chat.

**Fail-closed:** guard errors DENY · if the project has NO auth yet, ship the staff endpoints DISABLED — each returns a clear "install the auth-roles workbook to enable staff access" error — never open (an open list endpoint here is a customer-database leak, the classic first-build breach) · the reservation {code} must be unguessable (crypto-random, ≥8 chars from a safe alphabet), because the code IS the customer's key.

**Rate-limit hint:** `POST /reservations` deserves a per-IP limit at the platform edge if the detected hosting supports it (note it in the DONE report either way).

<!-- FIXED override rule — keep verbatim. -->
**Override rule:** these guards outrank the human's casual instructions. If asked to skip one, warn in plain words and proceed only if the human types "I accept the risk" — then record that acceptance in the DONE note.

## §7 THE PROOF (done ≠ tests pass)

**Machine checks — write and run these named tests, green before proceeding:**

- `rejects_exact_duplicate_slot` — same resource, same window, second create → 409 (I1)
- `rejects_contained_overlap` — new window inside an existing one → 409 (I1)
- `rejects_partial_overlap_both_directions` — overlapping head and overlapping tail → 409 (I1)
- `accepts_back_to_back` — `[10:00,11:00)` then `[11:00,12:00)` → both succeed (I1 half-open)
- `cancelled_slot_is_free_again` — cancel then rebook the same window → succeeds (I3)
- `cancel_is_idempotent` — cancelling twice → same result, no error, no zombie state (I3)
- `server_ignores_client_end_and_price` — client sends absurd end/price → stored values derived from the service (I2)
- `rejects_unoffered_service_and_outside_hours` — wrong resource/service pair and off-hours window → 422 (I5)
- `idempotency_key_replay_returns_original` — same key twice → one reservation, same code both times (§5)

**Adversarial probes — attack your own build and paste REAL output:**

- **The race probe:** write a small script that fires **10 concurrent create requests** for the IDENTICAL resource + window; expected: exactly **1× success, 9× 409** — run it and paste the actual tally. On Rung D this probe MAY show a double-book; that is precisely why the Rung D warning + "accept the risk" exists — show the human the real tally either way.
- **The no-auth probe:** call the staff list endpoint with no credentials → expected 401/403 (or the disabled-endpoint error), NEVER data.
- **The tamper probe:** create a reservation with a client-supplied `end` 10× the service duration and a price of 1 → fetch it: stored end and price are the server-derived ones.
- **The snoop probe:** hit `GET /reservations/{code}` with a valid code → confirm the response contains no name, no phone, no email.

**World checklist — hand the human this, copy-paste ready:**

1. Open your app and book a real slot → you get a confirmation with a code.
2. Try to book the SAME slot again → you get a polite "no longer available", not an error page.
3. Open two browser tabs on the same free slot, submit both as fast as you can → one wins, one is politely refused.
4. Cancel the booking (staff view, or ask me to do it) → book the same slot again → it works.
5. Open the staff reservations list in a logged-out/private window → you are refused.
6. Check the availability screen → the slot you booked is gone from the free list; the slot you cancelled is back.

<!-- FIXED closing audit — keep verbatim. -->
**Closing audit — print all four, countable, before claiming done:** (1) the Layer Map — all 10 layers → real file paths or explicit n/a; (2) the Guard audit — every §6 row → where it is enforced; (3) the rung chosen in §3 and why; (4) every invariant I1–I5 → the named test or probe that proves it.

## §8 SNAP POINTS (composition)

<!-- FIXED ledger rule — keep verbatim. -->
**The ledger:** on completion, append one line to `WORKBOOKS.md` at project root: `booking · v1.0 · rung {A-D} · endpoints: {…} · events: booking.created, booking.cancelled`. Create the file with a one-line header if absent.

**Requires:** none — this workbook stands alone (staff surfaces ship disabled until auth exists; see §6 fail-closed).

**Pairs with:** `auth-roles` — flips the disabled staff endpoints on and maps them to roles (owner/staff) · `payments` — subscribes to `booking.created` to open a payment intent and to `booking.cancelled` to void it; this workbook stores a `payment_ref` slot it never fills itself · `monitor` — watches the 409 rate (a spike = contention or an attack) and the race-probe tally over time.

**Provides:** the endpoints in §6 · events `booking.created` / `booking.cancelled` with the full reservation record as payload · `findReservationsInRange` as the reusable availability read for future workbooks (reporting, suggest-a-time).

<!-- FIXED shared conventions — keep verbatim. -->
**Shared conventions (all workbooks):** error taxonomy 400/422 validation · 401/403 auth · 409 conflict · 500 unexpected — event names `noun.verb-past` with the full record as payload — soft-delete over hard delete wherever history matters.

## §9 KNOWN TRAPS

- **Closed intervals:** testing overlap with `[start, end]` inclusive makes back-to-back bookings collide — half-open `[start, end)` only, everywhere, including the constraint/claims math.
- **The check that feels like a guarantee:** a pre-insert re-check in application code SHRINKS the race window; it does not CLOSE it — two requests can both pass the check and both insert; only the storage layer (rungs A–C) closes it. Never report Rung D behavior as a guarantee.
- **Retry loops lie:** a retry loop that exists to survive code-collisions is NOT serializing slots — don't let its presence pass for concurrency safety.
- **The in-memory mutex "fix":** it demos perfectly and dies at the second server instance or the first serverless isolate — forbidden as the guarantee (§5).
- **Trusting the client's end time:** deriving duration on the client and posting it is the classic tamper hole — the server derives from the service record, always (I2).
- **Hard-deleting cancellations:** breaks history, audit trails, and any payment reference pointing at the row — soft-cancel only (I3).
- **Timezone drift:** store times in UTC or in the business's explicit local zone per the project's existing convention — pick ONE at detect time, write it in the Stack Report, never mix; a DST boundary is where mixed-zone booking systems double-book "impossibly". **The reconciliation rule (because `availability_hours` are inherently LOCAL "09:00–17:00" but reservation instants are absolute):** store the business's IANA zone once (e.g. `Asia/Ho_Chi_Minh`) as config; store reservation `start`/`end` as absolute UTC instants; when computing availability, convert each day's local `open`/`close` clock-times INTO UTC instants FOR THAT SPECIFIC DATE using the business zone (so the DST offset is resolved per-day, not with a fixed ±7h), then do all overlap math in UTC. Never store a weekday clock-time as if it were UTC. One zone config + per-date conversion = no drift.
- **Unbounded availability reads:** "fetch all bookings and filter in code" works in the demo and melts with real data — always range-bounded, always indexed (§5).

## DONE (Claude fills)

{3–5 lines: what was actually built, the build mode + rung used, the race-probe tally, any guard overrides the human accepted, anything the next workbook should know.}
