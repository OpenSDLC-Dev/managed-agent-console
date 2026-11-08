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

### Platform plan 69 slice 3

Principal-owned key behavior and native failure protection are independently verified. Task review and paired delivery remain pending.
Slice 2 [PR #246](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/246) merged. Its published-image acceptance and limits are in the [platform history](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/HISTORY.md#plan-69-slice-2-browser-acceptance).
Release hold: no SemVer release until platform plan 69 slice 7. Do not merge a release-please PR or dispatch release.yml.

## Tasks

- [x] Verify owned-key presentation, environment guards and native browser contracts ([native checks](./test/native/contract.spec.ts), [failure controls](./test/native/failure-artifacts.test.mjs)).
- [ ] Complete task review and paired platform acceptance before companion merge and SHA-image delivery.
