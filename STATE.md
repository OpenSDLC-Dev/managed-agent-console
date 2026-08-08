# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**[Issue #33](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/33) — principle 3's feature detection.** No plan file; the issue is the spec.

- [x] Step 1 — what the platform returns for an unimplemented surface: **404 `not_found_error`, never 501**, indistinguishable from a real miss except by route (findings on the issue).
- [x] Step 2 — the detection rule and session probe (`src/lib/platform/surfaces.ts`).
- [x] Step 3 — nav, command palette, and the six collection pages hide instead of erroring; a test per surface.
- [x] Step 4 — mock-platform `__unimplemented` mode + e2e proving the hiding.

Plan 05 (release management) completed and archived 2026-08-08; summary in [docs/HISTORY.md](./docs/HISTORY.md), as for plans 01–04.

The console releases itself now. Conventional-Commit PR titles feed release-please, which keeps a release PR open; `pnpm release:prepare X.Y.Z` files the changelog section a release ships with; merging that PR tags, publishes the Release with that section as its body, and pushes a multi-arch image to `ghcr.io/opensdlc-dev/managed-agent-console`. Steps in [docs/releasing.md](./docs/releasing.md). **0.2.0 went out that way** on 2026-08-08.

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
