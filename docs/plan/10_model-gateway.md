---
status: archived
---

# Model Gateway management (plan 10)

The console half of
[platform plan 59](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/59_model-gateway.md),
its slice 3. The platform's `cmd/modelgateway` serves an admin API under `/admin/v1/` for vendor
accounts, their keys, upstream models, the model names callers send, per-key model grants and a usage
ledger. The brain sends every model call through the gateway by default, so a gateway with an empty
catalogue fails every agent turn. Today an operator configures it with `curl`
(`deploy/gcp/README.md` in the platform). This plan gives it console screens.

## Decisions — settled with the owner 2026-10-14, from a clickable prototype

1. **Navigation.** A `Model Gateway` group holds `Models` and `Providers`. Usage goes under an
   `Analytics` group, as the reference console files its usage report. The exact group label and
   position wait on a Chrome pass over platform.claude.com (not signed in on 2026-10-14).
2. **Names.** The wire's `alias` is a **Model** and its `deployment` an **Upstream model**: the console
   already has `Deployments` (scheduled agent runs). Code and types keep the wire's names.
3. **One more BFF namespace**, `src/app/api/gateway/[...path]`, forwarding an allowlist of
   `admin/v1/…` shapes and methods to `MODEL_GATEWAY_BASE_URL`. Credentials follow the control plane's
   rules: the operator's Bearer in SSO mode, `PLATFORM_API_KEY` otherwise, never both. In password and
   open mode that key **must be the bootstrap key**: the admin API refuses every other platform key
   (`internal/modelgateway/admin/admin.go` `authenticate`). The shared proxy core percent-encodes
   every path segment, so a Model name with any character the wire allows (`checkAliasName`),
   `?`, `#` and `%` included, reaches the gateway intact. Rejected alternative: refusing those
   characters, which made such a Model impossible to edit or delete from the console (PR #215
   review).
4. **A gateway 401 never ends the console session.** The control-plane proxy reads a 401 as the
   operator's token refused. The gateway also answers 401 when it runs without `IDENTITY_*` while the
   console runs SSO, and reading that as a dead session would sign every operator out on the Models
   page.
5. **Feature detection, not configuration.** With `MODEL_GATEWAY_BASE_URL` unset the BFF answers every
   gateway path `404 not_found_error`; the surface probe on `admin/v1/aliases` then hides the screens,
   the API Keys column, and turns the agent model field back into a text box (principle 3).
6. **The agent and Dream model field is a select of the gateway's chat Models**, names only, without
   `*`. A saved value the list lacks shows empty, and Save sends nothing until one is chosen; it says
   why on the field, so Save stays enabled as for every other field. This is a **deliberate
   exception to principle 4**: the wire still takes any string, so API and CLI callers are unaffected.
7. **Model access lives on the API Keys page** (platform plan 59): a column and a dialog that writes or
   deletes the key policy. Env-managed keys (`bootstrap`, `brain`) get no grant control: a policy
   written for the brain's key would limit every agent's model calls. One written through the API
   can only be removed, which restores the built-in grant (PR #218 review). An archived or expired key
   gets the same removal-only control: a grant on it serves no request.
8. **Usage sums daily rollups in the browser** for its tiles, chart and grouped table. That is
   presentation of rows the platform serves, not recomputed state. Cost shows **no currency**: the
   gateway stores prices without one.
9. **A first-run setup dialog** creates a provider, its key, an upstream model and a Model, in that
   order, and stops at the first refusal, keeping what it made. No `*` catch-all: no agent predates
   the gateway.
10. **Vendor names are the platform's** (`profile.go` `DisplayName`). The owner's renames — `Zhipu
(GLM)`, `Other Anthropic-compatible Endpoint`, `Other OpenAI-compatible Endpoint` — belong in the
    platform, not in a console copy.

## Ground truth

- Routes, bodies and refusals: `internal/modelgateway/admin/{admin,providers,deployments,aliases,keypolicies,usage,validate}.go`
  at platform `2a528c6`. An update is a POST naming only changed fields; a field fixed at creation is
  refused by name. A key policy is written whole. Lists answer `{data}` unpaginated; the ledger
  answers `{data, has_more}`, newest first, paged by `before`.
- Cross-row rules the store enforces, which the console surfaces as the platform's own 409/400
  message rather than re-checking: a provider with upstream models cannot be deleted; an upstream
  model a Model routes to cannot be deleted; a Model a key policy names cannot be deleted; a Model has
  one kind; an embedding Model keeps its one upstream model (`internal/modelgateway/store`).
- The gateway is unreleased: platform `v0.5.1` lacks `cmd/modelgateway`. These screens need the
  platform release after it; against an older platform they stay hidden by decision 5.

## Slices

1. BFF namespace, env, browser helpers, zod transcription of the admin views, the mock gateway.
   This plan and STATE.md.
2. The surface probe and query hooks. Providers: list, detail, add; keys; upstream models.
3. Models: list, inspector, routing editor; first-run setup.
4. API Keys: the model access column and dialog.
5. Analytics → Usage: overview and the request ledger, linked to sessions.
6. The agent and Dream model select; `MODEL_GATEWAY_BASE_URL` in the deploy manifests; fidelity
   surfaces; a model-free live contract against the compose stack's gateway.

## Verification

- Unit: the BFF gate (shapes, methods, credential choice, a 401 that leaves the session, the unset
  variable's 404); one test per formatter for its human string, `data-*` attributes elsewhere.
- Mock conformance: every response the mock gateway serves or constructs parses with the transcription.
  The mock gateway binds its own port (18070 e2e, 18071 fidelity), as the stub identity provider does:
  on the platform's port, a console that sent gateway calls to `PLATFORM_BASE_URL` would still pass.
- e2e against the mock; fidelity shots of each new surface in both themes.
- Live, model-free: create a provider with a dummy key, an upstream model, a Model and a key policy
  through the console against `localhost:8090`, then delete them. No vendor is called.

## Open

Filed as issues: the Analytics label (#219), staging (#220), the vendor names (#221).
