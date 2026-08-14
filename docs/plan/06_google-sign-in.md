---
status: archived
---

# Google sign-in — staging stops being a shared password on a bare IP (plan 06)

Requested 2026-08-09. Staging was a shared password typed over plain HTTP into a bare public IPv4,
and the thing behind it was a full-power management key. Two slices plus cleanup (issues #69, #74;
PRs #68–#80). **The console gained no authentication code — it lost the one it had.**

Five maintainer decisions bound the plan (all 2026-08-09): Casdoor is not part of this (D1);
`CONSOLE_PASSWORD` stays for local development and the suites and leaves production (D2); scope is
the console UI, the platform's control-plane API keeps its own load balancer and `x-api-key` (D3);
the hostname need not share a domain with the Workspace (D4); and deployment identifiers are not
written into this repository (D5). Consequently this file names five values it never spells out:
`${GCP_PROJECT_ID}`, `${GKE_CLUSTER}`, `${GCP_ZONE}`, `${WORKSPACE_DOMAIN}`, `${CONSOLE_HOST}`.

What shipped is [deploy/k8s/](../../deploy/k8s/) and [docs/deploy-gcp.md](../deploy-gcp.md).

## The decision

**GCP IAP on a GKE Ingress, access granted by the IAM binding `domain:${WORKSPACE_DOMAIN}`.** Three
reasons, in the order the project's principles put them:

1. **It is the literal implementation of principle 5** — deployment protection belongs to the
   deployment. Production ends up with no accounts, no roles and no authorization branch in `src/`:
   a smaller authentication surface than before, not a larger one.
2. **`domain:` resolves the principal against the Workspace directory.** Every application-level
   alternative — a hand-rolled `hd` check, a proxy's `--email-domain`, an IdP's e-mail regex —
   compares a _string_, which a consumer account with a verified address in the domain satisfies
   without being a member of anything. The strongest form of the rule, for zero lines of code.
3. **Nothing in the repository becomes GCP-specific.** IAP is configuration of one deployment; the
   published image is byte-identical in behaviour and a self-hoster keeps the password gate.

| Option                          | Why it lost                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GCP IAP**                     | **Chosen.** Three lines of YAML, one IAM binding scoped to this backend service, free, membership-based, and $0 marginal cost per further browser app behind the same Ingress.                                                                                                                                        |
| Casdoor                         | Not disqualified — disproportionate. 88k LOC, an LDAP and a RADIUS listener started unconditionally, a first-boot `built-in/admin`/`123`, a second hostname, certificate and database — to express a one-row whitelist.                                                                                               |
| oauth2-proxy sidecar            | The right answer to a question D1 removed. Buys issuer portability at the cost of a container to patch, two new secrets, and a domain rule that is a string comparison. Kept as the documented upgrade path.                                                                                                          |
| In-app OIDC relying party       | ~250 lines of production code plus tests, a client secret in the process that already holds the management key, and under D2 no way for CD's in-pod deep check to authenticate at all.                                                                                                                                |
| Cloudflare Access               | **The closest call.** Its zone objection evaporated once D4 put the console on a Cloudflare-served zone. It loses on policy being dashboard state rather than a reviewable file, and on a second vendor in the request path — not on cost or capability. Paired with a Tunnel it would need no public address at all. |
| ingress-nginx + `auth-url`      | Run and patch a controller, give up ManagedCertificate, and inherit `proxy_buffering: on` — an SSE hazard.                                                                                                                                                                                                            |
| Cloud Armor source-IP allowlist | Not authentication: no roaming, no phones.                                                                                                                                                                                                                                                                            |

**What would reverse this**: not a second, third or fifth _browser_ application — IAP is configured
per backend service, so N apps sit behind one Ingress with N independent policies at $0 marginal
cost each, and single sign-on across them is a free side effect. What reverses it is a client that
must **hold** a token rather than sit behind a Google load balancer — a CLI, a mobile client, a
third-party integration, anything off GCP. **IAP is an enforcement point, never an issuer.**

## External facts established while costing this

- **Google will not issue any OAuth flow against a bare-IP, plain-HTTP deployment** (two independent
  rules, each exempting localhost only), and IAP on GKE needs a registered hostname too. A hostname
  with TLS is a precondition of _every_ option, including fronting it with a third-party IdP.
- **A `gce`-class Ingress has no external-auth annotation** — no equivalent of ingress-nginx's
  `auth-url`. The only edge gates Google exposes there are IAP and Cloud Armor.
- **IAP itself is free; the load balancer is not.** A global ALB bundles its first five forwarding
  rules, which is why applications two through five really are $0 and the first one is not.
- **Two silent GKE traps** — the default `GET /` health check, and a backend timeout that is
  request-and-response rather than idle and so cuts every SSE trace. Both are fixed in
  `BackendConfig`, where each carries its own comment.
- **IAP does not process health checks**, so GCLB and kubelet probes pass through ungated.
- **Casdoor's domain restriction is broken** — `Provider.EmailRegex`'s reject branch
  (`controllers/auth.go:932-935`) has no `return`, and the handler proceeds into sign-in. The
  adjacent failure branch does return, so it is an omission rather than a soft warning.

## Deliberate divergences and risks carried

- **The production container has no gate of its own.** That is the design; its cost is paid by the
  `NetworkPolicy`. An explicit "I am behind a proxy" affirmation was rejected: it would declare
  intent rather than observe evidence, and would be copied along with any manifest it protected.
- **IAP is GCP-only** — this repository's reference deployment demonstrates something a reader off
  GCP cannot reproduce, which `deploy/k8s/README.md` must say rather than let the manifests imply.
- **This does not cover the platform API, and IAP is not the answer there — ever.** IAP accepts only
  a Google-issued OIDC token, so a fully compliant wire client holding a valid key is refused
  _before_ the platform's middleware runs. That is a pre-protocol refusal, not a 404 or 501 the
  console could feature-detect around, and principle 3 exists to prevent an endpoint only a Google
  client can drive. Shrinking the platform's exposure is `service.type: ClusterIP` in the platform
  repo, not IAP.
- **`domain:` admits every current and future Workspace account** — correct for single-operator
  staging, and wider than the password it replaced. A Google Group binding narrows it later.
- **Break-glass needs no second door on the internet**: a second Workspace account first, and
  `kubectl port-forward` reaches an ungated console — appropriate, since anyone who can port-forward
  can read `console-secrets` and drive the platform directly. The console grants strictly less.
- **Verifying `x-goog-iap-jwt-assertion` is deliberately not done.** The concrete bypass here is the
  pod's own port, closed by the `NetworkPolicy`; and the assertion's `aud` embeds a backend service
  id that changes whenever the Ingress is recreated, so hard-coding it would lock everyone out on a
  rebuild.

## Deployment identifiers in a public repository

**D5:** identifiers live in Actions **variables** — not secrets, because they are not secret, merely
the maintainer's — and everything in git refers to them by name. None of them grants anything: there
is no service-account key anywhere, Workload Identity Federation only trusts tokens from this
organization, and every secret is read from Secret Manager at deploy time. What publishing them
_does_ cost is a target list, and a coupling of an open-source project to one operator's cluster —
the larger of the two. Rewriting the history of two already-released repositories was considered and
declined: these are identifiers, not credentials, and the trust policy is what protects the
deployment. Hence `deploy/` is **a reference deployment, not a template**.

## If a second service ever needs the same login

The seam is at the edge either way, so being wrong is bounded: **delete three lines of
`BackendConfig`, add ~35 lines of oauth2-proxy sidecar, change `targetPort`, widen CD's credential
pipeline.** `src/`, tests, hostname and certificate all unchanged; a later Google→Casdoor move is
`--oidc-issuer-url` plus a client id. Three sharp edges found while costing it: oauth2-proxy defaults
to binding `127.0.0.1`, so `--http-address=0.0.0.0:4180` is mandatory or the kubelet never marks the
pod ready; `--skip-auth-route` matches **paths**, so a rule for `/api/health` would expose
`/api/health?deep=1` — the management-key lever — because a query string is not part of a Go
`URL.Path`; and its `--email-domain` is strictly weaker than the IAM binding it would replace.
