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
- [x] Add multiagent interfaces: ordered Agent rosters, Session thread traces,
      child approvals and interrupts, and idle-child archival.
- [ ] Add deployments, memory stores and outcome interfaces.
- [ ] Complete interaction parity and Chrome fidelity checks.
- [ ] Pass the contributor gate and PR review for each slice.

Skills PR #128, session lifecycle PR #130 and session resources PR #131 are
merged. Multiagent PR #132 replaces the stale null-only wire assumptions and
passes the local contributor gates, 69 end-to-end cases, 88 two-theme fidelity
shots, a Docker build and the real platform's model-free write contract. Remote
CI and review remain.
