---
workbook: auth-roles
version: "1.0"
kind: feature
risk: high
requires: []
pairs_with: [booking, crm, payments]
provides:
  - "identity resolution (who is calling) as middleware"
  - "roles + policies as DATA (create/list/assign, not hardcoded)"
  - "a single enforce() gate every protected endpoint passes through"
  - "member invite/assign-role/remove (staff management)"
  - "flips sibling workbooks' disabled staff endpoints ON"
  - "events: member.invited, member.role-changed, member.removed"
status: stable
---

<!-- This is a WORKBOOK — one recipe of the AI App Cookbook, in the Workbook System format (see FRAMEWORK.md). The human attaches this file to Claude Code and says "build this workbook." Everything below §1 is Claude's contract, not learner reading. This is also the course's FIRST DISTILL example (Tier-1 lesson 6): the learner authors it by reading the user-management + roles they ALREADY built by hand, and lifting it into this reusable file. -->

# Auth & Roles · Workbook

## §1 START HERE (for you, the human)

**What you get:** your app knows WHO is using it and WHAT each person is allowed to do — an owner sees everything, staff see their work, and nobody can reach a screen or button they shouldn't, even by typing the URL directly. Dropping this switches on the staff-only screens your other features shipped locked.

**What to say:** "Build this workbook: @auth-roles.workbook.md" — or just attach it and say "build this". (VN: "Xây workbook này.")

**What you'll see:** Claude first prints a short Stack Report (what it found in your project, whether it's building NEW or INTEGRATING into your existing login, the few decisions it needs you to confirm, and what it will build — ≤12 lines) and waits for your OK. Then it builds and tests itself — including calling a staff-only endpoint as a low-privilege user to prove it's refused. At the end it hands you a short checklist of things to click in your running app — when you've seen them all, it's done.

## §2 THE CONTRACT

**The job:** resolve WHO is calling ({identity}), decide WHAT they may do by matching the requested {action} against their {role}'s {policy}, and enforce that decision at ONE gate every protected endpoint passes through — deny by default, and never trust the client's claim about their own role.

**Vocabulary mapping** (adapt these words to the human's business — detect from their app/brief; ask only if truly ambiguous):

| Word in this workbook | Means in the human's app |
|---|---|
| {identity} | the resolved caller — a logged-in user, an API key, or "anonymous"; carries their id and their role |
| {role} | a named bundle of permissions the human can create (owner / staff / viewer / …) — data, NOT a hardcoded `if role == "admin"` |
| {policy} | the rules a role carries: a list of allow/deny statements over actions (e.g. allow `orders:*`, deny `auth:write`); deny always wins |
| {action} | the thing being attempted, as `{resource}:{read\|write}` (e.g. `contacts:read`, `reservations:write`) — derived from the route, never sent by the client |
| {member} | a person attached to an owner/org with a role — invite, change role, remove; this is the user-management surface |

**Invariants — each one is testable and each one maps to a check in §7:**

- **I1 (deny by default):** the enforce gate DENIES any request it cannot positively prove is allowed — an untagged endpoint, a missing identity, an unknown action, a role with no matching allow → all refused. Absence of a decision is a deny, never an allow.
- **I2 (server derives the action):** the {action} for a request is computed on the SERVER from the route + method (`GET /contacts` → `contacts:read`, `POST /contacts` → `contacts:write`); a client-sent action, role, or permission is ignored entirely.
- **I3 (deny overrides allow):** when a role's policy has both an allow and a deny that match an action, DENY wins — so "allow everything EXCEPT user management" is expressible and airtight (the classic operator role).
- **I4 (roles are data, one gate):** roles + policies are stored records the owner can create/edit/assign; authorization is decided in ONE place (the enforce gate) that every protected path calls — never scattered `if` checks in handlers that drift out of sync.
- **I5 (credentials are one-way):** passwords and API keys are stored only as hashes (never plaintext); a created key's plaintext is shown ONCE and never again; no credential is ever logged or echoed. **The hash must be a slow, salted KDF, NOT a bare digest** — a plain `SHA-256` is fast + unsalted and passes a naive "only hashes present" test while being brute-forceable; on the detected stack (Cloudflare Workers = WebCrypto, no native bcrypt/argon2) use **PBKDF2 via `crypto.subtle` with a high iteration count + a per-credential random salt** (or an argon2/scrypt WASM lib if added); an API-key (high-entropy random) may use a fast salted hash since it isn't guessable, but a PASSWORD must use the slow KDF.

**Out of scope (do not build, even if tempting):** the actual login UI / password-reset emails / OAuth provider dance (this workbook resolves an already-authenticated identity and authorizes it; wiring a specific IdP is a thin adapter the human points at) · per-row/field-level ABAC (a later `fine-grained-authz` workbook) · multi-tenant / multi-org isolation (this is a SINGLE-operator app — one set of roles, no tenant boundary) · session storage mechanics (use the project's existing session/JWT/cookie — this workbook reads it, doesn't reinvent it) · SSO/SAML.

**Slots the human MAY customize before attaching** (edit these lines, nothing else): the {role} names + their starting policies (default **owner** = all · **staff** = all except user-management · **viewer** = read-only) · whether new members default to **staff** or **viewer** (default staff) · the resource words in the action convention (they follow your existing route names automatically).

## §2a THE DOMAIN MODEL (the real entities + how they relate)

<!-- Grounded in SellKit's real IAM (internal/auth: types.go, policy.go, enforce.go, builtin.go). -->

**Entities** (the nouns authorization really has):

| Entity | Key fields | What it is |
|---|---|---|
| identity | subject_id, kind, role_id, label | the resolved caller — kind ∈ user / api_key / anonymous; carries the role; produced by middleware, never by the client |
| role | id, name, description, builtin | a named bundle of permissions the admin can create; `builtin` roles (owner/staff/viewer) ship seeded and cannot be deleted |
| policy | id, name, statements (JSON), builtin | a named set of statements a role references; separating policy from role lets one policy back many roles. On D1/SQLite (no array type) `statements` is a JSON column holding the statement array — not a child table (statements are always read as a whole set, never queried individually) |
| statement | effect, actions[], resources[] | one rule inside the policy's JSON: `effect` ∈ allow / deny · `actions` like `orders:*` / `contacts:read` / `*` (the exact-segment grammar, §3) · `resources` (`*` for now — the resources dimension is inert in v1.0, present for forward-compat; do not model per-resource scoping yet) |
| member | user_id, email, role_id, invited_by, status | a person in the app with a role; the user-management surface (invite / change-role / remove) |
| credential | subject_id, kind, hash, key_prefix, expires_at | a password hash or an API-key hash (NEVER plaintext); `key_prefix` (first chars) identifies a key without revealing it |

**Relationships:**

- identity references one role; an anonymous identity has no role and matches only public (un-tagged-as-protected) routes.
- role has-many policies (a role's effective permissions = the union of its policies' statements); the three builtin roles are seeded by a MIGRATION (an idempotent `INSERT … ON CONFLICT DO NOTHING`), NOT "on first run" — a Cloudflare Worker isolate is ephemeral and has no boot hook, so seeding lives in the D1 migration that creates the tables. **The exact seed statements (so they don't stay prose):** owner = `[{allow, ["*"]}]` (everything) · staff = `[{allow, ["*"]}, {deny, ["auth:write"]}]` (everything except changing users/roles; keeps `auth:read` so staff can LIST members) · viewer = `[{allow, ["*:read"]}]` (read anything, write nothing). These are concrete records the migration inserts; they use only the exact-segment grammar from §3.
- policy has-many statements; a statement is pure data (effect + actions + resources) evaluated by the gate.
- member references one role; changing a member's role re-points role_id — it does not rewrite policies.
- credential belongs-to a subject (a user or an api_key); one-way (hash only); a user may rotate credentials without changing identity.

**Lifecycle / state:**

- member.status: `invited → active` (accepts) · `active → removed` (soft — the row survives for audit, access revoked immediately). Role changes are logged (from_role → to_role → who → when). Removing the LAST owner is refused (an app with no admin is bricked — see §2c).
- role: builtin roles are immutable in name/builtin-flag but their policies are editable by the owner; a custom role can be created, edited, and deleted only when no member references it (deleting a role in use is refused, or reassigns to a default — a §2b decision).
- credential: created once (plaintext shown once for api-keys), rotated by replace, revoked by delete/expire; a revoked/expired credential fails identity resolution → anonymous → deny (I1).

## §2b DECISIONS & TRADE-OFFS (surfaced at the gate — never silently guessed)

| Decision | Options | When to pick which | Default |
|---|---|---|---|
| Permission model | fixed-roles / roles-as-data (RBAC) / policy-statements (IAM-style) | fixed-roles only for the tiniest app that will never add a role; roles-as-data for most (owner can add roles without a deploy); IAM-style statements when you need "allow all EXCEPT X" precisely (I3) | roles-as-data with allow/deny statements — matches I3/I4 |
| Default role for a new member | owner / staff / viewer | staff for teams that trust new hires with operational work; viewer for read-first orgs that grant write deliberately | staff (all except user-management) |
| Enforce placement | per-handler checks / one middleware gate / one store-level gate | one gate always — the only debate is middleware (at the route) vs store-level (at every query); store-level is strongest (nothing reaches data un-checked) but needs the caller-mode tag; middleware is simpler | one gate; store-level if the stack supports a context-threaded hook, else middleware (I4) |
| Un-tagged endpoint policy | allow (migration) / deny | allow ONLY as a temporary migration phase while you tag routes; the shipped default is deny (an untagged protected route is a hole) | deny — fail closed (I1) |
| Deleting a role in use | refuse / reassign-to-default | refuse (safest — forces an explicit choice); reassign only if you accept silently downgrading those members | refuse |
| Credential type | password-only / api-keys / both | password-only for human logins; api-keys when other systems/integrations call your API; both when you have both | match what the app already has — never add a login mechanism the app lacks |

Claude states each of these at the §3 gate with its default and asks the human to confirm or change — none is guessed silently. The enforce-placement and un-tagged-endpoint decisions are load-bearing (a wrong choice is an open door) and MUST be confirmed explicitly.

## §2c GOTCHAS / HOW IT GOES WRONG (this domain's classic mistakes)

- **Hardcoding `if role == "admin"` in handlers** → every new role means editing every handler, checks drift out of sync, and one missed handler is a breach. Roles are DATA and there is ONE gate; handlers never decide authorization themselves (I4).
- **Trusting a role/permission the client sent** → a caller sets `role: admin` in the body or a header and walks in. The server RESOLVES identity from the session/key and DERIVES the action from the route; nothing about permissions comes from the request body (I2).
- **Allow-by-default on an un-tagged route** → the one endpoint someone forgot to protect is wide open, and you find out when it's abused. Deny by default: an untagged protected route is refused, not allowed (I1).
- **Allow-only policies with no deny** → you can't express "an operator can do everything EXCEPT manage users" without listing every allowed action forever; the list rots as you add features. Support deny statements with deny-overrides so the exception is one line (I3).
- **Checking authentication but not authorization** → the code confirms someone is logged in and then serves any action, so a viewer reaches an owner-only endpoint. Being authenticated is not being authorized; the gate must evaluate the ACTION against the role, not just "is there an identity?" (I1/I3).
- **Storing or logging plaintext credentials** → one log leak or DB dump hands over every account. Hash on write, show an api-key's plaintext exactly once, never log a credential (I5).
- **Removing the last owner / locking yourself out** → an app with zero admins can't be administered and needs a DB surgery to recover. Refuse to remove or downgrade the last owner (§2a lifecycle).

## §3 DETECT (do this before touching any file)

<!-- FIXED boilerplate — identical in every workbook. -->

1. **Inspect:** manifest files (`package.json`, `go.mod`, `requirements.txt`, `Gemfile`, `composer.json`…), lockfiles, platform config (`wrangler.toml`, `next.config.*`, `Dockerfile`…), existing migrations/schema, the existing auth pattern, the test runner, the folder layout — and `WORKBOOKS.md` at project root if it exists (workbooks already installed). For Mode INTEGRATE, ALSO read any existing user/session/login/middleware and any endpoints OTHER workbooks shipped disabled (booking's staff endpoints, crm's whole surface) that this workbook must switch on.
2. **Decide the build mode:** **NEW** (no auth exists — scaffold identity resolution, roles/policies as data, the enforce gate, and seed builtin roles via migration) or **INTEGRATE** (a login already exists — read it, resolve identity FROM the existing session/JWT/cookie, and add the roles + enforce layer ON TOP without replacing the login). Print which mode and what it means. **INTEGRATE migration rule (avoid the self-lockout §2c warns about):** existing sessions predate roles and carry NO role_id — so the install migration MUST (a) create a `member` row for every existing user, (b) assign the FIRST/known-admin user the `owner` role and everyone else the confirmed default (staff/viewer), and (c) resolve identity as "the member row's role, defaulting to the confirmed default if somehow absent" — NEVER "no role → deny," which would instantly lock the owner out. Confirm the owner-user at the gate before running the backfill.
3. **Print the Stack Report** — one small table: language · runtime · framework · database · migration tool · existing auth mechanism · hosting · test runner · conventions observed · build mode (NEW / INTEGRATE). Name unknowns as unknown; never guess.
4. **Confirm the decisions** in §2b — state each with its default (permission model, default role, enforce placement, un-tagged policy, role-delete behavior, credential type) and ask the human to confirm or change. Enforce placement + un-tagged policy MUST be confirmed explicitly.
5. **Choose your rung** from the enforcement ladder below. The ladder is written against CAPABILITIES, never brand names — an unfamiliar stack still lands on a rung.
6. **Gate:** print the Stack Report (with build mode) + confirmed decisions + chosen rung + a plain-words build plan (≤12 lines total) and WAIT for the human's OK before writing any code.

**Iron rules:** extend, never replace (never introduce a second login mechanism; in INTEGRATE mode, resolve identity FROM the existing session and add roles on top) · match the house style (naming, folders, error shapes) · missing capability = propose the smallest honest addition native to the detected hosting, and wait.

**Adaptation ladder — where the authorization decision is ENFORCED (I1/I4). The rung decides how impossible it is for a request to reach data un-checked. Higher rungs make "forgot to guard this one" structurally impossible; lower rungs rely on discipline. On the default stack (Cloudflare Worker + Hono) you land on Rung B — Hono gives you route middleware but no store-level hook — so the single-middleware gate is the target.**

- **Rung A — the stack can thread a context through every data call (e.g. Go context, a request-scoped container):** enforce at the STORE level — every protected query passes through one `enforce(ctx, action)` hook, so an un-tagged HTTP caller is denied at the data layer even if a handler forgot the middleware. Nothing reaches data without a decision.
- **Rung B — DEFAULT for Cloudflare Worker + Hono: route middleware but no data-layer hook:** enforce in ONE Hono middleware that runs before every handler under a guarded sub-app: it derives the action (route+method → the §-action map), runs `evaluate(statements, action)`, and denies on no-allow. **The fail-closed mechanism (this is how "un-tagged = denied" actually holds on Hono — do NOT rely on "code review"):** structure the app as `publicApp` (an EXPLICIT allowlist of the few public routes — login, the signed webhooks) and `guardedApp` (everything else) mounted under the enforce middleware, then add a terminal `app.all('*', denyHandler)` catch-all LAST so any route not explicitly registered in either falls through to a 403. A route you forget to add is therefore DENIED by the catch-all, not silently served — fail-closed is structural, not a review checklist. Public routes are a short, reviewed allowlist; everything else is guarded or denied.
- **Rung C — serverless/edge with per-function handlers, no shared middleware chain:** a single `requireAction(request, action)` helper called as the FIRST line of every protected function; a lint/test asserts every protected function calls it (the check is the safety net a shared chain would give for free).
- **Rung D — no server-side enforcement point at all (static front-end calling a third-party API directly):** you cannot enforce authorization client-side — print this WARNING in plain words: "Authorization cannot be enforced in a client-only app; anyone can call the API directly with any role. You need a server/edge function between the client and the data. I recommend adding {the lightest server capability native to the detected hosting}." Proceed only if the human types "accept the risk".

**Action convention (all rungs):** the action is `{resource}:{op}`. `op` = `read` for GET / `write` for POST/PUT/PATCH/DELETE. `resource` = the route's primary noun UNLESS the route is in the special-case map below (checked FIRST). The client never supplies the action (I2).

**The special-case map (`resolveAction` checks this BEFORE the noun rule — here it is in full, don't infer it):** the user-management surface all collapses onto the single `auth` resource so one `deny auth:write` covers it — `POST/PATCH/DELETE /members` + `/roles` + `/policies` + `/api-keys` → `auth:write`; `GET /members` + `/roles` + `/policies` + `/api-keys` → `auth:read`; `PATCH /members/{id}/role` → `auth:write`. Every OTHER route falls through to the noun rule: `GET /contacts` → `contacts:read`, `POST /reservations` → `reservations:write`, `GET /contacts/{id}` → `contacts:read` (the id segment is ignored; the primary noun is the first path segment). A route matched by neither the map nor a registered handler is denied by the Rung-B catch-all.

**The `evaluate(statements, action)` algorithm (the core function — here is the exact spec, it is NOT just "deny wins"):**
1. Collect ALL statements from the union of the role's policies (builtin + custom) — order does NOT matter (step 3 makes it order-independent).
2. A statement MATCHES `action` if any of its `actions[]` patterns matches, where `matchesAction(pattern, action)` is: split both on `:` into `(res, op)`. The pattern matches iff (`pattern.res == "*"` OR `pattern.res == action.res`) AND (`pattern.op == "*"` OR `pattern.op == action.op`). So legal patterns are EXACTLY: `*` (normalize a bare `*` to `*:*`), `resource:*`, `*:op`, `resource:op`. **No prefix/substring wildcards** — `ord*` is illegal, `orders` must match the whole segment. This exact-segment rule is the whole grammar; a non-expert must not invent prefix matching.
3. Decision: if ANY matching statement has `effect:"deny"` → **DENY** (deny always wins, regardless of specificity — a broad deny beats a specific allow, unlike AWS-IAM's specificity nuance; we do NOT do specificity ordering). Else if ANY matching statement has `effect:"allow"` → ALLOW. Else (no statement matched) → **DENY** (I1 default-deny). Absence of a decision is a deny.

Edge cases a blind builder MUST get right (each is a test): `*:read` allows every read, no write · `orders:*` allows only the `orders` resource (not `orders-archive`) · allow `*` + deny `auth:write` → `auth:write` denied, `orders:write` allowed · empty statements → everything denied.

## §4 THE LAYERS (build in this order; one responsibility per layer)

| Layer | This feature puts here |
|---|---|
| route | `POST /members` (invite) · `GET /members` (list) · `PATCH /members/{id}/role` · `DELETE /members/{id}` (soft-remove) · `POST /roles` `GET /roles` `PATCH /roles/{id}` `DELETE /roles/{id}` · `POST /policies` `GET /policies` · `POST /api-keys` `GET /api-keys` `DELETE /api-keys/{id}` — thin handlers, zero decision logic |
| validation | edge schema checks: required fields, email format on invite, role name shape, statement `effect` ∈ allow/deny, action strings well-formed; reject unknown fields; reject a client-sent role/permission/action; NO authorization here (that's the gate) |
| auth | THE gate itself lives here conceptually: the middleware/hook that resolves identity, derives the action (I2), evaluates policy (deny-overrides, I3), and denies by default (I1) — every protected route passes through it |
| command | `inviteMember` · `changeMemberRole` (refuse last-owner downgrade) · `removeMember` (soft) · `createRole`/`editRole`/`deleteRole` (refuse if in use) · `createPolicy` · `createApiKey` (hash, return plaintext once) — each emits its event |
| domain | PURE functions, no framework/DB imports: `resolveAction(method, route)` (special-case map first, then the noun rule — §3) · `evaluate(statements, action)` (the exact 3-step algorithm in §3, deny-overrides, default-deny — I1/I3) · `matchesAction(pattern, action)` (the exact-segment grammar in §3 — `*`/`res:*`/`*:op`/`res:op` only, no prefix wildcards) · `canRemove(member)` (last-owner guard) — each unit-testable in isolation |
| persistence | repository functions — the ONLY place queries live; roles/policies/members/credentials stored here; the enforce hook (rung A) or the middleware's policy read (rung B/C) reads from here; credential writes hash before store (I5) |
| event | `member.invited`, `member.role-changed`, `member.removed` emitted through one small in-process dispatcher — the seam exists even if today's only listener is the audit log |
| listener | best-effort subscribers: on `member.invited` send the invite (via the project's existing email path if present) — never throws into the request path |
| adapter | identity resolution from the EXISTING session/JWT/cookie wrapped in ONE module (the only place that knows the app's login mechanism); a specific IdP/OAuth is pointed at here, not reinvented |
| audit | append-only record for invite / role-change / remove / role-edit / key-create-or-revoke: who, what, old/new role, when — every permission change is signed for |

**Rules:** domain functions stay pure · all queries behind persistence functions · a layer that truly doesn't apply is declared n/a with one line of why — never silently skipped, never faked · follow the project's existing layout for where these files live.

## §5 HOLD THE LOAD (implement silently; verified in §7)

- The members list and roles/policies list endpoints are paginated by default (cap 50, cursor or offset per house convention) — never return every member unbounded.
- Indexes ship with the schema: `UNIQUE(role_name)` and `UNIQUE(member_email)` · `UNIQUE(key_prefix)` on api-keys · an index backing the identity→role lookup the gate does on EVERY request.
- The gate's policy lookup is O(1)-ish per request: the caller's role+policies are resolved ONCE per request (cached on the identity/context), never re-queried per action check inside a handler (no N+1 on authorization).
- `POST /members` (invite) and `POST /api-keys` accept an idempotency key (an `Idempotency-Key` header); store it in a D1 table `idempotency_key(key PRIMARY KEY, response_ref, created_at)`, keyed by the header string, expiring after 24h; a replay returns the ORIGINAL result (same member/key), never a duplicate invite or a second key. (Lightweight here — these aren't money paths, but a double-clicked invite still shouldn't create two members.)
- Handlers stateless: authorization decisions come from stored roles/policies read per request, never an in-memory permission cache that goes stale across instances or misses a role change.
- The evaluate() function is bounded — a policy has a capped number of statements; an absurdly large policy → 422, not an unbounded scan on every request.

## §6 THE GUARDS (security — non-negotiable)

**Authz matrix — every endpoint this workbook creates gets a row:**

| Endpoint | Who may call it |
|---|---|
| `POST /members` (invite) | owner only (`auth:write`) |
| `GET /members` (list) | any role whose policy allows `auth:read` (staff + owner) — list, not modify |
| `PATCH /members/{id}/role` | owner only (`auth:write`) |
| `DELETE /members/{id}` | owner only (`auth:write`) — refuse last owner |
| `POST/PATCH/DELETE /roles` + `/policies` | owner only (`auth:write`) |
| `GET /roles` + `/policies` | any role allowing `auth:read` (staff + owner) |
| `POST /api-keys` | owner only (`auth:write`) |
| `GET /api-keys` (list, prefixes only) | owner only (`auth:read`) — never returns key material |
| `DELETE /api-keys/{id}` (revoke) | owner only (`auth:write`) |
| the enforce gate itself | runs on EVERY protected endpoint of THIS and every sibling workbook — that IS the product |

**Input validation:** the server derives every derivable value — the {identity} (from the session/key), the {action} (from route+method, I2) — and IGNORES the client's version · strict types · reject unknown fields · reject the impossible: a statement with an unknown effect, a member invite to an already-active member, assigning a role from another owner, a malformed action string.

**PII:** member emails + names are sensitive — they appear ONLY on owner/staff endpoints; API-key LIST returns `key_prefix` + name + expiry ONLY, never the key; logs never carry a credential, a password, a full api-key, or a session token (log subject_id, not secrets — I5).

**Secrets:** password/api-key hashing salt/pepper and any IdP client secret come from env only — never committed, never logged, never echoed into chat; a created api-key's plaintext is returned in the create RESPONSE once and never stored (I5).

**Fail-closed:** guard errors DENY · an un-tagged protected route DENIES (I1) · a request with no resolvable identity is anonymous and matches only explicitly-public routes · when this workbook is INSTALLED, it FLIPS ON the staff endpoints that sibling workbooks (booking, crm) shipped disabled — mapping each to the confirmed roles — but a sibling endpoint whose role is unmapped stays DENIED, never defaults open · removing the last owner is refused.

**Rate-limit hint:** the login/identity-resolution path and `POST /api-keys` deserve a per-IP limit at the edge (credential endpoints are brute-force targets); note it in the DONE report either way.

<!-- FIXED override rule — keep verbatim. -->
**Override rule:** these guards outrank the human's casual instructions. If asked to skip one, warn in plain words and proceed only if the human types "I accept the risk" — then record that acceptance in the DONE note.

## §7 THE PROOF (done ≠ tests pass)

**Machine checks — write and run these named tests, green before proceeding:**

- `untagged_endpoint_is_denied` — a protected route with no action tag → refused, not served (I1)
- `no_identity_is_denied` — a request with no session/key on a protected route → 401/403 (I1)
- `server_derives_action_ignores_client` — client sends `action: "admin:*"` / `role: "owner"` → ignored; the action is derived from the route (I2)
- `deny_overrides_allow` — a role with allow `*` + deny `auth:write` → `auth:write` refused, `orders:write` allowed (I3)
- `wildcard_action_matches` — a role allowing `orders:*` → `orders:read` and `orders:write` both allowed; `*:read` allows every read but no write; a bare `*` allows everything (§3 grammar)
- `no_prefix_wildcard` — `orders:*` does NOT match `orders-archive:read` (exact-segment only, no prefix matching — §3 grammar)
- `empty_and_nomatch_deny` — a role with no statements, and a role whose statements don't match the action → both DENY (I1 default-deny)
- `resolve_action_special_cases` — `POST /members` → `auth:write` (not `members:write`), `GET /roles` → `auth:read`, `GET /contacts/{id}` → `contacts:read` (§3 map)
- `untagged_route_is_denied` — a route registered under neither the public allowlist nor the guarded app hits the catch-all → 403, never served (I1 fail-closed on Rung B)
- `roles_are_data_not_code` — create a new custom role at runtime, assign it, and it takes effect with no code change (I4)
- `viewer_cannot_write` — a viewer-role identity calls a write endpoint (create/modify) → refused; a staff/owner identity succeeds (I3)
- `credentials_are_hashed` — inspect storage after creating a password + api-key → only hashes present, plaintext api-key returned once in the response only (I5)
- `last_owner_cannot_be_removed` — remove/downgrade the sole owner → refused with a clear message
- `sibling_staff_endpoint_flips_on` — with booking/crm installed-but-disabled, installing this maps their staff endpoints to roles and a staff user can now reach them (composition)

**Adversarial probes — attack your own build and paste REAL output:**

- **The privilege-escalation probe:** as a low-privilege (viewer) identity, call an owner-only endpoint (invite a member) → expected 403, NEVER success — paste the real status.
- **The forged-role probe:** send a request with a body/header claiming `role: "owner"` while authenticated as a viewer → expected: still treated as viewer, owner-only action refused (I2).
- **The un-tagged-hole probe:** add a new protected endpoint and DELIBERATELY forget to tag it → expected: the gate DENIES it (rung A/B) or the tagging test FAILS loudly (rung C), never silently serves it (I1).
- **The credential-leak probe:** create an api-key, then GET the api-keys list and check the logs → the response shows only the prefix, the logs show no key material (I5).

**World checklist — hand the human this, copy-paste ready:**

1. Invite a teammate as "staff" → they can sign in and do the day-to-day work.
2. As that staff member, try to open user-management / invite someone → you're politely refused.
3. As the owner, change their role to "viewer" → now they can look but not change things.
4. Open a staff-only screen (like your booking or CRM staff view) while logged out → you're refused.
5. Create an API key → you see the key ONCE; reopen the list → you only see its prefix, never the key again.
6. Try to remove the last owner (yourself, if you're the only one) → the app refuses so you can't lock yourself out.

<!-- FIXED closing audit — keep verbatim. -->
**Closing audit — print all four, countable, before claiming done:** (1) the Layer Map — all 10 layers → real file paths or explicit n/a; (2) the Guard audit — every §6 row → where it is enforced; (3) the rung chosen in §3 and why; (4) every invariant I1–I5 → the named test or probe that proves it.

## §8 SNAP POINTS (composition)

<!-- FIXED ledger rule — keep verbatim. -->
**The ledger:** on completion, append one line to `WORKBOOKS.md` at project root: `auth-roles · v1.0 · rung {A-D} · endpoints: {…} · events: member.invited, member.role-changed, member.removed`. Create the file with a one-line header if absent.

**Requires:** none — but it's the workbook OTHER workbooks require to switch on their staff surfaces; installing it is what turns their disabled endpoints on.

**The "flip disabled endpoints on" mechanism (the concrete contract — this is how "flip" actually works, not a hand-wave):** "shipped disabled" means a sibling workbook, built before auth existed, registered its staff route to return a fixed `403 {"error":"install auth-roles to enable"}` stub AND recorded a line in `WORKBOOKS.md` declaring `{workbook, route, method, required_action, default: disabled}`. When auth-roles installs, it (1) reads those declared rows from `WORKBOOKS.md`, (2) for each, confirms the `required_action` maps to a real role at the gate, (3) replaces the 403 stub by routing that endpoint through the enforce middleware under its `required_action`. A row whose action maps to NO role stays denied (never defaults open). So "flip on" = "move the route from the disabled-stub list into the guarded sub-app under its declared action." The `sibling_staff_endpoint_flips_on` test builds a tiny fake sibling that declares one disabled row, installs auth-roles, and asserts a staff identity can now reach it while an anonymous one still can't — testable in isolation with a fixture, no real sibling needed.

**Pairs with:** `booking` — its disabled staff list/reschedule/cancel rows (declared in `WORKBOOKS.md`) get mapped to owner/staff and flipped on · `crm` — the whole CRM is disabled-stubbed without auth; this reads its declared rows and switches them on · `payments` — refund/void rows become owner-only through this gate · every future workbook — each declares its endpoints' required actions in the ledger, and this workbook is the single place they're enforced.

**Provides:** the enforce gate every protected endpoint calls · roles + policies as data (create/assign at runtime) · identity resolution as middleware · the member-management endpoints · events `member.invited` / `member.role-changed` / `member.removed` with the full record as payload · the `{resource}:{op}` action convention every sibling workbook's routes plug into.

<!-- FIXED shared conventions — keep verbatim. -->
**Shared conventions (all workbooks):** error taxonomy 400/422 validation · 401/403 auth · 409 conflict · 500 unexpected — event names `noun.verb-past` with the full record as payload — soft-delete over hard delete wherever history matters.

## §9 KNOWN TRAPS

- **Scattered `if role ==` checks:** they drift, one gets missed, and the miss is a breach; there is ONE gate and roles are data (I4). If you find an authorization `if` inside a handler, it's a bug.
- **Client-supplied action/role/permission:** trusting any of these from the request is instant escalation; the server resolves identity and derives the action (I2). Never read a permission from the body or a header.
- **Allow-by-default / un-tagged routes:** the endpoint nobody remembered to protect is the one that leaks; deny by default, and make an un-tagged protected route fail (I1).
- **Allow-only policies:** without deny + deny-overrides you can't express "everything except X" and the allow-list rots; support deny statements (I3).
- **Authenticated ≠ authorized:** confirming someone is logged in and then serving any action is the classic hole; the gate must evaluate the ACTION against the role every time, not just check that an identity exists (I1/I3).
- **The stale permission cache:** caching a user's permissions in memory means a role change or a revoke doesn't take effect until restart (and differs per instance); resolve per request from stored data (§5).
- **Plaintext or logged credentials:** hashing on write but then logging the request body (with the password/key in it) leaks it anyway; scrub credentials from logs and never store plaintext (I5).
- **Self-lockout:** deleting or downgrading the last owner bricks administration; refuse it (§2a).
- **The confused deputy:** a background job running as "system" that executes a user's request without carrying the user's role can do more than the user could; system-mode is for trusted internal code only, and user-initiated work carries the user's identity + role (I1).

## DONE (Claude fills)

{3–5 lines: what was actually built, the build mode + rung used, which sibling workbooks' disabled endpoints this flipped on and to which roles, the privilege-escalation probe result, any guard overrides the human accepted, anything the next workbook should know.}
