# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

Both halves of the platform's SSO/RBAC work (#56) landing in this repo. The maintainer gave the go-ahead on 2026-08-14 to build to the plans. Each has one slice waiting on the platform — plan 07's API-key slice on platform 31 slice 5, plan 08's acceptance slice on platform 31 slice 4 — but every other slice is unblocked.

- [Plan 07](./docs/plan/07_console-issued-keys.md) — **in progress.** Environment-key and API-key issuance UI. Trails [platform plan 30](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/30_environment-keys-console-issuance.md), which landed 2026-08-11. Absorbs the earlier environment-keys-only draft of plan 07 (its 2026-08-10 decisions carry forward unchanged) and adds the API-key half. Carries the **2026-08-14 reference recording** of both key dialects; that recording is also what platform plan 31 slice 5 declared itself gated on. Its open decisions D1–D3 all sit on the API-key half, which is blocked anyway — nothing they touch is reachable before slice 4.
  - [x] Slice 1 — the seams: `/api/oauth` allowlist BFF, shared forwarding core, offset envelope, env-key types/schemas/queries, `consolePostNoContent`, mock routes. Protocol verified against a live platform in Chrome.
  - [x] Slice 2 — environment keys, read. Seam 5 settled (no pager; a capped page says so) and seam 6 settled (404 read as unimplemented, valid only from a page that already loaded the environment — recorded in `docs/wire-divergences.md`).
  - [x] Slice 3 — environment keys, write + setup guide. Seam 7 added to the probe ratchet; its probe found the plaintext key surviving in the mutation cache (`gcTime: 0`). Two a11y findings: ours fixed, the shared destructive-button contrast filed as #90.
  - [ ] Slice 4 — API keys · _blocked on platform 31 slice 5_
  - [ ] Slice 5 — acceptance against the compose stack, archive
- [Plan 08](./docs/plan/08_console-sso-rbac.md) — browser OIDC login and role-aware UI, the console half of [platform plan 31](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/31_console-sso-rbac.md) (its slices 1–3 have merged). Decisions open: D1–D4, of which **D1 is a documented conflict over request topology** — platform plan 31:320–330 assigns this repo a browser-calls-the-platform-directly shape that discards the mechanism CLAUDE.md principle 2 names (it keeps the principle's headline invariant; the management key still never reaches the browser).

Plans 01–06 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here. Nothing lands in this file until a plan or issue is actually being worked on.
