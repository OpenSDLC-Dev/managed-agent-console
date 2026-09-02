# Changelog

Notable changes, newest first, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. This file holds the **cycle in progress**; released cycles are filed under
[docs/changelog/](./docs/changelog/), one per version, and are not edited afterwards.

## [Unreleased]

### Security

- **The runtime image refreshes its Alpine packages at build time.** `node:24-alpine` is rebuilt on
  Node's cadence, not Alpine's, so its `libcrypto3`/`libssl3` sat at 3.5.7-r0 days after Alpine had
  shipped 3.5.8-r0 — long enough for the trivy HIGH/CRITICAL gate to red every PR and every release
  build on CVE-2026-14456. One `apk upgrade --no-cache` in the runtime stage refreshes what is
  already installed: no new packages, same Alpine minor, so only patch releases are ever pulled. The
  gate keeps its teeth; it just stops failing on a fix that exists.

### Added

- **A Dashboard, and it is where the console opens.** A static landing page: one card per surface the
  deployment serves, under the sidebar's own group headings and in its order, so the two cannot
  drift. It reads no platform data — only the surface probe the shell already runs, because a card is
  a link and a link to an unserved surface goes nowhere useful. `/` redirects here rather than to
  `/agents`, and **so does signing in** — both, and the nav's first row, from one constant
  (`src/lib/routes.ts`), because a sign-in never passes through `/` and the two had drifted apart on
  the first pass.

### Changed

- **The sidebar is grouped, following the reference console's structure.** `Dashboard` and `API keys`
  at the top level, then a `Build` group (Files, Skills) and a `Managed Agents` group (Agents,
  Sessions, Environments, Credential vaults) — the reference's order, and its order inside each
  group. Group headers collapse.
- **Icons moved to where the reference puts them**: on top-level rows and group headers, and off the
  rows inside a group, which pad left instead so every label still lands in one column. Measured in
  Chrome rather than read off a screenshot; the facts and the lucide approximations are in
  [docs/design-reference.md](./docs/design-reference.md).
- **The wordmark is `Agent Console`**, and the `self-hosted console` line under it is gone — the nav
  below now says what kind of console this is by naming what the deployment serves.
- **The nav lives in one place** (`src/lib/nav.ts`). The sidebar and the command palette's "Go to"
  section each carried their own copy of the order and the icons, so the two could list the same
  destinations differently and neither would be wrong.
- **A surface's one-line description lives in the surface registry**, where its page header and its
  dashboard card both read it. `api-keys` keeps its own longer page subtitle, which warns rather than
  describes.

## Released

- [0.6.0](docs/changelog/0.6.0.md) — 2026-08-16 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.5.0...v0.6.0)
- [0.5.0](docs/changelog/0.5.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.4.0...v0.5.0)
- [0.4.0](docs/changelog/0.4.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.3.0...v0.4.0)
- [0.3.0](docs/changelog/0.3.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.2.0...v0.3.0)
- [0.2.0](docs/changelog/0.2.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.1.0...v0.2.0)
- [0.1.0](docs/changelog/0.1.0.md) — 2026-08-07 · [tag](https://github.com/OpenSDLC-Dev/managed-agent-console/releases/tag/v0.1.0)

[Unreleased]: https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.6.0...HEAD
