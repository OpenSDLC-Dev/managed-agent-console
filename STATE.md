# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan [02_quality-guardrails](./docs/plan/02_quality-guardrails.md)** (`in-progress`, issue #11) — cross-platform dev, hardened CI, Codex as second reviewer, 90%+ coverage. (Plan 01 is archived and live-accepted; see [docs/HISTORY.md](./docs/HISTORY.md).)

## Tasks

- [x] Slice 1 — .gitattributes + 3-OS CI matrix, zero-warning lint, SHA-pinned actions, Dependabot, CodeQL, trivy (caught 6 real CVEs on day one), Playwright failure artifacts, a11y smoke (caught 5 unlabeled controls); branch protection + secret scanning — PR #12
- [x] Slice 2 — coverage gate ≥90% in CI; suite 20 → 415 tests, 99.6% lines / 96.8% branches (baseline 10.3%)
- [ ] Slice 3 — Codex review workflow (blocked on operator: `OPENAI_API_KEY` secret or Codex GitHub App)
