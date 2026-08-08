# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**None.** Continuous delivery to GCP landed 2026-08-08 in [PR #63](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/63) and [PR #65](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/65), and ships in 0.4.0: every push to `main` builds the image, deploys it into the `map-staging` cluster beside the platform it manages, and holds the rollout red until the pod carrying that image has reached the control plane (the deep health check, run by `kubectl exec` over loopback) and the public address has answered as gated — rolling itself back on any failure after the apply. Runbook in [docs/deploy-gcp.md](./docs/deploy-gcp.md).

Known limitation carried on purpose: plain HTTP on a bare load-balancer IP, no domain and no TLS, which is why `CONSOLE_PASSWORD` is mandatory there.

Plan 05 (release management) completed and archived 2026-08-08; summary in [docs/HISTORY.md](./docs/HISTORY.md), as for plans 01–04.

The console releases itself now. Conventional-Commit PR titles feed release-please, which keeps a release PR open; `pnpm release:prepare X.Y.Z` files the changelog section a release ships with; merging that PR tags, publishes the Release with that section as its body, and pushes a multi-arch image to `ghcr.io/opensdlc-dev/managed-agent-console`. Steps in [docs/releasing.md](./docs/releasing.md). **0.3.0 went out that way** on 2026-08-08.

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
