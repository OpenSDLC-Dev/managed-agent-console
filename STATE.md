# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Nothing in flight.** Both halves of the platform's SSO/RBAC work (#56) are archived, each with its acceptance driven against a real stack on 2026-08-14:

- [Plan 07](./docs/plan/07_console-issued-keys.md) — **archived 2026-08-14.** Environment-key and API-key issuance UI. The real `ant beta:worker poll` authenticated on a console-issued key and stopped when the console revoked it; repeatable as `test/e2e-live/keys.spec.ts`.
- [Plan 08](./docs/plan/08_console-sso-rbac.md) — **archived 2026-08-14.** Browser OIDC login and role-aware UI. Against the bundled Casdoor, a `map-viewer` mutation was refused in the platform's own words and a `map-admin` issued an environment key through plan 07's dialog. **D1 is the decision to revisit first if this is reopened** — it resolves a documented conflict over request topology by taking Mode A, where [platform plan 31](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/31_console-sso-rbac.md):320–330 assigns this repo the browser-calls-the-platform-directly shape.

Both narratives, and what their acceptance runs found, are in [docs/HISTORY.md](./docs/HISTORY.md). Plans 01–06 are summarized there too. How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here; #99 is the one this work left behind. Nothing lands in this file until a plan or issue is actually being worked on.
