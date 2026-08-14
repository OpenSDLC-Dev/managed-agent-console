---
status: archived
issue: "#56"
---

# Console SSO and role-aware UI (plan 08)

The console half of
[platform plan 31](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/31_console-sso-rbac.md).
The platform had grown OIDC verification, a principal per request and three roles; this repo still
had one shared password in front of one management key, so **every operator was root and no action
had an author.** Four slices plus acceptance, PRs #92–#96 and #100. What shipped is
`src/app/api/auth/*`, `src/lib/identity*`, and the account block in the sidebar.

## Decisions — settled 2026-08-14

### D1 — Mode A, and it contradicts platform plan 31

Plan 31 assigns this repo **Mode B**, where the browser calls the platform's IAP-protected backend
directly, on the reasoning that a server-to-server BFF hop would make IAP re-authenticate the _BFF's_
workload identity and collapse every user onto one principal. That is correct for IAP-fronting-the-
platform, and it contradicts principle 2 ("every platform call goes through the console's own
server"), the console's SSE proxy, and CLAUDE.md's "simplicity first" — supporting both would mean
two request paths with different origins, cookie scopes and error handling.

**Mode A is taken**, and its cost is written down: the console BFF forwards the user's OIDC token, so
the platform must be reachable over a path that is not IAP-gated. On our GKE staging that cost is
already paid — IAP fronts the console and the console reaches the platform in-cluster — and plan 31's
objection does not apply, because nothing depends on an IAP assertion naming the human: **the token
names the human, end to end.** _This is the decision to revisit first if any of this is reopened._

Two constraints Mode A inherits from the platform's verifier, neither optional:

- **`IDENTITY_OIDC_AUDIENCE` is the console's own OAuth `client_id`.** In an authorization-code flow
  the ID token's `aud` _is_ the relying party's client id, and the console cannot generically ask an
  IdP for a different audience; setting the two differently produces tokens the platform rejects on
  every proxied request.
- **`IDENTITY_MODE` is single-valued** — a deployment runs `oidc` **or** `trusted_proxy`. The two
  modes are mutually exclusive per platform, not layerable.

Principle 5 forbade RBAC/SSO _"until the platform grows them"_; the platform grew them, so slice 2's
PR amended it. That amendment is independent of D1.

### D2 — a server-side session store, keyed by an opaque cookie

An ID token is 800–2000 bytes and can exceed 4 KB with group claims, against a ~4096-byte cookie
ceiling; the alternatives were per-token cookies, chunked cookies, or a sealed cookie. The store
removes the size ceiling, makes logout and refresh trivial, and keeps the ID token out of the browser
entirely. Its cost is real and stated rather than hidden: it is the console's **first stateful
component**, an in-memory map is enough only for the single replica we run, and **every deploy or pod
restart signs every operator out** — on a console redeployed on every merge to `main`.

### D3 — `CONSOLE_PASSWORD` survives as a distinct mode, never replaced

Plan 06 D2 already kept it for local development and the suites, and 10 `signIn()` helpers, the live
tier and the fidelity run all authenticate through it. Two gates means the matrix must be stated, not
left to emerge — an unspecified overlap is exactly where a password session silently reacquires root:

| `CONSOLE_PASSWORD` | identity configured | Console gate                                       | What the BFF sends                            |
| ------------------ | ------------------- | -------------------------------------------------- | --------------------------------------------- |
| set                | unset               | password cookie                                    | `x-api-key`                                   |
| unset              | set                 | SSO session                                        | `Authorization: Bearer`; **no session ⇒ 401** |
| set                | set                 | SSO only; password gate bypassed for `/api/auth/…` | `Bearer` only                                 |
| unset              | unset               | none                                               | `x-api-key`                                   |

The load-bearing row is the third: when identity is configured, a password-authenticated session
**never** reaches the platform — no fallback to `x-api-key`, no borrowing another session, just 401
and a prompt to sign in. A test pins each row, and the third row's negative is the one that matters.

### D4 — optimistic UI plus a 403 presented as a denial

The platform has **no `me`/whoami route**, and no role floor at which a role-less authenticated human
passes, so "authenticated, any role" is not currently expressible on it. The reference solves this
with the capability manifest recorded in
[plan 07](./07_console-issued-keys.md#the-capability-endpoint--how-the-reference-gates-ui). A
`me`-shaped route was filed as
[platform #403](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/403) as an explicit
prerequisite for anything that _hides_ a control, and slice 4 shipped without it: controls stay
visible and a refusal is rendered in the platform's own words. Hiding one accurately needs that
route.

## What the console does not decide

The platform owns the claim→role mapping and enforces per route. The console must **not** mirror that
config — a second copy of the authority rules is a drift bug waiting to happen, and principle 4 puts
semantics on the platform. The console knows only which IdP to send the browser to, and what the
platform told it.

## Three landmines found in the existing deployment

- **Removing `PLATFORM_API_KEY` from the pod would make it permanently NotReady** — the readiness
  probe hits `/api/health`, which 503s when the var is unset. The decision: the key **stays in the
  pod as a dedicated service credential for the deep health check only**, and becomes optional for
  the shallow depth. The deep check runs from CD via `kubectl exec` and has no user context, so it is
  the one console→platform call that can never borrow a user's token.
- **The session cookie would have been minted without `Secure`** — the predicate read
  `request.nextUrl.protocol`, and behind a TLS-terminating load balancer the pod sees `http:`.
  Harmless only while production minted no cookie; switched to `x-forwarded-proto`, with `SameSite`
  specified alongside it because the BFF became cookie-authenticated in production for the first time.
- **The `/api/auth/…` routes would have been born _inside_ the password gate**, so the IdP callback
  could never complete wherever `CONSOLE_PASSWORD` is set. Their exemption is a **prefix**, unlike
  the anchored route tokens: everything under it must be unauthenticated by construction.

## Feature detection cannot see identity — deliberately

`src/lib/platform/surfaces.ts` treats only 501, or 404 + `not_found_error`, as "surface absent"; a
403 `permission_error` leaves a surface shown-and-erroring. And the platform makes SSO-on
indistinguishable from SSO-off to an unauthenticated caller by design. So the console's **own config**
carries its mode and must not probe for it — a stated divergence from principle 3, recorded in
[docs/wire-divergences.md](../wire-divergences.md).
