# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan [01_v1-console](./docs/plan/01_v1-console.md)** (`in-progress`) — approved 2026-08-02 with one scope addition (raw editor gets a JSON↔YAML toggle in v1). Currently on **slice 2: read-only resource pages**.

## Tasks

- [x] Slice 1 — Next.js scaffold (TS strict, Tailwind, shadcn), toolchain, CI, Dockerfile, BFF proxy, login gate, nav shell, connection probe — PR #1 (unit 5/5, e2e 4/4, Chrome fidelity pass vs reference)
- [x] Slice 2 — read-only resource pages — part 1 (agents/environments/sessions + trace viewer) PR #2; part 2 (vaults/skills/files) PR #4 (e2e 12/12, fidelity pass)
- [ ] Slice 3 — live session trace + HITL
- [ ] Slice 4 — write paths (incl. JSON↔YAML raw editor)
- [ ] Slice 5 — polish + deploy docs
