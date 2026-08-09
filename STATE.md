# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**None.** Plan 06 — Google sign-in was archived 2026-08-09, its last acceptance check confirmed by the maintainer: a Google account outside the Workspace is refused. Staging answers on a hostname over HTTPS, the only way in is a Google account in the Workspace domain enforced at the load balancer, and the production container runs with **no authentication code at all** — it lost the gate it had rather than gaining one. Summary in [docs/HISTORY.md](./docs/HISTORY.md); nothing from it is left open.

Plans 01–06 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here. Nothing lands in this file until a plan or issue is actually being worked on.
