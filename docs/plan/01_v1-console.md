---
status: in-progress
---

# managed-agent-console v1 — web console for managed-agent-platform

The operator-facing web console for [managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform) (v0.1.0): manage agents, environments, and sessions — including a live session event trace and human-in-the-loop tool approval — plus vaults, skills, and files, against a self-hosted platform deployment.

**UI reference:** the Managed Agents section of Anthropic's Claude Console (platform.claude.com), surveyed 2026-08-02 — left-nav resource pages (list + filters + column config + empty states), a create-agent modal with a Rendered/Raw config editor, a session trace view, and a quickstart with a template gallery. **Visual style must stay consistent with the reference** (standing decision, 2026-08-02): each UI slice extracts design facts (computed fonts, colors, spacing) from the live reference in Chrome before building, and verifies the built UI against it with side-by-side Chrome screenshots before the slice's PR merges. We adopt its information architecture and diverge where self-hosting demands (connection setup, no billing, no AI-generate in v1).

**API truth:** the platform's implemented surface only — verified 2026-08-02 against the platform checkout (`internal/api/server.go` route registration and per-handler files; `docs/ARCHITECTURE.md`; `docs/DIVERGENCES.md`). The reference product's surfaces the platform has not implemented stay out of the console (see Non-goals).

## Ground truth (platform wire facts the console is built around)

Verified against platform source; file citations are into the platform repo.

**Resources served.** Agents (create/list/get/update-as-POST/archive/versions; optimistic `version` lock → 409), Environments (CRUD + archive + hard DELETE; `cloud` config with `networking` `unrestricted|limited{allowed_hosts, allow_mcp_servers, allow_package_managers}` and `packages`, or type-only `self_hosted`), Sessions (create/list/get/limited-update/archive/hard DELETE), Session events (batch POST, cursor-paged GET, SSE stream), Session resources (file mounts only), Vaults + credentials (three auth types: `mcp_oauth` with refresh config + live `mcp_oauth_validate` probe, `static_bearer`, `environment_variable` with networking scope and injection locations; secrets write-only; archive purges secrets), Skills (multipart upload — loose `files[]` or one zip; versions; zip content download), Files (multipart upload, classic Files-API pagination `{data, has_more, first_id, last_id}`; metadata; delete).

**Not implemented on the platform** (`internal/api`, DIVERGENCES): deployments, memory stores, outcomes (`user.define_outcome` → 400), multiagent (non-null → 400), MCP _execution_ (`mcp_servers`/`mcp_toolset` validate and round-trip but the brain never offers MCP tools), `github_repository`/`memory_store` session resources (→ 400), health endpoint (none), environment-key issuance over the wire (none — a console cannot mint BYOC worker keys), session stats (`active_seconds`/`duration_seconds` render 0).

**Auth.** Management lane = `x-api-key` (bootstrap key from `CONTROLPLANE_API_KEY`; full-power, unscoped, no user identity — sessions deliberately carry no `user_id`). `anthropic-version`/`anthropic-beta` headers accepted and ignored. Error envelope `{"type":"error","request_id","error":{type,message}}`; `request-id` on every response.

**Session create shape** (`internal/api/sessions.go`): top-level keys exactly `agent` (id string | `{type:"agent",id,version?}` | `{type:"agent_with_overrides",…}` where only `system` may be null), `environment_id`, `title`, `metadata` (flat string map), `resources` (only `{type:"file",file_id,mount_path?}` works), `vault_ids` (immutable after create). **`initial_events` is rejected** — seed a session by POSTing events after create.

**Agent config as implemented** (`internal/domain/agent.go`, `internal/toolset/definitions.go`): `model` = string or `{id, speed:"standard"|"fast"}`; `tools[]` union = `agent_toolset_20260401` (`default_config`/`configs[]` with per-tool `enabled` + `permission_policy {always_allow|always_ask}`; unknown keys rejected at every level; eight tool names: `bash read write edit glob grep web_fetch web_search`) | `custom {name,description,input_schema}` | `mcp_toolset` (inert); `mcp_servers[]` = `{type:"url",name,url}` only (inert); `skills[]` = `{type:"anthropic"|"custom", skill_id, version?}`, omitted version persists as the literal `"latest"`; `multiagent` must stay null.

**Events and streaming** (`internal/domain/event.go`, `internal/api/events.go`, `internal/events/preview.go`):

- Taxonomy: inbound `user.message | user.interrupt | user.tool_confirmation | user.custom_tool_result | user.tool_result (self_hosted only) | system.message`; agent `agent.message | agent.thinking | agent.tool_use | agent.tool_result | agent.custom_tool_use` (+ mcp variants, never emitted); session `session.status_running | session.status_idle (carries stop_reason) | session.status_rescheduled | session.status_terminated | session.error | session.updated | session.deleted`; span `span.model_request_start | span.model_request_end (carries model_usage token counts)`.
- Statuses actually written in v1: `idle` ⇄ `running` only; sessions start `idle`. `stop_reason.type`: `end_turn | requires_action (+event_ids[]) | retries_exhausted`.
- SSE: named frames (`event: <type>` + `data: <json>`), `ping` every 15 s, `error` frame on internal failure, `session.deleted` terminates the stream. Deltas are opt-in per connection (`?event_deltas[]=agent.message`; `agent.thinking` is start-only), frame type **`content_delta`** with `(event_id, index)` append semantics; the buffered event later persists under the pre-allocated preview id, so the client reconciles by id and replaces. **No history replay, no `Last-Event-ID`** — seed from `GET …/events` then tail; tolerate duplicates in the overlap window.
- HITL on the wire: ask-gated turns park the session `idle` with `stop_reason {type:"requires_action", event_ids:[ask-gated agent.tool_use…]}` (mixed turns gate everything). Approve/deny = `POST …/events` with `{"events":[{"type":"user.tool_confirmation","tool_use_id","result":"allow"|"deny","deny_message"?}]}` (`deny_message` only with deny). Deny synthesizes an `is_error` tool result; remaining asks re-emit a shrunken `requires_action`; the last clearance emits `session.status_running`. Escape hatch: `user.interrupt` (optionally batched with a redirecting `user.message`).

**Pagination — three conventions.** (1) Keyset cursor `{data, next_page}` (agents/environments/sessions/vaults/credentials/skills/skill-versions/events; sessions alone add `prev_page`; `limit` default 20 max 100, but events/skill-versions/resources max 1000). (2) Session resources: own cursor, omitted `limit` returns all. (3) Files: classic `after_id`/`before_id` + `has_more`.

**Hard console constraints discovered.**

1. **No CORS, no OPTIONS handling anywhere** on the platform — a browser cannot call it cross-origin. ⇒ all calls go through the console's own server (BFF), which is also design principle 2 (key never in the browser).
2. `EventSource` cannot set `x-api-key` ⇒ the SSE stream is proxied server-side; the browser consumes the console's same-origin stream.
3. No health endpoint ⇒ the connectivity probe is `GET /v1/agents?limit=1`.
4. Management-lane download of user-uploaded files returns 400 (`downloadable:false`) ⇒ the Files page shows metadata and the `downloadable` flag; it offers download only where the platform allows it.
5. Work-item ids rotate on re-handout; work-queue UI (if any) must not treat `work_` ids as stable. v1 shows only `GET …/work/stats` per environment — and only if an environment key is provided, which the platform cannot issue over the wire; absent a key the panel hides. (Deferred entirely if this proves awkward; the stats call is the sole work-API touch in scope.)

## Settled decisions

| Dimension         | Decision                                                                                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack             | **Next.js (App Router) + TypeScript strict**, Tailwind CSS + shadcn/ui, TanStack Query + TanStack Table, `pnpm`                                                                                                                                                                              |
| Platform access   | **BFF only**: route handlers under `/api/platform/*` forward to `PLATFORM_BASE_URL`, injecting `x-api-key` from `PLATFORM_API_KEY` (server env). SSE re-streamed through the BFF. No `NEXT_PUBLIC_*` credential, ever                                                                        |
| Console auth      | v1: optional single shared password (`CONSOLE_PASSWORD`; unset ⇒ no gate, for loopback/dev). Cookie session, middleware-enforced. Not a user system                                                                                                                                          |
| Config editor     | Rendered form **and** Raw editor with a JSON↔YAML toggle (JSON is the wire truth and the save format; YAML is editor sugar serialized to the same JSON — decided 2026-08-02 to include in v1)                                                                                                |
| API client        | Hand-written thin typed client over `fetch` against the platform wire (the TS types transcribed from the platform's Go domain — cite the source file in a comment). No Anthropic SDK dependency: the SDK pins api.anthropic.com beta semantics we don't need, and the BFF is the only caller |
| Feature detection | Surfaces the platform 400s/404s as unimplemented (deployments, memory stores, multiagent, MCP) are absent from v1 nav — not grayed out. Console versions track platform capability by release notes, not runtime probing, until the platform grows a capability endpoint                     |
| Testing           | Vitest (unit/component) + Playwright (e2e) against a **mock platform** (in-repo fixture server implementing the wire facts above, SSE included). Live tier opt-in: `RUN_LIVE_CONSOLE_TESTS=1` drives the platform's `deploy/compose` stack; consent without configuration fails, never skips |
| Delivery          | Docker image (Next standalone output); compose example documented here, a `console` service PR to the platform's compose stack after v1                                                                                                                                                      |
| License / repo    | Apache-2.0, public, PR-only workflow (CLAUDE.md)                                                                                                                                                                                                                                             |

## Non-goals (v1)

- **Deployments, memory stores, outcomes, multiagent, MCP management UI** — the platform doesn't serve them; they enter the console only after they land there (platform issues track them).
- **Template gallery & AI-generated agent configs** (Claude Console's quickstart) — needs a curated template set and a model endpoint; follow-up.
- **Usage/cost analytics** — the platform computes no stats (`stats` are zeros). The console shows per-session token usage from `usage` and `span.model_request_end.model_usage`, nothing more.
- **Multi-user/RBAC/SSO** — single-tenant v1, matching the platform.
- **BYOC worker management** — no wire surface to issue environment keys; revisit when the platform grows one.

## Architecture

```
apps/console (single Next.js app)
  src/app/(auth)/login                      # CONSOLE_PASSWORD gate
  src/app/(console)/agents|environments|sessions|vaults|skills|files
  src/app/api/platform/[...path]/route.ts   # BFF proxy (streams SSE; strips/repacks headers)
  src/lib/platform/                         # typed wire client + TS wire types + cursors
  src/lib/session-trace/                    # event log store: seed + SSE tail + delta reconcile
  src/components/                           # shadcn-based UI, tables, forms, JSON editor
  test/mock-platform/                       # fixture server: wire endpoints + SSE, used by vitest+playwright
```

The session trace store is the one genuinely stateful client piece: it seeds from `GET …/events?order=asc` (paging to the tip, `limit` up to 1000), attaches the proxied SSE with chosen `event_deltas[]`, deduplicates the overlap by event id, applies `content_delta` frames by `(event_id, index)` append, and replaces the preview with the persisted event on arrival. Reconnect = re-seed from the last known cursor, then re-attach. Everything else is stateless request/response through TanStack Query.

## Slices

Each slice is one or more PRs; STATE.md tracks progress; this file's status flips `in-progress` with slice 1's first PR.

1. **Scaffold + shell.** Next.js app (TS strict, Tailwind, shadcn), lint/format/test toolchain, CI (GitHub Actions: lint + typecheck + unit + e2e-mock + build), Dockerfile (standalone), BFF proxy route with header injection + streaming passthrough, login gate, left-nav shell with the six resource sections, connection status widget (probe = `GET /v1/agents?limit=1` via BFF, surfacing the error envelope and `request-id` on failure).
   → verify: CI green from a clean checkout; `docker run` serves the console; probe turns green against a local compose-stack platform and shows the envelope error against a wrong key.
2. **Read-only resource pages.** Lists + detail views for agents (incl. versions), environments, sessions, vaults (+credentials), skills (+versions), files — each honoring its pagination convention, list filters mirroring the platform's query params (sessions: `statuses[]`, `agent_id`, `created_at[...]`, order; agents: `include_archived`, created-at range), empty states, archived badges. Session detail renders the event log read-only via polling (`order=asc`, `types` filter chips, span/token display).
   → verify: e2e suite over mock fixtures covering all three pagination schemes and each list's filters; manual pass against the live stack.
3. **Live session trace + HITL.** The session-trace store (seed + SSE tail + delta reconcile + reconnect), streaming message/thinking previews, status chips driven by `session.status_*`, the approval banner (parse `requires_action.event_ids` → resolve `agent.tool_use` events → per-tool Allow / Deny-with-message posting `user.tool_confirmation`), composer posting `user.message`, interrupt button (plain, and batched interrupt+message "redirect" variant), `session.error` surfacing with retry status.
   → verify: mock-SSE e2e (deltas, reconnect-dedup, approval round trip); live acceptance: create an `always_ask`-on-`bash` agent, run a session from the console, watch the stream, deny once (deny_message lands as `is_error` tool result), approve once, session completes — all through the UI.
4. **Write paths.** Create/edit agent (rendered form: name/model+speed/system/description; toolset editor with per-tool enable + policy; custom tools; skills picker fed by the skills list; raw tab with JSON↔YAML toggle and round-trip guarantee — JSON is what saves; optimistic-version conflict surfaced as a reload prompt on 409), archive agent; create/edit/archive/delete environment (cloud networking + packages editor, self_hosted); create session (agent picker with version pin or overrides, environment picker, vault multi-select, title/metadata, file-resource attach: upload to `/v1/files` then mount); vault + credential CRUD (three auth unions, write-only secret UX with re-enter-to-replace, archive-purges-secrets warning, `mcp_oauth_validate` probe button); skills upload (files or zip, 32 MiB), new version, version zip download; files upload (500 MB cap surfaced), delete, `downloadable` handling per constraint 4.
   → verify: e2e mock coverage per form incl. unknown-key 400s surfaced inline, 409 path, duplicate-mount 400; live acceptance: the full loop — upload file, create vault+credential, create agent, create session with both attached, drive it to completion from the console.
5. **Polish + deploy docs.** Error toasts standardized on the envelope (`request-id` copyable), dark mode, `Ctrl+K` resource search, loading/skeleton states, README quickstart (docker run + compose snippet next to the platform stack), CHANGELOG, this plan archived with a summary in a HISTORY entry when done.
   → verify: e2e smoke on both themes; docs-consistency pass (README/CHANGELOG/STATE truthful); fresh-machine walkthrough of the quickstart.

## Acceptance (v1 done)

Against a local platform compose stack, an operator using only the console can: configure the connection; create an environment and an agent (with an `always_ask` tool policy); upload a file and a skill; create a vault with a credential; start a session binding all of them; watch the live trace stream with message deltas; deny then approve a gated tool call; interrupt-and-redirect a turn; see token usage per model span; archive the session, agent, and environment — with every wire interaction passing through the BFF and no credential ever present in browser storage, page source, or client bundles.

## Risks / open questions

- **Platform is pre-1.0 and wire shapes may move** — mitigations: types transcribed with source citations, the mock server asserts on the same shapes, and a console release names the platform version it targets.
- **SSE-through-BFF buffering**: Next route handlers must stream without buffering (verified in slice 1 with the ping cadence — a 15 s ping arriving late fails the check).
- **Raw editor round-trip fidelity**: the platform stores tool/server/skill entries verbatim; the raw editor must not reorder/normalize on save (edit = replace whole arrays, mirroring update semantics). The YAML view compounds this — YAML→JSON conversion must be lossless for the wire's shapes (no anchors/tags, keys stay strings), and the JSON form is always what saves.
- **Rendered↔Raw sync conflicts** in the agent editor: raw wins on divergence; the form re-parses on tab switch and flags entries it cannot render (custom tools with exotic schemas stay raw-only).
