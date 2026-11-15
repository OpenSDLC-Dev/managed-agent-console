# STATE.md — Active work

Conventions: [CLAUDE.md](./CLAUDE.md) · changes: [CHANGELOG.md](./CHANGELOG.md).

## Active work

### Owner verification

Owner verification of the live Session / child SSE alignment from
[recordings #8](https://github.com/OpenSDLC-Dev/managed-agents-wire-recordings/issues/8):
reconnect reconciliation, preview lifecycle and transcript cards on platform
0.4.0 with console 0.7.0, after [release #121](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/121)
and local Docker delivery. Preserve the #7 acceptance fixture.

Reference facts and capability boundaries: [docs/design-reference.md](./docs/design-reference.md).

Stop after delivery. Scheduled execution #9 and OAuth #10 remain deferred.

### Platform plan 69 slice 4

Organization model limits, principal usage and current owner-role inference access.
Slice 3 [PR #254](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/254) merged.
Release hold: no SemVer release until platform plan 69 slice 7. Do not merge a release-please PR or dispatch release.yml.

## Tasks

- [ ] Separate principal totals and retain each request's credential attribution.
- [ ] Show owner-role model access and cookie-only organization model budgets.
- [ ] Complete checks, native browser acceptance, light/dark surface shots and independent review.
- [ ] Deliver the companion PR with the [platform slice 4](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/codex/plan-69-slice-4/STATE.md), settle CI and review threads, then squash merge.
