# Changelog

Notable changes, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); each entry is the one place a change's narrative is written.

This file holds the cycle in progress. **Released cycles live in [docs/changelog/](./docs/changelog/)**, one file per version — entries here are narrative paragraphs, and a single file accumulating them would make every reader pay for the whole project's history to see what changed this week.

## [Unreleased]

Two plans drafted for the console half of the platform's SSO and RBAC work: [plan 07](docs/plan/07_console-issued-keys.md) builds the credential-issuance surfaces (environment keys, API keys), and [plan 08](docs/plan/08_console-sso-rbac.md) adds a browser OIDC login and forwards the signed-in operator's own token in place of the management key on user-initiated calls, keeping the `x-api-key` path intact for the deployment's own health check and for identity-disabled deployments. Neither is approved yet — each opens with the decisions its author could not make alone, and plan 08's first one is worth naming: the platform's plan 31 assigns this repo a topology in which the browser calls the platform directly, which discards the mechanism the console's principle 2 names, though not the guarantee behind it.

Plan 07 carries a recording of the reference console's key-management dialect, made in Chrome on 2026-08-14 against a live Admin session. It confirms the paths the platform already mirrored, adds the request bodies for both issuance calls, and documents how the reference gates its UI — a bootstrap capability manifest of `{permission, status}` pairs rather than a role name. Plan 08's D4 asks the platform for a `me` route and, absent one, ships optimistic UI with a 403 toast; whether that route should carry permissions or a role is an open decision there. The recording was taken without minting anything: submissions were intercepted and refused, and the account's credential lists were re-read afterwards to prove it.

## Released

- [0.5.0](docs/changelog/0.5.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.4.0...v0.5.0)
- [0.4.0](docs/changelog/0.4.0.md) — 2026-08-09 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.3.0...v0.4.0)
- [0.3.0](docs/changelog/0.3.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.2.0...v0.3.0)
- [0.2.0](docs/changelog/0.2.0.md) — 2026-08-08 · [compare](https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.1.0...v0.2.0)
- [0.1.0](docs/changelog/0.1.0.md) — 2026-08-07 · [tag](https://github.com/OpenSDLC-Dev/managed-agent-console/releases/tag/v0.1.0)

[Unreleased]: https://github.com/OpenSDLC-Dev/managed-agent-console/compare/v0.5.0...HEAD
