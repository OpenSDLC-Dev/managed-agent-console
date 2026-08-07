# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**None.** Plan 05 (release management) completed and archived 2026-08-08; summary in [docs/HISTORY.md](./docs/HISTORY.md), as for plans 01–04.

The console releases itself now: Conventional-Commit PR titles feed release-please, which keeps a release PR open; `pnpm release:prepare X.Y.Z` files the changelog section a release ships with; merging that PR tags, publishes the Release with the section as its body, and pushes a multi-arch image to `ghcr.io/opensdlc-dev/managed-agent-console`. The steps are in [docs/releasing.md](./docs/releasing.md).

One thing still needs a human, once: the GHCR package is **private on first publish** and must be flipped to public in package settings, or the README's `docker run` fails for anyone outside the org.

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
