# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**None.** Plan 06 — Google sign-in was archived 2026-08-09, its last acceptance check confirmed by the maintainer: a Google account outside the Workspace is refused. Staging answers on a hostname over HTTPS, the only way in is a Google account in the Workspace domain enforced at the load balancer, and the production container runs with **no authentication code at all** — it lost the gate it had rather than gaining one. Summary in [docs/HISTORY.md](./docs/HISTORY.md); nothing from it is left open.

Pick the next plan from the backlog before adding anything here. Two things are known and unowned:

- [#66](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/66) — two live specs pin the platform's pre-#343 toolset render
- The same deployment-identifier sweep this repo did in [#69](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/69) is open for the platform repo as [managed-agent-platform#355](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/355)

One operational fact worth carrying, because no file in this repo records deployment state: staging holds an archived `sse-timeout-probe` agent left by the SSE measurement, which the platform has no endpoint to delete.

Plans 01–06 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
