# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan 06 — Google sign-in** ([docs/plan/06_google-sign-in.md](./docs/plan/06_google-sign-in.md), `draft`, drafted 2026-08-09). It retires the plain-HTTP limitation 0.4.0 shipped on purpose: staging is a shared password on a bare IP in front of a full-power management key. The decision is **GCP IAP with the IAM binding `domain:${WORKSPACE_DOMAIN}`**, after which the production console has no authentication code at all. **Awaiting maintainer approval**, and the hostname — the one open input.

- [ ] One-time human infra, not CD: global static IP, one A record at Namecheap, edge objects applied by hand, certificate `Active`, `roles/iap.httpsResourceAccessor` for `domain:${WORKSPACE_DOMAIN}` and for `cd-deployer`
- [ ] Slice 1 — `${CONSOLE_HOST}` with managed TLS: `deploy/k8s/edge.yaml` (Ingress + ManagedCertificate + BackendConfig + FrontendConfig), Service to ClusterIP, deploy.yml targets the hostname. Gate untouched, `src/` untouched
- [ ] Slice 2 — IAP on, `CONSOLE_PASSWORD` out of production, the pod's `0.0.0.0` bind closed in the same PR, smoke gate rewritten (anonymous → 401; the deep check loses its login and asserts `login_gate === false`)

Neither slice is expected to change a test or re-shoot a fidelity surface. Continuous delivery to GCP shipped in 0.4.0 ([#63](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/63), [#65](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/65)); what it does is in [docs/deploy-gcp.md](./docs/deploy-gcp.md).

Plans 01–05 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
