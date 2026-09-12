# STATE.md — Active work

Conventions: [CLAUDE.md](./CLAUDE.md) · changes: [CHANGELOG.md](./CHANGELOG.md).

## Active work

**Reference interaction acceptance** — [#141](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/141).
Reference: managed-agents-wire-recordings, 2026-09-12-console-141, ec8c4c6.

- [x] Inspect populated recordings and verify their integrity.
- [x] Deliver Vault first credentials (#158), direct approvals (#159) and Memory workspace (#160).
- [x] Deliver Agent list inspection (#161) and inline configuration/version/resource views (#162).
- [x] Deliver Session list inspection (#163), transcript/approval workspace (#164) and nested resource previews (#165).
- [x] Deliver timeline/Thread after green CI/review and squash merge (#166), including overlap review fix.
- [x] Deliver Deployment list inspection after green CI/review and squash merge (#167).
- [x] Implement Deployment inline configuration, resource edits and run/Session inspection.
- [x] Verify drafts, resource replacement, upload locking and unavailable run/Session components.
- [x] Support the platform's persisted plain-string user messages after a real wire mismatch surfaced in browser tests.
- [x] Verify 42 affected Chrome surfaces in both themes, including configuration, run/Session inspection, creation selection labels and narrow layouts.
- [x] Complete integrated coverage (1,296 tests, 85.90% branches) and browser regression; fix archived keyboard scrolling and pass all 22 affected browser cases.
- [ ] Complete Deployment workspace CI/review and squash merge.
- [ ] Complete combined Docker/Chrome acceptance within implemented platform capabilities.

Reference facts and capability boundaries: [docs/design-reference.md](./docs/design-reference.md).
