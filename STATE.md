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

### Platform plan 69 slice 5

Administrator selection of a service account for future scheduled deployment sessions.
Source acceptance, independent review and CI passed for [PR #259](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/259).
Evidence: [native acceptance](./docs/HISTORY.md#platform-plan-69-slice-5--local-source-checks).
Release hold: no SemVer release until platform plan 69 slice 7. Do not merge a release-please PR or dispatch release.yml.

## Tasks

- [x] Add the native administrator-only deployment initiator setting.
- [x] Verify cookie/CSRF writes, persistence, pause state and manual-run authority.
- [x] Complete local checks, native light/dark shots, independent review and CI.
