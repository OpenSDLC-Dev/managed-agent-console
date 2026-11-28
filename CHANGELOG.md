# Changelog

Notable changes, newest first, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. This file holds the **cycle in progress**; released cycles are filed under
[docs/changelog/](./docs/changelog/), one per version, and are not edited afterwards.

## [Unreleased]

### Added

- Browse complete conversation turns in Session Quickview and the full transcript. Tool confirmations and results stay with the originating call across later messages.

- Manage workspaces in Settings, assign user and service-account roles, and switch workspaces from the sidebar. Workspace administrators can issue keys for eligible service accounts in their workspace.

- Workspace links preserve the selected workspace through navigation, reload and sharing. Independent browser tabs and resource caches follow their own workspace grants.

- Agents opens on a workspace activity report. The Create page supports template previews, model-assisted draft refinement and explicit creation, with environment and session setup. The directory opens its standalone configuration page.

- Resources opens on the Default workspace overview with file and skill counts, recent records, links to each library and an Add menu.

- Claude Code, Codex and Antigravity CLI now share repository instructions, scoped rules, skills and independent review roles. Look for the startup hook's drift-check receipt in each new session. If it is missing, run the doctor manually and verify the hook in a fresh session.

- Playground can request Bash, desktop, browser, web search and web fetch tools. Inspect the arguments and enter results to continue the conversation. DeepSeek Flash returns web results directly. Each tool has a starter template.

- Messages now opens on Overview with usage, recent API keys and resources. Logs shows direct Messages requests and Playground runs with a copyable request ID and a shareable details drawer.

- Playground runs a prompt against configured chat models and streams the answer. Administrators can approve access for the `user` role in Members. [Platform #995](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/995)

### Changed

- Spending & usage labels its destination **API usage**. Usage filters show their label and value together. Dropdowns throughout the Console leave room for the arrow and selection mark, including on narrow screens.

- **Breaking page URL change.** Agents, Messages, Playground, Resources and Dreams now open under `/workspaces/default/`. Organization keys, members and service accounts open under `/settings/`. Replace bookmarks to the retired flat pages, which return HTTP 404.

- The Agents directory opens a centered creation form with six starting templates, description generation, model settings, editable YAML and JSON, collapsed optional sections and a persistent action bar. The Agents sidebar now reads Memory and Credential vaults.
- The Agents overview Create menu fits all five destinations on one line each at desktop and mobile widths.

- Files and Skills support exact-ID lookup, shareable detail drawers, staged uploads and confirmed single or bulk deletion. Selecting rows shows the count, clear control and Delete in a floating bar at the bottom of the list pane. Custom skills can be updated from the list or drawer.

- Playground puts model settings in a drawer and separates adding tools from adding messages. The two client-tool templates fill the request, keep the selected model and allow inspection of streamed tool arguments.
- Messages Logs distinguishes the originally requested model from the gateway alias that handled it.

- Playground lets you edit cURL and JSON requests, keep edits when switching back to Form and choose streaming or a single JSON response.

- Model cards, model comparisons and model guides read each deployment's rates and pricing terms from Model Gateway. Operators can record the currency and terms when editing an upstream model.
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

### Fixed

- The Sessions All filter includes terminated and archived sessions. Refreshing, sharing a paged list and returning through browser history restore its page and filters.

- Restore color to usage charts, resource and event icons, and syntax in agent configuration, Playground requests and API previews in both themes. Copy and edit preserve the original source.

- Header search now shows page breadcrumbs and popular Claude guides. Search results group documentation, accessible workspaces and resources, and opening a result takes you to the selected workspace.

- Refreshing the Agents directory or opening its URL now restores the current page and filters.

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
