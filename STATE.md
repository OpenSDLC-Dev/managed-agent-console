# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan 05 — release management** ([docs/plan/05_release-management.md](./docs/plan/05_release-management.md), `approved`, drafted and approved 2026-08-07). The console has never been released: no tag, no GitHub Release, and clone-and-build as the only path to a running instance.

- [ ] Slice 1 — cut v0.1.0 by hand (Keep-a-Changelog frame, dated section, compare footer; tag on `main` after merge)
- [ ] Slice 2 — publish the image (OCI labels, native amd64 + arm64 build, trivy gate before push, GHCR, README quickstart)
- [ ] Slice 3 — automate the cut (release-please with `skip-changelog`, `changelog:cut` script, Conventional-Commit PR titles) — **blocked**: needs the GitHub App credential the maintainer is creating (plan decision 3)
- [ ] Slice 4 — the console shows its version in the sidebar (28-surface fidelity re-shoot)

Plan 04 (verification hardening, issue #31) completed and archived 2026-08-07; summary in [docs/HISTORY.md](./docs/HISTORY.md). Plans 01–03 archived there too. The console is feature-complete against the platform's implemented surface, with 515 unit / 39 e2e / 5 live tests, a 28-surface fidelity manifest, and a probe ratchet.

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
