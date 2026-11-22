# Changelog

Notable changes, newest first, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. This file holds the **cycle in progress**; released cycles are filed under
[docs/changelog/](./docs/changelog/), one per version, and are not edited afterwards.

## [Unreleased]

### Added

- Playground runs a prompt against configured chat models and streams the answer. Administrators can approve access for the `user` role in Members. [Platform #995](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/995)

### Changed

- The Dashboard shows recorded gateway usage and compares four integrated models. Each model card opens a dialog with its specifications, prices and copyable ID. Use a configured gateway alias in Playground or a new agent draft, or open the model's full Console guide.
- Search active or archived service accounts across the directory. Copy an account ID, edit its description or role, inspect and issue its API keys, or open a shareable detail page. Unfinished creation forms now prompt before dismissal.
- Deleted API keys disappear from the Keys page and its filters. Platform retains their history for administrative queries.
- Search, filter and inspect API keys, manage them from the row or details panel, and open their month-to-date gateway costs. Key creation now starts with CLI sign-in or an account-linked API key.
- Work on an issue without a plan now starts with an independent, read-only difficulty review.
- Issue reports now use GitHub's Bug, Feature and Task types. Two labels show priority and difficulty.
- Open Playground from Build → Messages or the Dashboard resource card. Edit and run a request beside its rendered or raw response, inspect token usage, and add the answer to the next turn.
- Group console navigation under Build and Organization, with dedicated submenu panels and a full-width return to all sections. Place Model Gateway directly after Keys in Organization. Move search into the global header.
- Open the first available destination from desktop group links, show the active page beside its group and open narrow navigation from the header.
- Keep the desktop sidebar expanded and follow system appearance. The account menu shows the running Platform version and updates after an upgrade. The Console version appears on its own line. The status dot turns red when the platform is unreachable.
- Identify a development build by its base release and eight-character commit in the account menu, for example `v0.9.1-dev-41a8318b`.

## Released

- [0.9.1](docs/changelog/0.9.1.md) — 2026-11-19 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.9.0...v0.9.1)
- [0.9.0](docs/changelog/0.9.0.md) — 2026-11-18 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.8.2...v0.9.0)
- [0.8.2](docs/changelog/0.8.2.md) — 2026-10-12 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.8.1...v0.8.2)
- [0.8.1](docs/changelog/0.8.1.md) — 2026-10-04 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.8.0...v0.8.1)
- [0.8.0](docs/changelog/0.8.0.md) — 2026-10-04 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.7.0...v0.8.0)
- [0.7.0](docs/changelog/0.7.0.md) — 2026-09-17 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.6.0...v0.7.0)
- [0.6.0](docs/changelog/0.6.0.md) — 2026-08-16 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.5.0...v0.6.0)
- [0.5.0](docs/changelog/0.5.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.4.0...v0.5.0)
- [0.4.0](docs/changelog/0.4.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.3.0...v0.4.0)
- [0.3.0](docs/changelog/0.3.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.2.0...v0.3.0)
- [0.2.0](docs/changelog/0.2.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.1.0...v0.2.0)
- [0.1.0](docs/changelog/0.1.0.md) — 2026-08-07 · [tag](https://github.com/OpenSDLC-Dev/managed-agent-console/releases/tag/v0.1.0)

[Unreleased]: https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.9.1...HEAD
