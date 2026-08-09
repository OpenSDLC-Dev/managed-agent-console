# STATE.md — Active work

What is being worked on right now, and how far along it is — nothing else. **Size budget: ~30 lines.** Everything static lives elsewhere: conventions and the doc index in [CLAUDE.md](./CLAUDE.md), a change's narrative in [CHANGELOG.md](./CHANGELOG.md), the backlog in GitHub issues.

## Active work

**Plan 06 — Google sign-in** ([docs/plan/06_google-sign-in.md](./docs/plan/06_google-sign-in.md), `approved` 2026-08-09). It retires the plain-HTTP limitation 0.4.0 shipped on purpose: staging is a shared password on a bare IP in front of a full-power management key. The decision is **GCP IAP with the IAM binding `domain:${WORKSPACE_DOMAIN}`**, after which the production console has no authentication code at all. The hostname is chosen and held in the `${CONSOLE_HOST}` Actions variable — a zone separate from `${WORKSPACE_DOMAIN}`, which the plan's D4 records as deliberate and reversible.

- [x] Precondition steps 0–2 — cluster confirmed VPC-native, `HttpLoadBalancing` enabled and on Dataplane V2 (so slice 2's `NetworkPolicy` prerequisite holds); global static IP `console-ip` reserved; the **DNS-only** A record verified to resolve to it from two resolvers, which is what distinguishes a proxied record from a slow one
- [ ] [#69](https://github.com/OpenSDLC-Dev/managed-agent-console/issues/69) — deployment identifiers become Actions variables, so slice 1 writes a token rather than a literal to be swept again. Variables created first, on purpose: an unset one renders empty and would deploy with no project
- [ ] Remaining one-time human infra, not CD: edge objects applied by hand, certificate `Active` (15–60 min), `roles/iap.httpsResourceAccessor` bound **to the backend service, not the project**
- [ ] Slice 1 — `${CONSOLE_HOST}` with managed TLS: `deploy/k8s/edge.yaml` (Ingress + ManagedCertificate + BackendConfig + FrontendConfig), Service to ClusterIP, deploy.yml targets the hostname. Gate untouched, `src/` untouched
- [ ] Slice 2 — IAP on, `CONSOLE_PASSWORD` out of production, the pod's `0.0.0.0` bind closed in the same PR, smoke gate rewritten (anonymous → 401; the deep check loses its login and asserts `login_gate === false`)

Neither slice is expected to change a test or re-shoot a fidelity surface. Continuous delivery to GCP shipped in 0.4.0 ([#63](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/63), [#65](https://github.com/OpenSDLC-Dev/managed-agent-console/pull/65)); what it does is in [docs/deploy-gcp.md](./docs/deploy-gcp.md).

Plans 01–05 are complete and archived; summaries in [docs/HISTORY.md](./docs/HISTORY.md). How a release is cut: [docs/releasing.md](./docs/releasing.md).

The backlog is [GitHub issues](https://github.com/OpenSDLC-Dev/managed-agent-console/issues) — see them there, not here.
