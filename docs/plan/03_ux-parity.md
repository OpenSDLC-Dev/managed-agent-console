---
status: archived
issue: 24
---

# UX parity from already-served data (plan 03)

Requested 2026-08-03: close the UX gap to the reference console using **only data and endpoints the
platform already serves** — nothing here depended on platform-side work. Four slices, PRs #25–#29.
Source material: a frame-by-frame read of the "Introducing Claude Managed Agents" video
([watch](https://www.youtube.com/watch?v=I1BvAHOsjBU)) and a live survey of platform.claude.com's
Managed Agents section, both 2026-08-02.

What shipped is `src/lib/session-trace/`, the transcript/debug split in the session view, the wire
filters on the list pages, and the agent editor's toolset controls.

## Decisions

1. **All derivations are presentation-only.** Offsets, idle gaps and span pairing are pure functions
   over the served event log — rendering, not session-state recomputation, so principle 4 holds.
2. **Offsets measure from the session's `created_at`, not the first event.** The console's own create
   flow sends the first message from the session view, so a real pre-first-message idle interval
   exists and a first-event origin would hide it (review finding, PR #25).
3. **Unknown events render honestly, never blank** — a muted, truncated JSON preview. Deliberate
   forward-compatibility: outcome events become legible the day a platform serves them.
4. **No search box.** The reference's `Search by name or exact ID` implies a server search the wire
   does not have, and faking it over one loaded page would lie about its scope. Recorded divergence.
5. **The equivalent-curl block uses `$PLATFORM_BASE_URL` / `$PLATFORM_API_KEY` placeholders.** The
   browser knows neither (principle 2) and must not; the value is teaching the wire shape.
6. **`default_config` is a first-class editor control**, emitted compactly, and round-trips
   externally-authored shapes unchanged (pinned by regression test).
7. **Created-time filters are presets, not date pickers** — All / 24 h / 7 d / 30 d onto
   `created_at[gte]`, matching the reference's own control.

## Declined (with reasons)

- **Timeline colour-band strip** (the reference's per-event gantt) — highest effort, purely
  aesthetic; deferred to a follow-up issue.
- **Session `stats` chip and per-tool durations** — both need platform work (stats render empty; no
  tool-execution spans). Platform-repo issues, not console work.
- **Describe→generate, "Ask Claude", model-written summaries** — all need a model credential in the
  console. Adding one breaks the key posture (principle 2) and wire-neutrality (principle 3).
- **Multi-agent lanes, Deployments, Memory stores** — platform post-v1; principle 1 keeps them out.
- **Batch-select checkboxes** — no bulk wire operations exist; selection with nothing to apply is
  ceremony.
