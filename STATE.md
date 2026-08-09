# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan 06 — Google sign-in** ([docs/plan/06_google-sign-in.md](./docs/plan/06_google-sign-in.md), `in-progress`). Both slices are delivered and live: staging answers on a hostname over HTTPS, and the only way in is a Google account in the Workspace domain, enforced at the load balancer. The production container now runs with **no authentication code at all** — it lost the gate it had rather than gaining one. **Every task the plan listed is now done**, so the only open question is a lifecycle one: whether the plan is archived while one verification it named stays unperformed (below), since that check needs a second Google account nobody has had to hand.

- [x] [#69](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/69) — deployment identifiers are Actions variables
- [x] Preconditions 0–5 — VPC-native and Dataplane V2 confirmed; global static IP; **DNS-only** A record; certificate `Active` after 14 min; backend `HEALTHY` on the pinned path; IAP API on; `roles/iap.httpsResourceAccessor` bound to the domain **on the backend service, not the project**
- [x] Slice 1 ([#71](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/71)) — hostname with managed TLS, plain HTTP redirecting to it
- [x] Slice 2 ([#73](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/73)) — IAP on, `CONSOLE_PASSWORD` out of the pod, `NetworkPolicy` in the same PR, smoke gate rewritten around IAP's own denial header. Two follow-on fixes the first real deploys found: [#75](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/75) (the health check needed a permission CD deliberately lacks) and [#76](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/76) (`apply` cannot remove an env var a rollback re-added, and the rollback must name its target)
- [x] Browser verification — signing in as a Workspace account lands on `/agents` with no password page; anonymous `GET /` and `GET /api/platform/v1/agents`, sent with `Accept: application/json`, both answer 401 carrying `x-goog-iap-generated-response` (without that header IAP answers 302 to `accounts.google.com` — it content-negotiates the refusal). **Not yet checked: a Google account outside the Workspace being refused** — that needs a second account to sign in with
- [x] Precondition step 6 — `console-password` rotated, version 1 disabled, the new value verified into the cluster and shown to nobody ([plan step 6](./docs/plan/06_google-sign-in.md) has the record)
- [x] [#74](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/74) — `console-secrets` is one key. The blocker was never the key itself: an old ReplicaSet keeps its whole pod template, so an unbounded revision history means no credential can ever be retired. `revisionHistoryLimit: 3` states the reachable window instead, prunes immediately, and is documented as a security boundary rather than housekeeping
- [x] Confirm a session trace streams past two minutes — a signed-in browser held one open through the hostname for **252s**, taking all 16 of the platform's 15s `ping` frames as separate chunks (so nothing in GFE → IAP → proxy buffers), and it ended on `session.deleted` because the probe session was deleted rather than on a timeout. The reconciled backend service reports `timeoutSec: 3600`. Staging had no agent/environment/session at all, so the probe created three rows and removed them; the agent could only be **archived**, since the platform has no `DELETE /v1/agents`

Neither slice changed a test or re-shot a fidelity surface. The same identifier sweep is open for the platform repo as [managed-agent-platform#355](https://github.com/OpenSDLC-Dev/managed-agent-platform/issues/355).

Plans 01–05 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
