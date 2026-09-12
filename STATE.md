# STATE.md — Active work

Conventions: [CLAUDE.md](./CLAUDE.md) · changes: [CHANGELOG.md](./CHANGELOG.md).

## Active work

**Reference interaction acceptance** — [#141](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/141).
Reference: managed-agents-wire-recordings, 2026-09-12-console-141, ec8c4c6.

- [x] Inspect populated recordings and verify their integrity.
- [x] Deliver Vault first credentials (#158), direct approvals (#159) and Memory workspace (#160).
- [x] Deliver Agent list inspection (#161) and inline configuration/version/resource views (#162).
- [x] Deliver Session list inspection (#163), transcript/approval workspace (#164) and nested resource previews (#165).
- [x] Implement timeline/zoom/download and Thread metadata/usage; local integrated browser and Chrome checks pass.
- [x] Fix overlapping timeline markers found in review and verify pointer selection at both scales.
- [x] Deliver timeline/Thread after green CI/review and squash merge (#166).
- [x] Implement Deployment list inspection, including related resources and raw API views.
- [x] Verify Deployment inspector coverage: 1,280 tests, 85.88% branches before timeline integration.
- [x] Verify integrated Deployment inspector browsers (153 cases), 11 Chrome surfaces in both themes, and probes.
- [ ] Complete Deployment inspector CI/review and squash merge.
- [ ] Complete Deployment full editor and run inspection.
- [ ] Complete combined Docker/Chrome acceptance within implemented platform capabilities.

Reference facts and capability boundaries: [docs/design-reference.md](./docs/design-reference.md).
