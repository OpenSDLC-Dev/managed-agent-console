---
status: draft
issue: "#56"
---

# Console-issued credentials: environment keys and API keys (plan 07)

The console can drive every resource the platform serves except the two that
mint credentials. Environment keys have had a platform surface since
[platform plan 30](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/30_environment-keys-console-issuance.md)
landed (2026-08-11) and nothing in this repo consumes it: an operator standing
up a self-hosted worker still hand-edits `CONTROLPLANE_API_KEY` or runs SQL.
This plan builds the two issuance surfaces the reference console has, against
the dialect recorded below.

It is deliberately **separate from [plan 08](./08_console-sso-rbac.md)** (SSO
and RBAC). Platform plan 30 names this repo's half "console plan 07"
(30:28–30) and platform plan 31 names the SSO half "console plan 08" (31:25);
keeping the numbering honours both cross-repo references. The two are also
independently shippable, and 07's shippable slices come first: issuance works
today against the management key. Their blocked tail slices interleave — 07's
API-key slice waits on platform 31 slice 5, 08's acceptance slice on platform
31 slice 4 — so the numbering is a naming convention, not a strict completion
order. Issuance gains its role gate for free when plan 08
lands — the platform already registers all three console routes at
`identity.RoleAdmin` (`internal/api/server.go:130–132`), so a viewer's browser
gets a 403 from the platform the moment identity is switched on, with no
console change.

This plan **supersedes and absorbs** the earlier draft of plan 07
(`docs/plan/07_environment-keys.md`, PR #84, drafted 2026-08-10). Everything
that draft settled is carried below unchanged — including its decisions taken
with the maintainer on 2026-08-10, its verbatim reference copy, and its
architecture. What this file adds is the API-key half, the 2026-08-14
recording, and four further seams. PR #84 closes as superseded, not rejected.

## Decisions already settled with the maintainer (2026-08-10)

Binding; carried from the superseded draft. Not reopened here.

**Precedence, settled 2026-08-14:** where a 2026-08-10 decision conflicts with
the live recording of the reference console, **the recording governs**. One
decision below is qualified by that rule; the rest are unaffected, and the
recording corroborates them.

1. **Scope is the keys section and the setup panel**, both rendered only for
   `self_hosted` environments, matching the reference. The reference page's
   work-queue Overview stats were put out of scope here — and the 2026-08-14
   recording shows **the reference does render them** on this page (Queued /
   Processing / Idle workers / Oldest item, "Updates every few seconds"), so
   under the precedence rule this is not a fidelity choice we get to make. It
   stays out of scope for a different and verifiable reason: the stats route
   `GET /v1/environments/{id}/work/stats` is registered on the **environment-key
   lane** at `identity.RoleNone` (`internal/api/server.go:182`), which no human
   credential can reach — not the management key, not an admin token. So the
   console _cannot_ serve it, rather than choosing not to. Record it in
   `docs/design-reference.md` as a divergence forced by the platform, and
   revisit the moment the platform exposes stats on a management-reachable
   route.
2. **Reference UX is copied faithfully** — copy text, dialog flow, columns —
   with our platform's realities substituted: key prefix `sk-map-env01-…`, and
   worker commands pointing at our platform via
   `--base-url`/`ANTHROPIC_BASE_URL` (which the `ant` worker subcommands
   honour).
3. **Sequencing**: the platform lands first and this repo never ships ahead of
   it (principle 1); the mock platform implements the contract immediately so
   console tests never wait on a live stack.

## Decisions still needed from the maintainer

Recorded here unanswered; the plan cannot leave `draft` until they are settled.
All three concern the **API-key** half, which the 2026-08-10 draft predated.

1. **D1 — Does the API-key surface ship in this plan or wait?** The
   environment-key half is buildable today. The API-key half needs platform
   plan 31 slice 5, which is _itself_ gated on the reference recording this
   plan now supplies (31:609–616). Recommended: **build both, slice the
   API-key half last, and let it block on the platform** — the recording
   removes the platform's stated blocker, so the dependency is now a
   scheduling question rather than an unknown.
2. **D2 — Does the API-key page get its own nav section?** The recording
   captured the reference's URL (`/settings/workspaces/{workspace}/keys`) but
   not its nav placement; ours has no Settings area at all.
   Recommended: **a top-level `API keys` item**, and
   amend `docs/design-reference.md:48` which currently records "no
   Billing/API keys/Workbench" as a deliberate divergence — that line becomes
   half true and must not be left stale.
3. **D3 — Do we mirror `expires_at` semantics exactly, including "Never"?**
   The reference offers 3 hours / 1 day / 7 days / 30 days / Custom / Never,
   with Never styled as a danger action. Our platform's environment keys take
   no expiry from the caller at all. Recommended: **mirror the reference per
   surface** — env keys get no expiry control (the platform assigns), API keys
   get the six options — rather than inventing symmetry the wire does not have.

## Ground truth — the reference dialect, recorded 2026-08-14

Observed in Chrome against `platform.claude.com` signed in as an org **Admin**,
with DevTools-level request capture. This is the recording platform plan 31
slice 5 declares itself gated on (31:609–616); it re-confirms the 2026-08-10
observation that platform plan 30 mirrored (`internal/api/consoleapi.go:39–48`)
and extends it with the request bodies and the API-key surface.

**Method note — nothing was created.** The two `POST`s below were captured by
installing a recorder that intercepts `fetch`/`XHR`/`sendBeacon`, records the
request, and returns a synthetic `599` **without sending it**. Both dialogs
were driven to submit; both requests were captured and refused. The account's
key and token lists were re-read afterwards and were unchanged (1 API key, 2
environment tokens). Read-only `GET`s were issued directly. No credential on
the maintainer's account was minted, revoked, or altered.

### Environment keys — `/api/oauth/…` (already mirrored by the platform)

Surface: a section on the **environment detail page**, not a page of its own.
Heading "Environment keys"; body copy _"An environment key lets a runner on
your infrastructure connect to this environment and pull jobs. Generate one per
host so you can revoke access individually."_ Table columns **Name · ID ·
Created · Expires** plus a per-row trash icon. One button, secondary with a key
glyph: **"Generate environment key"**. Alongside it a dismissible
"Set up your self-hosted environment" panel of four steps: register a key →
export `ANTHROPIC_ENVIRONMENT_KEY='sk-ant-oat01-…'` → install the `ant` CLI from
GitHub releases → `ant beta:worker poll --environment-id "env_…" --workdir
"/workspace"`. (The 2026-08-14 pass saw the first three above the fold and the
CLI download command; the fourth step is carried from the fuller 2026-08-10
capture, which the precedence rule does not displace — a partial view does not
overrule a complete one.)

Full dialog copy, from the 2026-08-10 capture and re-confirmed 2026-08-14 —
this is what "copied faithfully" (settled decision 2) means concretely:

- Empty state: _"No environment keys yet."_
- Generate dialog **"Create environment key"** — _"Give your environment key a
  name to help identify it later."_, one text input (placeholder _"e.g.,
  Production Server"_), Cancel / Create environment key.
- Success dialog **"Save your environment key"** — _"Keep a record of the key
  below. You won't be able to view it again."_, the full key in a mono block,
  _"Copy environment key"_, Close.
- Revoke confirm **"Revoke environment key"** — _"Are you sure you want to
  revoke this environment key? Workers using this key will no longer be able to
  connect. This action cannot be undone."_ (Cancel / destructive Revoke).
  Revoked keys vanish from the list.

```
GET  /api/oauth/organizations/{org_uuid}/environments/{env_id}/tokens   → 200
{ "data": [ { "id": string, "name": string,
              "created_at": string, "expires_at": string } ],
  "pagination": { "total": number, "limit": number,
                  "offset": number, "has_more": boolean } }

POST /api/oauth/organizations/{org_uuid}/environments/{env_id}/tokens   (captured, blocked)
content-type: application/json
{ "name": "protocol-probe-do-not-keep" }
→ 200 { "access_token": "sk-map-env01-…", "expires_in": 31536000 }

POST /api/oauth/organizations/{org}/environments/{env}/tokens/{token_id}/revoke → 204
```

Facts worth naming:

- **The create body is `{name}` and nothing else** — no expiry, no scope. The
  listing showed `Created Aug 10, 2026 / Expires Aug 10, 2027`, so the server
  assigns a one-year lifetime. Our platform already behaves this way; D3 below
  is settled for this surface by the recording.
- **The create response is RFC 6749-shaped and carries no row metadata** —
  `{access_token, expires_in}`, verified in our platform's landed code at
  `internal/api/consoleapi.go:75–79` (the reference also returns
  `authorization_details`, which plan 30 deliberately does not emit). The
  plaintext appears here and never again. **Consequently the console cannot
  render the new row from the create response: it must invalidate and re-GET
  the list**, which is the reference's own sequence.
- The `ID` column renders a **truncated tail** (`…1c7c3f1`), never the secret.
- The reference's environment-key prefix is `sk-ant-oat01-`; ours is
  `sk-map-env01-`. Already a recorded wire divergence — not new here.
- The path carries `organizations/{org_uuid}` even though nothing in the
  reference's own management API takes an org in a path. Our platform pins the
  segment to the literal `default` (`consoleapi.go:52–53`), which is the
  correct read: the segment exists because the reference's does.

### API keys — `/api/console/…` (new observation; platform slice 5's input)

Surface: an **"API keys"** page at `/settings/workspaces/{workspace}/keys`.
_(Nav placement was not captured in this recording; D2 must not treat it as
recorded.)_ Heading "API keys" with a count
badge; subtitle _"API keys are owned by workspaces and remain active even after
the creator is removed"_. Table columns **Key · Created by · Created · Expires
· Last used · Cost**. The Key cell is two lines: the name, then the
`partial_key_hint` in a mono face. **Created by** renders a human — display
name over email — not a key id. Row menu holds exactly one item, destructive:
**"Delete API key"**, behind an in-app confirm (_"Are you sure you want to
delete {name}? This action can't be undone."_, Cancel / red Delete).

Create dialog **"Create API key"**: a read-only **Workspace** row, a **Name**
field (placeholder `my-secret-key`), an **Expires** select
(3 hours · 1 day · 7 days · 30 days · Custom · **Never**, the last styled as a
danger option), and a primary **Add** button disabled until valid.

```
GET  /api/console/organizations/{org_uuid}/workspaces/{workspace_id}/api_keys  → 200
[ { "id": "apikey_…",  "type": "api_key",
    "name": string,    "workspace_id": string | null,
    "created_at": string,
    "created_by": { "id": string, "type": "user" },
    "partial_key_hint": string,        // e.g. sk-ant-api03--GK…sAAA
    "status": "active" | "expired" | "archived",
    "expires_at": string | null,
    "principal": null,
    "can_manage": boolean } ]

POST /api/console/organizations/{org_uuid}/workspaces/{workspace_id}/api_keys  (captured, blocked)
content-type: application/json
{ "name": "protocol-probe-do-not-keep",
  "expires_at": "2026-09-12T22:02:56.996Z" }

GET  /api/console/organizations/{org_uuid}/workspaces/{workspace_id}/api_keys/policy → 200
{ "max_api_key_age_hours": null,
  "workspace_max_api_keys": null,
  "organization_max_api_keys": null }
```

**Three gaps in this capture that slice 4 must close before it builds.** Named
here so they are not mistaken for settled contract:

- **The rendered table asks for fields the response does not carry.** The page
  shows `Created by` as a display name over an email, plus `Last used` and
  `Cost`; the response carries only `created_by: {id, type}`, and no
  `last_used` or `cost` at all. So there is an enrichment step — a member
  lookup and a usage/cost source — that was **not captured**. Either the
  platform's surface supplies these, or a batch lookup is defined, or those
  columns do not ship. Decide before building, not during.
- **The wire value for `Never` is unobserved.** The capture selected "30 days".
  Whether `Never` sends `expires_at: null`, omits the field, or uses another
  sentinel is unknown; the response type permits `null`, which is suggestive
  and not evidence.
- **Workspace scope**, below.

Facts that decide our shape:

- **The client sends an absolute RFC 3339 `expires_at`**, computed in the
  browser from the relative choice — the wire has no "30 days" concept. A
  console mirroring this owns the clock, which is a testable seam.
- **`created_by` is a person, `principal` is a separate (null) field.** The
  reference already models what our platform's `principals` table introduces:
  key ownership is audit metadata about a _human_. Platform plan 31 defers
  `api_keys.principal_id` to slice 5's own migration (31:392–397); this
  recording says the column the reference exposes is `created_by`
  `{id, type}`, with `principal` reserved beside it.
- **`can_manage` is per-row.** The reference tells the client, per key, whether
  it may act — it does not make the client infer authority from a role. See
  plan 08's role-aware-UI section; this is the same design answer at row scope.
- **Workspace scope is UNKNOWN and must not be guessed.** The request named
  `workspaces/default` and returned 12 keys whose `workspace_id` was all
  `null`. One request against one workspace cannot establish that the segment
  does not scope the response — those rows may equally be legacy or
  organization-level keys that are deliberately visible in the default
  workspace. Getting this wrong in either direction is a **cross-workspace key
  exposure**, so slice 4 does not start until the scope is settled by comparing
  a second workspace or by reading the platform's own implementation. Whichever
  it turns out to be, the plan must then state which rows and which destructive
  actions the page shows.
- **`status` is a tri-state including `archived`.** A directly-issued `GET`
  returned 12 rows while the page showed one live row; because that `GET` was
  issued by the recorder rather than captured from the page's own traffic (see
  the method note), this establishes only that the endpoint returns rows the
  page does not show — **not** where the filtering happens, nor which rows were
  hidden. Our platform's env-key listing filters server-side and on a different
  axis (revoked omitted, expired retained —
  `internal/api/envkeys.go:102–106`), which we keep either way. Settling where
  the reference filters needs the page's own request list.
- **A `policy` endpoint exists** carrying key-age and count caps, all null on
  this plan tier. We have no equivalent and need none; noted so a future
  reader does not mistake its absence for an oversight.

### The capability endpoint — how the reference gates UI

Recorded because it answers a question plan 08 must otherwise guess at.

```
GET /api/bootstrap/{org_uuid}/current_user_access → 200
{ "features": …, "account_features": …,
  "account_permissions": [ { "permission": "api:manage",
                             "status": "available" | "blocked_by_role" }, … ] }
```

46 entries for an Admin. The vocabulary is fine-grained permissions, not roles:
`api:view`, `api:manage`, `environments:manage`, `workspaces:view`,
`workspaces:manage`, `members:manage`, `scoped_api_keys:manage`, … The console
fetches this once at bootstrap and gates every control on it. **It never probes
with a 403 and it never re-derives authority from a role name.**

Two consequences this repo must carry:

1. **There is no `environment_keys:*` permission in the list** — the nearest
   entries are `environments:manage` and `api:manage`, which are distinct from
   each other. **Which permission actually guards the "Generate environment
   key" button was not observed**, and cannot be read off an Admin's list of
   available permissions: the control might be checked against
   `environments:manage`, against something else, or only server-side. Treat
   the association as INFERRED until the control is captured under a
   non-Admin account. With that caveat, it bears on platform plan 31's one
   INFERRED divergence (31:657–660), which reads: _"which reference console
   roles gate 'Generate environment key' is undocumented; `admin`-only here is
   a local judgment (the reference's Developer role *can* manage API keys, so a
   future recording may justify relaxing the env-key gate to `developer`)."_

   **This recording does not close that question**, and should not be cited as
   if it had: it captured one **Admin's** permission list, and distinct
   permission _names_ say nothing about which _roles_ hold them — a Developer's
   list was never observed. What it does establish cuts against the note's own
   reasoning: the stated ground for relaxing was "the reference's Developer role
   can manage API keys", but env-key issuance rides `environments:manage`, a
   _different_ permission from `api:manage`, so that inference no longer
   carries. Closing the note needs a recording taken as a Developer. Flagged
   here so the platform's INFERRED entry is **corrected** rather than treated as
   discharged.

2. `status` distinguishes **`available`** from **`blocked_by_role`** — the
   reference tells a user _why_ a control is unavailable. Our platform's 403
   names the required role and never the caller's (`internal/api/errors.go`,
   `identitylane.go:118–121`), so we can render the same distinction only if
   plan 08 gets a `me`-shaped route. Tracked there, not here.

## Architecture

### Where the UI lives

- **Environment keys**: a section on
  `src/app/(console)/environments/[id]/page.tsx`, mirroring the reference's
  placement. Not a route of its own — the key belongs to the environment and
  the reference makes that structural.
- **API keys**: a new top-level page, `src/app/(console)/api-keys/page.tsx`,
  pending D2.

Both are `"use client"` pages using `useQuery`/`useMutation` from
`src/lib/platform/queries.ts`, exactly like every other page in the repo
(verified: 17 of the 18 `page.tsx` files are client components — the 18th,
`src/app/(console)/page.tsx`, is a server component that only `redirect`s to
`/agents` — and the repo has no server-side data path: no `next/headers`,
`cookies()`, `revalidate`, `generateStaticParams`, or `unstable_cache` anywhere
in `src/`).

### Seven seams in the existing code that must move first

These are the whole reason this plan has a slice 1 that renders nothing.

1. **The BFF path gate is `/v1`-only, and the fix is a second route, not a
   wider gate.** `src/app/api/platform/[...path]/route.ts:34–47` 404s anything
   whose first segment is not `v1`, without contacting the platform. Rather
   than teach that gate a second prefix, add a **dedicated passthrough**
   `src/app/api/oauth/[...path]/route.ts` reusing the proxy internals
   (server-side `x-api-key` injection, header allowlists, streaming), so the
   console's own URL is the reference console's URL verbatim:
   `<console>/api/oauth/organizations/default/environments/{id}/tokens`. The
   existing `/api/platform/[...path]` proxy and its `v1` guard stay untouched —
   each route keeps one narrow, auditable contract instead of one gate growing
   exceptions. A test pins that an inbound `x-api-key` still never forwards.
   **Console OIDC (plan 08) mounts its route handlers under `/api/auth/…`,
   never `/api/oauth/…`, which this passthrough owns.**
2. **`platformPost` and `platformDelete` throw on a 204.**
   `src/lib/platform/http.ts:65–78` and `:97–106` unconditionally
   `await response.json()` on success. The revoke route answers a bodiless
   **204** (`internal/api/server.go:132` registers it through
   `handleNoContent`). No existing console call hits a 204, so today's helpers
   have never been wrong; a successful revoke would surface as an error toast.
   Needs a `platformPostNoContent` (or a 204 branch) with its own test.
3. **The mock platform server speaks neither dialect.**
   `test/mock-platform/server.mjs` has no `/api/` routes and 401s anything
   without a matching `x-api-key` before routing. Every default-tier test of
   these surfaces depends on teaching it the three console routes.
4. **`docs/design-reference.md:48`** records "no … API keys …" as a deliberate
   divergence. Shipping the page makes that line false. It moves in the same
   PR as the page (per CLAUDE.md: divergences are recorded where they are
   read, not only in a PR nobody re-reads).
5. **There is no offset pager.** `src/lib/platform/http.ts:26–39` has keyset
   `Page<T>` and classic `ClassicPage<T>` only; the console-API listing is
   `{data, pagination:{total, limit, offset, has_more}}`
   (`internal/api/consoleapi.go:94–104`) — a third shape, and
   `src/lib/platform/use-cursor-page.ts` is cursor-only. Slice 1 adds the
   envelope type; slice 2 decides whether 100 keys per environment needs a
   pager at all.
6. **Feature detection does not extend to `/api/`.** `isUnimplemented`
   (`src/lib/platform/surfaces.ts:52–62`) is documented as valid only on the
   collection routes listed above it (`:17–22`), and the console route's 404 is
   ambiguous because the platform answers the same envelope for a missing
   environment (`internal/api/consoleapi.go:112–113`, `:135–136`). A platform
   predating plan 30 must therefore be distinguished some other way — a probe
   against the collection path with a known-good environment id, or simply
   rendering the section and letting it error. Decide in slice 2; record in
   `docs/wire-divergences.md`.
7. **The probe ratchet does not cover these files.**
   `scripts/check-probes.mjs:36–59` enforces a hardcoded `SEAMS` list and only
   counts probes whose file sits directly in a listed seam directory
   (`:88–95`). A `probe:` test on an env-keys component is collected and
   ignored until its module is added there.

### Derived state and its attributes

Per CLAUDE.md, every formatter-rendered state also ships machine-readable:

**Environment keys (slices 2–3).** Our platform's row is
`{id, name, created_at, expires_at}` and nothing else
(`internal/api/consoleapi.go:84–89`) — this table must not license inventing
fields the wire does not carry:

| Rendered                   | Attribute                                        |
| -------------------------- | ------------------------------------------------ |
| `…1c7c3f1` (truncated id)  | `data-token-id` (full id)                        |
| `Aug 10, 2027`             | `data-expires-at` (raw RFC 3339, `""` when null) |
| "Expired" / "Active" badge | `data-key-state="active\|expired"`               |

**API keys (slice 4, blocked).** These come from the reference's API-key wire
and only exist once the platform serves an equivalent:

| Rendered                | Attribute                       |
| ----------------------- | ------------------------------- |
| `sk-ant-api03--GK…sAAA` | `data-partial-key-hint`         |
| Row action availability | `data-can-manage="true\|false"` |

The active/expired distinction is computed client-side from `expires_at` versus
now, because the platform's listing returns expired keys deliberately
(`envkeys.go:105–106`: _"an operator whose worker has stopped connecting needs
to see the credential it is failing on"_). That is a rendering derivation, not
domain logic — principle 4 holds — but it owns a clock, so it gets exactly one
formatter test and one injected-now unit test.

### Hooks and existing patterns to mirror

Carried from the superseded draft, which mapped this onto the repo's own
precedents. Vault credentials are the closest sub-resource CRUD shape
(`src/lib/platform/queries.ts:425–481`, query key `["vault-credentials", id]`);
`credential-form.tsx` is the form-in-dialog precedent; `ConfirmIconButton`,
`DataTable`, `EmptyState`, `IdCode`, `Time` and `copyText` all exist in
`bits.tsx`. **A reveal-once secret dialog exists nowhere yet — it is net-new
UI.** The mock platform already carries a `self_hosted` fixture environment
(`env_byoc0000000000000001`).

Hooks: `useEnvironmentKeys`, `useCreateEnvironmentKey`,
`useRevokeEnvironmentKey` on query key `["environment-keys", envId]`; create
and revoke invalidate the list. Create shows its error inline in the dialog
(`meta: { errorToast: false }` + `RequestId`); revoke keeps the global toast
with `errorTitle: "Revoke failed"`.

### The one-time secret

The platform returns the full key exactly once, on create, and returns nothing
else with it. The dialog that issues it must therefore be the only place it is
ever shown, must offer copy, and must say plainly that it will not be shown
again — and the value must never enter a query key, a toast, a log, or a
`data-*` attribute.

**Plaintext discipline**: the `access_token` is held in component state for the
reveal dialog and cleared on close, with `mutation.reset()` so it leaves the
mutation cache too; it is never logged, never written to a `data-*` attribute,
never persisted. Because the create response carries no row metadata, the
mutation's `onSuccess` invalidates `["environment-keys", envId]` and the
refreshed list renders the new row. Review should treat **any second render
path for the key as a defect**.

This gets an adversarial probe (`probe:` prefix, per `pnpm probes:check`)
asserting the secret appears in the DOM exactly once and never in the React
Query cache.

## Slices

1. **The seams.** BFF console-path allowlist; `platformPostNoContent`; mock
   server learns `GET`/`POST …/tokens` and `POST …/tokens/{id}/revoke`; typed
   wire shapes in `types.ts` plus their zod transcription in `schemas.ts`
   (verification instrument only — `zod` is a devDependency, and
   `eslint.config.mjs` allows importing it only from
   `src/lib/platform/schemas.ts` and the platform module's own tests). Also
   adds the offset-pagination envelope type (seam 5). Renders nothing; proves
   nothing observable changed.
2. **Environment keys, read.** The section on the environment detail page:
   listing, empty state, expired/active derivation, the `data-*` attributes,
   the issuance precondition (the platform 400s any environment that is not
   `self_hosted` **and** any archived environment —
   `internal/api/consoleapi.go:200–205` — so the control is hidden in both
   cases, a client-side mirror of the wire that gets a recorded decision), and
   the seam-6 decision on detecting a pre-plan-30 platform. Fidelity manifest
   gains the surface in the same PR.
3. **Environment keys, write, and the setup guide.** Generate dialog (name
   only) swapping on success to the reveal-once "Save your environment key"
   dialog with `copyText` and its Check/Copy feedback swap — closing is final;
   revoke via `ConfirmIconButton` carrying the reference's revoke copy;
   invalidate-and-refetch rather than optimistic insert (the create response
   has no row). Plus the dismissable **"Set up your self-hosted environment"**
   panel: the four reference steps with our commands — export
   `ANTHROPIC_ENVIRONMENT_KEY`, install the `ant` CLI, then
   `ant beta:worker poll --environment-id "<id>" --workdir "/workspace"` with
   `--base-url` pointing at the platform, a copy button per code block.
   Dialog a11y coverage; e2e in `write-paths.spec.ts` style (generate → key
   shown once → row appears → revoke → confirm → row gone). Fidelity re-shot,
   and `docs/design-reference.md` gains the divergence notes (our key prefix,
   our commands).
4. **API keys** — _blocked on platform plan 31 slice 5_. The page, the create
   dialog with the six expiry options and the browser-computed `expires_at`,
   the delete confirm. Ships only once the platform serves the surface; the
   recording above is what unblocks the platform side.
5. **Acceptance + archive.** Against the platform's compose stack (the
   `test/e2e-live` tier): generate a key in the UI for a self-hosted
   environment, start a real `ant beta:worker poll` with it against the
   platform, watch it authenticate; revoke the key in the UI and watch the next
   poll 401. This is the console-side mirror of platform plan 30 slice 3's
   acceptance. Recorded in `docs/HISTORY.md`.

## Verification

- Per slice: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:e2e`, `pnpm probes:check`.
- Every slice that touches UI names its re-shot fidelity surfaces in the PR and
  adds any new surface to `test/fidelity/surfaces.ts` in the same PR — the
  manifest test (`test/fidelity/surfaces.test.ts`) reads every `page.tsx` off
  disk and fails on an unlisted one, so this is enforced, not aspirational.
- The secret-handling probe (slice 3) is a merge gate, not a nice-to-have —
  which means slice 3 also adds its module to `SEAMS` in
  `scripts/check-probes.mjs:36–59` (seam 7). Without that edit the probe is
  collected and ignored.
