---
status: draft
issue: "#56"
---

# Console SSO and role-aware UI (plan 08)

The console half of
[platform plan 31](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/31_console-sso-rbac.md).
The platform now verifies OIDC tokens itself, resolves each request to a
principal, and enforces one of three roles (`admin` / `developer` / `viewer`)
per route — slices 1–3 have landed. This repo owes the other end: **a browser
login against the deployment's identity provider, and a console that acts as
the signed-in human instead of wielding one god key on their behalf.**

Today `PLATFORM_API_KEY` sits in the console's pod and every browser action is
performed with full management authority (`src/app/api/platform/[...path]/route.ts:74`
sets `x-api-key` on every proxied call). Whoever gets past the console's
password gate is root on the platform. That is the thing this plan ends.

Plan 07 (credential issuance UI) is deliberately separate and ships first; it
needs none of this and gains its role gate for free when this lands.

## Decisions needed from the maintainer

The plan cannot leave `draft` until D1–D4 are settled. D1 in particular is a
conflict between two documents over the console's request topology, and must be
decided rather than inherited.

### D1 — Mode A or Mode B?

Platform plan 31 defines two identity modes and **assigns this repo Mode B's
shape**, 31:320–330 (verbatim):

> **the proxy fronts the control plane's own backend service** — the console
> reaches the platform through the same protected path … In this mode the
> console is **not** a proxying BFF for platform calls: the browser calls the
> platform's protected backend directly, so the assertion IAP mints names the
> human — a server-to-server BFF hop would make IAP re-authenticate the
> _BFF's_ workload identity and collapse every user onto one principal …
> **Console plan 08 carries this as its Mode B shape.**

That is the correct security reasoning for a GCP/IAP deployment, and it
contradicts three standing commitments in this repo:

- `CLAUDE.md:27`, principle 2 — headlined _"The management API key never
  reaches the browser"_, and stating the mechanism: _"Every platform call — SSE
  streams included — goes through the console's own server (route handlers
  acting as a thin proxy)."_ Mode B keeps the headline invariant (the browser
  holds an IAP session, never the management key) but discards the mechanism the
  principle names — so this is a conflict over topology, not a breach of the
  guarantee.
- `src/lib/platform/http.ts:1–5` — _"Everything goes to /api/platform/v1/… —
  **never** to the platform directly (CLAUDE.md principle 2)."_
- Plan 06 D3 — the platform API keeps its own public load balancer, ungated by
  console work.

**Recommendation: scope this plan to Mode A, and defer Mode B to its own
plan.** Reasons, in order of weight:

1. **Mode A costs this codebase almost nothing; Mode B rewrites its data
   layer.** Every page that calls the platform is a client component reaching
   `/api/platform/…` through relative URLs — 17 of the 18 `page.tsx` files are
   `"use client"`, and the exceptions call nothing platform-side
   (`(console)/page.tsx` only redirects, `login/page.tsx` calls `/api/login`).
   If the token lives in an httpOnly
   cookie the console's _server_ exchanges for an `Authorization: Bearer`
   header inside `route.ts`, then `src/lib/platform/*`,
   `src/lib/session-trace/*`, and every page stay **byte-identical**. Mode B
   makes the browser call a second origin, which breaks the relative-URL
   contract, the SSE reader (`use-session-trace.ts`), the connection probe
   (`connection-status.tsx`), and the skill-zip download — an
   `<a href="/api/platform/v1/skills/{id}/versions/{v}/content" download>`
   (`src/app/(console)/skills/[id]/page.tsx:77–84`, whose own comment reads
   _"Zip download streams through the BFF; dual-auth on the wire"_). A
   top-level navigation cannot carry an `Authorization` header, so Mode B
   needs either a cross-origin cookie, a signed-URL scheme, or a rewrite that
   fetches the zip in JS and hands the browser a blob — the last is possible
   but buffers a whole skill archive in memory to replace something that
   streams today. None of these exist; all of them are Mode B's bill.
2. **Mode A works on every deployment we actually run.** Local compose, a
   private cluster, and our GKE staging — which _is_ IAP-fronted
   (`deploy/k8s/edge.yaml:142–143`), but IAP there guards the **console**, not
   the control plane: `PLATFORM_BASE_URL` is the platform's in-cluster Service
   URL (`docs/deploy-gcp.md:34`). Mode B instead needs IAP in front of the
   _platform's_ backend service, which no deployment we run has.
3. Supporting both means maintaining two request paths with different origins,
   cookie scopes, and error handling, in a repo whose stated rule is
   "simplicity first; no speculative abstractions".

The cost of the recommendation is honest and should be written down: **Mode A
means the console BFF forwards the user's OIDC token to the platform, so the
platform must be reachable by the console over a path that is not IAP-gated** —
i.e. the platform accepts Bearer JWTs alongside `x-api-key`, exactly as plan
31's Mode A describes. On our GKE staging that cost is **already paid**: IAP
fronts the console and the console reaches the platform in-cluster. Plan 31's
Mode B objection does not apply, because in Mode A nothing depends on an IAP
assertion naming the human — the _token_ names the human, end to end.

Two constraints Mode A inherits from the platform's verifier, neither optional:

- **The ID token's `aud` must contain the platform's configured
  `IDENTITY_OIDC_AUDIENCE`**, and `azp` is checked when `aud` carries multiple
  values (`internal/identity/verifier.go:309–313`). The console must therefore
  request the _platform's_ audience, not merely its own client id.
- **`IDENTITY_MODE` is single-valued**: a deployment runs `oidc` **or**
  `trusted_proxy`. Mode A and Mode B are mutually exclusive per platform, not
  layerable — which is a further reason to pick one here rather than build both.

`CLAUDE.md:30`, principle 5, forbids RBAC/SSO outright _"until the platform
grows them"_. The platform has now grown them, so the PR that lands slice 2
amends principle 5 to record that — **independently of D1**. If D1 goes the
other way, this plan is additionally not an amendment of the below but a
different plan, and principle 2 (`CLAUDE.md:27`) has to be rewritten first.

### D2 — Where does the token live?

An OIDC ID token is 800–2000 bytes and can exceed 4 KB with group claims; a
refresh token adds more. Browsers cap a cookie at ~4096 bytes including
attributes. The console today has **one** cookie holding a 44-character
constant (`src/lib/auth.ts:9–24`: `btoa(HMAC-SHA256(CONSOLE_PASSWORD,
"managed-agent-console-session-v1"))` — a fixed message, so no subject, no
`iat`, no `exp`), and **no encryption helper, no `jose`, no `iron-session`, no
session store**.

Options: (i) separate cookies per token; (ii) chunked cookies with a
reassembler; (iii) an encrypted/sealed cookie; (iv) a server-side session store
keyed by an opaque cookie. **Recommended: (iv).** It removes the size ceiling
entirely, makes logout and refresh trivial (the cookie is a handle, not the
credential), and keeps the ID token out of the browser altogether. Its cost is
real and should be stated: it is the console's **first stateful component**. An
in-memory map is enough for the single-replica deployment we run
(`deploy/k8s/deployment.yaml`), and the plan should say plainly what that costs
rather than pretending an in-memory map is a design: scaling past one replica
needs a shared store, **and every deploy or pod restart signs every operator
out** — the console is redeployed on every merge to `main`.

### D3 — Does `CONSOLE_PASSWORD` survive?

**Recommended: yes, as a distinct mode alongside SSO, never replaced.** Plan 06
D2 already decided it stays for local development and the suites; 10
`signIn()` helpers across 8 of the 9 e2e specs, the live tier, and 29 fidelity
surfaces × 2 themes all authenticate through it. `sessionTokenFor`/`isValidSession` get
a sibling, not a rewrite.

### D4 — How does the UI learn the user's role?

The platform has **no `me`/whoami route** — verified: `NewHandler`
(`internal/api/server.go:51–212`) is the only route table, and nothing
serialises a role or principal to any client. Worse, there is no role floor at
which a role-less authenticated human passes: `requireRole`
(`internal/api/identitylane.go:110–122`) denies at every `min`, and
`rolematrix_test.go` _fails the build_ on any identity-reachable route
registered without a real role. So "authenticated, any role" is not currently
expressible on the platform.

The reference answers this with a capability manifest, recorded in
[plan 07's ground truth](./07_console-issued-keys.md#the-capability-endpoint--how-the-reference-gates-ui):
`GET /api/bootstrap/{org}/current_user_access` → `account_permissions:
[{permission, status: "available" | "blocked_by_role"}]`, fetched once at
bootstrap and used to gate every control. It never probes with a 403.

**Recommended: file a platform issue for a `me`-shaped route, as an explicit
prerequisite for anything that _hides_ a control — and ship optimistic UI + a
403 toast as the fallback so this plan is not blocked on it.** Whether that
route carries a role or, closer to the reference's dialect, a
`{permission, status}` manifest, is itself part of the ask; plan 07 records
that the reference deliberately does not make the client infer authority from a
role name.

The platform ask is small in code and awkward in structure — and smaller than
it first looks only in the role half. Of `{subject, email, display_name,
role}`, **only the role is on the request context** today: `identitylane.go:88–89`
stores an `identityPrincipal{ID, Role}` (`:18–21`) whose `ID` is the minted
`principal_…` id, not the subject; subject, email and display name live in the
`identity.Identity` the verifier returns
(`internal/identity/identity.go:144–150`) and are persisted to the `principals`
row by `upsertPrincipal` (`internal/api/principals.go:35–47`) — which by design
stores no role. So the handler must either widen `identityPrincipal` or re-read
the principals row and take the role from the context. Beyond that: a fourth
route adapter or sentinel role that runs on the identity lane without a role
floor, plus an amendment to the role-matrix completeness test. No migration, no
new claim handling.

## What the console does not decide

The platform owns the claim→role mapping (`IDENTITY_CLAIM_ROLES`,
`IDENTITY_ROLE_MAP`) and enforces per route. The console must **not** mirror
that config — a second copy of the authority rules is a drift bug waiting to
happen, and principle 4 puts semantics on the platform. The console knows only:
which IdP to send the browser to, and what the platform told it.

## Architecture (Mode A)

```
browser ──login──▶ console /api/auth/login ─302─▶ IdP (code + PKCE)
                                                   │
browser ◀──────────── 302 ?code=… ─────────────────┘
   │
   ▼
console /api/auth/callback ─ code+verifier ──▶ IdP token endpoint
   │                                            │
   │◀───────── id_token (+ refresh) ────────────┘
   │  store server-side; set opaque httpOnly session cookie
   ▼
browser ──/api/platform/v1/… (cookie)──▶ console BFF
                                            │ look up session,
                                            │ set Authorization: Bearer <id_token>
                                            ▼
                                         platform  (verifies, resolves principal,
                                                    enforces route role)
```

Request handling changes in **two** places in
`src/app/api/platform/[...path]/route.ts`. `route.ts:53` unconditionally
resolves `platformApiKey()`, which throws when the var is unset
(`src/lib/env.ts:14–18`) and 500s the request at `:54–66` before any header is
set — that becomes conditional on the mode; and `:74`'s
`headers.set("x-api-key", apiKey)` becomes `Authorization: Bearer <token>`
derived from the session. **In identity mode the proxy fails closed: no session
means 401, never a fallback to `x-api-key`.** The management key stays in the
pod for the deep health check, so a fallback would silently restore root for an
unauthenticated browser — this is the single most important assertion in slice
3's tests. Everything browser-side is untouched.

Three traps the BFF must respect, verified in platform source:

1. **Never send both.** A non-empty `x-api-key` wins irreversibly and the JWT
   is never read (`server.go:316–318`). The proxy's request allowlist already
   drops any browser-supplied `x-api-key` (`route.ts:10–19`) — that must stay.
2. **A non-JWT-shaped Bearer** on a management path falls through to
   `requireAPIKey` and 401s with the misleading `missing x-api-key header`
   (`identitylane.go:47–49`). Worth a console-side assertion so a malformed
   token produces a legible error.
3. **The Bearer works on `/api/` too.** `isConsolePath` routes to the same
   `dispatchManagementAuth` (`server.go:272–281`, `:426–428`), so plan 07's
   console routes authenticate identically. The work API and gate config are
   registered `RoleNone` and reject every human, admin included — the console
   never calls them.

### Three landmines in the existing deployment

- **Removing `PLATFORM_API_KEY` from the pod makes it permanently NotReady.**
  `src/app/api/health/route.ts:94–105` returns 503 with
  `missing: ["PLATFORM_API_KEY"]` when the var is unset, and
  `deploy/k8s/deployment.yaml:125–131` points the readinessProbe at
  `/api/health`. The rollout would fail in a way that reads as an infra fault.
  The health route's configuration contract must be sliced **before** the
  credential is touched. Its deep check also calls the platform with
  `x-api-key` and has **no user context** (it runs from CD via `kubectl exec`),
  so it needs either its own service credential or a different assertion — this
  is the one console→platform call that cannot borrow a user's token.
- **The session cookie would be minted without `Secure`.**
  `src/app/api/login/route.ts:31` sets `secure` from
  `request.nextUrl.protocol === "https:"`; behind a TLS-terminating load
  balancer the pod sees `http:`. Today this is harmless because production sets
  no `CONSOLE_PASSWORD` and no cookie is ever minted. The moment this plan
  mints one in production it is a live bug. Switch the predicate to
  `x-forwarded-proto` in the same slice, and specify `SameSite` **with** it:
  slice 3 makes the BFF cookie-authenticated in production for the first time
  (today's attributes are at `src/app/api/login/route.ts:28–34`), and a
  cookie-authenticated proxy that forwards `POST`/`DELETE` needs `SameSite=Lax`
  at minimum plus an origin check on mutations.
- **The `/api/auth/…` routes would be born _inside_ the password gate.**
  `src/proxy.ts:52–54` exempts only `login$|api/login$|api/health$` plus static
  assets, so whenever `CONSOLE_PASSWORD` is set — local dev, the gated e2e
  specs, the fidelity run — `/api/auth/login` and `/api/auth/callback` are
  redirected to `/login` (`proxy.ts:24–27`) and the IdP callback can never
  complete. The file's own comment (`proxy.ts:46–51`) warns about exactly this.
  The exemption is a **prefix** (`api/auth/`), unlike the three anchored route
  tokens: everything under it must be reachable unauthenticated by
  construction.

### Feature detection cannot see identity — and that is deliberate

`src/lib/platform/surfaces.ts:52–62` treats only 501, or 404 +
`not_found_error`, as "surface absent". A 403 `permission_error` leaves a
surface shown-and-erroring. And the platform makes SSO-on indistinguishable
from SSO-off to an unauthenticated caller by design (`server.go:324–327`). So
the console's **own config** carries its mode; it must not probe for it. That
is a stated divergence from principle 3 and belongs in
`docs/wire-divergences.md`.

## Slices

1. **Configuration and the health contract.** `IDENTITY_*`-shaped console
   config (issuer, client id, redirect, scopes, mode); make
   `PLATFORM_API_KEY` optional in the shallow health depth and give the deep
   check its own credential story; move `secure` to `x-forwarded-proto`.
   Nothing user-visible; unblocks everything after it.
2. **The OIDC relying party.** Route handlers under **`/api/auth/…`** —
   `login`, `callback`, `logout`. The namespace is reserved by plan 07, whose
   console-API passthrough owns `/api/oauth/…`; these must never collide.
   Authorization code + **PKCE (S256)**, `state` and `nonce` verified,
   the session store and its opaque cookie, token refresh, and the first new
   runtime dependency since plan 01 (`jose` or equivalent — the repo has no
   JWT tooling at all today). Widens `src/proxy.ts`'s matcher to exempt
   `/api/auth/…` (see the landmine above) and adds its module to `SEAMS` in
   `scripts/check-probes.mjs` so these probes are ratcheted rather than merely
   written. Adversarial probes: `state` mismatch rejected,
   `nonce` replay rejected, no token in any log or client bundle. Behind a
   config flag; the password gate stays default.
3. **The BFF forwards the user.** `x-api-key` → `Authorization: Bearer` from
   the session; 401 from the platform clears the session and bounces to login;
   the mock platform server learns a Bearer lane (it is `x-api-key`-only and
   401s before routing today). `x-api-key` mode still works unchanged.
4. **Role-aware UI.** Optimistic rendering plus a 403 toast that quotes the
   platform's own message (which names the _required_ role, never the
   caller's — `errors.go`, `identitylane.go:118–121`). Gains the
   capability-manifest path if and when the platform ships the `me` route
   (D4); ships without it either way.
5. **Acceptance + archive.** Blocked on platform slice 4 (deployment wiring —
   verified unlanded: `IDENTITY_*` appears in no compose, Helm, or GCP target).
   Against the bundled Casdoor: a viewer token 403s a mutation and the UI says
   so; an admin token issues an environment key through plan 07's surface.

## Ordering and external dependencies

- Plan 07 first — independent, and its surfaces are what slice 4 gates.
- Slices 1–4 need nothing from the platform beyond what has already merged
  (slices 1–3 of platform plan 31).
- Slice 5 needs platform slice 4. Do not schedule it earlier.
- The D4 platform issue (`me` route) is a prerequisite only for _hiding_
  controls, never for shipping.

## Verification

- Per slice: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:e2e`, `pnpm probes:check`; new fidelity surfaces added in the same
  PR that renders them.
- Slices 2 and 3 are security-sensitive and get the full dual review
  regardless of diff shape.
- The `x-api-key` path must stay byte-identical while identity is disabled —
  that is the console's own analogue of the platform's wire-compat rung, and it
  is what lets this land without a flag day.
