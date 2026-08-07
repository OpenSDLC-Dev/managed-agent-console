# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan 05 — release management** ([docs/plan/05_release-management.md](./docs/plan/05_release-management.md), `approved`, drafted and approved 2026-08-07). The console had never been released — no tag, no GitHub Release, and clone-and-build as the only path to a running instance. Slice 1 lands the first cut; the rest makes releases repeatable and the image pullable.

- [x] Slice 1 — cut v0.1.0 by hand (Keep-a-Changelog frame, dated section, compare footer). The `v0.1.0` tag and its GitHub Release are created on `main` at this slice's squash-merge; new work accumulates under CHANGELOG's `[Unreleased]`.
- [x] Slice 2 — publish the image (OCI labels, native amd64 + arm64 build, trivy gate before push, GHCR, README quickstart). Two one-time steps at merge: dispatch `release.yml` against `v0.1.0`, then flip the GHCR package to public.
- [x] Slice 3 — automate the cut (release-please with `skip-changelog`, `pnpm release:prepare`, Conventional-Commit PR titles). Proven end to end: release PR #46 (`chore(main): release 0.2.0`) was opened by `opensdlc-console-release[bot]`, collected CI checks, and touched only `package.json` + the manifest. It stays open until the rest of plan 05 lands.
- [x] Slice 4 — the console shows its version in the sidebar (28 surfaces re-shot in both themes)

Remaining before the plan closes: cut 0.2.0 (`pnpm release:prepare 0.2.0`, then merge #46), which is what exercises the whole pipeline end to end. The GHCR package still needs flipping to public by hand — until then the README's `docker run` fails for anyone outside the org.

Plan 04 (verification hardening, issue #31) completed and archived 2026-08-07; summary in [docs/HISTORY.md](./docs/HISTORY.md). Plans 01–03 archived there too. The console is feature-complete against the platform's implemented surface, with 515 unit / 39 e2e / 5 live tests, a 28-surface fidelity manifest, and a probe ratchet.

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
