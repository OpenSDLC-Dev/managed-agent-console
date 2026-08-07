# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**None.** Plan 04 (verification hardening, issue #31) completed and archived 2026-08-07; summary in [docs/HISTORY.md](./docs/HISTORY.md). Plans 01–03 archived there too.

The console is feature-complete against the platform's implemented surface, with 515 unit / 39 e2e / 5 live tests, a 28-surface fidelity manifest, and a probe ratchet.

Open backlog items live in GitHub issues. Two carried out of plan 04:

- #33 — principle 3's feature detection is stated but not implemented: every 404 renders as `ErrorState`, so "the platform lacks this capability" and "this resource does not exist" are indistinguishable.
- #37 — primary-button padding drift found by the slice-4 fidelity pass: `px-2.5` (10px) against the reference's 12px. Deliberately not fixed in a tooling PR — the class sits on the shared default button size and would move every surface.
