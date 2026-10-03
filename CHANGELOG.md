# Changelog

Notable changes, newest first, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. This file holds the **cycle in progress**; released cycles are filed under
[docs/changelog/](./docs/changelog/), one per version, and are not edited afterwards.

## [Unreleased]

### Security

- Upgrade Next.js to 16.3.6 to address remote code execution in `next/og ImageResponse`
  ([GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), #183).
- The BFF forwards the console namespaces (`/api/oauth/…`, `/api/console/…`) only for the
  `default` organization and workspace, the only ones this console manages. Any other value is
  now a 404 from the console itself. The platform will answer a foreign organization UUID with a
  401, as the reference does, and the proxy ends the operator's session on any upstream 401. So,
  with SSO on, a link from another site naming such a UUID would have signed an operator out.
  Deploy this console before the platform release that answers that 401
  ([platform #820](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/820), #187).
- The `/v1` proxy refuses the work API (`/v1/environments/{id}/work…`) with its own 404. That
  surface takes an environment key, so the platform answers an SSO operator's token there with a
  401, and a link from another site could sign the operator out the same way. The console never
  calls it (#187).

### Changed

- A session's own files are listed with the session, following the platform's per-mount copies
  ([platform #578](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/578), #192). Every
  file mount now mints a session-scoped copy, and the unfiltered Files list leaves out every
  session-scoped row, so the session's Resources tab lists them from `GET /v1/files?scope_id=`, as
  the reference console does. A mounted file shows its copy's size, and harvested outputs follow it.
  Only an output offers Download, since `downloadable` is the one signal that tells the two apart,
  and an expired one says so instead. An output, or a copy no resource mounts any more, can be
  deleted there, as outputs could from the Files page before; the platform judges each delete, as
  it deletes a mounted copy too. The rubric picker also suggests the session's own files, labelled apart
  from uploads, and leaves out expired files. The Files page drops its Scope column. In the
  Sessions inspector, a mounted file now opens the session's Resources. Deploy this console with
  platform #578 or later: before it, outputs list on the Files page too and a mounted file shows no
  size.

### Fixed

- A memory store's row in a session's Resources tab no longer offers Remove resource. The platform
  removes a resource only by its `sesrsc_` id, which a memory store does not have, so the request
  always failed with 404 `Resource not found`. The reference answers the same way and shows no
  Remove on that row. A memory store stays attached for the session's lifetime, as a repository
  does. The mock platform now returns that 404 for any id that is not a `sesrsc_` id (#193).
- A session opened by any address but its `sesn_…` id, such as a legacy `session_…` one, is read
  first and moves to the id it answers with, query and hash kept, before its workspace loads. Every
  query and write on the page now keys that one id, so a file attached there, or an outcome
  defined, shows at once rather than at the next poll, and the event history is read and the stream
  opened once rather than under both ids (#192).
- A memory store may omit `archived_at`, as the reference does until the store is archived. The
  console reads a store without the key as live, and the mock platform now serves that recorded
  shape. Deploy this console before any platform release that omits the key
  ([platform #817](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/817), #185).
- A session thread's `stats` and `usage` may be null, as the spec allows before the thread's
  first status transition and first idle. The Threads view shows "—" instead of failing the page.
  Deploy this console before any platform release that serves null
  ([platform #674](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/674), #184).
- Outcome contracts accept a brain-started evaluation and preserve the original failure
  through cleanup; model-bearing outcome and deployment contracts now require a separate
  spend opt-in (#176).
- Deployment workflow header now describes the single platform API key payload and clarifies that
  IAP is specific to this GKE deployment; self-hosters can still use `CONSOLE_PASSWORD` (#177).

## Released

- [0.7.0](docs/changelog/0.7.0.md) — 2026-09-17 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.6.0...v0.7.0)
- [0.6.0](docs/changelog/0.6.0.md) — 2026-08-16 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.5.0...v0.6.0)
- [0.5.0](docs/changelog/0.5.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.4.0...v0.5.0)
- [0.4.0](docs/changelog/0.4.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.3.0...v0.4.0)
- [0.3.0](docs/changelog/0.3.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.2.0...v0.3.0)
- [0.2.0](docs/changelog/0.2.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.1.0...v0.2.0)
- [0.1.0](docs/changelog/0.1.0.md) — 2026-08-07 · [tag](https://github.com/OpenSDLC-Dev/managed-agent-console/releases/tag/v0.1.0)

[Unreleased]: https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.7.0...HEAD
