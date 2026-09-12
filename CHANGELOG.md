# Changelog

Notable changes, newest first, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. This file holds the **cycle in progress**; released cycles are filed under
[docs/changelog/](./docs/changelog/), one per version, and are not edited afterwards.

## [Unreleased]

### Fixed

- Session inspection and transcripts accept the platform's persisted plain-string user messages, including newly started Deployment runs.

- Session approvals now offer direct Approve/Deny actions, retain optional denial reasons in a secondary menu, and stop showing resolved calls or custom-result requests as pending approvals.

- Schedule presets use a 12-hour clock with keyboard-operable AM/PM controls, preserving midnight and noon in the submitted cron expression.

- Environment detail and editing follow the reference section layout, with package-manager rows, metadata key/value rows and network switches. Removing metadata preserves platform patch semantics; failed saves retain the draft.
- Custom tool schema drafts support Tab indentation and Escape-then-Tab focus exit, including inside the Agent creation dialog.

### Added

- Deployment rows and exact lookup open a resizable inspector with pinned Agent details, initial events, server schedule timestamps and resource metadata. Rendered/API views and previous/next selection retain list filters and paging.

- Deployment configuration edits in place with pinned Agent versions, complete resource editing, draft protection and Save/Discard. Runs open a Session inspector with run metadata, server filters and a return link to the selected run.

- Session resources expand bound Memory trees and show Markdown/Raw content, file metadata and repository details in place. Downloadable outputs offer downloads and bounded text previews; ordinary uploads retain the platform's content restriction.

- Session timelines provide zoom, exact event inspection and a full-trace JSON download. Thread details expose pinned Agent/model metadata, served usage counters and per-request input-token charts.

- Session details present message and tool cards with inline approvals beside a resizable inspector for Session, Events, Tools, Resources and Threads. Transcript search and exact event inspection retain the complete persisted trace.

- Agent details edit configuration in place with Discard and Save new version, historical version selection, scoped Session/Deployment tabs and a prefilled Start session dialog. Drafts retain their original version across refreshes and conflicts.

- Session rows and exact lookup open a resizable inspector with current metadata, linked resources, recent persisted events and API responses. Selection and closing preserve list filters and pagination.

- Agent rows and exact-ID lookup open a list inspector with version, tool permissions, skills and pinned multiagent members. Rendered/API views, previous/next navigation and resizing retain list filters and history.

- Memory stores open a list inspector and a folder/content workspace. Memories have Markdown and raw previews, downloads and inline editing with conflict-safe saves and draft navigation protection.

- Vault creation continues to an optional first-credential step. Skipping retains the vault; failed credential saves retry against the same vault. Credential networking has explicit Limited and Unrestricted controls.

- Created filters support custom date ranges and local-day presets. Agent, Session, Memory-store and Deployment list selections survive reload, detail navigation and browser history.

- Sessions offer exact-ID lookup, deployment filtering, multiple runtime statuses with an Active default, and server-backed creation-time sorting.

- Agent drafts prompt before leaving through navigation, cancellation, modal close or template replacement; Stay preserves edits, and reload uses the browser confirmation.

- Session and deployment creation share a Resource menu for repository, file and
  memory attachments. Memory instructions support multiple lines, and file uploads
  complete before creation is enabled.

- Memory-store and deployment lists support exact-ID lookup; memory stores gain
  creation-time filtering and deployments gain an Agent filter. Both lists show
  Created, with deployment schedules under Trigger.

- Deployment schedules offer searchable timezone selection and retain custom
  platform-supported timezone identifiers. Suggestions show their current GMT offsets.

- Environments open in a resizable inspector with exact-ID lookup and an API view.
  Selected rows support confirmed archive/delete with partial-failure retry, and
  detail editing saves or cancels in place with multiline descriptions.

- Deployments and memory stores can be created without leaving their lists.
  Deployment forms provide a plain initial-message editor and manual/schedule
  controls while retaining advanced events and metadata.

- Agent lists can open an exact ID beyond the loaded page. Sidebar and group
  preferences survive reloads, compact groups open flyouts, and phone navigation remains temporary.

- Agent forms now edit custom tools and MCP servers with permissions directly,
  preserve Raw-only fields, and attach skills through a paginated picker.

- Skills open in a resizable inspector with exact-ID lookup, shareable selection,
  previous/next navigation and an API view while preserving the list and version actions.

- Credential vaults and their credentials now have complete operator workflows:
  metadata-aware create/edit, credential detail and rotation, archive/delete,
  archived filtering and exact environment-variable, bearer and OAuth settings.

- Dreams can be created from one memory store and 1–100 session transcripts,
  then inspected, canceled while active and archived after reaching a terminal
  state. Lists expose status, inputs and output behavior without starting a
  model run during test verification.

- Session details display typed outcome evaluations and their dedicated trace
  events. Operators can define text- or file-rubric outcomes with the
  platform's iteration budget and see progress, verdicts and explanations.

- Session and deployment resource forms suggest active memory stores by name
  while keeping direct ID entry available for large or temporarily unavailable
  catalogs.

- Memory stores can be created, edited, archived and deleted. Operators can
  browse paths, create and edit durable text memories with SHA-256 concurrency
  protection, inspect attributed version history, redact old versions and keep
  tombstones visible after deleting live content.

- Deployments can be created and edited with version-pinned agents, initial
  events, resources and optional Cron schedules. Operators can pause, resume,
  run and archive them, inspect upcoming runs and follow each persistent run to
  its session or platform error.

- Agents can be configured as coordinators with an ordered, version-pinned
  roster. Session details list primary and child threads, switch to each
  thread's live trace, route approvals and interrupts to the selected child,
  and archive idle child threads.

- Sessions can attach and remove uploaded-file resources, and can be created
  with GitHub repository or memory-store attachments. Repository tokens are
  write-only and rotatable; the console never renders them.

### Fixed

- Files follow the platform cursor across deleted boundary rows and accept its current metadata shape. Session deletion warns that outputs are removed and refreshes file lists and rubric suggestions; uploads and direct file deletion refresh those suggestions too.

- Dashboard now centers its responsive cards, exposes primary shortcuts and uses
  the reference's heading hierarchy. The sidebar folds into a compact rail and
  keeps navigation and its footer within the viewport.

- Keyboard focus remains visible in resource action menus, select popups, the
  session composer and the command palette, with arrow-key navigation and
  Escape focus restoration for row actions.

- Skills now use the platform's GA names, source objects and version IDs across
  lists, details, agent selection, search and uploads. Version history is paged;
  deleting a skill warns that all versions are removed, while the platform
  protects a skill's last version from individual deletion.

### Testing

- Added a model-free Vault/credential live contract plus mock, component,
  end-to-end and Chrome fidelity coverage for write-only secret lifecycles.

- Added wire-schema, mock lifecycle, end-to-end and Chrome fidelity coverage
  for Dreams. The live tier limits itself to the collection probe because a
  real create starts a billed model-backed consolidation run.

- Added mock and model-free local coverage for outcome acceptance, the
  single-active rule and interrupt settlement.

- Added mock and model-free local contracts for memory-store metadata patches,
  path rollups, optimistic writes, retained delete history, redaction and
  archive read-only behavior.

- Added a model-free local Skills contract suite covering upload, version reads,
  cursor paging, archive download and deletion against an actual platform.
- The screenshot walker follows the configured landing route after sign-in,
  fixing its timeout after the Dashboard became the landing page.

### Security

- Local contract requests refuse redirects so their management key cannot be
  forwarded to a redirect destination.

- **The runtime image refreshes its Alpine packages at build time**, clearing CVE-2026-14456 in
  `libcrypto3`/`libssl3`. `node:24-alpine` is rebuilt on Node's cadence, not Alpine's, so it carries
  a superseded OpenSSL for days after Alpine has shipped the fix — long enough to red the trivy gate
  on every PR and every release build.

### Added

- Session details now support title and metadata edits, archive and confirmed
  deletion, with platform errors shown when an operation is refused.
  Metadata-only edits preserve concurrent title changes by other operators.

- **A Dashboard, and it is where the console opens.** A static landing page: one card per surface the
  deployment serves, under the sidebar's own group headings and in its order, so the two cannot
  drift. It reads no platform data — only the surface probe the shell already runs, because a card is
  a link and a link to an unserved surface goes nowhere useful. `/` redirects here rather than to
  `/agents`, and **so does signing in** — both, and the nav's first row, from one constant
  (`src/lib/routes.ts`), because a sign-in never passes through `/` and the two had drifted apart on
  the first pass.

### Changed

- Background Agent refreshes retain the current edit draft and optimistic version until the operator explicitly reloads.

- List filters permanently reset pagination, including when returning to a previous filter. Deployment page actions wrap on narrow screens.

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
