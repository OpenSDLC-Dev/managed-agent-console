# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan 05 — release management** ([docs/plan/05_release-management.md](./docs/plan/05_release-management.md), `approved`, drafted and approved 2026-08-07). All four slices have landed; what remains is the release that exercises them.

- [x] Slice 1 — cut v0.1.0 by hand; tag and GitHub Release published
- [x] Slice 2 — publish the image (native amd64 + arm64, trivy gate before push, GHCR)
- [x] Slice 3 — automate the cut (release-please with `skip-changelog`, `pnpm release:prepare`, Conventional-Commit PR titles)
- [x] Slice 4 — the console shows its version in the sidebar (28 surfaces re-shot in both themes)
- [ ] **Cut 0.2.0** — this PR files the section; merging release PR #46 then tags, publishes the Release with that section as its body, and pushes the image. The plan archives once that has actually run, not before.
- [ ] Flip the GHCR package to **public** by hand — until then README's `docker run` fails for anyone outside the org.

Plan 04 (verification hardening, issue #31) completed and archived 2026-08-07; summary in [docs/HISTORY.md](./docs/HISTORY.md). Plans 01–03 archived there too.

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
