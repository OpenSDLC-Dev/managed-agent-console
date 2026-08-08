# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Continuous delivery to GCP** (branch `feat/gcp-continuous-delivery`) — the console gets a deployed environment, not just a published image.

- [x] `GET /api/health`, shallow (configuration only, anonymous for the kubelet) and `?deep=1` (calls the platform, and gated whenever the console is) — 20 tests, 3 of them `probe:` for the no-leak invariant
- [x] `/api/health` exempted from the login gate — a gated health route answers 401, which a readiness probe reads as an unhealthy container
- [x] `deploy/k8s/` — Deployment + `type: LoadBalancer` Service, applied into namespace `map` beside the platform; pod template carries a `console-secrets/checksum` so a rotation actually rolls
- [x] `.github/workflows/deploy.yml` — push to `main`: build → push → deploy → smoke, WIF identity, no GitHub secrets. Deep check by `kubectl exec` inside the pod; the public IP is asserted to be gated (`login_gate: true`, anonymous `GET /` → 307 `/login`)
- [x] [docs/deploy-gcp.md](./docs/deploy-gcp.md), README pointer, CHANGELOG, this file
- [x] Adversarial review of the pipeline, findings fixed (the deep lever, the unasserted gate, the no-op dispatch, base64 masking, poll bounds, secret-dir shredding)
- [ ] First real run of the workflow — the image `…/map-images/console:9787b51` was built and pushed by hand, but no step of `deploy.yml` has executed against `map-staging`
- [ ] Open the PR

Known limitation carried on purpose: plain HTTP on a bare load-balancer IP, no domain and no TLS, which is why `CONSOLE_PASSWORD` is mandatory there.

Issue #33 (principle 3's feature detection) closed 2026-08-08 in PR #60 and ships in 0.3.0.

Plan 05 (release management) completed and archived 2026-08-08; summary in [docs/HISTORY.md](./docs/HISTORY.md), as for plans 01–04.

The console releases itself now. Conventional-Commit PR titles feed release-please, which keeps a release PR open; `pnpm release:prepare X.Y.Z` files the changelog section a release ships with; merging that PR tags, publishes the Release with that section as its body, and pushes a multi-arch image to `ghcr.io/opensdlc-dev/managed-agent-console`. Steps in [docs/releasing.md](./docs/releasing.md). **0.2.0 went out that way** on 2026-08-08.

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
