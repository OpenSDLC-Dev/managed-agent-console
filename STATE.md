# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

Both halves of the platform's SSO/RBAC work (#56) landing in this repo. The maintainer gave the go-ahead on 2026-08-14 to build to the plans. Each has one slice waiting on the platform — plan 07's API-key slice on platform 31 slice 5, plan 08's acceptance slice on platform 31 slice 4 — but every other slice is unblocked.

- [Plan 07](./docs/plan/07_console-issued-keys.md) — **in progress.** Environment-key and API-key issuance UI. Trails [platform plan 30](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/30_environment-keys-console-issuance.md), which landed 2026-08-11. Absorbs the earlier environment-keys-only draft of plan 07 (its 2026-08-10 decisions carry forward unchanged) and adds the API-key half. Carries the **2026-08-14 reference recording** of both key dialects; that recording is also what platform plan 31 slice 5 declared itself gated on. Its open decisions D1–D3 all sit on the API-key half, which is blocked anyway — nothing they touch is reachable before slice 4.
  - [x] Slice 1 — the seams: `/api/oauth` allowlist BFF, shared forwarding core, offset envelope, env-key types/schemas/queries, `consolePostNoContent`, mock routes. Protocol verified against a live platform in Chrome.
  - [x] Slice 2 — environment keys, read. Seam 5 settled (no pager; a capped page says so) and seam 6 settled (404 read as unimplemented, valid only from a page that already loaded the environment — recorded in `docs/wire-divergences.md`).
  - [x] Slice 3 — environment keys, write + setup guide. Seam 7 added to the probe ratchet; its probe found the plaintext key had been surviving in the mutation cache after the dialog closed, fixed here with `gcTime: 0`. Two a11y findings: ours fixed, the shared destructive-button contrast filed as #90. Review also caught a dismissal mid-issuance orphaning a live key — now refused.
  - [ ] Slice 4 — API keys · _blocked on platform 31 slice 5_
  - [ ] Slice 5 — acceptance against the compose stack, archive
- [Plan 08](./docs/plan/08_console-sso-rbac.md) — **in progress.** Browser OIDC login and role-aware UI, the console half of [platform plan 31](https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/31_console-sso-rbac.md) (its slices 1–3 have merged). D1–D4 settled 2026-08-14 on their recommendations; **D1 remains the one to revisit first** — it resolves a documented conflict over request topology by taking Mode A, where platform plan 31:320–330 assigns this repo the browser-calls-the-platform-directly shape.
  - [x] Slice 1 — config and the health contract: `IDENTITY_*` console config (fail closed, never silently unauthenticated), the D3 matrix as tests, `PLATFORM_API_KEY` no longer blocking readiness _once identity is configured_ (review caught the first version dropping that condition, which would have admitted a pod whose every platform call 500s), cookie `Secure` from `x-forwarded-proto`. Every path checked against a running platform in Chrome.
  - [x] Slice 2 — the OIDC relying party under `/api/auth/…`: authorization code + PKCE S256, discovery, `jose`, the server-side session store and its opaque handle, the `/api/auth/` matcher exemption, and the SSO control on `/login`. CLAUDE.md principle 5 amended here, as the plan scheduled. Two new probe seams. Verified against a real Casdoor in Chrome up to the provider's own sign-in page; a completed round trip needs an operator's credentials and is slice 5's.
  - [ ] Slice 3 — the BFF forwards the user's token
  - [ ] Slice 4 — role-aware UI
  - [ ] Slice 5 — acceptance, archive · _blocked on platform 31 slice 4_

Plans 01–06 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here. Nothing lands in this file until a plan or issue is actually being worked on.
