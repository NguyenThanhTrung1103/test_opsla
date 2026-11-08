---
workbook: payments
version: "1.0"
kind: feature
risk: high
requires: []
pairs_with: [booking, auth-roles, monitor]
provides:
  - "POST create-checkout (public — QR/checkout for an order)"
  - "POST webhook-receiver (public, signed — the provider calls it)"
  - "GET payment-by-ref (public, no PII — status only)"
  - "staff refund + verify-poll endpoints"
  - "events: payment.succeeded, payment.refunded"
status: stable
---

<!-- This is a WORKBOOK — one recipe of the AI App Cookbook, in the Workbook System format (see FRAMEWORK.md). The human attaches this file to Claude Code and says "build this workbook." Everything below §1 is Claude's contract, not learner reading. -->

# Payments · Workbook

## §1 START HERE (for you, the human)

**What you get:** your customers pay for an order or a booking — by bank-transfer QR or a card checkout — and the money lands EXACTLY ONCE against that order, even if the payment provider calls your app twice, retries, or replays the same notification an hour later.

**What to say:** "Build this workbook: @payments.workbook.md" — or just attach it and say "build this". (VN: "Xây workbook này.")

**What you'll see:** Claude first prints a short Stack Report (what it found in your project, whether it's building NEW or INTEGRATING into your existing app, the few decisions it needs you to confirm, and what it will build — ≤12 lines) and waits for your OK. Then it builds and tests itself — including firing the SAME payment notification ten times to prove the order is only ever marked paid once. At the end it hands you a short checklist of things to click in your running app — when you've seen them all, it's done.

## §2 THE CONTRACT

**The job:** a customer pays for an {order} through a {provider}; the system opens a payment, shows a {checkout} (a QR or a hosted page), receives the provider's {webhook}, and marks the order paid — guaranteeing the same payment is never counted twice and the amount is always the server's, never the client's.

**Vocabulary mapping** (adapt these words to the human's business — detect from their app/brief; ask only if truly ambiguous):

| Word in this workbook | Means in the human's app |
|---|---|
| {order} | the thing being paid for — an order, a booking, an invoice, a cart; it OWNS the amount (the server reads the amount from here, never from the client) |
| {provider} | the payment gateway with a webhook + a verify call — SePay/VietQR (bank-transfer QR, the detected VN default), Stripe (cards), or any gateway that notifies-then-can-be-polled |
| {checkout} | what the customer is handed to pay: a bank-transfer QR image URL (SePay/VietQR) or a hosted card page (Stripe) — this workbook creates it, it does not host it |
| {ref} | the opaque, per-PAYMENT reference embedded in the transfer memo (e.g. `SK<8 random hex>`); it ties a notification back to exactly one payment row, and it is what makes a replay a no-op (I1). It is generated fresh per payment (crypto-random), NOT derived from the order id — see the Ref rule for why |
| {webhook} | the provider's signed callback saying "this transfer arrived"; it is the untrusted edge — verified, then made idempotent by {ref} |

**Invariants — each one is testable and each one maps to a check in §7:**

- **I1 (paid exactly once):** a duplicate or replayed {webhook} for the same {ref} settles the {order} EXACTLY ONCE — the second delivery is a no-op, never a second "paid", never a double-credit. This is the promise the feature is named for.
- **I2 (server owns the amount):** the amount charged and the amount checked come from the {order}'s own record; any client-sent amount is ignored. A webhook whose paid amount does NOT satisfy the match policy (§2b) is NEVER silently marked `succeeded` — it lands in an explicit `mismatched` state (a real row + an audit entry + a staff flag), so the money that arrived is visible and reconcilable, never stranded and never auto-accepted.
- **I3 (no valid signature → rejected):** a {webhook} is processed ONLY if its signature/secret verifies; when the secret is unset the receiver is FAIL-CLOSED — it rejects every call, it never "processes anyway".
- **I4 (amounts are integers, smallest unit):** every amount is an integer in the currency's smallest unit — VND has NO subunit (`750000` = 750,000₫, stored as-is), USD is cents; NEVER a float, never `parseFloat`, never `*100` guesswork.
- **I5 (status is a lifecycle, the row survives):** a payment moves `pending → succeeded → refunded`, or `pending → failed`, or `pending → mismatched` (money arrived but the amount didn't satisfy the match policy — a terminal-until-staff-resolves state); refund is a soft status transition (the row survives for history + audit), never a delete; a settle only advances from a legal prior state, never un-refunds a refunded row.
- **I6 (the poll reconciles a missed webhook):** if a {webhook} never arrives, a staff/scheduled VerifyPayment POLL asks the provider directly and settles the order through the SAME idempotent path — a payment can be recovered without ever double-counting one that already landed.

**Out of scope (do not build, even if tempting):** hosting the checkout page or card form (the {provider} does that — this workbook creates the QR/URL and receives the result) · storing raw card numbers / PAN / CVV (NEVER — that is the provider's PCI scope, not yours) · subscriptions / recurring billing / installments (a `subscriptions` workbook) · payouts / marketplace split / connect (a `payouts` workbook) · the order/cart/booking itself (this workbook SETTLES an order the `booking` or an order workbook owns; it stores no product data) · dunning / retry-email flows (the `email` workbook, driven by `payment.failed`).

**Slots the human MAY customize before attaching** (edit these lines, nothing else): the {order}/{provider} words above · which provider is the default (default **SePay/VietQR bank-transfer QR** for VN; Stripe if the app is card-first) · the currency (default **VND**) · whether the refund/verify staff endpoints are on (they ship DISABLED until the auth-roles workbook exists — see §6).

## §2a THE DOMAIN MODEL (the real entities + how they relate)

<!-- Grounded in SellKit's real payment surface (internal/payment: provider.go, sepay.go, vietqr.go, store.go). -->

**Entities** (the nouns payments really has):

| Entity | Key fields | What it is |
|---|---|---|
| payment | id, order_id, provider, provider_txn_id, ref, status, amount, paid_amount, currency, meta, created_at | the payment record; ONE order can have several rows over time (a failed attempt then a success); `provider_txn_id` = the gateway's per-transaction id used to match/reconcile (distinct from any provider account/config id, which is env config, not a column); `amount` = the amount OWED (from the order, I4), `paid_amount` = what actually arrived (set on settle; `!= amount` → `mismatched`, I2); `status` is the lifecycle (I5) |
| ref | `SK` + 8 crypto-random hex, unique per payment ROW | the idempotency key; written into the transfer memo, extracted from the webhook, matched back to exactly one payment — the UNIQUE thing that makes a replay land once (I1). Per-payment (never per-order) so a failed attempt + its retry get DIFFERENT refs and both can exist under `UNIQUE(ref)` |
| provider | name, capabilities (create-checkout / parse-webhook / verify / refund) | the gateway abstraction; SePay/VietQR generate a QR from acct+bank+amount+ref, Stripe hosts a card page — the workbook depends on the CAPABILITY, never a brand |
| webhook_event | provider_txn_id, ref, status, amount, currency, raw, test | the normalized, verified result parsed from a provider's signed callback (or from a verify-poll); `test` flags a sandbox/test transfer — in PRODUCTION mode a `test:true` event is rejected (never settles a real payment); in test/sandbox mode it settles but the resulting payment carries a `test` marker in `meta` so it never counts toward real revenue reporting |
| refund | payment_id, amount, reason, actor, at | a soft status transition + provider call (or a manual-bank-transfer note when the provider has no programmatic refund) — append to history, never delete the payment row (I5) |
| audit_entry | payment_id, actor, action, old_status, new_status, at | append-only history of open / settle / fail / refund / poll-reconcile — who/what/old/new/when |

**Relationships:**

- an {order} has-many payments over time; a payment belongs-to exactly one order (via `order_id`) — the order OWNS the amount the server trusts (I2).
- a payment carries exactly one {ref}; the {ref} is UNIQUE across payments — that uniqueness is what closes I1 at the storage layer (a replayed webhook resolving to the same ref cannot create or settle twice).
- a payment belongs-to one {provider} by name; the {provider} is resolved from config, never from the request body.
- a payment has-many audit_entries; a refund is BOTH a status transition on the payment AND an audit_entry — it never removes the row (I5).
- a payment has-one webhook_event that settled it (its `provider_txn_id` + `raw` are stored on the payment's `meta` for reconciliation).

**Lifecycle / state:**

- payment.status: `pending → succeeded` (a verified webhook or verify-poll whose amount satisfies the match policy settles it) · `pending → mismatched` (verified webhook arrived but the amount is short/over beyond the policy — the row records the received amount + a staff flag, money is visible not stranded; staff resolve it manually to `succeeded` or `refunded`) · `pending → failed` (provider reports failure/expiry) · `succeeded → refunded` (owner refund). Refund is soft (the row survives for history — I5). A settle only ADVANCES from a legal prior state: settling to `succeeded` touches only `pending` rows (never un-refunds a `refunded` one); settling to `refunded` touches only `pending/succeeded` — so a replayed settle event is inert (I1/I5). `pending` is the only non-terminal state; `failed`, `refunded`, and `mismatched` are terminal-until-staff-action. Amounts stored in ONE currency's smallest unit, fixed at create time, never mixed (I4).

## §2b DECISIONS & TRADE-OFFS (surfaced at the gate — never silently guessed)

| Decision | Options | When to pick which | Default |
|---|---|---|---|
| Payment provider | bank-transfer-QR (SePay/VietQR) / card (Stripe) / both | bank-transfer-QR for VN-first sellers (lowest fees, instant, the SellKit default); card when buyers are international or expect a card page; both if you serve both and let the customer choose | SePay/VietQR bank-transfer QR |
| Where the amount comes from | order-derived / request-supplied | ALWAYS order-derived — the server reads the amount off the {order} record; request-supplied is a fraud hole and is never an option, listed only to name the trap (I2) | order-derived (I2 — not negotiable) |
| Webhook match key | ref-in-memo (`SK<hex>`) / provider-tx-id / order-id-echo | ref-in-memo for bank transfers (the customer types/scans a memo; the per-payment random ref survives bank truncation because it's written FIRST); provider-tx-id when the gateway echoes a stable id (Stripe); order-id-echo only if the provider reliably returns your order id | ref-in-memo (`SK<8 random hex>`); the resolved payment's own `order_id` is the settle-join |
| Refund mechanism | programmatic / manual-with-record | programmatic when the provider supports it (Stripe refund API); manual-with-record for bank transfers (SePay/VietQR have NO refund API — staff transfers back by hand, the app records the status change + reason) | manual-with-record for bank-transfer providers, programmatic for card |
| Missed-webhook fallback | verify-poll-on-demand / scheduled-reconcile / none | verify-poll-on-demand (a staff "check payment" button) as the floor; scheduled-reconcile (a cron that polls pending payments older than N minutes) when volume is high; none only for a provider with a rock-solid webhook and low stakes | verify-poll-on-demand (I6) |
| Amount-match policy | exact / exact-or-over / tolerance-band | exact for card gateways (they charge the exact amount) — under OR over → `mismatched`; exact-or-over for bank transfer (a customer who overpays has still paid; accept ≥ order amount, refund the surplus manually) — under → `mismatched`; tolerance-band (±N) only if rounding/fees routinely shift the amount | exact for card, exact-or-over for bank transfer — anything failing the policy goes to `mismatched` (I2), never silent-`succeeded` |

Claude states each of these at the §3 gate with its default and asks the human to confirm or change — none is guessed silently. The provider, the refund mechanism, and the amount-match policy are load-bearing (money movement) and MUST be confirmed explicitly. `amountsMatch(orderAmount, paidAmount, policy)` implements exactly this decision — a payment failing it lands in `mismatched`, not `succeeded`.

## §2c GOTCHAS / HOW IT GOES WRONG (this domain's classic mistakes)

- **Storing money as a float (`19.99`, `parseFloat`, `amount * 100`)** → rounding drift silently loses or invents cents, and reconciliation never balances. Store an INTEGER in the currency's smallest unit; VND has no subunit so `750000` is stored as-is, USD is cents (I4). Never a float anywhere in the money path.
- **Trusting the amount (or the "paid" flag) from the client or the webhook body** → a tampered request pays 1₫ for a 750,000₫ order. The server DERIVES the amount from the {order} record and only accepts a webhook whose amount matches it (I2); the client's amount is ignored entirely.
- **Processing a webhook with no signature check (or "process anyway" when the secret is unset)** → anyone who finds the URL can mark any order paid. The receiver verifies the signature/secret and is FAIL-CLOSED when the secret is unset — it rejects, it never processes (I3). This is the single most common payment breach.
- **No idempotency key, so a retried/replayed webhook double-counts** → the provider retries on any 5xx or timeout, and a naive receiver marks the order paid twice / emits two `payment.succeeded` / double-credits a wallet. The {ref} is UNIQUE and the settle only advances a legal state, so the second delivery is a no-op (I1). This is THE hard part of payments.
- **Hard-deleting a refunded or failed payment** → destroys the audit trail, the dispute evidence, and the link an order needs to explain "why is this refunded". Refund and failure are SOFT status transitions; the row survives (I5).
- **Assuming the webhook always arrives** → a dropped or delayed callback leaves a real, paid order stuck `pending` forever. A VerifyPayment POLL reconciles it through the same idempotent settle path (I6) — never a second, divergent write path.
- **Hardcoding one provider brand as the assumption** → the app can't add cards later without a rewrite. Depend on the {provider} CAPABILITY (create-checkout + parse-webhook + verify + refund); SePay/VietQR and Stripe are rungs on that ladder, not the assumption.

## §3 DETECT (do this before touching any file)

<!-- FIXED boilerplate — identical in every workbook. -->

1. **Inspect:** manifest files (`package.json`, `go.mod`, `requirements.txt`, `Gemfile`, `composer.json`…), lockfiles, platform config (`wrangler.toml`, `next.config.*`, `Dockerfile`…), existing migrations/schema, the existing auth pattern, the test runner, the folder layout — and `WORKBOOKS.md` at project root if it exists (workbooks already installed — read whether `booking` is installed, since this workbook subscribes to its `booking.created`). For Mode INTEGRATE, ALSO read the existing order/cart/booking model this feature must settle, and any existing payment or checkout surface.
2. **Decide the build mode:** **NEW** (no payment surface exists — scaffold payments, the webhook receiver, the provider adapter fresh) or **INTEGRATE** (the app already has orders/checkout/a payment table — read it, state where this payment feature attaches to the existing order model, and extend it rather than duplicating). Print which mode and what it means.
3. **Print the Stack Report** — one small table: language · runtime · framework · database · migration tool · auth · hosting · test runner · conventions observed · build mode (NEW / INTEGRATE). Name unknowns as unknown; never guess.
4. **Confirm the decisions** in §2b — state each with its default (provider, amount-source, webhook match key, refund mechanism, missed-webhook fallback) and ask the human to confirm or change. The provider and the refund mechanism MUST be confirmed explicitly.
5. **Choose your rung** from the guarantee ladder below. The ladder is written against CAPABILITIES, never brand names — an unfamiliar stack still lands on a rung.
6. **Gate:** print the Stack Report (with build mode) + confirmed decisions + chosen rung + a plain-words build plan (≤12 lines total) and WAIT for the human's OK before writing any code.

**Iron rules:** extend, never replace (no new framework/DB/ORM into an existing app; in INTEGRATE mode, settle the EXISTING order model, don't duplicate it) · match the house style (naming, folders, error shapes) · missing capability = propose the smallest honest addition native to the detected hosting, and wait.

**Adaptation ladder — the paid-exactly-once guarantee (I1). The rung decides WHERE idempotency lives; higher rungs put it in the database, where two simultaneous deliveries of the same {ref} cannot both settle. An application-level "have I seen this ref?" check narrows the race; only a storage constraint closes it.**

- **Rung A — DB supports interactive transactions + unique indexes (e.g. detected Postgres):** a `UNIQUE(ref)` on payments; settling runs inside ONE transaction that both marks the payment `succeeded` (via a state-guarded `UPDATE … WHERE status = 'pending'`) and inserts the audit row — a replayed webhook resolves to the same ref, the guarded UPDATE touches zero rows, and the whole thing is a no-op → return 200 "already processed".
- **Rung B — DB supports transactions + unique indexes (most SQL engines):** same `UNIQUE(ref)` + the state-guarded `UPDATE payments SET status='succeeded' WHERE ref=? AND status='pending'`; the rows-affected count IS the idempotency signal (1 = settled now, 0 = already settled or unknown ref → no-op). Emit `payment.succeeded` only when rows-affected = 1.
- **Rung C — no interactive transactions, but atomic batch writes exist (e.g. detected Cloudflare D1, some serverless SQL) — THE DEFAULT LANDING RUNG:** a `UNIQUE(ref)` index + a D1 atomic `db.batch([...])` that lands the guarded status UPDATE, the audit insert, AND (preferred) the order→paid flip as a single all-or-nothing unit. **The idempotency signal is the rows-affected on the guarded UPDATE — and `db.batch()` returns an ARRAY of results, one per statement, so read `results[i].meta.changes` for the UPDATE's index specifically (NOT a bare `.changes` on the wrong object, which yields `undefined` and silently breaks the emit-gate).** 1 = settled now → emit `payment.succeeded`; 0 = already settled or unknown ref → no-op, no event. This is where most single-operator Cloudflare apps land.
- **Rung D — storage can enforce no uniqueness at all (KV-only, spreadsheet-backed, flat files):** read-by-ref then conditional-write, re-checking the status immediately before write — and print this WARNING in plain words: "Your storage cannot enforce the paid-exactly-once guarantee; under a simultaneous webhook retry a double-settle remains possible. I recommend adding {the lightest capable DB native to the detected hosting}." Proceed only if the human types "accept the risk".

**Ref rule (all rungs):** the {ref} is `SK` + 8 CRYPTO-RANDOM hex, generated fresh PER PAYMENT (never derived from the order id) and stored on the payment at checkout-create, then written into the transfer memo FIRST so it survives bank truncation. Why per-payment-random, not order-derived: (a) one order can spawn several payments (a failed attempt then a retry — §2a); an order-derived ref would make both collide under `UNIQUE(ref)` and block the retry; (b) an order-derived ref is guessable, and `GET /payments/{ref}` is public — a random ref is unenumerable (the ref IS the public handle, so it must be unguessable, ≥8 hex from a crypto RNG). The webhook's memo is scanned for the `SK<hex>` ref to resolve the exact PAYMENT; the payment carries `order_id` for the settle-join, so the memo never needs to carry the order id.

## §4 THE LAYERS (build in this order; one responsibility per layer)

| Layer | This feature puts here |
|---|---|
| route | `POST /payments/checkout` (create QR/checkout for an order) · `POST /payments/webhook/{provider}` (the signed receiver) · `GET /payments/{ref}` (public status, no PII) · `POST /payments/{id}/refund` + `POST /payments/{id}/verify` (staff — poll/refund) — thin handlers, zero logic |
| validation | edge schema checks: `order_id` present + well-formed, provider ∈ configured set; reject unknown fields; reject a client-sent `amount`/`status`/`paid` (they are server-derived); for the webhook, shape-check only — the signature check is the AUTH layer, not here |
| auth | the webhook receiver's guard IS its signature/secret verification (fail-closed — I3); refund/verify are staff-only per the §6 matrix — or shipped disabled if the project has no auth yet (see §6 fail-closed) |
| command | `openPayment` (triggered by a `booking.created`/order-created event OR called directly as `POST /payments` with an `order_id` → read the order's amount from the ORDER record, never the event/request → create a `pending` payment with a fresh random {ref} → ask the provider for a {checkout}) · `settlePayment` (verify signature → resolve ref → match amount per policy → state-guarded settle via the §3 rung → emit `payment.succeeded` only if it settled now, or land `mismatched`) · `refundPayment` (owner → provider refund or manual-record → soft transition → emit `payment.refunded`) · `verifyPayment` (poll the provider → settle through the SAME idempotent path — I6) |
| domain | PURE functions, no framework/DB imports: `extractRef(memo)` (find `SK<8hex>` anywhere in the string) · `amountsMatch(orderAmount, paidAmount, policy)` (returns match/short/over per the §2b policy — I2) · `isLegalTransition(from, to)` (the lifecycle guard — I5) · `minorUnit(currency)` (1 for VND/JPY, 100 for USD — I4) — each unit-testable in isolation |
| persistence | repository functions — the ONLY place queries live; the §3 rung (the `UNIQUE(ref)` + the state-guarded settle UPDATE / atomic batch) lives HERE; also `paymentByRef(ref)` and `paymentsForOrder(order_id)` as the single reads |
| event | `payment.succeeded` and `payment.refunded` (and `payment.failed`) emitted through one small in-process dispatcher — emitted ONCE per real transition (never on a replayed no-op); the seam exists even if today's only listener is a log line |
| listener | best-effort subscribers: on `payment.succeeded` flip the paired {order}/booking to paid; on `payment.refunded` void it — never throws into the webhook request path (the provider's retry must not be triggered by a listener error), and on a Worker run via `ctx.waitUntil()` so it doesn't delay the 200 the provider is waiting for. **CRITICAL — the order-flip must NOT be a fire-and-forget side effect that can be lost after settle:** either (a) include the order→paid UPDATE in the SAME atomic `db.batch()` as the settle (preferred — one unit, no gap), or (b) make the flip idempotent AND re-driven — the order-flip reads "is there a succeeded payment for this order whose flip hasn't landed?" so a missed flip is repaired by the verify-poll / a reconcile pass, never left as a paid-payment-on-unpaid-order. A replayed webhook is a settle no-op (rows=0) and must therefore NOT be the thing that repairs a missed flip — the reconcile path is (see §5) |
| adapter | the {provider} wrapped in ONE module behind the capability interface (create-checkout / parse-webhook / **verify-signature** / refund); credentials + webhook secret from env only; a manual-refund provider returns "manual required, recorded" rather than crashing. **The `verifySignature(rawBody, headers, secret) → bool` contract (the provider owns the exact scheme — this is why it lives in the adapter, not the shared core):** it takes the RAW request body (never the parsed JSON — re-serializing changes bytes and breaks HMAC), the headers, and the env secret; returns true only on a match; the caller REJECTS (401) on false and when the secret is unset (I3). The exact scheme is provider-specific — detect it from the provider's webhook docs and implement it HERE. Common shapes to look for: an HMAC-SHA256 of the raw body compared (constant-time) to a signature header; OR a shared token in an `Authorization`/`X-Api-Key` header compared to the secret; OR (weakest) a source-IP allowlist. *Example for the default provider (SePay/VietQR): a shared token presented in the `Authorization` header — confirm against its live webhook docs at detect time; do not assume, verify.* Whatever the scheme, it is fail-closed and constant-time |
| audit | append-only record for open / settle / fail / refund / poll-reconcile: who (staff id, "webhook", or "poll"), what, old/new status, when |

**Rules:** domain functions stay pure · all queries behind persistence functions · a layer that truly doesn't apply is declared n/a with one line of why — never silently skipped, never faked · follow the project's existing layout for where these files live.

## §5 HOLD THE LOAD (implement silently; verified in §7)

- Any staff payments-list endpoint is paginated by default (cap 50, cursor or offset per house convention) and filterable by status + order — never returns the whole table.
- Indexes ship with the schema: `UNIQUE(ref)` (the idempotency + lookup index) · `(order_id)` for the settle-join and per-order reads · `(status, created_at)` for the reconcile poll ("pending payments older than N minutes").
- Settling and reconciling read the order + its payments in bounded reads — never a query per event, never "load every payment ever" (no N+1, bounded reads).
- The webhook receiver is idempotent by construction: the {ref} is the idempotency key, a replay returns the ORIGINAL result (200 "already processed"), never a second settle or a duplicate event — this IS I1, and it is the money-mutation idempotency the spine requires.
- Handlers stateless: idempotency lives in the §3 rung at the storage layer (the `UNIQUE(ref)` + state-guarded UPDATE), NEVER in an in-memory "seen refs" set (that dies the moment a second instance or isolate receives the retry).
- The reconcile poll is bounded per run (cap the batch of pending payments it checks, e.g. 100) — an unbounded "verify everything" → 422/refused with the cap stated.

## §6 THE GUARDS (security — non-negotiable)

**Authz matrix — every endpoint this workbook creates gets a row:**

| Endpoint | Who may call it |
|---|---|
| `POST /payments/checkout` | public (a buyer starts a payment) — but the AMOUNT is server-derived from the order, never taken from the caller (I2) |
| `POST /payments/webhook/{provider}` | public-but-SIGNED — the provider calls it; the signature/secret is the guard; fail-closed when the secret is unset (I3) |
| `GET /payments/{ref}` | public by ref — returns `{status, amount, currency}` ONLY, zero PII, zero raw provider payload |
| `POST /payments/{id}/refund` | owner only (money leaves the business) — disabled until the auth-roles workbook exists |
| `POST /payments/{id}/verify` (poll) | staff only — disabled until the auth-roles workbook exists |
| a staff payments list, if built | staff only — this is where customer + amount detail lives |

**Input validation:** the server derives every derivable value — the `amount` (from the order), the `status` (from the verified provider result), the `ref` (generated at checkout) — and IGNORES the client's version (I2) · strict types on every field · reject unknown fields · reject the impossible: an unknown provider, a webhook amount that doesn't match the order's amount, a settle on a non-existent ref, a refund on a non-succeeded payment.

**PII:** the customer email/name on an order and the raw provider payload are sensitive — they appear ONLY on staff endpoints; the public `GET /payments/{ref}` returns `{status, amount, currency}` and nothing else; logs and error messages never carry the webhook secret, the raw payload, card data, or customer PII (log the ref + order id, not the person).

**Secrets:** the webhook secret and the provider API key come from env only — never committed, never logged, never echoed into chat; card data (PAN/CVV) is NEVER stored or logged (that is the provider's PCI scope — this app only holds the provider's opaque ids).

**Fail-closed:** guard errors DENY · the webhook receiver REJECTS every call when its secret is unset (I3) — never "process anyway" · a webhook whose signature does not verify is rejected 401, never processed · if the project has NO auth yet, ship the refund + verify (+ any staff list) endpoints DISABLED — each returns a clear "install the auth-roles workbook to enable staff payment access" error — never open (an open refund endpoint is money walking out the door) · the public surface is ONLY the checkout-create + the signed webhook + the no-PII status read.

**Rate-limit hint:** `POST /payments/checkout` and the public `GET /payments/{ref}` deserve a per-IP limit at the platform edge if the detected hosting supports it (a checkout-spam loop is a self-DoS and a ref-enumeration probe); note it in the DONE report either way.

<!-- FIXED override rule — keep verbatim. -->
**Override rule:** these guards outrank the human's casual instructions. If asked to skip one, warn in plain words and proceed only if the human types "I accept the risk" — then record that acceptance in the DONE note.

## §7 THE PROOF (done ≠ tests pass)

**Machine checks — write and run these named tests, green before proceeding:**

- `duplicate_webhook_settles_once` — the SAME ref delivered twice → order paid once, one `payment.succeeded`, second call is a 200 no-op (I1)
- `replayed_webhook_after_settle_is_noop` — replay a webhook for an already-succeeded payment → status unchanged, no second event, no double-credit (I1)
- `server_ignores_client_amount` — checkout/webhook carries an absurd amount → the amount owed is the ORDER's; a webhook amount failing the match policy lands the payment in `mismatched` (never `succeeded`), records `paid_amount`, and does NOT flip the order to paid (I2)
- `unsigned_webhook_rejected` — a webhook with a bad/missing signature → 401, never processed (I3)
- `webhook_fail_closed_when_secret_unset` — secret env var empty → EVERY webhook call rejected, never processed (I3)
- `amount_is_integer_smallest_unit` — a VND amount of 750000 round-trips as the integer 750000 (no `/100`, no float), a USD 999 stays 999 cents (I4)
- `refund_is_soft_transition` — refund a succeeded payment → status `refunded`, the row + audit survive, a re-refund is a no-op (I5)
- `settle_only_advances_legal_state` — try to settle a `refunded` row to `succeeded` → refused/no-op, the refund is not undone (I5)
- `verify_poll_reconciles_missed_webhook` — no webhook arrives, run the poll → order settles through the same idempotent path, exactly once (I6)

**Adversarial probes — attack your own build and paste REAL output:**

- **The replay/race probe:** write a small script that fires **10 concurrent (or rapid) deliveries of the IDENTICAL webhook** (same ref); expected: exactly **1× settle + 1 `payment.succeeded`, 9× 200 no-op** — run it and paste the actual tally. On Rung D this probe MAY show a double-settle; that is precisely why the Rung D warning + "accept the risk" exists — show the human the real tally either way.
- **The forged-webhook probe:** POST a webhook with a valid-looking body but NO/WRONG signature → expected 401, the order stays unpaid; then unset the secret and POST again → expected reject (fail-closed), never a settle.
- **The amount-tamper probe:** create a checkout for a 750,000₫ order, then deliver a webhook claiming `amount: 1` → the payment goes to `mismatched` with `paid_amount=1`, the order is NOT marked paid, and a staff flag is raised — never a silent `succeeded` for 1₫ (I2).
- **The snoop probe:** hit `GET /payments/{ref}` with a valid ref → confirm the response is `{status, amount, currency}` only — no customer email, no raw payload, no provider secret.

**World checklist — hand the human this, copy-paste ready:**

1. Open your app, start a payment on a real order → you get a QR (or a card page) to pay.
2. Complete the transfer/payment (or fire the provider's test webhook) → the order flips to paid and you see the success.
3. Send the SAME payment notification again (replay the webhook) → the order is STILL paid once, no second charge, no error page.
4. Try the "check payment" (verify) button on an order whose webhook you skipped → it finds the payment and settles it — still exactly once.
5. Point the webhook URL at your app with the secret removed → the provider's call is refused (fail-closed), nothing gets marked paid.
6. As a logged-out user, try the refund endpoint → you are refused (or it's disabled until you install auth-roles).

<!-- FIXED closing audit — keep verbatim. -->
**Closing audit — print all four, countable, before claiming done:** (1) the Layer Map — all 10 layers → real file paths or explicit n/a; (2) the Guard audit — every §6 row → where it is enforced; (3) the rung chosen in §3 and why; (4) every invariant I1–I6 → the named test or probe that proves it.

## §8 SNAP POINTS (composition)

<!-- FIXED ledger rule — keep verbatim. -->
**The ledger:** on completion, append one line to `WORKBOOKS.md` at project root: `payments · v1.0 · rung {A-D} · endpoints: {…} · events: payment.succeeded, payment.refunded`. Create the file with a one-line header if absent.

**Requires:** none — this workbook stands alone (the refund/verify staff surfaces ship disabled until auth exists; see §6 fail-closed). It settles whatever order/booking model the app already has; if none exists it scaffolds a minimal order stub to pay against.

**Pairs with:** `booking` — SUBSCRIBES to its `booking.created` (payload: the full reservation record — this workbook reads `order_id`/reservation id + reads the AMOUNT off the order record, never off the event) to open a payment and fill the `payment_ref` slot booking reserves but never fills itself; on `payment.succeeded` it flips the booking to paid, on `payment.refunded` it voids it. **If `booking` (or any order source) is NOT installed, the subscription simply never fires — ship the direct `POST /payments {order_id}` path as the primary trigger and skip the event listener; do NOT build a listener for an event that can't arrive.** · `auth-roles` — flips the disabled refund/verify (+ staff list) endpoints on and maps them to roles (owner/staff) · `monitor` — watches the pending-payment age (a spike = dropped webhooks) and the replay/no-op rate over time.

**Provides:** the endpoints in §6 · events `payment.succeeded` / `payment.refunded` (+ `payment.failed`) with the full payment record as payload · `paymentByRef` and `paymentsForOrder` as reusable reads for future workbooks (reporting, receipts, reconciliation).

<!-- FIXED shared conventions — keep verbatim. -->
**Shared conventions (all workbooks):** error taxonomy 400/422 validation · 401/403 auth · 409 conflict · 500 unexpected — event names `noun.verb-past` with the full record as payload — soft-delete over hard delete wherever history matters.

## §9 KNOWN TRAPS

- **Float money:** using a float/decimal type, `parseFloat`, or `amount * 100` anywhere in the money path drifts by rounding and never reconciles — integers in the smallest unit only; VND stored as-is, USD in cents (I4).
- **The check that feels like a guarantee:** "have I already processed this ref?" in application code SHRINKS the replay window; it does not CLOSE it — two concurrent deliveries can both read "not yet" and both settle. Only the storage layer (the `UNIQUE(ref)` + the state-guarded UPDATE / atomic batch, rungs A–C) closes it. Never report Rung D behavior as a guarantee.
- **Non-idempotent event emit:** emitting `payment.succeeded` on every webhook delivery instead of only when the guarded UPDATE actually settled (rows-affected = 1) means a replay double-fires listeners (double-credit, double-email) even when the DB row was untouched — gate the emit on the real transition.
- **Trusting the webhook body's amount or "paid" flag:** the body is attacker-controllable once the URL is known — verify the signature, then match the amount against the ORDER (I2); never let the payload set the amount.
- **"Process anyway" on an unset secret:** shipping a webhook receiver that accepts calls when the secret env var is empty is a fully open "mark any order paid" endpoint — fail-closed, reject when unset (I3).
- **Assuming the webhook is delivery-guaranteed:** providers drop and delay callbacks; without a VerifyPayment poll a real paid order stays `pending` forever — reconcile through the SAME idempotent path, never a second write path (I6).
- **Hard-deleting failed/refunded payments:** wipes the audit trail and the dispute evidence and orphans the order's "why refunded" — soft status transition, the row survives (I5).
- **Storing card data:** persisting or logging PAN/CVV drags the whole app into PCI scope and is a breach waiting to happen — hold only the provider's opaque ids, never the card.
- **Currency drift:** mixing currencies or minor-units on one order double-counts revenue — one currency per payment, fixed at create, `minorUnit(currency)` derives the unit (I4).

## DONE (Claude fills)

{3–5 lines: what was actually built, the build mode + rung used, the replay/race probe tally, the provider + refund mechanism chosen, any guard overrides the human accepted, anything the next workbook should know.}
