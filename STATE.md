# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan 04 — verification hardening** ([docs/plan/04_verification-hardening.md](./docs/plan/04_verification-hardening.md), `approved`, issue #31, drafted and approved 2026-08-07).

- [ ] Slice 1 — wire schemas become the source of truth (zod; `types.ts` → `z.infer`; fixture conformance; one-shot reference-wire audit against `@anthropic-ai/sdk`'s types)
- [ ] Slice 2 — the suite proves it can fail (schema canary + contract-violation fixtures for the trace layer)
- [ ] Slice 3 — semantic `data-*` state attributes replace formatted-text e2e assertions
- [ ] Slice 4 — surface × fixture manifest + screenshot script for the Chrome fidelity pass
- [ ] Open the recorded known gap as its own issue: principle 3's feature detection is stated but not implemented (every 404 renders as `ErrorState`)

Plan 03 (UX parity, issue #24) completed and archived 2026-08-04; summary in [docs/HISTORY.md](./docs/HISTORY.md).
