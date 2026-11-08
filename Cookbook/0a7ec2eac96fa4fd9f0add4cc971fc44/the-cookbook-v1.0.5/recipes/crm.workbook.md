---
workbook: crm
version: "1.0"
kind: feature
risk: high
requires: []
pairs_with: [auth-roles, email, calendar]
provides:
  - "POST create-contact (staff)"
  - "POST import-contacts bulk upsert (staff)"
  - "POST log-activity on a contact (staff)"
  - "PATCH move-stage with history (staff)"
  - "GET search/filter contacts (staff)"
  - "events: contact.captured, contact.stage-changed, activity.logged"
status: stable
---

<!-- This is a WORKBOOK — one recipe of the AI App Cookbook, in the Workbook System format (see FRAMEWORK.md). The human attaches this file to Claude Code and says "build this workbook." Everything below §1 is Claude's contract, not learner reading. -->

# CRM · Workbook

## §1 START HERE (for you, the human)

**What you get:** every person who ever contacted your business is remembered — their details, every note and call and meeting you logged, and where they are in your pipeline — and you can find any one of them in a second, with no duplicate ever created from the same email.

**What to say:** "Build this workbook: @crm.workbook.md" — or just attach it and say "build this". (VN: "Xây workbook này.")

**What you'll see:** Claude first prints a short Stack Report (what it found in your project, whether it's building NEW or INTEGRATING into your existing app, the few decisions it needs you to confirm, and what it will build — ≤12 lines) and waits for your OK. Then it builds and tests itself — including importing the same person twice to prove you get ONE record, not two. At the end it hands you a short checklist of things to click in your running app — when you've seen them all, it's done.

## §2 THE CONTRACT

**The job:** capture a {contact}, log every {activity} against them, move them through your pipeline {stage} with a recorded history, and search/filter your whole list fast — while GUARANTEEING the same email never becomes two records.

**Vocabulary mapping** (adapt these words to the human's business — detect from their app/brief; ask only if truly ambiguous):

| Word in this workbook | Means in the human's app |
|---|---|
| {contact} | the person you're remembering — a lead, a customer, a patient, a student, a guest; the central record, keyed by email |
| {stage} | where the contact is in your process — new / contacted / qualified / won / lost (rename to your funnel; it's ONE value at a time) |
| {activity} | a timestamped thing that happened WITH this contact — a note, a call, an email you sent, a meeting you booked; append-only history |
| {tag} | a free label you attach to segment contacts (e.g. "vip", "webinar-apr", "cold") — many per contact |
| {consent} | the proof this person gave YOU their own email (source: form / order / import) — the gate that decides whether you may bulk-email them |

**Invariants — each one is testable and each one maps to a check in §7:**

- **I1 (one person, one record):** two captures with the same email never create two {contact} rows — the second UPSERTS into the first (merges new fields, never duplicates). Email is the merge key, case-folded and trimmed.
- **I2 (server owns the timeline):** the server stamps every {activity}'s `occurred_at` and `actor` from its OWN clock and the authenticated staff identity; a client-sent timestamp or author is ignored. Activities are append-only — never edited in place, never hard-deleted.
- **I3 (stage moves are historied):** changing a {contact}'s {stage} writes the stage-change row (from → to → who → when) AND updates the contact's cached stage in ONE atomic unit (on D1: a single `db.batch([insert stage_change, update contact.stage])` — NOT two separate awaits, which can crash between and leave a stale cache) — so the funnel is always reconstructable and the cache never diverges. The current stage on the contact is a cache of the latest history row; if ever in doubt, it's rebuildable from the newest stage_change.
- **I4 (consent gates the blast):** a {contact} may be included in any bulk-email segment ONLY if it carries a {consent} record with a known source; a contact with no consent is reachable one-to-one by staff but NEVER in a bulk send. The server enforces this, not the UI.
- **I5 (search is bounded and indexed):** every list/search response is paginated (capped page size) and served by an index; there is no endpoint that returns "all contacts" unbounded, and search never scans per-row in application code.

**Out of scope (do not build, even if tempting):** sending the actual bulk email campaign (the `email` workbook owns sends + unsubscribe; this workbook only records that an email activity happened and exposes the consent-gated segment) · running the calendar (the `calendar` adapter creates ONE event when you log a meeting; scheduling logic is not here) · deals-as-separate-entities with multiple pipelines (this is contact-centric with ONE stage — a `deals` workbook can add that later) · lead-scoring / automations / workflows · merging two DIFFERENT emails into one person (manual merge is a later feature; I1 only de-dupes the SAME email) · customer login/accounts.

**Slots the human MAY customize before attaching** (edit these lines, nothing else): the {contact}/{stage}/{activity} words above · the stage list (default **new → contacted → qualified → won / lost**) · the activity types (default **note / call / email / meeting**) · the default page size (default **50**) · whether calendar sync on a meeting activity is **on** or **off** (default off).

## §2a THE DOMAIN MODEL (the real entities + how they relate)

<!-- Grounded in SellKit's real customer + lead surface (internal/customer, internal/lead). -->

**Entities** (the nouns a CRM really has):

| Entity | Key fields | What it is |
|---|---|---|
| contact | id, email, email_key, name, phone, stage, tags[] (JSON), meta (JSON), first_seen_at, last_activity_at, deleted_at | the person you're remembering; ONE row per `email_key`; `email_key` = lower(trim(email)) is the UNIQUE de-dupe key (I1) — code the schema from THIS list, the key column is load-bearing; `stage` + `last_activity_at` are caches derived from history; `deleted_at` is the soft-delete that reserves the email; `meta` is an untyped JSON blob for extra fields, `tags[]` a JSON array |
| consent | contact_id, source, granted_at, revoked_at | proof this person gave you their email (source ∈ form / order / import); its PRESENCE (and `revoked_at IS NULL`) is the bulk-email gate (I4) |
| activity | id, contact_id, type, body, actor, occurred_at, ref, voided_at | one timestamped thing that happened WITH the contact; append-only (never UPDATE the body); `type` ∈ note/call/email/meeting; `ref` = nullable external id (e.g. the calendar event id); `voided_at` = the soft-void flag (a "delete" sets this, the row survives — I2) |
| stage_change | id, contact_id, from_stage, to_stage, actor, changed_at | append-only funnel history; the current `contact.stage` is the latest row's `to_stage` (I3) |
| tag | name | a reusable label; a contact carries many via `tags[]` (or a join table on richer stacks — see the ladder) |
| import_batch | id, source, created, skipped, at | one bulk-import run's result (created vs merged counts) — the audit of a list import |

**Relationships:**

- a contact is UNIQUE per lower(email) — that uniqueness is what closes I1 at the storage layer.
- contact has-one consent (0..1); no consent = staff-reachable but bulk-excluded (I4).
- contact has-many activities; an activity belongs-to exactly one contact; deleting a contact soft-deletes and keeps its activities for history (or cascades on hard-delete only if the human explicitly chooses — see §2b).
- contact has-many stage_changes; the newest is the source of truth for `contact.stage` (I3).
- contact has-many tags (through `tags[]` or a join table); a tag is a reusable label across contacts.
- import_batch has-many contacts it touched (created or merged) — for the "what did that import do" audit.

**Lifecycle / state:**

- contact.stage: `new → contacted → qualified → won | lost` — but the transition set is CONFIGURABLE (the human's funnel); any move writes a stage_change (I3); moves are not restricted to "forward only" unless the human opts in (re-opening a lost lead is legal). A contact is soft-deleted (`deleted_at`), never hard-removed by default — its email stays reserved so a re-import doesn't resurrect a duplicate.
- activity: created once, immutable, append-only — no update, no hard-delete (a "deleted" activity is a soft `voided_at` flag if the human needs it; the row survives — I2). `occurred_at` is server-stamped at creation.
- consent: granted once with a source; a `revoked_at` flag can turn OFF bulk eligibility without deleting the person (unsubscribe is the `email` workbook's job, but the flag lives here). Times stored in ONE zone (UTC or the business's explicit local zone — fixed at detect time, never mixed — see §9).

## §2b DECISIONS & TRADE-OFFS (surfaced at the gate — never silently guessed)

| Decision | Options | When to pick which | Default |
|---|---|---|---|
| Merge key for de-dupe | email / phone / email+phone | email for online-first businesses (the norm); phone for phone-first (some VN retail); email+phone only if you reliably have both and want the strictest de-dupe | email (case-folded, trimmed) — matches I1 |
| Delete policy for a contact | soft-delete / archive / hard-delete | soft-delete (default) keeps history + reserves the email against re-import dupes; archive when you want it out of lists but fully recoverable; hard-delete ONLY for a GDPR/erasure request, and it must cascade activities | soft-delete |
| Pipeline shape | single-stage-on-contact / multi-pipeline-with-deals | single (default) when each person is in ONE process at a time (services, courses, clinics); multi-pipeline is a `deals` workbook — out of scope here | single stage on the contact |
| Stage transitions | free / forward-only / configurable-graph | free (default) lets you move any direction (re-open a lost lead); forward-only when your process is strict; a graph only for regulated funnels | free |
| Consent default for imported contacts | source=import / no-consent | source=import ONLY if the human attests these people opted in to THEM (the honest default is to trust the operator's attestation and record the source); no-consent forces every imported contact to re-opt-in before any blast | source=import, recorded — but the human confirms the attestation at the gate |
| Calendar sync on a meeting activity | off / create-event | off (default) — logging a meeting is just a record; create-event wires the `calendar` adapter so a meeting activity also drops a real calendar invite | off |

Claude states each of these at the §3 gate with its default and asks the human to confirm or change — none is guessed silently. The consent-attestation and delete-policy decisions are load-bearing (privacy + data-loss) and MUST be confirmed explicitly.

## §2c GOTCHAS / HOW IT GOES WRONG (this domain's classic mistakes)

- **Re-importing a list with no merge key** → the same 500 people become 1,000 rows, every future email double-sends, and the funnel counts are garbage. De-dupe on a stable key (email, case-folded) at capture AND import — UPSERT, never blind INSERT (I1). This is the #1 CRM failure and the reason I1 exists.
- **Storing the current stage but not its history** → you can never answer "how many moved from qualified to won last month" — no funnel, no conversion rate, no analytics. Model stage_change as append-only data; treat `contact.stage` as a cache of the latest row (I3).
- **Editing activities in place** → the timeline stops being trustworthy; a "call" note gets overwritten and the history lies. Activities are append-only; a correction is a NEW activity, not an edit (I2).
- **Hard-deleting a contact** → orphans or destroys their activities, loses the audit trail, AND frees the email so the next import recreates them as a "new" duplicate. Soft-delete keeps history and reserves the email (§2b delete policy).
- **Emailing everyone because the UI showed a "select all"** → you blast people who never consented, land in spam, and (in the EU/for card-payers) break the law. Consent PRESENCE is a server-side gate on every bulk segment (I4) — the UI cannot override it.
- **Treating tags/segments as free-text on the contact** → you can't reliably filter, typos fragment your segments ("VIP" vs "vip"), and search melts. Model tags as reusable labels; normalize on write (I5).
- **Mixing local and UTC times on activities** → your "last contacted 3 days ago" is off by a timezone and your daily-activity report double-counts across the DST boundary. Pick ONE zone at detect time, write it in the Stack Report, never mix (see §9).

## §3 DETECT (do this before touching any file)

<!-- FIXED boilerplate — identical in every workbook. -->

1. **Inspect:** manifest files (`package.json`, `go.mod`, `requirements.txt`, `Gemfile`, `composer.json`…), lockfiles, platform config (`wrangler.toml`, `next.config.*`, `Dockerfile`…), existing migrations/schema, the existing auth pattern, the test runner, the folder layout — and `WORKBOOKS.md` at project root if it exists (workbooks already installed). For Mode INTEGRATE, ALSO read any existing customer/lead/user/contact models this CRM must relate to or extend, and any existing email-consent or unsubscribe surface.
2. **Decide the build mode:** **NEW** (no contact/customer surface exists — scaffold contacts, activities, stage-changes, consent fresh) or **INTEGRATE** (the app already has a customers/users/leads table — read it, state where the CRM's contact record maps to the existing person model, and extend it rather than duplicating a second people table). Print which mode and what it means.
3. **Print the Stack Report** — one small table: language · runtime · framework · database · migration tool · auth · hosting · test runner · conventions observed · build mode (NEW / INTEGRATE). Name unknowns as unknown; never guess.
4. **Confirm the decisions** in §2b — state each with its default (merge key, delete policy, pipeline shape, stage transitions, import-consent attestation, calendar sync) and ask the human to confirm or change. The consent attestation and delete policy MUST be confirmed explicitly.
5. **Choose your rung** from the guarantee ladder below. The ladder is written against CAPABILITIES, never brand names — an unfamiliar stack still lands on a rung.
6. **Gate:** print the Stack Report (with build mode) + confirmed decisions + chosen rung + a plain-words build plan (≤12 lines total) and WAIT for the human's OK before writing any code.

**Iron rules:** extend, never replace (no new framework/DB/ORM into an existing app; in INTEGRATE mode, map the contact onto the existing people model, don't create a parallel one) · match the house style (naming, folders, error shapes) · missing capability = propose the smallest honest addition native to the detected hosting, and wait.

**Adaptation ladder — the no-duplicate guarantee (I1). The rung decides WHERE de-dupe lives; higher rungs put it in the database, where two simultaneous imports of the same email cannot both slip through. An application-level "check if exists then insert" narrows the race; only a storage constraint closes it. On the default stack (Cloudflare Worker + D1 + Hono) you land on Rung B — the atomic-batch/upsert rung — since D1 has no interactive transactions.**

- **Rung A — DB supports interactive transactions + partial/expression unique indexes (e.g. detected Postgres):** a UNIQUE index on `lower(email) WHERE deleted_at IS NULL`; capture and import both use INSERT … ON CONFLICT DO UPDATE (upsert), so a concurrent duplicate merges instead of erroring. Soft-deleted rows keep the email reserved via a second lookup on delete.
- **Rung B — DEFAULT for Cloudflare D1: no interactive transactions, but atomic batch + upsert exist:** store a normalized `email_key` column (lower(trim(email))) with `UNIQUE(email_key)`; capture/import use `INSERT … ON CONFLICT(email_key) DO UPDATE`. **The merge column list (spell it out — "merges new fields" is not codeable, and getting it wrong WIPES data):** `DO UPDATE SET name = COALESCE(excluded.name, contact.name), phone = COALESCE(excluded.phone, contact.phone), meta = json_patch(contact.meta, excluded.meta), last_activity_at = excluded.last_activity_at` — i.e. a blank incoming field NEVER overwrites an existing value (COALESCE keeps the old), and `first_seen_at` is NEVER in the SET list (it's set once on insert only). A sparse re-import must not erase good data. **The within-one-batch same-email case is NOT closed by the unique index alone** (D1's `db.batch()` has no read-visibility between statements, so two `INSERT…ON CONFLICT` for the same NEW key in one batch collide into a constraint error, not a merge): running the domain `dedupeByKey(rows)` to COLLAPSE duplicate emails BEFORE building the batch is MANDATORY, not optional — dedupe in app code first, then upsert the collapsed set. Concurrent SEPARATE batches: each is atomic, so a rare cross-batch conflict fails ONE batch wholesale — retry that batch (its upserts are idempotent, so the retry merges cleanly). This is where the default stack lands.
- **Rung C — SQL engine with transactions + case-sensitive unique indexes but no upsert:** the same normalized `email_key` + `UNIQUE(email_key)`; upsert emulated as "insert; on unique-violation, update the existing row" inside ONE transaction. Same guarantee, one extra round-trip.
- **Rung D — storage can enforce no uniqueness at all (KV-only, spreadsheet-backed, flat files):** read-by-email-key then insert-or-merge, re-checking immediately before write — and print this WARNING in plain words: "Your storage cannot enforce the no-duplicate guarantee; two simultaneous imports of the same person can still create two records. I recommend adding {the lightest capable DB native to the detected hosting — on Cloudflare that's D1}." Proceed only if the human types "accept the risk".

**Normalize rule (all rungs):** the email merge key is `lower(trim(email))` computed on the SERVER at capture and import; the raw email is stored for display, the key is what the unique index guards.

## §4 THE LAYERS (build in this order; one responsibility per layer)

| Layer | This feature puts here |
|---|---|
| route | `POST /contacts` (create/upsert) · `POST /contacts/import` (bulk upsert) · `GET /contacts?q&stage&tag&page` (search/filter) · `GET /contacts/{id}` (one contact + its timeline) · `POST /contacts/{id}/activities` (log activity) · `PATCH /contacts/{id}/stage` (move stage) · `DELETE /contacts/{id}` (soft-delete) — thin handlers, zero logic |
| validation | edge schema checks: required fields, email format, activity `type` ∈ allowed set, `stage` ∈ configured set; reject unknown fields; reject a client-sent `occurred_at`/`actor`/`stage_change` history; NO business rules here |
| auth | per-endpoint guards per the §6 matrix; every endpoint is staff-only — or shipped disabled if the project has no auth yet (see §6 fail-closed) |
| command | `captureContact` (normalize email → upsert by key → record consent source → emit `contact.captured`) · `importContacts` (per-row upsert, dedupe within the batch first, return created/merged counts, write import_batch) · `logActivity` (server-stamp occurred_at + actor → append → bump `last_activity_at` → emit `activity.logged` → if meeting + calendar-on, call the calendar adapter) · `moveStage` (write stage_change → update cached stage → emit `contact.stage-changed`) |
| domain | PURE functions, no framework/DB imports: `normalizeEmailKey(email)` · `dedupeByKey(rows)` (collapse a batch before insert) · `isValidTransition(from, to, policy)` · `isBulkEligible(contact)` (has non-revoked consent — I4) · `nextStageDefault(stage)` — each unit-testable in isolation |
| persistence | repository functions — the ONLY place queries live; the §3 rung (the unique index + upsert) lives HERE; also `searchContacts(q, filters, page)` as the single bounded+indexed list read, and `timelineFor(contact)` as the single activity read |
| event | `contact.captured`, `contact.stage-changed`, `activity.logged` emitted through one small in-process dispatcher — the seam exists even if today's only listener is a log line. **On a Cloudflare Worker, any listener doing real async work (email's send, the calendar invite) MUST run inside `ctx.waitUntil()` — the isolate is torn down after the response, so a fire-and-forget side effect without `waitUntil` is killed mid-flight** |
| listener | best-effort subscribers: on `contact.captured` log it; on `activity.logged` (type=email) the `email` workbook may subscribe to actually send — never throws into the request path |
| adapter | the outbound calendar call (create an event for a meeting activity) wrapped in ONE module; credentials from env; a missing credential or calendar outage means "log the activity anyway, skip the invite, note it", never "crash the log" (fail-open — the record is the source of truth) |
| audit | append-only record for create / import / stage-change / soft-delete: who (staff id), what, old/new stage, when — stage_change IS this for moves; the same shape covers the rest |

**Rules:** domain functions stay pure · all queries behind persistence functions · a layer that truly doesn't apply is declared n/a with one line of why — never silently skipped, never faked · follow the project's existing layout for where these files live.

## §5 HOLD THE LOAD (implement silently; verified in §7)

- The contacts list/search endpoint is paginated by default (cap 50, cursor or offset per house convention) and filterable by stage + tag + free-text `q` — never returns the whole table.
- Indexes ship with the schema: the `UNIQUE(email_key)` de-dupe index (which doubles as the by-email lookup) · `(stage)` for pipeline filtering · a `tag` join/index for tag filtering · `(contact_id, occurred_at DESC)` for the timeline read.
- **Full-text SEARCH (the road, not just "FTS5") — free-text `q` covers name + email + phone; stage + tag are FILTERS, not full-text (this resolves the name/email-vs-name/email/tag/stage question):** on D1/SQLite create an FTS5 virtual table `contact_fts USING fts5(name, email, phone_digits, content='contact', content_rowid='id')` and keep it in sync with three triggers (AFTER INSERT / UPDATE / DELETE on `contact` that write the matching `contact_fts` rows) — WITHOUT the triggers the index silently goes stale. Query = `SELECT c.* FROM contact_fts f JOIN contact c ON c.id=f.rowid WHERE contact_fts MATCH ? AND c.stage=? AND c.deleted_at IS NULL` (the `q` becomes a prefix match `q*` after escaping quotes; stage/tag are plain WHERE filters joined back on the rowid). Never `LIKE '%q%'` — that's the un-indexed full scan I5 forbids. (On Postgres: trigram/`tsvector`; other stacks: a normalized prefix column.)
  - **Phone must be searched on NORMALISED DIGITS, not the stored string.** Vietnamese staff type the same number as `0901 234 567`, `0901234567`, `+84 901 234 567` or `84901234567`. Index `phone_digits = digits-only(phone)` (strip spaces, dots, dashes, parens, and a leading `+`; fold a leading `84` to `0` so one number has one key), and normalise the query the same way before matching: if `q` is mostly digits, strip its separators and prefix-match against `phone_digits`; otherwise match name/email as usual. Without this, searching a phone "works" for whoever typed it and silently fails for everyone else — the same class of bug `email_key` closes for email (I1).
- The one-contact view fetches the contact + its timeline in bounded reads — the list of contacts NEVER fetches each contact's activities in a loop (no N+1); a "last activity" column is the cached `last_activity_at`, not a per-row subquery.
- `POST /contacts` and `POST /contacts/import` accept an `Idempotency-Key` header; store it in a D1 table `idempotency_key(key PRIMARY KEY, result_json, created_at)` (NOT in memory — a second Worker isolate must see it, same reason §5 bans in-memory de-dupe sets), expiring after 24h; a replay with the same key returns the stored ORIGINAL result (same created/merged counts), never re-running the import — a double-clicked "Import" must not double-process.
- Handlers stateless: de-dupe lives in the §3 rung at the storage layer, NEVER in an in-memory "seen emails" set (that dies the moment a second instance imports concurrently).
- Bulk import is bounded per request (cap the row count, e.g. 1,000; larger files chunk into batches) — an unbounded import request → 422 with the cap stated.

## §6 THE GUARDS (security — non-negotiable)

**Authz matrix — every endpoint this workbook creates gets a row:**

| Endpoint | Who may call it |
|---|---|
| `POST /contacts` | staff only — a contact record is PII |
| `POST /contacts/import` | staff only — bulk PII in |
| `GET /contacts` (search/list) | staff only — this is the customer database itself |
| `GET /contacts/{id}` | staff only — full PII + timeline |
| `POST /contacts/{id}/activities` | staff only — writes to the person's history |
| `PATCH /contacts/{id}/stage` | staff only |
| `DELETE /contacts/{id}` (soft) | staff only (hard-delete/erasure: owner only) |
| the consent-gated bulk segment read | staff only, AND every row must pass `isBulkEligible` (I4) — the segment is server-filtered, never client-filtered |

**Input validation:** the server derives every derivable value — `email_key` (normalized), `occurred_at` (server clock), `actor` (authenticated staff id), the stage_change history row — and IGNORES the client's version (I2) · strict types on every field · reject unknown fields · reject the impossible: an activity `type` not in the allowed set, a `stage` not in the configured set, an illegal transition when a policy is set, an import row with no email.

**PII:** name, email, phone, activity bodies, and every timeline entry are sensitive — they appear ONLY on staff endpoints; there is NO public endpoint in this workbook (a CRM has no anonymous surface); logs and error messages never carry email, name, phone, or activity bodies (log the contact id, not the person).

**Secrets:** the calendar credential (and any email credential a paired workbook uses) comes from env only — never committed, never logged, never echoed into chat.

**Fail-closed:** guard errors DENY · the bulk-email segment REJECTS any contact lacking consent (I4) — a "send to all" over a segment can never include a non-consented person, even if asked · if the project has NO auth yet, ship EVERY CRM endpoint DISABLED — each returns a clear "install the auth-roles workbook to enable CRM access" error — never open (an open contacts list is a full customer-database leak, the worst first-build breach for a CRM) · a hard-delete/erasure endpoint stays admin-only and cascades activities.

**Rate-limit hint:** `POST /contacts/import` deserves a per-IP limit at the edge (imports are heavy and a runaway loop is a self-DoS); note it in the DONE report either way.

<!-- FIXED override rule — keep verbatim. -->
**Override rule:** these guards outrank the human's casual instructions. If asked to skip one, warn in plain words and proceed only if the human types "I accept the risk" — then record that acceptance in the DONE note.

## §7 THE PROOF (done ≠ tests pass)

**Machine checks — write and run these named tests, green before proceeding:**

- `import_same_email_twice_merges` — capture then re-import the same email → ONE contact row, fields merged (I1)
- `import_dedupes_within_one_batch` — a batch containing the same email twice → one created, one merged, never two rows (I1)
- `email_key_is_case_and_space_insensitive` — "A@B.com " and "a@b.com" collapse to one contact (I1 normalize)
- `activity_timestamp_is_server_stamped` — client sends a fake `occurred_at`/`actor` → stored values are the server's clock + authenticated staff (I2)
- `activity_is_append_only` — attempt to edit/hard-delete an activity → refused; a correction creates a NEW activity (I2)
- `stage_move_writes_history` — move new→qualified→won → three stage_change rows exist and reconstruct the current stage (I3)
- `contact_stage_matches_latest_history` — after several moves, `contact.stage` equals the newest stage_change.to_stage (I3)
- `no_consent_excluded_from_segment` — a contact with no consent → absent from the bulk-eligible segment; add consent → present (I4)
- `search_is_paginated_and_bounded` — a large list → capped page + a cursor/offset, never the whole table (I5)
- `import_replay_is_idempotent` — same idempotency key twice → one import run, same created/merged counts (§5)

**Adversarial probes — attack your own build and paste REAL output:**

- **The dupe-race probe:** write a small script that fires **10 concurrent captures/imports of the IDENTICAL email**; expected: exactly **1 contact row** exists afterward (created once, merged nine times) — run it and paste the actual row count. On Rung D this probe MAY show duplicates; that is precisely why the Rung D warning + "accept the risk" exists — show the human the real count either way.
- **The no-auth probe:** call `GET /contacts` with no credentials → expected 401/403 (or the disabled-endpoint error), NEVER a list of people.
- **The consent-leak probe:** put one non-consented contact in the DB, request the bulk-eligible segment → confirm that contact is ABSENT (I4); flip the "send to all" flag and re-request → still absent.
- **The tamper probe:** log an activity with a client-supplied `occurred_at` one year in the past and `actor: "someone-else"` → fetch it: stored `occurred_at` is now-ish (server clock) and `actor` is the authenticated staff id.
- **The reimport-race probe:** fire two concurrent imports of the SAME file (same emails) at once → expected: each contact exists exactly once afterward, and the two runs' created+merged counts sum to one insert per unique email — paste the real per-email row counts (this is the dupe-race probe at file scale).

**World checklist — hand the human this, copy-paste ready:**

1. Add a contact with an email → you see it in the list.
2. Add the SAME email again (or import a file that includes it) → you still have ONE record, not two, and any new detail got merged in.
3. Open the contact and log a call and a note → both appear in the timeline, newest first, with the time you did it.
4. Move the contact from "new" to "qualified" to "won" → the stage updates AND you can see the history of those moves.
5. Search for the contact by name, then by email, then filter by stage → you find them fast, and the list is paged, not the whole database at once.
6. Open the contacts list in a logged-out/private window → you are refused (no customer data leaks).
7. (If email is wired) try to add a contact you never got consent from to a bulk send → the system won't include them.

<!-- FIXED closing audit — keep verbatim. -->
**Closing audit — print all four, countable, before claiming done:** (1) the Layer Map — all 10 layers → real file paths or explicit n/a; (2) the Guard audit — every §6 row → where it is enforced; (3) the rung chosen in §3 and why; (4) every invariant I1–I5 → the named test or probe that proves it.

## §8 SNAP POINTS (composition)

<!-- FIXED ledger rule — keep verbatim. -->
**The ledger:** on completion, append one line to `WORKBOOKS.md` at project root: `crm · v1.0 · rung {A-D} · endpoints: {…} · events: contact.captured, contact.stage-changed, activity.logged`. Create the file with a one-line header if absent.

**Requires:** none to BUILD — but note the honest consequence: on a no-auth app EVERY CRM endpoint ships disabled (§6), so a standalone CRM build is non-functional until `auth-roles` is installed. That's intentional fail-closed (an open contacts list is a customer-database leak), not a bug — but tell the human plainly at the gate: "this ships locked; install auth-roles to use it." **The disabled-stub + flip-on contract (matches auth-roles' mechanism):** each CRM endpoint ships returning `403 {"error":"install auth-roles to enable"}` AND records a row in `WORKBOOKS.md`: `{workbook: crm, route, method, required_action, default: disabled}`. When auth-roles installs, it reads those rows and routes each endpoint through its enforce gate under the declared `required_action` (e.g. `POST /contacts` → `contacts:write`, the segment read → `contacts:read`). The `actor` on I2 (the authenticated staff id) comes from auth-roles' resolved identity on the request — until then, disabled.

**Pairs with:** `auth-roles` — reads crm's declared `WORKBOOKS.md` rows and flips the disabled endpoints on, mapping each `required_action` to the app's roles (owner/staff/viewer); provides the `actor` identity I2 needs · `email` — subscribes to `activity.logged` (type=email) to actually send, owns unsubscribe + delivery-suppression, and CONSUMES this workbook's `resolveSegment` (never bypasses I4 consent) · `calendar` — the adapter this workbook calls when a meeting activity is logged with calendar-sync on; it creates one event and returns the id stored in `activity.ref` · `booking` — its `booking.created` event can drive a `logActivity` here (a booking becomes a meeting activity on the contact) once both are installed.

**Provides:** the endpoints in §6 · events `contact.captured` / `contact.stage-changed` / `activity.logged` with the full record as payload · `searchContacts` and `timelineFor` as reusable reads for future workbooks (reporting, a dashboard) · **the consent-gated segment resolver `resolveSegment(segmentDef) → AsyncIterable<{address, consent_source}>` — the ONLY sanctioned source of a mass-email audience, and the exact interface the `email` workbook consumes.** Its output contract: it yields ONLY contacts with a `consent` row where `revoked_at IS NULL` and `deleted_at IS NULL` (crm owns CONSENT — the opt-in/opt-out gate, I4); it streams `{address, consent_source}` (an async iterable / cursor, never a materialized giant list). It does NOT apply email-delivery suppression (hard-bounces / spam-complaints) — that's DELIVERY data the `email` workbook owns and joins on top; crm gates consent, email gates deliverability. `segmentDef` is the opaque JSON filter blob crm defines (stage/tag/consent-source predicates) and email stores verbatim, never parses. Same-Worker default = an in-process function call; separate Worker = a service-binding RPC.

<!-- FIXED shared conventions — keep verbatim. -->
**Shared conventions (all workbooks):** error taxonomy 400/422 validation · 401/403 auth · 409 conflict · 500 unexpected — event names `noun.verb-past` with the full record as payload — soft-delete over hard delete wherever history matters.

## §9 KNOWN TRAPS

- **Blind INSERT on import:** the classic dupe bomb — always UPSERT on the normalized email key; the unique index (rungs A–C) closes the race, an app-level "check then insert" only narrows it (never report Rung D as a guarantee).
- **The check that feels like a guarantee:** two concurrent imports both run "does this email exist? no → insert" and both insert; only the storage-layer unique constraint serializes them. Never let a pre-insert existence check pass for de-dupe safety.
- **Case/whitespace email drift:** "Bob@X.com" and "bob@x.com " are the same person; normalize (lower+trim) to the key on the SERVER before the unique index sees it, or the constraint won't fire.
- **Editable timeline:** allowing an activity to be updated in place makes the history untrustworthy and breaks any audit; append-only, correction = new row (I2). Enforced by construction: there is NO PATCH/DELETE-activity route (§4 exposes only create + the soft-`voided_at` void), and the persistence layer offers only an insert + a void-flag update — never an `UPDATE activity SET body=…`. Append-only is a shape of the API + repo, not a DB constraint.
- **Stage as a single mutable column with no history:** you lose all funnel analytics forever; write a stage_change row on every move and treat the column as a cache (I3).
- **N+1 on the list:** rendering "last activity" or "activity count" per row by querying inside the loop melts at real volume; carry `last_activity_at` as a cached column, aggregate counts in one grouped query.
- **Unbounded contacts read:** "fetch all contacts and filter/search in code" works in the demo and dies at 10k rows — always paginated, always index-served (I5).
- **Client-trusted actor/timestamp:** trusting who-and-when from the request lets a caller forge history — the server stamps both from auth + its own clock (I2).
- **Timezone drift on activities:** store times in UTC or the business's explicit local zone per the project's convention — pick ONE at detect time, write it in the Stack Report, never mix; a mixed-zone timeline mis-orders events and mis-counts a daily-activity report across the DST boundary.
- **Hard-delete freeing the email:** removing a contact row lets the next import recreate them as brand-new — soft-delete reserves the email (§2b delete policy); hard-delete is admin-only, cascades activities, and is for erasure requests only.

## DONE (Claude fills)

{3–5 lines: what was actually built, the build mode + rung used, the dupe-race probe row count, whether calendar sync was enabled, any guard overrides the human accepted, anything the next workbook should know.}
