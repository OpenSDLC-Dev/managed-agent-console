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

### Fixed

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
