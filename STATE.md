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

### Platform plan 69 slice 2

[PR #246](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/246) is open; remote CI, merge and publication remain pending.
Release hold: no SemVer release until platform plan 69 slice 7. Do not merge a release-please PR or dispatch release.yml.

## Tasks

- [x] Local independent checks, task review and precommit prose closure: [evidence](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/246#verification).
- [x] Committed medium-effort review of `3998c621`: no merge-blocking correctness findings ([evidence](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/246#verification)).
- [ ] Finish the companion PR and CI, then merge.
- [ ] After merge, verify the full-SHA multi-arch registry digest before platform deployment wiring.
