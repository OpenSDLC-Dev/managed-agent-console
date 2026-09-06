# STATE.md — Active work

What is being worked on right now, and how far along. **~30 lines, nothing static.** Conventions:
[CLAUDE.md](./CLAUDE.md) · narrative: [CHANGELOG.md](./CHANGELOG.md) · backlog:
[GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## Active work

**Platform parity** — [plan 09](./docs/plan/09_platform-parity.md), approved 2026-09-05.

- [x] Restore GA Skills and model-free contract coverage; merged in #128.
- [x] Add session title, metadata, archive and delete actions.
- [x] Validate session lifecycle against the real platform and Chrome.
- [x] Add session resource attachments and verify their live file contract.
- [ ] Add multiagent interfaces.
- [ ] Add deployments, memory stores and outcome interfaces.
- [ ] Complete interaction parity and Chrome fidelity checks.
- [ ] Pass the contributor gate and PR review for each slice.

Skills PR #128 and session lifecycle PR #130 are merged.

Session resources: file attachments can be added and removed after creation;
repository and memory-store attachments are creation-only. Targeted unit,
component and local contract runs pass, as does the two-theme resource
fidelity surface. Coverage: 1004 tests passed; e2e: 63 passed plus the corrected
remaining case passed on rerun. Remote contributor gates and review remain.
