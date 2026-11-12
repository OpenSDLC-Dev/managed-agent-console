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

Principal-owned key behavior and the Task 3 review repairs are independently verified.
Native client acceptance and the clock-recovery, native-cache and probe-initialization cleanup repairs passed independent checks. Companion delivery remains pending.
Slice 2 [PR #246](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/246) merged. Its published-image acceptance and limits are in the [platform history](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/HISTORY.md#plan-69-slice-2-browser-acceptance).
Release hold: no SemVer release until platform plan 69 slice 7. Do not merge a release-please PR or dispatch release.yml.

## Tasks

- [x] Verify the Task 3 review repairs, including [native checks](./test/native/contract.spec.ts) and [failure controls](./test/native/failure-artifacts.test.mjs).
- [x] Complete Task 3 committed source review at `e9a383a`.
- [ ] Verify the review follow-ups, then complete prepublication source review and companion delivery. The [platform state](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/feat/plan-69-slice-3-owned-keys/STATE.md) tracks final source/image pairing and packaged acceptance.
