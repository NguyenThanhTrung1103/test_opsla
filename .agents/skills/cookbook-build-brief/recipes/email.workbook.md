---
workbook: email
version: "1.0"
kind: feature
risk: high
requires: []
pairs_with: [crm, auth-roles]
provides:
  - "POST send-campaign to a consent-gated segment (staff)"
  - "POST send-transactional one-off (staff/system)"
  - "GET unsubscribe one-click (public, permanent)"
  - "POST provider delivery webhook (delivered/bounced/complained)"
  - "the suppression list + sendability state (feeds the circuit-breaker)"
  - "events: email.sent, email.bounced, email.complained"
status: stable
---

<!-- This is a WORKBOOK — one recipe of the AI App Cookbook, in the Workbook System format (see FRAMEWORK.md). The human attaches this file to Claude Code and says "build this workbook." Everything below §1 is Claude's contract, not learner reading. -->

# Email · Workbook

## §1 START HERE (for you, the human)

**What you get:** you can email a whole segment of your people at once (a campaign) or send one person a single message (a receipt, a reminder) — and the system will only ever email someone who actually gave you their address, will honor an unsubscribe forever, and will never accidentally send the same campaign to the same person twice.

**What to say:** "Build this workbook: @email.workbook.md" — or just attach it and say "build this". (VN: "Xây workbook này.")

**What you'll see:** Claude first prints a short Stack Report (what it found in your project, whether it's building NEW or INTEGRATING into your existing app, the few decisions it needs you to confirm, and what it will build — ≤12 lines) and waits for your OK. Then it builds and tests itself — including running one campaign twice to prove nobody gets it twice, and trying to email someone who never consented to prove they're blocked. At the end it hands you a short checklist of things to click in your running app — when you've seen them all, it's done.

## §2 THE CONTRACT

**The job:** send an {email} to a consent-gated {segment} as a {campaign}, OR send one transactional {email} to one address; GUARANTEE that no address without a {consent} record is ever reached, that an {unsubscribe} is honored forever, that a runaway loop can't exceed the per-period {quota}, that a reputation spike auto-pauses sending, and that re-running a campaign never double-sends the same recipient.

**Vocabulary mapping** (adapt these words to the human's business — detect from their app/brief; ask only if truly ambiguous):

| Word in this workbook | Means in the human's app |
|---|---|
| {campaign} | one "email this segment this message" run — a header (subject + body + segment) plus an async fan-out to every resolved recipient; identified by a `campaign_id` |
| {segment} | the audience a campaign targets — resolved (never hand-listed) from crm's consent-gated bulk segment; the ONLY sanctioned source of a mass audience |
| {recipient} | one address a campaign is fanned out to; the pair (campaign_id, recipient) is the idempotency key — one send per pair, ever |
| {consent} | crm's proof this person gave YOU their own address (source ∈ order / form / import) — its PRESENCE is the gate that decides who is sendable (this is crm's I4) |
| {unsubscribe} | a person's permanent, one-click opt-out — once set it suppresses them from ALL future campaigns, forever, across every segment |
| {suppression} | an address marked un-sendable — from an unsubscribe, a hard bounce, or a complaint; the union of these is "do not email this person" |
| {quota} | the per-period ceiling on sends (e.g. N mails/month) — a hard gate so a bug or a loop can't blast |
| {transactional} | a one-off email to ONE address triggered by an event (a receipt, a booking confirmation) — still consent/suppression-checked, but not a segment campaign |

**Invariants — each one is testable and each one maps to a check in §7:**

- **I1 (consent gates every send):** no {email} is ever sent to an address lacking a {consent} record with a known source — for campaigns this is enforced because the {segment} comes from crm's consent-gated resolver (crm's I4), and for {transactional} the same consent+suppression check runs before the send. This workbook HONORS crm's gate and never widens or bypasses it.
- **I2 (unsubscribe is forever):** a one-click {unsubscribe} is permanent and honored across ALL future campaigns and transactional sends — an unsubscribed address is filtered out of every segment resolution and rejected by every one-off send, with no way for a later "send to all" to reach them.
- **I3 (idempotent fan-out):** re-running a {campaign} — a retry, a double-clicked "Send", a scheduler re-fire — never sends the same (campaign_id, {recipient}) pair twice; a re-run is a no-op for already-sent recipients.
- **I4 (quota is a hard ceiling):** sends are metered against a per-period {quota}; once the ceiling is reached, further sends are refused (402/blocked), never silently dropped and never allowed to overrun — a runaway loop cannot blast.
- **I5 (bad reputation auto-pauses):** when bounces/complaints spike past a threshold, the sender is auto-PAUSED and every new campaign is refused (fail-closed) until a human reviews — a {suppression} event (bounce/complaint) both marks the address AND feeds this circuit-breaker.
- **I6 (deliverability attributes back):** every send carries campaign_id + recipient tags, so a provider webhook (delivered / bounced / complained) attributes back to the exact (campaign, recipient) and updates that address's sendability (suppression + the reputation counters behind I5).

**Out of scope (do not build, even if tempting):** building the audience / consent capture itself (crm owns {contact}, {consent}, and the consent-gated segment — this workbook CONSUMES it) · the roles/login that protect staff endpoints (auth-roles owns that; staff endpoints ship disabled without it) · a drag-drop template designer / rich WYSIWYG (a body is markdown/HTML text; a template picker is a later `templates` workbook) · A/B testing, drip/nurture SEQUENCES over time (a `sequences` workbook can add multi-step; this is single-campaign + transactional) · open/click tracking pixels and link rewriting (a later `email-analytics` concern; this workbook attributes delivery events, not engagement) · SMS/push (other channels, other workbooks).

**Slots the human MAY customize before attaching** (edit these lines, nothing else): the {campaign}/{segment}/{unsubscribe} words above · the per-period {quota} number + window (default **month**) · the circuit-breaker window size N (default **1000 sends**) and thresholds (default **pause when complaint-rate > 0.1% or hard-bounce-rate > 5% over the last N**) · the consent sources you accept (default **order / form / import**, matching crm) · whether transactional sends are also quota-metered (default **yes**).

## §2a THE DOMAIN MODEL (the real entities + how they relate)

<!-- Grounded in SellKit's real broadcast + audience surface (internal/broadcast: broadcast.go, scan.go; internal/audience: audience.go). No owner_id/tenant_id — single-operator app (CONTRACT constraint 2). -->

**Entities** (the nouns email really has — name each with its key fields):

| Entity | Key fields | What it is |
|---|---|---|
| campaign | id, subject, body_markdown, segment, status, recipient_count, sent_count, failed_count, send_at, post_ref, created_at, completed_at | the campaign header — one "email this segment this message" run; `segment` is crm's stored segment DEFINITION (never a recipient list — §2c); `recipient_count` is a SUMMARY integer (resolved-at-fire count for display), NOT the list; `status` ∈ scheduled/sending/sent/failed/canceled; `post_ref` is the optional source-content id that makes a campaign idempotent per source |
| send_record | id, campaign_id, recipient, status, provider_message_id, error, sent_at | ONE row per (campaign_id, {recipient}) actually sent — the `UNIQUE(campaign_id, recipient)` here is what closes the double-send race (I3); `status` ∈ queued/sent/delivered/bounced/complained/failed |
| consent | (owned by crm) contact, source, granted_at, revoked_at | crm's proof-of-permission; this workbook READS it (never writes contact consent) — presence + not-revoked = sendable (I1) |
| suppression | address, reason, source_ref, at | an address marked un-sendable; `reason` ∈ unsubscribed / hard_bounce / complaint; the union of these is the "do not email" list (I2 + feeds I5); an unsubscribe row is permanent |
| quota_usage | period, sent, ceiling | the per-period send counter vs its ceiling — the hard gate for I4 (a month bucket by default) |
| reputation_window | window_sent, sent, bounced, complained, paused_at | a COUNT window (not a time window — pick one, this is count): counters over the last N sends where N is a fixed size (default **1000**; the rate = bounced/N, complained/N over the most recent N). When `sent` rolls past a multiple of N, evaluate the rates; when a rate crosses a threshold, `paused_at` is stamped and sending is refused until cleared (I5). Below N total sends, the window is "not enough data" — don't pause on tiny samples |
| delivery_event | id, campaign_id, recipient, type, provider_message_id, at | a provider webhook fact (delivered/bounced/complained) attributed back via campaign+recipient tags; updates the send_record + suppression + reputation_window (I6) |

**Relationships:**

- campaign has-many send_records; a send_record belongs-to exactly one campaign and one {recipient}; the pair is UNIQUE — that uniqueness is what closes the double-send race (I3).
- campaign's {segment} is resolved THROUGH crm's consent-gated resolver — the campaign never stores a raw recipient list, it stores the segment DEFINITION and re-resolves at fire time (so a mid-flight unsubscribe/opt-out is honored — I1/I2).
- a {recipient} is only sendable if crm has a non-revoked consent for it AND there is no suppression row for its address — both conditions are joined into the segment resolver and the transactional pre-check.
- a delivery_event belongs-to one (campaign, recipient); a bounce/complaint event WRITES a suppression row AND increments the reputation_window (I6 → I5).
- quota_usage and reputation_window are app-wide (single-operator app — NO owner/tenant scope, per CONTRACT constraint 2); one counter set for the whole app.

**Lifecycle / state:**

- campaign.status: `scheduled → sending → sent` (all recipients attempted) · `sending → failed` (nothing sent) · `scheduled → canceled` (only a scheduled campaign can be canceled; a sending/sent one cannot — 409). Re-running a `sending`/`sent` campaign is idempotent per (campaign_id, recipient) — a no-op for already-sent rows (I3). Times stored in ONE zone (UTC or the business's explicit local zone — fixed at detect time, never mixed — see §9).
- send_record.status: `queued → sent → delivered` (happy path) · `sent → bounced` / `sent → complained` (provider webhook), each of which writes a suppression row; `queued → failed` (send error, retriable but never double-sent). Append-first, status advanced by delivery events — never hard-deleted.
- suppression: created once (from unsubscribe / hard bounce / complaint), permanent for unsubscribe; the address stays suppressed across ALL future campaigns (I2). An unsubscribe is one-way — there is no self-serve re-subscribe (a re-opt-in is a deliberate new consent capture in crm, not a flag flip here).
- reputation_window: rolls forward; crossing a threshold stamps `paused_at` (sending refused, I5); clearing the pause is a deliberate human action (staff endpoint), never automatic.

## §2b DECISIONS & TRADE-OFFS (surfaced at the gate — never silently guessed)

| Decision | Options | When to pick which | Default |
|---|---|---|---|
| Idempotency key for a campaign | campaign_id-only / (campaign_id, recipient) / source `post_ref` | (campaign_id, recipient) ALWAYS closes the per-recipient double-send (I3, non-negotiable); ADD a source `post_ref` unique key when a campaign is generated from a piece of content (a post, a broadcast) so "Send as email" twice reuses the SAME campaign instead of making two | (campaign_id, recipient) send-record uniqueness + optional `post_ref` campaign-level dedup. **Two levels, no conflict: `post_ref` (or the `Idempotency-Key` header) dedups CAMPAIGN CREATION — the first request creating a campaign for that post_ref wins and a repeat returns it; (campaign_id, recipient) dedups the SENDS within it. If a header key and a post_ref are both present, `post_ref` is the durable source-of-truth (the header is a per-request retry guard)** |
| Consent source policy | order+form+import / order+form only / order only | match crm's accepted sources exactly — this workbook must NOT accept a source crm's gate rejects; tighten to order-only if you never want imported lists emailed | order+form+import (mirror crm's I4) |
| Circuit-breaker sensitivity | strict / standard / off | strict (pause at complaint>0.05%, bounce>2%) if you share a sending IP/reputation pool; standard for a dedicated sender; off is FORBIDDEN in production (you'll get your domain blacklisted) — off only in a local dev env with a fake provider | standard (complaint>0.1%, hard-bounce>5% over last N) |
| Quota window | per-day / per-month / both | per-month for a plan ceiling; per-day when you want a burst cap too; both stacks a daily burst limit under a monthly ceiling | per-month |
| Fan-out delivery mode | synchronous-in-request / async job queue / durable-scheduled | synchronous only for tiny lists (< ~50) and ONLY with the timeout warning (rung C); async is the real answer for any real list — see the §3 ladder | async (queue/durable) — see §3 ladder |
| Transactional metering | metered / unmetered | metered (default) counts one-offs against the same quota so a receipt loop can't blast; unmetered only if receipts are provably bounded (one per order) and you want campaign quota separate | metered (transactional counts against quota) |

Claude states each of these at the §3 gate with its default and asks the human to confirm or change — none is guessed silently. The consent-source policy and circuit-breaker sensitivity are load-bearing (privacy + deliverability) and MUST be confirmed explicitly.

## §2c GOTCHAS / HOW IT GOES WRONG (this domain's classic mistakes)

- **Storing a frozen recipient list on the campaign at create time** → someone unsubscribes between "create" and "send" and still gets the email, because the list was snapshotted before their opt-out. Store the segment DEFINITION and RE-RESOLVE recipients at fire time through crm's gate, so a mid-flight unsubscribe is honored (I1/I2). SellKit's scheduler re-resolves at fire time for exactly this reason.
- **Bypassing crm's consent gate with your own "email everyone" query** → you re-implement the audience, forget the suppression/consent joins, and blast people who never opted in. The ONLY sanctioned audience source is crm's consent-gated segment resolver — never SELECT addresses directly, never widen the segment in this workbook (I1). SellKit: "there is no list-import path — a recipient can only exist by having given this seller their email."
- **Treating unsubscribe as a per-campaign flag** → they opted out of the April newsletter but the May one still reaches them, because the opt-out was scoped to one campaign. An unsubscribe is a GLOBAL, permanent suppression across every future send (I2).
- **Idempotency by campaign_id alone (or none)** → a retry or a double-clicked "Send" re-runs the whole fan-out and everyone gets the email twice. The idempotency grain is (campaign_id, recipient): a UNIQUE send-record per pair makes a re-run a no-op for already-sent recipients (I3). SellKit uses a per-campaign advisory lock PLUS a (source, post) unique index as the double-click backstop.
- **No quota gate** → a bug in a loop, or a compromised endpoint, sends a million emails before anyone notices, torching your reputation and your bill. A hard per-period ceiling refuses sends past the cap (I4).
- **Ignoring bounces/complaints** → your hard-bounce and complaint rates climb, the provider blacklists your domain, and NOTHING sends anymore. Feed every bounce/complaint into a suppression row AND a reputation counter that auto-pauses sending before you get blacklisted (I5/I6).
- **Hardcoding one email provider as the assumption** → you wire everything to one brand's SDK, then can't move when pricing or deliverability changes. Name the CAPABILITY (an email sending provider with a delivery webhook) and detect the concrete one; keep it behind ONE adapter (§4) so the provider is swappable.
- **Mixing local and UTC times on send/delivery events** → your "sent 3 days ago" and your per-window reputation math drift across a DST boundary and mis-fire the circuit-breaker. Pick ONE zone at detect time, write it in the Stack Report, never mix (see §9).

## §3 DETECT (do this before touching any file)

<!-- FIXED boilerplate — identical in every workbook. -->

1. **Inspect:** manifest files (`package.json`, `go.mod`, `requirements.txt`, `Gemfile`, `composer.json`…), lockfiles, platform config (`wrangler.toml`, `next.config.*`, `Dockerfile`…), existing migrations/schema, the existing auth pattern, the test runner, the folder layout — and `WORKBOOKS.md` at project root if it exists (workbooks already installed). For Mode INTEGRATE, ALSO read the installed `crm` workbook's contact/consent/segment surface this feature CONSUMES, and any existing email-sending, unsubscribe, or provider-webhook code this must relate to or extend.
2. **Decide the build mode:** **NEW** (no email/campaign surface exists — scaffold campaigns, send-records, suppression, the provider adapter, and the unsubscribe + webhook endpoints fresh) or **INTEGRATE** (a related surface already exists — crm's consent-gated segment, or an existing transactional-email path — read it, state where this feature attaches, extend rather than duplicate the audience or the sender). Print which mode and what it means.
3. **Print the Stack Report** — one small table: language · runtime · framework · database · migration tool · auth · hosting · test runner · conventions observed · **detected email provider** (the concrete sender + whether it exposes a delivery webhook) · **the timezone the app stores times in** (detect from the existing schema/convention, or propose UTC and confirm — the reputation-window rate math and any scheduled send depend on ONE fixed zone, §2c) · build mode (NEW / INTEGRATE). Name unknowns as unknown; never guess.
4. **Confirm the decisions** in §2b — state each with its default (idempotency key, consent-source policy, circuit-breaker sensitivity, quota window, fan-out mode, transactional metering) and ask the human to confirm or change. The consent-source policy and circuit-breaker sensitivity MUST be confirmed explicitly.
5. **Choose your rung** from the guarantee ladder below. The ladder is written against CAPABILITIES, never brand names — an unfamiliar stack still lands on a rung.
6. **Gate:** print the Stack Report (with build mode) + confirmed decisions + chosen rung + a plain-words build plan (≤12 lines total) and WAIT for the human's OK before writing any code.

**Iron rules:** extend, never replace (no new framework/DB/ORM into an existing app; in INTEGRATE mode, consume crm's existing segment + consent, don't duplicate the audience) · match the house style (naming, folders, error shapes) · missing capability = propose the smallest honest addition native to the detected hosting, and wait.

**Adaptation ladder — idempotent async fan-out (I3). The rung decides WHERE the "no double-send + delivered off the request path" guarantee lives; higher rungs put the uniqueness in the database (where a re-run cannot slip past it) and the delivery in a real async worker. A check in application code narrows the double-send window; only a storage constraint + a durable worker closes it.**

- **Rung A — DB with transactions + a real job queue (e.g. detected Postgres + a worker/queue):** a `send_records` table with `UNIQUE(campaign_id, recipient)`; the fan-out enqueues one durable job per recipient, each job does INSERT the send-record (on unique-violation → already sent, skip) THEN calls the provider; a retried job is a no-op because the insert already landed. The campaign can also carry an optional `UNIQUE(post_ref)` so a "send as email" double-click reuses the same campaign. Delivery is fully off the request path.
- **Rung B — DEFAULT LANDING on Cloudflare: D1 + Cloudflare Queues:** the `send_records` table with `UNIQUE(campaign_id, recipient)` written via D1's atomic batch. **The crash-safe send state machine (this is the load-bearing part — "insert-then-send" alone is NOT enough, spell it out):** each send_record has a status `queued → sent → (delivered/bounced/complained)`; the fan-out is (1) CLAIM: `INSERT … ON CONFLICT(campaign_id,recipient) DO NOTHING` — if 0 rows inserted, this pair is already claimed → STOP (no-op, prevents the double-send); if 1 row, you own this send; (2) SEND: call the provider passing a DETERMINISTIC per-send idempotency key = `{campaign_id}:{recipient}` (every real provider — Resend/SES/MailChannels — honors an idempotency key and dedupes a repeat), so even if this exact step re-runs after a crash, the PROVIDER sends once; (3) MARK: `UPDATE … SET status='sent', provider_message_id=? WHERE campaign_id=? AND recipient=?`. Recovery: a redelivered queue message whose row is still `queued` (crashed between claim and mark) RE-RUNS step 2 — the provider idempotency key makes the resend a no-op at the provider, then step 3 marks it — so a crash NEVER silently drops (the row is re-driven) and NEVER double-sends (the provider key dedupes). This closes the drop-vs-double-send gap the unique index alone leaves open. **Wire it on Cloudflare Queues:** a `[[queues.producers]]` binding the campaign command enqueues onto (enqueue in batches inside `ctx.waitUntil()` so a 5000-recipient producer returns fast), a `[[queues.consumers]]` binding with an exported `queue()` handler doing the 3 steps per message, `max_retries` set (e.g. 3) + a dead-letter queue so a permanently-failing recipient lands in the DLQ instead of looping forever. This is the rung you'll usually land on for the default stack.
- **Rung B-alt — Durable Object alarm loop (pick this over Queues ONLY if you need strict ordering or a single-writer counter):** a DO holds the campaign, `alarm()` steps through recipients single-threaded (no concurrency, so the quota/reputation counters have no contention — see §5). Trade-off: simpler counters, but one DO is a throughput ceiling. Default to Queues unless the counter-contention in §5 pushes you here.
- **Rung C — DB with unique index but NO async worker (serverless with no queue/DO):** same `UNIQUE(campaign_id, recipient)` send-records, but fan-out runs SYNCHRONOUSLY inside the request, insert-then-send per recipient — and print this WARNING in plain words: "Sending runs inside the request; a large segment will hit the request timeout and the fan-out will stop partway (the unique index still prevents double-sends on retry, but the campaign won't finish in one call). I recommend adding {the lightest async primitive native to the detected hosting — a queue or a scheduled worker}." Proceed only if the human types "accept the risk". Correctness (no double-send) holds; completeness at volume does not.
- **Rung D — storage can enforce no uniqueness at all (KV-only, spreadsheet-backed, flat files):** check-then-send with a re-check immediately before each send — and print this WARNING: "Your storage cannot enforce the no-double-send guarantee; a retry or a concurrent re-run can email the same person twice. I recommend adding {the lightest capable DB native to the detected hosting}." Proceed only if the human types "accept the risk".

**Consent rule (all rungs) — the crm resolver interface (this is the contract you call; it is what makes the campaign path buildable, not a hand-wave):** this workbook calls crm's `resolveSegment(segmentDef) → AsyncIterable<{address, consent_source}>` (an in-process function call when crm + email live in the SAME Worker — the default; a service-binding RPC if crm is a separate Worker — detect which at DETECT). `segmentDef` is the opaque JSON blob crm defined and this workbook stored verbatim on `campaign.segment` (never parsed here). crm's resolver ALREADY excludes non-consented + opted-out (crm owns consent). **The suppression split (resolving the apparent double-join):** crm excludes CONTACT-level opt-outs; THIS workbook owns EMAIL-delivery suppression (hard-bounces + spam-complaints from delivery events — data crm never sees), so the send path does one final `suppressionFor(address)` check as a belt-and-suspenders on crm's output — not a re-implementation of consent, a distinct layer. If crm is not installed, a campaign endpoint has no sanctioned audience and ships disabled (see §6/§8); transactional sends still work against a directly-supplied address + the local suppression check.

## §4 THE LAYERS (build in this order; one responsibility per layer)

| Layer | This feature puts here |
|---|---|
| route | `POST /campaigns` (create + fan-out) · `GET /campaigns` + `GET /campaigns/{id}` (staff status) · `POST /campaigns/{id}/cancel` (scheduled only) · `POST /email/transactional` (one-off, staff/system) · `GET /unsubscribe?token=` (public, one-click) · `POST /email/webhook` (provider delivery events) — thin handlers, zero logic |
| validation | edge schema checks: required fields, subject/body present, segment definition well-formed (delegated to crm's segment parser), webhook payload shape, unsubscribe token format; reject unknown fields; reject a client-sent recipient list on a campaign (segments only); NO business rules here |
| auth | per-endpoint guards per the §6 matrix; campaign + transactional + cancel + pause-clear are staff-only (or shipped disabled until auth-roles); `GET /unsubscribe` is public; `POST /email/webhook` is authenticated by the provider's signing secret, NOT a user session |
| command | `createCampaign` (resolve segment via crm's consent gate → check circuit-breaker pause → persist header → enqueue fan-out) · the per-recipient `sendOne` (queue consumer: RE-CHECK the pause flag first — a breaker that trips mid-fan-out from arriving bounces must stop the REST of the run, not just block new campaigns → atomic quota-increment → the §3 claim-send-mark state machine) · `sendTransactional` (consent + suppression pre-check → atomic quota → send one) · `handleUnsubscribe` (write permanent suppression → emit nothing sensitive) · `ingestDeliveryEvent` (attribute to (campaign,recipient) → update send-record → on bounce/complaint write suppression + bump reputation → maybe auto-pause) · `clearPause` (staff-reviewed) |
| domain | PURE functions, no framework/DB imports: `isSendable(address, consent, suppression)` (the consent+suppression predicate — I1/I2) · `exceedsQuota(usage, ceiling)` (I4) · `breaches(window, thresholds)` (the circuit-breaker rule — I5) · `unsubToken(address)` / `verifyUnsubToken(token)` — **the token is an HMAC-signed encoding of the address: `token = base64url(address) + "." + base64url(HMAC-SHA256(address, UNSUB_SECRET))`; `verifyUnsubToken` recomputes the HMAC and constant-time-compares, then returns the address (so the token CARRIES the address — no token→address table needed) — this makes it unguessable (an attacker can't forge the HMAC) yet self-contained (griefing/enumeration impossible)** — each unit-testable in isolation |
| persistence | repository functions — the ONLY place queries live; the §3 rung (the `UNIQUE(campaign_id, recipient)` send-record + insert-then-send) lives HERE; also `suppressionFor(address)`, `quotaUsage(period)`, `reputationWindow()`; the segment RESOLUTION is delegated to crm's resolver, never re-implemented here |
| event | `email.sent`, `email.bounced`, `email.complained` emitted through one small in-process dispatcher — the seam exists even if today's only listener is a log line; the workbook also SUBSCRIBES to crm's `activity.logged` to trigger a transactional send. **The subscription assumes crm + email share ONE Worker isolate (the default — an in-process event bus); if crm is a SEPARATE Worker there is no in-process bus, so the trigger is instead a crm→email service-binding call or a queue message — decide at DETECT. The `activity.logged` payload this consumes: `{type, contact_id, address, meta}` — act only when `type=="email"`, send to `address`** |
| listener | best-effort subscribers: on crm's `activity.logged`(type=email) → `sendTransactional`; on `email.bounced`/`email.complained` → update reputation + maybe pause — never throws into the request path (a webhook that fails to update a counter logs and returns 200 so the provider doesn't hammer retries) |
| adapter | the outbound send + the provider's delivery-webhook parsing wrapped in ONE module behind a `Sender` seam: `send({to, subject, body, idempotencyKey, tags}) → {providerMessageId}` and `parseDeliveryWebhook(rawBody, headers) → {type, campaignId, recipient, providerMessageId}` and `verifyWebhookSignature(rawBody, headers, secret) → bool`. The concrete provider (detected: Resend / SES / MailChannels on Cloudflare) is the only thing this module knows — **you WILL need to read the detected provider's send + delivery-webhook + signature docs to implement these three; the workbook gives the SEAM shape, the provider gives the wire format** (each signs differently: Resend/Svix HMAC, SES/SNS signature — implement in the adapter, verify fail-closed). The campaign_id + recipient `tags` on send are what the provider echoes back on the delivery webhook so I6 can attribute; credentials + the webhook signing secret from env; a missing credential means the send FAILS CLOSED (never "send unsigned/unconfigured"), an unverifiable webhook signature is rejected 401 |
| audit | append-only record for campaign create / cancel / unsubscribe / suppression-add / pause / pause-clear: who (staff id or "system" or "provider-webhook"), what, old/new sendability, when |

**Rules:** domain functions stay pure · all queries behind persistence functions · a layer that truly doesn't apply is declared n/a with one line of why — never silently skipped, never faked · follow the project's existing layout for where these files live.

## §5 HOLD THE LOAD (implement silently; verified in §7)

- The campaigns list endpoint is paginated by default (cap 50, cursor or offset per house convention) and filterable by status — never returns every campaign or every send-record unbounded.
- Indexes ship with the schema: `UNIQUE(campaign_id, recipient)` on send_records (the double-send guard, which doubles as the per-campaign recipient lookup) · `UNIQUE(address)` on suppression (the "do not email" lookup on every send) · an index backing `quota_usage(period)` and the reputation-window read the circuit-breaker does before each campaign · an optional `UNIQUE(post_ref)` on campaigns for source-dedup.
- Segment resolution is ONE bounded query per campaign (crm's resolver) — never a query per recipient to re-check consent (the consent+suppression joins live IN the resolver, no N+1); the suppression check for a campaign is a set join, not a per-address round-trip.
- **The quota is a HARD ceiling and must be ATOMIC (a pre-flight check-then-increment RACES and overruns under fan-out concurrency — do NOT do that).** Each send increments via an atomic conditional update: `UPDATE quota_usage SET sent = sent + 1 WHERE period=? AND sent < ceiling` and read rows-affected — 1 = you got a slot, send; 0 = ceiling hit, refuse (402). This is the ONLY pattern that holds under N concurrent queue consumers on D1 (no interactive transactions). A pre-flight `SELECT sent < ceiling` then a later `+1` is the classic race the invariant I4 forbids — the single-threaded quota test passes while the real invariant fails, so the test must fire N concurrent sends against a ceiling and assert no overrun.
- **Counter contention:** `quota_usage` and `reputation_window` are single app-wide rows every fan-out message writes — a hot path. On the Queues rung, keep the consumer concurrency modest (e.g. cap 8 in flight) so the conditional-increment contention stays bounded; if it's still hot, the DO-alarm rung (§3 Rung B-alt) serializes the counter and removes contention entirely. State which you chose in the DONE note.
- `POST /campaigns` and `POST /email/transactional` accept an idempotency key (header or field, per house convention); a replay with the same key returns the ORIGINAL campaign/result, never a second fan-out — a double-tapped "Send" must not become two campaigns (this is the campaign-level guard on top of the per-recipient I3).
- Handlers stateless: the no-double-send guarantee lives in the §3 rung (`UNIQUE(campaign_id, recipient)`) at the storage layer, NEVER in an in-memory "already sent" set (that dies the moment a second instance/isolate runs the fan-out).
- Fan-out concurrency is bounded (a semaphore / a queue's concurrency cap, e.g. 8 in flight) so a large campaign doesn't open thousands of provider connections at once; the segment size per campaign is bounded and large lists chunk.

## §6 THE GUARDS (security — non-negotiable)

**Authz matrix — every endpoint this workbook creates gets a row:**

| Endpoint | Who may call it |
|---|---|
| `POST /campaigns` | staff only — sends to your whole audience; disabled-until-auth-workbook if no auth yet |
| `GET /campaigns` + `GET /campaigns/{id}` | staff only — campaign status + counts |
| `POST /campaigns/{id}/cancel` | staff only — scheduled campaigns only |
| `POST /email/transactional` | staff or system (an internal event/listener) — never public |
| `GET /unsubscribe?token=` | public by token — one-click, returns a plain confirmation, zero PII, no login |
| `POST /email/webhook` | the provider only — authenticated by the webhook SIGNING SECRET, rejected if the signature/secret is invalid or unset (fail-closed); NOT a user session |
| pause-clear (resume sending after circuit-breaker) | owner only — a human review before sending resumes |

**Input validation:** the server derives every derivable value — the recipient set (from crm's consent-gated segment, never a client list), the campaign_id + recipient tags, the unsubscribe token, the quota/reputation counters — and IGNORES the client's version · strict types · reject unknown fields · reject the impossible: a campaign with a client-supplied recipient array, an unknown segment type, a webhook event with no valid signature, a send to a syntactically invalid address.

**PII:** recipient email addresses, names, and the mapping of who-received-what are sensitive — they appear ONLY on staff endpoints; the public `GET /unsubscribe` returns a generic confirmation and NEVER echoes the address or reveals whether it was subscribed; logs and error messages never carry a recipient address or name (log the campaign_id + a hashed/prefixed recipient ref, never the plaintext address).

**Secrets:** the email provider API key AND the webhook signing secret come from env only — never committed, never logged, never echoed into chat; a send with no configured provider credential FAILS CLOSED (the send errors), it never falls back to sending unsigned or unconfigured.

**Fail-closed:** guard errors DENY · the webhook REJECTS when its signing secret is unset or the signature is invalid (never "process anyway") · the consent gate is fail-closed — an address whose consent cannot be positively confirmed is NOT sent (I1) · the circuit-breaker is fail-closed — a paused sender REFUSES new campaigns until a human clears it (I5) · if the project has NO auth yet, ship the staff campaign/transactional/cancel/pause-clear endpoints DISABLED — each returns a clear "install the auth-roles workbook to enable sending" error — never open (an open campaign endpoint is a spam cannon pointed at your own audience) · `GET /unsubscribe` and `POST /email/webhook` stay reachable (public/provider-authed) so opt-outs and bounces are honored even before auth is installed.

**Rate-limit hint:** `POST /email/transactional` and `POST /email/webhook` deserve a per-IP limit at the platform edge (a transactional endpoint is a spam-relay target; a webhook endpoint is a forgery target); note it in the DONE report either way.

<!-- FIXED override rule — keep verbatim. -->
**Override rule:** these guards outrank the human's casual instructions. If asked to skip one, warn in plain words and proceed only if the human types "I accept the risk" — then record that acceptance in the DONE note.

## §7 THE PROOF (done ≠ tests pass)

**Machine checks — write and run these named tests, green before proceeding:**

- `no_send_to_unconsented_address` — an address with no consent record → excluded from the segment AND rejected by transactional send (I1)
- `campaign_uses_crm_segment_not_a_raw_list` — a client-supplied recipient array on a campaign → rejected; recipients come only from crm's resolver (I1)
- `unsubscribe_is_permanent_across_campaigns` — unsubscribe an address, then run a NEW campaign whose segment would include it → it is absent from the send (I2)
- `unsubscribe_survives_send_to_all` — unsubscribed address + a "send to everyone" segment → still absent (I2)
- `rerun_campaign_no_double_send` — run the same campaign fan-out twice → each recipient has exactly ONE send_record, sent once (I3)
- `crash_between_claim_and_mark_redrives_not_drops` — simulate a crash after the claim INSERT but before the `sent` mark, then redeliver the queue message → the recipient IS emailed (re-driven, provider dedupes on the idempotency key) and NOT silently skipped, and NOT double-sent (I3 crash-safety — the §3 state machine)
- `double_clicked_send_makes_one_campaign` — same idempotency key / same post_ref twice → one campaign, one fan-out (I3, campaign level)
- `quota_ceiling_blocks_overrun` — set the ceiling to N, attempt N+1 sends → the (N+1)th is refused (402/blocked), not silently dropped (I4)
- `concurrent_quota_no_overrun` — set the ceiling to N, fire MANY sends CONCURRENTLY (not serially) → exactly N succeed, the rest refused, `sent` never exceeds `ceiling` (I4 under fan-out concurrency — proves the atomic conditional-increment, catches the pre-flight-check race)
- `spike_pauses_sending` — feed bounces/complaints past the threshold → the next campaign create is refused with the paused error (I5)
- `bounce_suppresses_and_attributes` — a bounce webhook for (campaign,recipient) → that address gets a suppression row, the send_record flips to bounced, the reputation counter increments (I6)

**Adversarial probes — attack your own build and paste REAL output:**

- **The double-send probe:** run the SAME campaign's fan-out twice concurrently (or fire the queue redelivery) for a segment of 10 → expected: exactly **10 send_records, each sent once** (0 duplicates) — run it and paste the actual per-recipient count. On Rung D this probe MAY show a double-send; that is precisely why the Rung D warning + "accept the risk" exists — show the human the real count either way.
- **The consent-leak probe:** put one address with NO consent (and one that's opted-out) into the raw people table, request a campaign over the segment → confirm BOTH are absent from the resolved recipients (I1); flip a "send to all" flag and re-request → still absent.
- **The unsubscribe-forever probe:** unsubscribe an address via `GET /unsubscribe?token=`, then create a fresh campaign whose segment includes it → fetch the send_records → that address has NONE (I2).
- **The no-auth probe:** call `POST /campaigns` with no credentials → expected 401/403 (or the disabled-endpoint error), NEVER a fan-out.
- **The forged-webhook probe:** POST a bounce event to `/email/webhook` with a missing/invalid signature → expected reject (401/403), the address is NOT suppressed by the forged call (fail-closed).
- **The quota-runaway probe:** loop transactional sends past the ceiling → expected: sending stops at the ceiling, the loop gets refusals, no overrun (I4).

**World checklist — hand the human this, copy-paste ready:**

1. Create a campaign to a segment you built in CRM → you see it go out, and the status shows how many were sent.
2. Run the SAME campaign again → nobody gets it twice (the sent count doesn't double).
3. Click an unsubscribe link from a test email → you're removed; run a new campaign → that person is not on it.
4. Try to send a campaign while logged out → you're refused.
5. Try to email someone who never gave you their address (add them raw, without consent) → the system won't include them.
6. (If your provider is wired) let a test bounce come back → that address is suppressed and the campaign's failed count reflects it.

<!-- FIXED closing audit — keep verbatim. -->
**Closing audit — print all four, countable, before claiming done:** (1) the Layer Map — all 10 layers → real file paths or explicit n/a; (2) the Guard audit — every §6 row → where it is enforced; (3) the rung chosen in §3 and why; (4) every invariant I1–I6 → the named test or probe that proves it.

## §8 SNAP POINTS (composition)

<!-- FIXED ledger rule — keep verbatim. -->
**The ledger:** on completion, append one line to `WORKBOOKS.md` at project root: `email · v1.0 · rung {A-D} · endpoints: {…} · events: email.sent, email.bounced, email.complained`. Create the file with a one-line header if absent.

**Requires:** none as a hard build blocker — but a campaign has NO sanctioned audience without `crm` installed (crm owns the contacts, the consent, and the consent-gated segment this workbook consumes); with no crm, the campaign endpoints ship disabled and only transactional-to-a-known-consented-address + unsubscribe + webhook are live.

**Pairs with:** `crm` — this workbook CONSUMES crm's consent-gated bulk segment as the ONLY audience source (never bypasses crm's I4 consent gate) and SUBSCRIBES to crm's `activity.logged`(type=email) to actually send a transactional email; crm records that an email activity happened, this workbook does the sending + owns unsubscribe/suppression · `auth-roles` — flips the disabled staff campaign/transactional/cancel/pause endpoints on and maps them to roles (owner/staff) · `booking` / `payments` — their `booking.created` / `payment.succeeded` events can drive a transactional send (a confirmation, a receipt) through this workbook once both are installed.

**Provides:** the endpoints in §6 · events `email.sent` / `email.bounced` / `email.complained` with the full send record as payload · the {suppression} list + address sendability as the reusable "do not email" source for future workbooks · the provider `Sender` adapter seam other workbooks can reuse for their own transactional sends.

<!-- FIXED shared conventions — keep verbatim. -->
**Shared conventions (all workbooks):** error taxonomy 400/422 validation · 401/403 auth · 409 conflict · 500 unexpected — event names `noun.verb-past` with the full record as payload — soft-delete over hard delete wherever history matters.

## §9 KNOWN TRAPS

- **Snapshotting recipients at create time:** an unsubscribe between create and send still reaches them; store the segment DEFINITION and re-resolve at fire time through crm's gate (I1/I2).
- **Re-implementing the audience:** a hand-rolled "SELECT email FROM …" forgets the consent + suppression joins and blasts non-consenters; the segment resolver (crm) is the ONE audience source, never bypassed (I1).
- **Idempotency by campaign_id alone:** a retry re-runs the whole fan-out and everyone gets it twice; the grain is (campaign_id, recipient) with a UNIQUE send-record, so a re-run is a no-op per already-sent recipient (I3). An advisory/queue lock helps but the unique index is the backstop.
- **The check that feels like a guarantee:** a pre-send "did we already send to this pair?" existence check in application code narrows the double-send window; only the `UNIQUE(campaign_id, recipient)` constraint closes it under concurrency/redelivery. Never report Rung D behavior as a guarantee.
- **Per-campaign unsubscribe:** scoping an opt-out to one campaign lets the next campaign reach them; unsubscribe is a GLOBAL permanent suppression (I2).
- **No circuit-breaker:** letting bounces/complaints climb unchecked gets your domain blacklisted; feed them into a reputation window that auto-pauses before the provider does (I5).
- **Unsigned/unverified webhook:** trusting any POST to `/email/webhook` lets an attacker forge bounces to suppress your real customers, or forge deliveries to hide failures; verify the provider signature and fail closed if the secret is unset (§6).
- **Sync fan-out at volume:** sending inside the request works in the demo and dies at the request timeout on a real list; deliver off the request path (rung A/B) — the sync rung (C) ships only with the timeout warning.
- **Hardcoding one provider:** binding to one brand's SDK everywhere blocks a switch; keep the provider behind ONE adapter seam and detect the concrete one (§4).
- **Timezone drift on send/delivery events:** mixed local/UTC times mis-order events and mis-fire the reputation window across a DST boundary; pick ONE zone at detect time, write it in the Stack Report, never mix (§2c).

## DONE (Claude fills)

{3–5 lines: what was actually built, the build mode + rung used, the detected email provider, the double-send probe count, the consent-leak + unsubscribe-forever probe results, any guard overrides the human accepted, anything the next workbook should know.}
