# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan 06 — Google sign-in** ([docs/plan/06_google-sign-in.md](./docs/plan/06_google-sign-in.md), `in-progress`). Both slices are delivered and live: staging answers on a hostname over HTTPS, and the only way in is a Google account in the Workspace domain, enforced at the load balancer. The production container now runs with **no authentication code at all** — it lost the gate it had rather than gaining one. What remains is cleanup the plan itself listed, not new work.

- [x] [#69](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/69) — deployment identifiers are Actions variables
- [x] Preconditions 0–5 — VPC-native and Dataplane V2 confirmed; global static IP; **DNS-only** A record; certificate `Active` after 14 min; backend `HEALTHY` on the pinned path; IAP API on; `roles/iap.httpsResourceAccessor` bound to the domain **on the backend service, not the project**
- [x] Slice 1 ([#71](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/71)) — hostname with managed TLS, plain HTTP redirecting to it
- [x] Slice 2 ([#73](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/73)) — IAP on, `CONSOLE_PASSWORD` out of the pod, `NetworkPolicy` in the same PR, smoke gate rewritten around IAP's own denial header. Two follow-on fixes the first real deploys found: [#75](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/75) (the health check needed a permission CD deliberately lacks) and [#76](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/76) (`apply` cannot remove an env var a rollback re-added, and the rollback must name its target)
- [x] Browser verification — signing in as a Workspace account lands on `/agents` with no password page; anonymous `GET /` and `GET /api/platform/v1/agents`, sent with `Accept: application/json`, both answer 401 carrying `x-goog-iap-generated-response` (without that header IAP answers 302 to `accounts.google.com` — it content-negotiates the refusal). **Not yet checked: a Google account outside the Workspace being refused** — that needs a second account to sign in with
- [ ] Precondition step 6 — rotate `console-password`. It crossed the public internet in the clear for as long as staging existed, and it is still the local-development and test credential
- [ ] [#74](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/74) — drop the `console-password` key from `console-secrets`, once no revision `rollout undo` can reach still mounts it
- [ ] Confirm a session trace streams past two minutes — the only real proof the SSE backend timeout was raised

Neither slice changed a test or re-shot a fidelity surface. The same identifier sweep is open for the platform repo as [managed-agent-platform#355](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/355).

Plans 01–05 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
