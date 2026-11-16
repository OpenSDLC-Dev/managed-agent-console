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

### Platform plan 69 slice 6

Issue and revoke keys for every environment, including cloud and archived environments.
Transfer automatic staging deployment to the platform chart; companion delivery remains pending.
Contract: [platform plan 69](../managed-agent-platform/docs/plan/69_principal-bound-auth.md), decisions 3/5 and slice 6.
Prior slice: [PR #259](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/259).
Release hold: no SemVer release until platform plan 69 slice 7. Do not merge a release-please PR or dispatch release.yml.

## Tasks

- [x] Enable cloud and archived environment key management with focused component tests.
- [x] Restrict the legacy deploy workflow to a confirmed manual rollback from `main`; keep image publication automatic.
- [x] Verify real cookie/CSRF issuance and revocation, one-time reveals and native light/dark shots.
- [ ] Complete full checks, independent review, CI and companion platform delivery.
