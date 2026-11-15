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
The reviewed Console companion is ready for platform slice 4 integration.
Release hold: no SemVer release until platform plan 69 slice 7. Do not merge a release-please PR or dispatch release.yml.

## Tasks

- [x] Separate principal totals and retain each request's credential attribution.
- [x] Show owner-role model access and cookie-only organization model budgets.
- [x] Complete local checks, native browser acceptance and light/dark surface shots ([record](./docs/HISTORY.md#platform-plan-69-slice-4--local-source-checks)).
- [x] Complete independent review and CI for [PR #255](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/255).
- [x] Bound repeated-signal fixture startup separately from cleanup, with delayed-start controls for slow runners.
