# deploy/k8s

What the console needs in a cluster that already runs
[managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform): a Deployment, a
Service, the edge that publishes it (Ingress, managed certificate, and the two load-balancer settings
this application does not survive the defaults of), and a `NetworkPolicy` — which is what stands in
front of port 3000 now that the production container has no gate of its own.

**Every field's reason is a comment beside it.** This file adds only what no single object can say:

- Applied by [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml) on every push to
  `main`; the pipeline, its placeholders and its rollback are
  [docs/deploy-gcp.md](../../docs/deploy-gcp.md).
- **Nothing here is a chart.** Four files with no templating are the honest shape of a single-tenant
  staging deployment, and a chart would be configurability nobody asked for.
- **A reference deployment, not a template** — it shows a shape that works without naming the cluster
  it was proven against.
- **IAP is GCP-only.** Self-hosters are unaffected and keep the `CONSOLE_PASSWORD` gate; this
  directory demonstrates something a reader off GCP cannot reproduce.
- **This does not cover the platform API**, which keeps its own load balancer and `x-api-key`. IAP is
  not the answer there — it accepts only a Google-issued OIDC token, so a compliant wire client
  holding a valid key would be refused before the platform's middleware ever ran.
