---
status: draft
issue: 24
---

# UX parity with the reference console from already-served data — trace readability, wire filters, editor reshape

Requested 2026-08-03: close the UX gap to the reference console using **only data and
endpoints the platform already serves** — nothing in this plan depends on platform-side
work. Source material: a frame-by-frame read of the "Introducing Claude Managed Agents"
video (youtube.com/watch?v=I1BvAHOsjBU) and a live survey of platform.claude.com's
Managed Agents section, both recorded 2026-08-02. The reference's standout surfaces
(multi-agent lanes, AI-assisted authoring) are exactly the ones this console must _not_
copy — see Declined — but its session-trace information density and its editor's
structure are ahead of ours on data we already hold.

## Ground truth (verified 2026-08-02/03 against both checkouts)

- **Trace rows show absolute time only, and hide everything they don't recognize.** The
  event renderer's switch falls through to `null` ([src/components/console/event-row.tsx](../../src/components/console/event-row.tsx):128)
  — an unrecognized type renders a bare badge with an empty body. That set now includes
  the platform's just-landed outcome family (`user.define_outcome` echo,
  `span.outcome_evaluation_start/_ongoing/_end` — platform `internal/domain/event.go:54-56`).
  Tool results are clamped to three lines with no expansion path (event-row.tsx:73).
- **Durations are computable client-side today, for model calls only.**
  `span.model_request_end` carries `model_request_start_id` (platform
  `internal/events/span.go:135`), so start/end pairing yields per-call durations. No
  tool-execution spans exist (`internal/domain/event.go:49-56`) — per-tool durations are
  a platform gap, out of scope here.
- **`processed_at` is nullable** — the platform deliberately echoes inbound tool results
  with `processed_at: null` and stamps at settlement (its DIVERGENCES registry). All
  time math must be null-safe.
- **The wire serves filters the console never surfaced.** Sessions list: `agent_id`,
  `agent_version`, `statuses`, `order`, `created_at[gt|gte|lt|lte]` (platform
  `internal/api/sessions.go:894`); agents list: `created_at[gte|lte]`, `include_archived`
  (`internal/api/agents.go:350-358`). The console sends only `statuses`
  ([src/app/(console)/sessions/page.tsx](<../../src/app/(console)/sessions/page.tsx>):77-80).
  Environments expose nothing further (`include_archived` only) — already surfaced.
- **The editor rewrites compact toolset configs.** `buildToolset` never emits
  `default_config` — only per-tool `configs` for deviations
  ([src/lib/agent-config/toolset.ts](../../src/lib/agent-config/toolset.ts):88-100) —
  while `parseTools` _reads_ `default_config` (:65-68). An externally-authored
  `{default_config: {enabled: false}}` agent is silently rewritten to eight per-tool
  entries on first console save. Semantically equivalent, but it clobbers the operator's
  chosen shape. Wire policy values are exactly `always_allow | always_ask`
  (platform `internal/domain/agent.go:33-34`) — the reference's third per-tool state is
  disabled (`enabled: false`), not a deny policy; our data model is complete.
- **Reference facts to match** (recorded 2026-08-02): session header is a single
  chip-row (agent · env · files · vault · age · duration · tokens), not a field table;
  every event row right-aligns `tokens · elapsed · offset` (offset = time since session
  start); idle gaps render as explicit `Session idle · 25s` full-width bands;
  `Transcript | Debug` tabs; clicking a row opens a detail panel (full output, scrollable,
  model-free); `Copy all` on the trace; list pages filter by agent and created-time;
  create-agent is a modal with two-column sections (explainer left, controls right), a
  toolset card carrying a **toolset-level default policy** plus per-tool rows with plain-
  language descriptions (`bash — Execute bash commands`), and empty states carry a CTA.
- **No search endpoint exists on the wire** (recorded when Ctrl+K landed, plan 01
  slice 5) and no session `stats` are computed (platform DIVERGENCES: rendered as empty
  wire shapes only) — two boundaries this plan stays inside.

## Design decisions

1. **All derivations are presentation-only.** Offsets, idle gaps, and span pairing are
   pure client-side functions over the served event log — rendering computations, not
   session-state recomputation, so principle 4 (thin console) holds. Each lands as a
   unit-tested helper in `src/lib/session-trace/`, null-safe on `processed_at`.
   **Offsets are relative to the session's `created_at`**, not the first event — the
   console's own create flow sends the first message from the session view, so a real
   pre-first-message idle interval exists and must not be hidden by a first-event origin
   (review finding, PR #25).
2. **Unknown events render honestly, never blank.** The fallback shows the event's
   payload as a muted, truncated JSON preview (expandable in the slice-3 detail panel).
   This is deliberate forward-compatibility: outcome events become _legible_ the day the
   operator's platform serves them, while their dedicated UI waits for an outcomes plan.
3. **No search box.** The reference's `Search by name or exact ID` implies a server
   search the wire doesn't have; faking it client-side over one loaded page would lie
   about its scope. Ctrl+K already filters loaded lists by name/id. Recorded divergence.
4. **The equivalent-curl block uses placeholders** — `$PLATFORM_BASE_URL` /
   `$PLATFORM_API_KEY`. The browser knows neither (principle 2) and must not. The value
   is teaching the wire shape, not producing a paste-runnable secret. Shown from the
   client-constructed request the console already builds for its BFF calls.
5. **`default_config` becomes a first-class editor control**: a toolset-level default
   policy select plus per-tool overrides, emitted compactly (bare toolset when all
   defaults; `default_config` when the default deviates; per-tool `configs` only for
   per-tool deviations). Round-trip preserves externally-authored shapes — regression
   test pins the current rewrite as fixed.
6. **Created-time filters are presets, not date pickers**: All time / 24 h / 7 d / 30 d
   mapping to `created_at[gte]`, matching the reference's `Created All time ∨` control
   and keeping the UI to one select.

## Slices (each lands as its own PR; mock platform + e2e extended in the same PR; Chrome fidelity pass per CLAUDE.md noted in each PR)

1. **Trace readability quick wins** (session detail only):
   - Meta chip-row replaces the vertical Overview `FieldList` (agent, environment,
     vaults, resources, tokens, created-age — links preserved). The reference's
     additional **duration chip (`5m 34s (2m 44s active)`) is deliberately absent**: it
     renders the session `stats` the platform serves as empty by recorded divergence —
     see Declined.
   - Every event row gains a right-aligned relative offset (`0:09` since the session's
     `created_at`, decision 1); `span.model_request_end` rows additionally show paired
     duration.
   - Idle gaps ≥ a threshold render as `Session idle · Ns` bands (status_idle →
     status_running pairing).
   - Unknown-event fallback rendering (decision 2).
   - `Copy all` (serialized trace to clipboard) on the events header.
   - Empty states gain CTAs (e.g. sessions list → Create session).
   - → verify: helper unit tests (null `processed_at`, unpaired spans, zero-gap);
     `test/e2e/session-live.spec.ts` extended; suites green; fidelity pass noted.
2. **Wire filters the console never surfaced**:
   - Sessions page: agent filter + created preset filter; agents page: created preset
     filter. Params wired through `useSessions`/`useAgents`;
     `test/mock-platform/server.mjs` honors `agent_id` and `created_at[gte]` so e2e
     asserts true server-side filtering.
   - **The agent filter's options must be complete** (review finding, PR #25): the
     dropdown pages through `v1/agents` to exhaustion (limit 100 per page, following
     `next_page`; sanity cap 1000 with a visible "options truncated" note if ever hit).
     Archived agents are included — archived agents' sessions remain filterable — and
     labeled with the existing archived badge.
   - → verify: e2e asserts the mock received the expected query params and rendered the
     filtered rows, **including selecting an agent beyond the first options page**
     (multi-page mock); suites green.
3. **Transcript | Debug split + event detail panel**:
   - Transcript tab: compact one-line rows (type chip · one-line summary · right-aligned
     tokens/duration/offset), span noise hidden; the existing filter chips fold in.
   - Debug tab: every event, raw JSON.
   - Clicking a row opens a master-detail panel: full tool input/output, scrollable,
     per-block copy — removes the `line-clamp-3` dead end.
   - → verify: e2e covers panel open/close, long-output scrolling, Debug raw view; a11y
     smoke extended to the panel; fidelity pass noted.
4. **Agent editor reshape**:
   - Two-column sectioned layout (explainer left, controls right) for General / Tools /
     Skills, matching the reference modal's structure (page, not modal — recorded
     divergence: deep-linkable editors suit an operator console).
   - Toolset card: toolset-level default policy + per-tool enabled/policy rows with
     static plain-language descriptions; compact emission per decision 5.
   - Equivalent-curl block on the editor (decision 4).
   - 2–3 starter templates (static JSON) seeding the form on `/agents/new`.
   - → verify: toolset round-trip tests incl. the pinned regression; e2e
     create-from-template; fidelity pass noted.

## Declined (with reasons)

- **Timeline color-band strip** (the reference's per-event gantt bar) — the highest-
  effort, purely aesthetic item; revisit as a follow-up issue once slice 3's structure
  exists.
- **Session `stats` chip (`5m 34s (2m 44s active)`) and per-tool durations** — both need
  platform work (stats are rendered-empty by recorded divergence; no tool-execution
  spans). Platform-repo issues, not console work.
- **Describe→generate, "Ask Claude", model-written output summaries** — all require a
  model credential in the console. The console holds a management key only; adding a
  model key breaks the key posture (principle 2) and wire-neutrality (principle 3).
  Evaluated and rejected.
- **Multi-agent lanes/tabs, Deployments, Memory stores** — platform post-v1 (#53, #51,
  #52); principle 1 keeps them out until served.
- **Batch-select checkbox column** on list pages — no bulk wire operations exist;
  selection with nothing to apply is ceremony.
