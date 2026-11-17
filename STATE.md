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

### Platform plan 69 slice 7

Remove Console-local authentication, credential proxying and obsolete model-key policy controls.
Slice 6 companion delivery passed independent live acceptance on 2026-11-17 ([platform PR #1046](https://github.com/OpenSDLC-Dev/managed-agent-platform/pull/1046)).
Contract: [platform plan 69](../managed-agent-platform/docs/plan/69_principal-bound-auth.md), decisions 3/5 and slice 7.
Release hold: no SemVer release until platform plan 69 slice 7. Do not merge a release-please PR or dispatch release.yml.

## Tasks

- [x] Keep only platform cookie/CSRF login and transport; remove legacy model grants and key-policy controls.
- [x] Migrate mock, native, live and fidelity fixtures; retain streaming, downloads and current-authority checks.
- [x] Retire the separate deployment owner and update operator guidance; preserve image publication.
- [ ] Complete coverage, Chrome fidelity, independent review, CI and companion platform delivery.
