# deploy/k8s

The legacy Console topology, retained for a coordinated rollback through platform plan 69 slice 6.
Normal automatic deployment moves to the
[platform chart](https://github.com/OpenSDLC-Dev/managed-agent-platform/tree/main/deploy/gcp),
which owns native Console login and the shared ingress resources. The handover is tracked in
[STATE.md](../../STATE.md).

What the legacy console needs in a cluster that already runs
[managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform): a Deployment, a
Service, the edge that publishes it (Ingress, managed certificate, and the two load-balancer settings
this application does not survive the defaults of), and a `NetworkPolicy` — which is what stands in
front of port 3000 now that the production container has no gate of its own.

**Every field's reason is a comment beside it.** This file adds only what no single object can say:

- Applied only by a confirmed manual rollback on `main` in
  [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml); the pipeline, its placeholders and its rollback are
  [docs/deploy-gcp.md](../../docs/deploy-gcp.md).
- These raw manifests describe the legacy staging deployment; the native topology is in the
  companion platform chart.
- **A reference deployment, not a template** — it shows a shape that works without naming the cluster
  it was proven against.
- **IAP is GCP-only.** Self-hosters are unaffected and keep the `CONSOLE_PASSWORD` gate; this
  directory demonstrates something a reader off GCP cannot reproduce.
- **This does not cover the platform API**, which keeps its own load balancer and `x-api-key`. IAP is
  not the answer there — it accepts only a Google-issued OIDC token, so a compliant wire client
  holding a valid key would be refused before the platform's middleware ever ran.
