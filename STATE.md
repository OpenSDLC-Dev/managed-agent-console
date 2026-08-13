# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

Two drafts opened 2026-08-14, both halves of the platform's SSO/RBAC work (#56) landing in this repo. **Neither may leave `draft` until the maintainer settles its decision block.** Each also has one build slice waiting on the platform — plan 07's API-key slice on platform 31 slice 5, plan 08's acceptance slice on platform 31 slice 4 — but every other slice is unblocked.

- [Plan 07](./docs/plan/07_console-issued-keys.md) — environment-key and API-key issuance UI. Trails [platform plan 30](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/30_environment-keys-console-issuance.md), which landed 2026-08-11 and is unconsumed here. Carries the **2026-08-14 reference recording** of both key dialects; that recording is also what platform plan 31 slice 5 declared itself gated on. Decisions open: D1–D3.
- [Plan 08](./docs/plan/08_console-sso-rbac.md) — browser OIDC login and role-aware UI, the console half of [platform plan 31](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/31_console-sso-rbac.md) (its slices 1–3 have merged). Decisions open: D1–D4, of which **D1 is a documented conflict over request topology** — platform plan 31:320–330 assigns this repo a browser-calls-the-platform-directly shape that discards the mechanism CLAUDE.md principle 2 names (it keeps the principle's headline invariant; the management key still never reaches the browser).

Plans 01–06 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here. Nothing lands in this file until a plan or issue is actually being worked on.
