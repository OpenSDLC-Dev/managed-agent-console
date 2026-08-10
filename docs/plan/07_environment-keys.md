---
status: draft
---

# Environment keys — issue, reveal once, revoke (plan 07)

The platform is growing an operator surface for BYOC worker credentials
([platform issue #43](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/43),
platform plan 30): named environment keys, issued per host, shown exactly once,
individually revocable, expiring a year after issue — served on an off-wire
`/console/v1` namespace built for this console. This plan is the console half:
an **Environment keys** section and a **self-hosted setup guide** on
self-hosted environment detail pages, modeled interaction-for-interaction on
the reference console's environments page (observed live on
platform.claude.com, 2026-08-10). The platform lands first; this repo never
ships ahead of it (principle 1).

## Ground truth (verified 2026-08-10)

### The platform contract (plan 30 — cite landed code before building)

Three management-authenticated endpoints, reached through the existing BFF
(which injects `x-api-key` server-side):

- `POST /console/v1/environments/{id}/keys` — body `{"name": "…"}` (trimmed,
  1–128 chars) → 200 `{"id":"envkey_…","type":"environment_key","name",
  "created_at","expires_at","key":"sk-map-env01-…"}`. **`key` appears in this
  response and never again** (hash-only storage). 400 on a `cloud` or archived
  environment; 404 on an unknown one.
- `GET /console/v1/environments/{id}/keys` → `{"data":[{id,type,name,
  created_at,expires_at},…],"has_more":false}` — unrevoked keys, newest first;
  expired-but-unrevoked keys are included.
- `POST /console/v1/environments/{id}/keys/{key_id}/revoke` → 204, idempotent;
  404 for an unknown or foreign `key_id`.

Wire truth for `schemas.ts` cites must come from the **landed platform code**
(`internal/api/` in the platform checkout), not from this plan — transcribe at
implementation time, per principle 1.

### Reference console behavior (observed live, platform.claude.com)

- Self-hosted environment detail → **Environment keys** section. Copy: "An
  environment key lets a runner on your infrastructure connect to this
  environment and pull jobs. Generate one per host so you can revoke access
  individually." Empty state: "No environment keys yet." Button: "Generate
  environment key" (key icon).
- Generate → dialog **"Create environment key"** — "Give your environment key
  a name to help identify it later.", one text input (placeholder "e.g.,
  Production Server"), Cancel / Create environment key.
- Success → dialog **"Save your environment key"** — "Keep a record of the key
  below. You won't be able to view it again.", the full key in a mono block,
  "Copy environment key", Close.
- Table columns **Name | ID | Created | Expires** (Expires = Created + 1 year;
  ID truncated), one trash icon per row → confirm dialog **"Revoke environment
  key"**: "Are you sure you want to revoke this environment key? Workers using
  this key will no longer be able to connect. This action cannot be undone."
  (Cancel / destructive Revoke). Revoked keys vanish from the list.
- A side panel **"Set up your self-hosted environment"** (dismissable ×) walks
  four steps: register a key → `export ANTHROPIC_ENVIRONMENT_KEY='…'` →
  install the `ant` CLI from GitHub releases → `ant beta:worker poll
  --environment-id "env_…" --workdir "/workspace"`.
- The **cloud** environment detail page shows none of this (no keys section,
  no setup panel, no queue stats) — it is self-hosted-only UI.

### This console as-is

- The BFF forwards only `v1`-prefixed paths (`src/app/api/platform/[...path]/route.ts:36`);
  key injection, header whitelists, and body streaming otherwise fit unchanged.
- The closest existing patterns: vault credentials for sub-resource CRUD hooks
  (`src/lib/platform/queries.ts:425–481`, query key `["vault-credentials", id]`),
  `AddCredentialButton` for form-in-dialog (`src/components/console/credential-form.tsx`),
  `ConfirmIconButton` for confirm-then-destroy, `DataTable`/`EmptyState`/
  `IdCode`/`Time` in `bits.tsx`, `copyText` + the `RequestId` copy-feedback
  swap. **A reveal-once secret dialog exists nowhere yet — it is net-new UI.**
- Mock platform (`test/mock-platform/`) already carries a `self_hosted` fixture
  environment (`env_byoc0000000000000001`); e2e write-paths and the fidelity
  manifest (`test/fidelity/surfaces.ts`) are the templates to extend.

## Settled decisions (with the user, 2026-08-10)

1. **Scope: the keys section and the setup panel**, both rendered only for
   `self_hosted` environments, matching the reference. The reference page's
   work-queue Overview stats are out of scope — `work/stats` rides the
   environment-key auth lane the console does not hold (future issue).
2. **Reference UX is copied faithfully** — copy text, dialog flow, columns —
   with our platform's realities substituted: key prefix `sk-map-env01-…`, and
   worker commands pointing at our platform via `--base-url`/
   `ANTHROPIC_BASE_URL` (which the `ant` worker subcommands honor).
3. **Sequencing**: platform plan 30 slices 1–2 merge first; the mock platform
   implements the contract immediately so console tests never wait on a live
   stack.

## Non-goals

- Work-queue statistics (above).
- Key history: revoked keys are not listed (reference behavior); no last-used
  tracking, no expiry warnings/notifications, no rename or regenerate-in-place.
- Any handling that would persist the plaintext key: it lives in dialog-local
  React state only and dies with the dialog.

## Architecture

- **BFF** — widen the path guard to also forward `console/v1/…` (route.ts:36);
  nothing else changes. A test pins that an inbound `x-api-key` still never
  forwards on the new prefix.
- **Schemas/types** — `EnvironmentKey` and `EnvironmentKeyCreated` (adds
  `key`) zod schemas in `src/lib/platform/schemas.ts` with platform
  `file:line` cites; inferred types re-exported from `types.ts`; probe tests
  (the ratchet covers `src/lib/platform/`); fixture-conformance rows in
  `schemas.test.ts`.
- **Hooks** (`queries.ts`, mirroring vault credentials): `useEnvironmentKeys`,
  `useCreateEnvironmentKey`, `useRevokeEnvironmentKey` on query key
  `["environment-keys", envId]`; create and revoke invalidate the list. Create
  shows its error inline in the dialog (`meta: { errorToast: false }` +
  `RequestId`); revoke keeps the global toast with `errorTitle: "Revoke
  failed"`.
- **Plaintext discipline**: the `key` from the create response is held in
  component state for the reveal dialog and cleared on close, with
  `mutation.reset()` so it leaves the mutation cache too; it is never logged,
  never written to a `data-*` attribute, never persisted anywhere.
- **UI** (`environments/[id]/page.tsx`, `kind === "self_hosted"` only):
  - An **Environment keys** `DetailSection` between Overview and Config:
    reference copy verbatim; `DataTable` with Name / ID (`IdCode`) / Created
    (`Time`) / Expires (`Time`, plus an "Expired" badge when past) / per-row
    trash `ConfirmIconButton` carrying the reference's revoke copy;
    `EmptyState` "No environment keys yet."; the Generate button.
  - **Generate flow**: dialog 1 ("Create environment key", name input,
    placeholder "e.g., Production Server") swaps on success to dialog 2
    ("Save your environment key", mono key block, "Copy environment key" via
    `copyText` with the Check/Copy feedback swap, Close). Closing is final.
  - **Setup panel** ("Set up your self-hosted environment"): the four
    reference steps with our commands — step 2 exports
    `ANTHROPIC_ENVIRONMENT_KEY`, step 3 installs the real `ant` CLI (the
    reference's release-download command works against this platform
    unchanged), step 4 runs `ant beta:worker poll --environment-id "<id>"
    --workdir "/workspace"` with `--base-url` pointing at the platform; a copy
    button per code block; dismissable (component state, not persisted).
  - **Feature detection**: a 404 `not_found_error` from the keys list means
    the platform predates plan 30 — hide the section and panel quietly. (The
    `surfaces.ts` collection-route rule deliberately does not extend to
    item-scoped routes, `surfaces.ts:19–23`; this is this plan's own stance.)
- Formatted values (Created/Expires) carry `data-*` attributes per the
  machine-readable-derived-state convention.

## Slices

1. `feat(platform-lib): console/v1 environment-key client` — BFF prefix,
   schemas + cites, hooks, mock-platform routes and fixtures, probes, unit
   tests.
2. `feat(environments): environment keys section` — the section, generate /
   reveal-once / revoke dialogs, page and component tests (`stubFetch`
   pattern), e2e in `write-paths.spec.ts` style (generate → key shown once →
   row appears → revoke → confirm → row gone), a11y coverage for the dialogs.
3. `feat(environments): self-hosted setup guide` — the panel, fidelity
   manifest entries (self-hosted detail, both generate dialogs, revoke
   confirm, setup panel) + re-shot surfaces named in the PR, and
   `docs/design-reference.md` divergence notes (our key prefix, our
   commands).

Each PR: Conventional-Commit title, CHANGELOG `[Unreleased]` entry, STATE.md
(activated in slice 1, closed out in slice 3).

## Acceptance

Against the platform's compose stack (the `test/e2e-live` tier): generate a
key in the UI for a self-hosted environment, start a real `ant beta:worker
poll` with it against the platform, watch it authenticate; revoke the key in
the UI and watch the next poll 401. This is the console-side mirror of
platform plan 30 slice 3's acceptance.

## Risks / open questions

- The platform contract above is plan-stage; if it shifts in the platform's
  review, this plan follows the landed code, and `schemas.ts` cites the final
  `file:line`.
- Visual details beyond the captured copy (spacing, iconography, panel layout)
  come from the fidelity ritual's Chrome extraction at build time
  (CLAUDE.md:70), not from this document.
- The reveal-once dialog is the console's first true-secret UI; the plaintext
  discipline above is the guard, and review should treat any second render
  path for `key` as a defect.
