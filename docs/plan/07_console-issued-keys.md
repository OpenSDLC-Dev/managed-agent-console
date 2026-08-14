---
status: archived
issue: "#56"
---

# Console-issued credentials: environment keys and API keys (plan 07)

The console could drive every resource the platform serves except the two that mint credentials:
standing up a self-hosted worker meant hand-editing `CONTROLPLANE_API_KEY` or running SQL. Five
slices, PRs #86–#98. Deliberately separate from [plan 08](./08_console-sso-rbac.md) and shippable
first — issuance works against the management key, and gains its role gate for free when identity is
switched on, because the platform already registers all three console routes at `RoleAdmin`.

Supersedes the earlier environment-keys-only draft (PR #84, 2026-08-10), whose decisions carry
forward unchanged. What shipped is `src/components/console/environment-key*`, `api-keys.tsx`, the
`/api/oauth` and `/api/console` BFF namespaces, and `test/e2e-live/keys.spec.ts`.

## Decisions

Settled with the maintainer 2026-08-10, and where a 2026-08-10 decision conflicts with the live
recording of the reference console, **the recording governs**:

1. **Scope is the keys section and the setup panel**, rendered only for `self_hosted` environments.
   The reference _does_ render work-queue stats on this page, so that is not a fidelity choice we get
   to make — but `GET /v1/environments/{id}/work/stats` is registered on the **environment-key lane**
   at `RoleNone`, which no human credential can reach, not even the management key. The console
   _cannot_ serve it rather than choosing not to. Recorded in design-reference.md as a divergence
   forced by the platform.
2. **Reference UX is copied faithfully** — copy text, dialog flow, columns — with our platform's
   realities substituted (`sk-map-env01-…`, worker commands pointing at our base URL).
3. **The platform lands first and this repo never ships ahead of it** (principle 1); the mock
   implements the contract immediately so console tests never wait on a live stack.

Settled 2026-08-14, on the recommendations as written:

4. **D1 — build both halves, slice the API-key half last** and let it block on the platform. The
   recording removed the platform's stated blocker, so the dependency became scheduling.
5. **D2 — API keys get a top-level nav item**, and design-reference.md's "no Billing/API keys/
   Workbench" line is amended rather than left half-true.
6. **D3 — mirror `expires_at` semantics per surface** rather than inventing symmetry the wire does
   not have: environment keys get no expiry control (the platform assigns), API keys get the
   reference's six options.

## What building it found (2026-08-14)

- **The wire value for `Never` is no longer unobserved**: it **omits** `expires_at`, and an explicit
  `null` is accepted for the same meaning. The console omits it, because that is what the reference
  sends. The other five choices resolve to an absolute instant client-side — the wire has no duration
  vocabulary at all.
- **`Last used` and `Cost` do not ship.** This platform serves neither, and no member lookup exists
  to turn `created_by: {id, type}` into a name. The console renders the actor id and drops the two
  columns rather than inventing either.
- **`Status` is added rather than dropped.** Our rows are `active`/`inactive`/`archived` plus a
  derived `expired`, and the console offers Disable/Enable/Archive against them; the reference's row
  menu holds a single `Delete API key` and needs no status column. A surface offering three outcomes
  has to say which one a row is in.

### The capability endpoint — how the reference gates UI

Recorded because it answers a question plan 08 would otherwise guess at:
`GET /api/bootstrap/{org_uuid}/current_user_access` returns `account_permissions:
[{permission, status: "available" | "blocked_by_role"}]` — 46 entries for an Admin, a vocabulary of
fine-grained permissions (`api:view`, `api:manage`, `environments:manage`, `scoped_api_keys:manage`,
…), not roles. The reference fetches it once at bootstrap and gates every control on it; **it never
probes with a 403 and never re-derives authority from a role name.**

Two consequences this repo carries:

1. **There is no `environment_keys:*` permission**, and which permission guards "Generate environment
   key" **was not observed** — the recording captured one _Admin's_ list, and permission names say
   nothing about which _roles_ hold them. This does **not** close platform plan 31's INFERRED
   divergence (31:657–660), and cuts against its reasoning: the stated ground for relaxing the gate
   to `developer` was that the reference's Developer can manage API keys, but env-key issuance rides
   `environments:manage`, a different permission. Closing it needs a recording taken as a Developer.
2. **`status` distinguishes `available` from `blocked_by_role`** — the reference tells a user _why_ a
   control is unavailable. Our platform's 403 names the required role and never the caller's, so we
   can render that distinction only if plan 08 gets a `me`-shaped route.

### The one-time secret

The platform returns the full key exactly once, on create. The issuing dialog is therefore the only
place it may ever appear, and the value must never enter a query key, a toast, a log, or a `data-*`
attribute. Plaintext is held in component state and cleared on close **with `mutation.reset()`**, so
it leaves the mutation cache too — a probe asserts it appears in the DOM exactly once and never in
the React Query cache. **Any second render path for the key is a defect.**
