---
status: approved
---

# Google sign-in — the staging console stops being a shared password on a bare IP

Requested 2026-08-09. Staging today is a shared password typed over plain HTTP into a bare public
IPv4, and the thing behind it is a full-power platform management key. This plan replaces that with
**Google sign-in restricted to `@${WORKSPACE_DOMAIN}`, enforced at the load balancer by GCP IAP**, and takes
the password out of production entirely. The console gains no authentication code — it loses the
authentication code it has.

Five decisions by the maintainer bound this plan — the first four taken before drafting, the fifth
during it (all 2026-08-09):

- **D1 — Casdoor is not part of this.** The maintainer keeps a checkout of
  [casdoor/casdoor](https://github.com/casdoor/casdoor) and asked whether it could serve this; the
  answer, after reading it, is that it could but should not (below). Nothing here waits on it, and
  nothing here forecloses it — [what changes if a second service ever needs the same
  login](#if-a-second-service-ever-needs-the-same-login) is costed at the end.
- **D2 — `CONSOLE_PASSWORD` stays for local development and the test suites, and leaves production.**
  The GCP pod gets no password path at all.
- **D3 — scope is the console UI.** The platform's own control-plane API keeps its public load
  balancer and its `x-api-key`, unchanged and ungated by this work.
- **D4 — the hostname is a reversible choice, and need not share a domain with the Workspace.** The
  host the console answers on and the directory the access rule resolves against are independent:
  `${CONSOLE_HOST}` may be any zone the maintainer controls DNS for, while `${WORKSPACE_DOMAIN}`
  must be the Cloud Identity domain the accounts live in. Changing the host later costs a DNS record,
  a `ManagedCertificate` domain (and another provisioning wait), an Ingress host rule and one Actions
  variable. It costs **nothing** in IAP or IAM — those bind to the backend service, not to a name —
  and **nothing** in OAuth, because IAP's redirect URI lives on `iap.googleapis.com` rather than on
  the application's own host. This is the one place the chosen option is meaningfully cheaper to
  change than the alternatives, all of which register the application's own callback URL with the
  issuer.
- **D5 — deployment identifiers are not written into this repository.** Decided 2026-08-09 while
  drafting: the values live in the repository's Actions variables, and everything public refers to
  them by name. See
  [Deployment identifiers in a public repository](#deployment-identifiers-in-a-public-repository).

Consequently this plan names five values it never spells out — `${GCP_PROJECT_ID}`, `${GKE_CLUSTER}`,
`${GCP_ZONE}`, `${WORKSPACE_DOMAIN}` and `${CONSOLE_HOST}`. Commands are meant to be run with those set,
and the reader who wants the concrete values reads them from the deployment rather than from git.

## Ground truth (verified 2026-08-09 against this checkout)

- **The gate fails open, by design, and D2 turns that from a dev convenience into the production
  posture.** [src/proxy.ts](../../src/proxy.ts):5-6 is `const password = process.env.CONSOLE_PASSWORD;
if (!password) return NextResponse.next();` — every route, before any check. So D2 needs **zero
  `src/` changes** to take effect: stop injecting the variable and the container serves everything
  anonymously. That is the whole mechanism, and it is also the whole hazard.
- **The deep health check stops gating itself at the same moment.**
  [src/app/api/health/route.ts](../../src/app/api/health/route.ts):62 is `if (deep && password !==
undefined)`. With no password, `GET /api/health?deep=1` — the lever that makes this process spend
  the management key against the control plane on demand, as that file's own comment at :26-31 says —
  answers anyone who can reach the port. The route's three `probe:` tests
  ([route.test.ts](../../src/app/api/health/route.test.ts):252, :289, :302) assert the body never
  serializes the key or the base URL; they hold regardless and need no change.
- **The container listens on every interface.** [Dockerfile](../../Dockerfile):30 is
  `ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0`, and
  [deployment.yaml](../../deploy/k8s/deployment.yaml):59-61 publishes `containerPort: 3000`. Port 3000
  is therefore reachable on the pod IP from anywhere in the cluster. Today a password stands there.
  After D2 nothing does, and what is behind it is the BFF that injects the management key. **This is
  not an IAP problem — it is true of every option — and it must land in the same PR as the password
  removal, not after it.**
- **`login_gate` becomes permanently false and CD asserts it is true.**
  [route.ts](../../src/app/api/health/route.ts):56 computes `loginGate = password !== undefined`;
  [deploy.yml](../../.github/workflows/deploy.yml) asserts `jq -e '.login_gate == true'` and fails the
  deploy with the message _"a bare public IP with no TLS is fronting a full-power platform management
  key"_. After D2 that assertion fails on the first deploy, and its wording is already contrary to
  fact.
- **The deep check uses the password as a machine credential and throws without it.** The `kubectl
exec … node -e` step reads `process.env.CONSOLE_PASSWORD` and its first statement is
  `if (!password) throw new Error("CONSOLE_PASSWORD is not set in the container")`, then `POST
/api/login`, then `getSetCookie()`. Under D2 this step does not degrade — it fails the deploy.
- **A guard refuses to deploy without a password.** The secret-sync step exits 1 when the
  `console-password` payload is whitespace-only: _"refusing to publish an ungated console on a public
  IP"_. Under D2 that guard is now guarding the wrong thing, and the `SECRETS_CHECKSUM` it feeds is
  `printf '%s\n%s'` over exactly two payloads — the field that makes a credential rotation actually
  roll the pod.
- **The public assertion is `307 → /login`.** The last smoke step curls `http://$ip/` anonymously and
  requires a 307 whose redirect ends in `/login`, which is what
  [src/proxy.ts](../../src/proxy.ts):24-27 returns. With the gate at the edge, the pod never sees that
  request and the assertion must change shape, not merely target.
- **The Service is a bare regional load balancer.** [service.yaml](../../deploy/k8s/service.yaml):16
  is `type: LoadBalancer`, :23 is `port: 80 → targetPort: 3000`, and the file's own header says _"there
  is no domain and no certificate yet"_.
- **The kubelet probes talk to the container directly and are unaffected by anything at the edge.**
  [deployment.yaml](../../deploy/k8s/deployment.yaml):87-93 readiness on `/api/health`, :104-111
  liveness on `/login`, both `httpGet … port: http`. `/login` keeps rendering with no password
  ([src/app/login/page.tsx](../../src/app/login/page.tsx) is unconditional), so liveness survives D2.
- **The test suites carry their own password and do not care.** The three Playwright configs each set
  `CONSOLE_PASSWORD` for the server they start, so 44 e2e assertions across 9 specs, the 11 copies of
  the `signIn()` helper, the live tier, and 29 fidelity surfaces × 2 themes all keep exercising the
  real password code path. **No test changes and no fidelity re-shoots are required by this plan.**
- **The deployment project is parented to the Workspace organization**, so a `domain:` IAM binding and
  an Internal consent screen are both available — checked with
  `gcloud projects describe ${GCP_PROJECT_ID} --format='value(parent.type,parent.id)'` against
  `gcloud organizations list`, and re-checkable the same way. The organization and customer
  identifiers are deliberately not reproduced here; see
  [Deployment identifiers in a public repository](#deployment-identifiers-in-a-public-repository).
  The domain resolves `MX 1 smtp.google.com` on registrar nameservers — Workspace mail, DNS edited by
  hand.

### Verified externally (2026-08-09)

- **Google will not issue this flow against the current deployment.** Two independent rules for a Web
  application OAuth client, each exempting localhost only: _"Redirect URIs must use the HTTPS scheme,
  not plain HTTP"_ and _"Hosts cannot be raw IP addresses"_
  ([support.google.com/cloud/answer/15549257](https://support.google.com/cloud/answer/15549257),
  [developers.google.com/identity/protocols/oauth2/web-server](https://developers.google.com/identity/protocols/oauth2/web-server)).
  A hostname with TLS is a precondition of **every** option, including putting any third-party IdP in
  front — that IdP's own callback host is what Google validates.
- **IAP on GKE needs the same hostname.**
  [cloud.google.com/iap/docs/enabling-kubernetes-howto](https://docs.cloud.google.com/iap/docs/enabling-kubernetes-howto)
  lists _"A domain name registered to the address of your load balancer"_ as a prerequisite and
  requires an HTTPS frontend; a Google-managed certificate cannot cover an IP.
- **A `gce`-class Ingress has no external-auth annotation.** There is no equivalent of ingress-nginx's
  `auth-url`/`auth-signin`. The only edge gates Google exposes there are IAP and Cloud Armor (a
  filter, not authentication). Anything else must sit _inside_ the request path as a proxy.
- **`domain:${WORKSPACE_DOMAIN}` is a valid IAM principal**
  ([cloud.google.com/iam/docs/principal-identifiers](https://docs.cloud.google.com/iam/docs/principal-identifiers)),
  and IAP documents Workspace domains as principals for `roles/iap.httpsResourceAccessor`. This is a
  membership check against the Workspace directory, not a string match on an email suffix — see the
  decision below for why that difference decides this plan.
- **IAP itself is free, the load balancer is not**
  ([cloud.google.com/iap/pricing](https://cloud.google.com/iap/pricing) charges nothing for IAP and
  says in the next breath that "networking and compute charges apply for required load balancing").
  The Ingress replaces the existing network load balancer rather than adding one, so the delta is
  small rather than zero — a global Application Load Balancer bundles its first five forwarding rules
  at one rate and charges per rule after that, which is why **the marginal cost of applications two
  through five behind the same Ingress genuinely is $0** while the first one is not. Take the current
  figures from the pricing page at the time rather than from this file.
- **Three scaling facts to know before a second application arrives**, none of which affect this plan:
  Google-managed certificates do not support wildcards and a target proxy holds at most 15 of them, so
  the shape that scales is one `ManagedCertificate` listing several hostnames rather than one per
  application; IAP is incompatible with Cloud CDN; and the pod-level bypass that slice 2 closes at the
  bind address is a cost every application pays separately, not a console-specific fix.
- **The Google-managed OAuth client is Preview and organization-users-only.** It is what lets slice 2
  enable IAP with no client secret in the cluster. Confirm it is still available and still fits before
  relying on it; the fallback is a self-managed OAuth client, which reintroduces a secret and a
  redirect URI.
- **IAP does not process health checks**, so the GCLB health check and the kubelet probes pass
  through ungated — no allowlist rule needed for them.
- **Two traps in the GKE edge, both silent.** The default Ingress health check is `GET /`, which this
  app answers 307 and GCLB reads as unhealthy — a permanently 502 hostname while the pod is Ready,
  `rollout status` is green and the logs are clean. And the GCLB backend timeout defaults to 30s and
  is a **request-and-response** timeout, not an idle timeout
  ([cloud.google.com/load-balancing/docs/https/request-distribution](https://docs.cloud.google.com/load-balancing/docs/https/request-distribution#timeouts-and-retries)),
  so an SSE session trace is cut every 30 seconds; the client reconnects with backoff and re-walks
  history, so nothing surfaces as an error. Both are fixed in `BackendConfig` in slice 1.
- **Casdoor's domain restriction is broken.** `Provider.EmailRegex` is the one field that expresses
  "only `@${WORKSPACE_DOMAIN}`", and its reject branch at `controllers/auth.go:932-935` has no `return`;
  `ResponseError` writes JSON without aborting the Beego handler, and :938 proceeds into sign-in. The
  adjacent failure branch at :930 _does_ return, so this is an omission rather than a soft warning.
  The mechanism that does hold is `EnableSignUp=false` plus pre-created users — a whitelist with one
  row on it.

## The decision

**GCP IAP on a GKE Ingress, with access granted by the IAM binding `domain:${WORKSPACE_DOMAIN}`.** The console
keeps no identity code, gains no container, and holds no OAuth credential; production runs the image
with `CONSOLE_PASSWORD` unset and the gate lives entirely at the load balancer.

Three reasons, in the order the project's principles put them:

1. **It is the literal implementation of principle 5.** _"The optional console login gate is
   deployment protection, not a user system."_ Deployment protection belongs to the deployment. After
   this change the production console has no accounts, no roles, no per-user state and no
   authorization branch anywhere in `src/` — a smaller authentication surface than today's 5 files,
   not a larger one.
2. **`domain:${WORKSPACE_DOMAIN}` is a stronger check than any email-suffix rule.** IAM resolves the principal
   against the Workspace directory. Every application-level alternative — a hand-rolled `hd` check, an
   `--email-domain` flag on a proxy, Casdoor's `EmailRegex` — compares a string, and a consumer Google
   account carrying a verified `@${WORKSPACE_DOMAIN}` address satisfies a string comparison while not being a
   member of anything. Getting the strongest form of the rule for zero lines of code is the whole
   argument.
3. **Nothing in the repository becomes GCP-specific.** IAP is configuration of one deployment, not
   code in the image. A self-hoster keeps `CONSOLE_PASSWORD` and the semantics they have today; the
   published GHCR image is byte-identical in behaviour.

| Option                          | Why it loses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GCP IAP**                     | **Chosen.** 3 lines of YAML, one IAM binding scoped to this backend service, no charge for IAP itself, a membership-based rule rather than a string comparison, nothing new to operate or patch, and a marginal cost of $0 for every browser application added behind the same Ingress afterwards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Casdoor                         | Not disqualified — disproportionate. 88k LOC of Go, 309 module requirements, a 319-file React admin, an LDAP and a RADIUS listener started unconditionally (`main.go:144-152`), a first-boot `built-in/admin` / `123` (`object/init.go:170`), a second hostname, a second certificate and a second database — to express a rule whose working form is a one-row whitelist, via a field that is broken. See [below](#if-a-second-service-ever-needs-the-same-login) for the future in which this flips.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| oauth2-proxy sidecar            | The right answer to a question D1 removed. It buys issuer portability — the same container speaks OIDC to Google today and to Casdoor later — at the cost of a container to patch, two new secrets, a widening of CD's credential pipeline from two payloads to four, and a domain rule that is a string comparison rather than a membership check. Kept as the documented upgrade path, not adopted now.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| In-app OIDC relying party       | ~250 lines of production code plus ~400 of tests, a client secret in the process that already holds the management key, a session cookie format to redesign (today's has no expiry), and under D2 no way for CD's in-pod deep check to authenticate at all. Principle 4 says the console owns presentation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cloudflare Access               | **The closest call, and closer than it first looked.** It was initially rejected because the free plan needs full-zone setup and moving `${WORKSPACE_DOMAIN}`'s nameservers would put company email in the blast radius — an objection that **evaporated** once D4 put the console on a zone already served by Cloudflare. What remains is real but smaller: Access policy is dashboard state rather than a reviewable file, which is the one thing this repository is least willing to give up; it puts a second vendor in the request path; and its rule matches an email string where an IAM binding resolves directly against the directory. Its upside is also real and should be recorded rather than buried — paired with a Cloudflare Tunnel it needs no public address at all, which removes the load balancer, its cost, the managed-certificate wait, and both of the silent GKE traps this plan spends a slice defusing. It loses on config-in-git and on not operating another daemon, not on cost or capability. |
| ingress-nginx + `auth-url`      | Run and patch an ingress controller, give up ManagedCertificate, and inherit `proxy_buffering: on` — an SSE hazard to remember to switch off.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Cloud Armor source-IP allowlist | Not authentication; no roaming, no phones. Worth three lines only if slice 1 slips by more than a week, and it expires the moment the Service becomes ClusterIP.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**What would reverse this — and what would not.** A second, third or fifth _browser_ application does
**not** reverse it: IAP is configured per backend service, not per load balancer ("When you enable IAP
on a Compute Engine backend service, only that backend service is protected by IAP", and "Multiple
apps within a project can each have different access policies"), so N apps sit behind one Ingress with
N `BackendConfig` objects and N independent IAM policies, at a marginal cost of $0 each. Single
sign-on across them is a free side effect, and revoking a Workspace account closes all of them at
once.

What does reverse it is an application that must **hold** a token rather than sit behind a Google load
balancer: a CLI, a mobile client, a third-party SaaS integration, or anything not on GCP. IAP is an
enforcement point, never an issuer — that is the sentence that matters, and it is about the shape of
the client, not the number of applications. The cost of being wrong is bounded and is stated in
[the last section](#if-a-second-service-ever-needs-the-same-login).

## Precondition: a hostname and TLS

Identical for every option in the table, so none of it is wasted whatever is decided later. **CD does
not do any of it** — [deploy.yml](../../.github/workflows/deploy.yml) owns build, push, deploy, smoke
and explicitly _"does not run Terraform"_; static IPs, DNS and IAM stay human and interactive.

Every command below is written in the repository variables' own names, so load them into the shell
first ([docs/deploy-gcp.md](../deploy-gcp.md) has the same snippet, and the reason the guard is not
optional):

```bash
exports="$(gh variable list --json name,value \
  --jq '.[] | "export \(.name)=\(.value | @sh)"')"
[ -n "$exports" ] && eval "$exports"
: "${GCP_PROJECT_ID:?}" "${GCP_ZONE:?}" "${GKE_CLUSTER:?}" "${K8S_NAMESPACE:?}" "${CONSOLE_HOST:?}"
```

`${WORKSPACE_DOMAIN}` is the exception: it is the Google Workspace domain the IAM binding resolves
against, it is not a repository variable because CD never uses it, and it appears only in step 5.
Export it by hand there.

0. **Check what the cluster can do**, because two of these answers are prerequisites rather than
   curiosities and both are cheaper to learn now than halfway through a slice:

   ```bash
   gcloud container clusters describe ${GKE_CLUSTER} --zone ${GCP_ZONE} --project ${GCP_PROJECT_ID} \
     --format='value(ipAllocationPolicy.useIpAliases,
                     addonsConfig.httpLoadBalancing.disabled,
                     networkConfig.datapathProvider,
                     addonsConfig.networkPolicyConfig)'
   ```

   `useIpAliases` **true** means VPC-native, which is what lets the Service stay `ClusterIP` and be
   reached through NEGs; **false** means slice 1's Service becomes `NodePort` instead and
   `BackendConfig.healthCheck.port` must name the node port rather than 3000. `httpLoadBalancing`
   must not be disabled, or the Ingress object sits there and never receives an address. And the
   datapath or the network-policy addon must show a policy engine is available — slice 2 has no
   alternative mechanism for closing the pod's lateral exposure, so a cluster that cannot enforce a
   `NetworkPolicy` cannot take the password removal.

1. **Reserve a global static IPv4.** A `gce`-class Ingress fronts a _global_ external Application Load
   Balancer, whose forwarding rule requires a global address; the current ephemeral _regional_ IP of
   the passthrough NLB cannot be promoted to one. **The public IP changes** — accepted deliberately,
   because the alternative that preserves it (regional Gateway API + Certificate Manager DNS
   authorization) costs an interactive cluster change to buy back an IP that was never published.

   ```bash
   gcloud compute addresses create console-ip --global --project ${GCP_PROJECT_ID}
   gcloud compute addresses describe console-ip --global \
     --project ${GCP_PROJECT_ID} --format='value(address)'
   ```

2. **Add one A record**, by hand, in whichever provider holds the zone for `${CONSOLE_HOST}`: an `A`
   record for the host, valued with the address from step 1. Not a CNAME and not a URL redirect — GCP
   requires the record to point at the load balancer with **nothing in the request path**. Touch no MX
   record. Confirm with `dig +short ${CONSOLE_HOST} @8.8.8.8` and check that what comes back is the
   address step 1 printed, not merely _an_ address.

   **If the zone is on a provider that can proxy the record — Cloudflare's orange cloud, or any
   equivalent CDN toggle — the record must be DNS-only.** A proxied record resolves to the provider's
   anycast addresses rather than to the load balancer, so a Google-managed certificate never sees what
   it needs and sits at `FAILED_NOT_VISIBLE` indefinitely. That failure reads as "still waiting", not
   as "misconfigured", and step 4's 15–60 minute window is exactly long enough to make it plausible.
   The `dig` check above is what distinguishes the two, which is why it compares the address rather
   than just asserting one exists. Cloudflare in particular defaults a new A record to proxied.

3. **Apply the edge objects by hand and wait for the certificate**, before slice 1's PR merges (see
   the slice for why):

   ```bash
   gcloud container clusters get-credentials ${GKE_CLUSTER} \
     --zone ${GCP_ZONE} --project ${GCP_PROJECT_ID}

   # edge.yaml carries the bare token CONSOLE_HOST, not a shell variable — see below.
   sed "s|CONSOLE_HOST|${CONSOLE_HOST}|g" deploy/k8s/edge.yaml | kubectl apply -n ${K8S_NAMESPACE} -f -

   kubectl annotate svc console -n ${K8S_NAMESPACE} \
     cloud.google.com/backend-config='{"default":"console"}'
   kubectl patch svc console -n ${K8S_NAMESPACE} -p '{"spec":{"type":"ClusterIP"}}'   # only if NEG-capable, step 0
   ```

   **`kubectl apply` performs no substitution of any kind**, so a manifest containing a literal
   `${CONSOLE_HOST}` reaches the API server with the dollar sign and braces intact and is rejected as
   an invalid DNS name — the Ingress host rule and the `ManagedCertificate` domain both. This is the
   one place where the placeholder convention of D5 has teeth rather than being a documentation
   habit, so `edge.yaml` follows the convention this repository already has: it carries the **bare
   token** `CONSOLE_HOST`, exactly as `deployment.yaml` carries `CONSOLE_IMAGE` and
   `SECRETS_CHECKSUM`, and the same `sed` that renders those renders this. Prose in this plan writes
   `${CONSOLE_HOST}` to mean "the value"; manifests never do.

   Then wait for the certificate, with a bound rather than an open-ended watch:

   ```bash
   timeout 90m bash -c 'until [ "$(kubectl get managedcertificate console -n ${K8S_NAMESPACE} \
     -o jsonpath="{.status.certificateStatus}")" = Active ]; do sleep 60; done'
   kubectl describe managedcertificate console -n ${K8S_NAMESPACE}     # on timeout, read domainStatus
   ```

   First issuance is typically 15–60 minutes after DNS resolves, and the load balancer may take up to
   30 more to serve it. `FAILED_NOT_VISIBLE` is a waiting state, not a failure — deleting and
   recreating only restarts the clock. If it is still that after 90 minutes, suspect the DNS record:
   step 2's `dig` comparison is what tells a proxied record from a slow one.

4. **Prove the backend is healthy on the pinned path** — the trap that otherwise presents as a
   permanently 502 hostname with a green rollout:

   ```bash
   gcloud compute backend-services list --global --project ${GCP_PROJECT_ID}
   gcloud compute backend-services get-health NAME --global \
     --project ${GCP_PROJECT_ID}                                          # HEALTHY
   gcloud compute health-checks describe NAME --global \
     --project ${GCP_PROJECT_ID} \
     --format='yaml(httpHealthCheck)'                                 # requestPath: /api/health
   ```

5. **Grant access — on the backend service, not on the project.** The deploy service account needs it
   too, if the smoke gate is to make an authenticated request:

   ```bash
   gcloud iap web add-iam-policy-binding --project ${GCP_PROJECT_ID} \
     --resource-type=backend-services --service=<console-backend-service> \
     --member='domain:${WORKSPACE_DOMAIN}' --role='roles/iap.httpsResourceAccessor'
   gcloud iap web add-iam-policy-binding --project ${GCP_PROJECT_ID} \
     --resource-type=backend-services --service=<console-backend-service> \
     --member='serviceAccount:<deploy-sa>' --role='roles/iap.httpsResourceAccessor'
   ```

   **The scope is the point, and `gcloud projects add-iam-policy-binding` is the wrong command here.**
   IAM inherits downward: a project-level `roles/iap.httpsResourceAccessor` applies to every
   IAP-secured resource in the project, including ones that do not exist yet. Granted at the project,
   the next application to switch IAP on would be **open to the whole domain the moment it was
   enabled** — silently, with no separate grant for anyone to review — and an allow policy can be
   added to more easily than it can be narrowed. Bound to this backend service, the second application
   arrives closed and has to be opened deliberately. Use a Google Group rather than `domain:` as soon
   as any application wants a narrower audience than "everyone"; group membership is managed in
   Workspace and never reaches git.

6. **Rotate `console-password`.** It has been crossing the public internet in the clear for as long as
   staging has existed. Do this even though D2 removes it — it is still the local-development and test
   credential, and it is compromised.

## Slices

### Slice 1 — `feat(deploy): publish the console on ${CONSOLE_HOST} with managed TLS`

TLS and a hostname, **with the gate untouched**: the password stays, `307 → /login` stays the
assertion. Independently correct and independently valuable — even if everything below were abandoned,
this stops the password and every session cookie crossing the wire in the clear.

- **New `deploy/k8s/edge.yaml`** (~70 lines with comments; four objects in one file — the apply loop
  already handles multi-document files, and this directory is deliberately not a chart):
  **Every hostname in this file is the bare token `CONSOLE_HOST`, never `${CONSOLE_HOST}`** — the
  workflow's `sed` renders it exactly as it renders `CONSOLE_IMAGE` and `SECRETS_CHECKSUM`, and
  `kubectl apply` would otherwise submit the dollar and braces to the API server as part of a DNS
  name. Two objects carry it:
  - `Ingress`: `kubernetes.io/ingress.class: gce`,
    `kubernetes.io/ingress.global-static-ip-name: console-ip`,
    `networking.gke.io/managed-certificates: console`,
    `networking.gke.io/v1beta1.FrontendConfig: console`, and one host rule on `CONSOLE_HOST`.
  - `ManagedCertificate`: `spec.domains: [CONSOLE_HOST]`.
  - `BackendConfig`: `healthCheck.requestPath: /api/health` and `port: 3000` — **both traps live
    here**; and `timeoutSec: 3600` for SSE. Each gets a comment naming the failure it prevents,
    because both failures are silent. `port: 3000` is correct only because the cluster is VPC-native
    (precondition step 0); on a non-VPC-native cluster this names the node port instead.
  - `FrontendConfig`: `redirectToHttps.enabled: true`. Do **not** set
    `kubernetes.io/ingress.allow-http: "false"` — the redirect needs HTTP listening.
- **`deploy/k8s/service.yaml`**: drop `type: LoadBalancer` (ClusterIP is the default, and is the right
  default here only because step 0 confirmed VPC-native — otherwise this becomes `NodePort`), add the
  backend-config annotation, rewrite the header comment at :1-7 and the `port: 80` comment at :22 —
  both now assert things that are false. ~−6/+10.
- **`.github/workflows/deploy.yml`**: add `CONSOLE_HOST: ${{ vars.CONSOLE_HOST }}` to the `env:` block
  and extend the apply step's `sed` to render the token into the manifests;
  delete the external-IP polling loop (a ClusterIP Service has no `status.loadBalancer.ingress`) and
  target `https://$CONSOLE_HOST` directly; add a fail-fast check that `managedcertificate console`
  reports `Active`, so a still-issuing certificate reads as one clear message instead of a 300-second
  timeout followed by an automatic rollback of a healthy revision. Every assertion otherwise
  unchanged. ~−20/+25.
- **Docs, same PR**: `deploy/k8s/README.md`'s "Known limitation: plain HTTP on a bare IP" section and
  its migration checklist, `docs/deploy-gcp.md`'s corresponding section and its two references to the
  bare IP, `README.md`, `CHANGELOG.md` under `## [Unreleased]`, `STATE.md`.
- **`src/`: no change. Tests: no change. Fidelity: no re-shoots.**
- **Proves it worked**: `curl -sSI https://${CONSOLE_HOST}/` returns 307 to `/login`; one green CD
  run.
- **Blocked on** precondition steps 1–4.

### Slice 2 — `feat(deploy): Google sign-in gates staging; the shared password leaves production`

- **`deploy/k8s/edge.yaml`**: add three lines to `BackendConfig`.

  ```yaml
  iap:
    enabled: true
  ```

  Omitting `oauthclientCredentials` uses the Google-managed OAuth client (GKE 1.29.4+), so **no client
  secret enters the cluster at all** — the single largest reason this option is smaller than the
  others.

- **`deploy/k8s/deployment.yaml`**: delete the `CONSOLE_PASSWORD` `secretKeyRef` and its comment
  (:73-81, −9), whose text is now false in every clause.
- **Close the pod's lateral exposure, in this same PR — with a `NetworkPolicy`, and _not_ by binding
  to loopback.** The container listens on `0.0.0.0:3000` (`Dockerfile`:30); after this PR nothing
  gates it, and behind it is a BFF that injects the management key. The obvious-looking fix — set
  `HOSTNAME: 127.0.0.1` in the pod's `env` — **is wrong for this topology and would break the
  deployment**: with container-native load balancing the GCLB delivers traffic straight to the
  **Pod IP**, and via a NodePort it arrives DNAT'd to the Pod IP too, so a process listening only on
  loopback is unreachable by the load balancer in either path. Converting the probes to `exec` hides
  it rather than fixing it: the kubelet runs probes inside the container's network namespace, so
  readiness goes green, the rollout succeeds, and the public hostname serves 502 from a backend that
  can never pass its health check. The correct mechanism is a `NetworkPolicy` on the console pod
  admitting port 3000 only from the GCLB health-check and proxy ranges (`35.191.0.0/16`,
  `130.211.0.0/22`), which is what NEG traffic and health checks both originate from.
  **This ships with the password removal; doing it afterwards is the one sequencing error this plan
  cannot absorb** — and because there is now no fallback mechanism, the cluster's ability to enforce
  a `NetworkPolicy` is a **prerequisite of slice 2**, not an open question (see the checks below).
- **`.github/workflows/deploy.yml`**: the credential pipeline drops from two payloads to one —
  `console-password` is no longer read, masked, guarded, written into `console-secrets`, or hashed.
  The empty-payload guard for it is deleted along with its message; `SECRETS_CHECKSUM` becomes a
  single-payload hash. The smoke gate is rewritten as below. ~−70/+45.
- **`src/`: no behaviour change**, but two comment blocks now assert facts that are false and, by this
  repository's standard, move in the same PR: `src/proxy.ts`:31-51 ("on the one deployment where the
  gate is mandatory") and `src/app/api/health/route.ts`:26-31 ("the deployment in deploy/k8s/
  publishes the console on a bare public IP").
- **Docs, same PR**: `deploy/k8s/README.md`'s secret table (two keys → one) and its health-endpoint
  section, `docs/deploy-gcp.md`'s identity and smoke-gate sections, `README.md`, `CHANGELOG.md`,
  `STATE.md`. `docs/design-reference.md` is untouched — no surface changes.
- **Tests: no change**, for the reason in Ground truth. **Fidelity: no re-shoots** — no `src/` change,
  and `/login` still exists and still renders.
- **Proves it worked**: anonymous `curl` of `https://${CONSOLE_HOST}/` is refused by IAP rather
  than served; `henry@${WORKSPACE_DOMAIN}` reaches `/agents` in a browser; a Google account outside the
  Workspace is refused; a session trace streams for **more than two minutes** without reconnecting
  (the only proof the SSE timeout was actually raised); one green CD run.
- **Blocked on** slice 1 and precondition step 5.

## What the smoke gate asserts afterwards

Each line replaces a specific line that exists today.

1. **Certificate ready** (new, fail-fast). `managedcertificate console` reports `Active`, or exit with
   a message. Exists so a 15–60 minute first issuance does not present as a mystery timeout plus a
   rollback of a working revision.
2. **Reachability** (replaces the anonymous `GET /api/health` → 200 poll). The GCLB health check is
   the thing that now proves routing, and it is visible: poll
   `gcloud compute backend-services get-health` for `HEALTHY`. `/api/health` itself is behind IAP from
   the internet's point of view and should not answer anonymously.
3. **The gate is closed, and closed _by IAP_** (replaces the `307 → /login` assertion). An anonymous
   request to `https://$CONSOLE_HOST/` must be **401** — IAP returns 302 only when the client
   advertises it can handle HTML, so a default `curl` receives 401 — **and the response must carry
   IAP's own denial header** (`x-goog-iap-generated-response`). The status code alone is too weak an
   assertion: a 401 can come from the application, from a misrouted backend, or from a load balancer
   with no policy on it at all, and every one of those would pass a bare status check while the gate
   was absent. The header is the only part of the response that only IAP can produce. This is a
   stronger claim than today's: the refusal happens in a different system and the request never
   reaches the application.
4. **The management-key path is not anonymous** (new, one line). Anonymous
   `GET https://$CONSOLE_HOST/api/platform/v1/agents` must be refused with the same header — asserting
   on the risk itself rather than on a proxy for it, and for the same reason as above, on the header
   rather than only on the code.
5. **The in-pod deep check, simplified** (rewrites the `kubectl exec` step). The login preamble is
   deleted: with no password, `/api/health?deep=1` no longer self-gates, and the script collapses to a
   single `fetch`. **Add `body.login_gate === false` as an assertion.** That is not decoration —
   today's login step is the only assertion in the whole pipeline about the _running container's_
   properties rather than about a Secret Manager payload or an external HTTP response, and deleting it
   would remove the only detector for a stale Secret or a manifest still injecting a password.
6. **Delete** the `jq -e '.login_gate == true'` assertion, whose subject is now permanently false and
   whose failure message is contrary to fact.
7. **The step summary** reports `https://$CONSOLE_HOST` and the 401, not `http://$ip` and the 307.

## Deliberate divergences and risks carried

Recorded here and, where they concern the deployment, in `docs/deploy-gcp.md`.

- **The production container has no gate of its own.** That is the design, and its cost is paid by the
  `NetworkPolicy` in slice 2. It also means the published GHCR image run anywhere
  without a proxy and without `CONSOLE_PASSWORD` is wide open — which is exactly today's documented
  behaviour for an unset password, unchanged, but it is now the shape the reference deployment uses.
  An explicit "I am behind a proxy" affirmation was considered and rejected: it would declare intent
  rather than observe evidence, would be copied along with any manifest it was meant to protect, and
  would be a breaking change to a published image. Smoke assertions 3, 4 and 5 observe the same
  property instead.
- **IAP is GCP-only.** Self-hosters are unaffected and keep the password gate; but this repository's
  reference deployment now demonstrates something a reader cannot reproduce off GCP. Say so in
  `deploy/k8s/README.md` rather than letting the manifests imply otherwise.
- **This does not cover the platform API, and IAP is not the answer there — ever.** Per D3 the control
  plane keeps its own public load balancer and `x-api-key`. "We added Google sign-in" will be read as
  broader than it is, so state the boundary in both deployment docs, and state the reason with it,
  because the obvious next thought is to put IAP in front of the platform too. **IAP cannot read
  `x-api-key`**: it accepts only a Google-issued OIDC token, so a fully compliant wire client holding
  a valid key is refused _before_ the platform's middleware runs — `requireAPIKey`
  (`internal/api/auth.go`) never sees the request. That is not a 404 or a 501 the console could
  feature-detect around; it is a pre-protocol refusal, and principle 3 exists precisely to prevent an
  endpoint that only a Google client can drive. The platform's own two `Authorization`-bearing lanes
  (`internal/api/envauth.go` for BYOC workers, `internal/api/gateauth.go` for the gate sidecar) would
  collide with IAP's use of the same header on top of that. The right way to shrink the platform's
  exposure is the one its own `docs/deploy-gcp.md` already names as the target state — `service.type`
  back to `ClusterIP`, since nothing outside the cluster calls it today — with Cloud Armor in front of
  a Gateway if an external worker ever appears. That work belongs to the platform repository and is
  not in this plan's scope.
- **The IP changes.** Anything bookmarking or allowlisting the old address breaks.
- **`domain:${WORKSPACE_DOMAIN}` admits every current and future Workspace account.** Correct for a
  single-operator staging deployment, and wider than the shared password it replaces. A Google Group
  binding narrows it later without touching anything in this repository.
- **SSE across the new path is a real risk with a silent failure mode.** `timeoutSec` is the known
  half and slice 1 fixes it; whether IAP adds buffering of its own is not documented either way, which
  is why slice 2's acceptance requires a trace that streams for over two minutes rather than one that
  merely opens. IAP authorizes per request, so an expiring session mid-stream is a second unknown with
  the same shape — the client retries with backoff and reports nothing.
- **Break-glass needs no second door on the internet.** A second `@${WORKSPACE_DOMAIN}` account is the first
  answer. If IAP or Google is unavailable, `kubectl -n ${K8S_NAMESPACE} port-forward deploy/console 3000:3000`
  reaches an ungated console — appropriate, not a hole: anyone who can port-forward can also read
  `console-secrets` and drive the platform directly, so the console grants strictly less. Note that
  exporting `CONSOLE_PASSWORD` in a local shell does nothing; `src/proxy.ts`:5 reads the _running
  container's_ environment.
- **Verifying `x-goog-iap-jwt-assertion` is deliberately not done.** IAP recommends it against the
  case where IAP is disabled or bypassed; the concrete bypass in this deployment is the pod's own
  port, which slice 2 closes at the bind address. Also the assertion's `aud` embeds the backend
  service ID, which changes whenever the Ingress is recreated — hard-coding it would lock everyone out
  on a rebuild. Revisit only if a second backend or a second reader appears.

## Deployment identifiers in a public repository

This repository is public, and `deploy/k8s/`, `.github/workflows/deploy.yml` and `docs/deploy-gcp.md`
already name one specific deployment: a GCP project, a cluster, a zone, a namespace, a deploy service
account, an Artifact Registry path, and — once this plan lands — a hostname. The sibling platform
repository does the same in `deploy/gcp/`. **None of it is a credential**, and that is by design: there
is no service-account key anywhere, Workload Identity Federation only trusts tokens from repositories
in this organization, and every secret is read from Secret Manager at deploy time. Making these
identifiers public does not grant anyone anything.

It does two other things, and this plan takes a position on each.

- **It hands a reader a target list** — the project, the cluster, and the hostname of an operator
  console that holds a full-power management key. The trust policy is what actually stops an attacker,
  so this is depth rather than a hole, but it is free to reduce.
- **It couples an open-source project to one operator's deployment.** Someone cloning this to run
  their own console inherits manifests they must edit and documentation describing a cluster they
  cannot reach. That is a real cost to the project's premise, and the larger of the two problems.

**D5 settles both, and this plan is the first document written under it.** Deployment identifiers
become Actions variables — not secrets, because they are not secret, merely the maintainer's — and
everything in git refers to them by name. Two consequences worth stating plainly:

- **This plan introduces no new identifier.** An earlier draft reproduced the organization ID and the
  Workspace customer ID, neither of which had ever appeared in this repository; both are gone. The
  Workspace domain and the console hostname, which this plan would otherwise have been the first to
  publish here, are `${WORKSPACE_DOMAIN}` and `${CONSOLE_HOST}`.
- **What is already in git history stays there.** Sweeping the existing literals out of
  `deploy/k8s/`, `.github/workflows/deploy.yml` and `docs/deploy-gcp.md` — and the platform
  repository's `deploy/gcp/` — is its own piece of work in both repositories, tracked separately; it
  reduces what is published from here on and cannot retroactively unpublish anything. Rewriting the
  history of two repositories that have already cut releases was considered and declined: these are
  identifiers, not credentials, and the trust policy is what protects the deployment.

Until that sweep lands, the honest statement in the README is that `deploy/` is **a reference
deployment, not a template** — it demonstrates a working shape and names the one cluster it was proven
against.

## If a second service ever needs the same login

This is the future in which the decision above is wrong, and the cost of being wrong is bounded
because the seam is at the edge either way.

**The switch is: delete three lines of `BackendConfig`, add ~35 lines of sidecar to
`deployment.yaml`, change `targetPort`, widen CD's credential pipeline from one payload to three.**
`src/` unchanged, tests unchanged, fidelity unchanged, hostname unchanged, certificate unchanged,
Ingress unchanged. oauth2-proxy validates its domain rule against `session.Email` on every request
regardless of provider, so a Google issuer and a Casdoor issuer are the same code path — the later
Google→Casdoor move is `--oidc-issuer-url` plus a client id, roughly two lines.

Three sharp edges to carry forward if that day comes, all discovered while costing this plan:
oauth2-proxy defaults to binding `127.0.0.1`, so `--http-address=0.0.0.0:4180` is mandatory or the
kubelet never marks the pod ready; `--skip-auth-route` matches **paths**, and a rule for
`/api/health` would expose `/api/health?deep=1` — the management-key lever — because a query string
is not part of a Go `URL.Path`; and its `--email-domain` is a string comparison, strictly weaker than
the IAM binding it would replace, so a Casdoor deployment must carry its own registration policy
(`EnableSignUp=false` plus pre-created users, **not** the broken `EmailRegex`).

Deploying Casdoor is a separate project with its own hostname, certificate, database and admin
surface, and it does not replace this seam — it replaces the issuer behind it.

## Open questions

| Question                                                                                                                                                                                                                                                                                      | What settles it                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D4 — the hostname.** Needed before precondition step 2, not before step 1: the static IP is reserved without it. It lands in `ManagedCertificate.spec.domains`, the Ingress host rule, and the `${CONSOLE_HOST}` variable — all three redeployable, none of them registered with an issuer. | The maintainer. Any zone whose DNS they control; it need not be the Workspace domain.                                                                                                                                                   |
| Does the zone's DNS provider proxy the record by default (Cloudflare's orange cloud, or equivalent)? A proxied record stalls the managed certificate at `FAILED_NOT_VISIBLE` indefinitely and reads as "still waiting".                                                                       | `dig +short ${CONSOLE_HOST} @8.8.8.8` must return the address printed by precondition step 1, not merely some address.                                                                                                                  |
| Does a ClusterIP Service need an explicit `cloud.google.com/neg` annotation here, or does GKE create the NEG automatically?                                                                                                                                                                   | After precondition step 3: `kubectl get svc console -n ${K8S_NAMESPACE} -o jsonpath='{.metadata.annotations}'`                                                                                                                          |
| Can the deploy service account create `Ingress`, `BackendConfig` and `ManagedCertificate` in the namespace? `docs/deploy-gcp.md` says it holds cluster-driving but explicitly not infrastructure permissions.                                                                                 | `kubectl auth can-i create ingress -n ${K8S_NAMESPACE} --as=<SA>`, or the first CD run after slice 1 merges.                                                                                                                            |
| With the Google-managed OAuth client, what audience does CI use to mint an id_token for an authenticated smoke request? If there is no stable answer, smoke assertion 2 stays as the backend-health poll and only the negative assertions (3, 4) run against the public address.              | After IAP is enabled: `gcloud iap settings get --resource-type=backend-services --service=NAME`, or one CI request with a token.                                                                                                        |
| **Not deferred — precondition step 0 settles it, and slice 2 is blocked until it does.** Can `${GKE_CLUSTER}` enforce a `NetworkPolicy`? With the loopback bind ruled out there is no second mechanism, so a cluster that cannot enforce one cannot take the password removal.                | `gcloud container clusters describe ${GKE_CLUSTER} --zone ${GCP_ZONE} --project ${GCP_PROJECT_ID} --format='value(networkConfig.datapathProvider,addonsConfig.networkPolicyConfig)'` — expect `ADVANCED_DATAPATH`, or the addon enabled |
| Does `kubectl port-forward` still reach the pod once the `NetworkPolicy` is in place? Break-glass depends on it, and whether node-originated traffic is subject to policy varies by CNI.                                                                                                      | After slice 2: `kubectl port-forward -n ${K8S_NAMESPACE} deploy/console 3000:3000` then `curl -I http://localhost:3000/login`                                                                                                           |
| Does IAP buffer or time out SSE beyond `timeoutSec`? No documentation says either way.                                                                                                                                                                                                        | Slice 2's two-minute trace, observed once by hand before the surface is called done.                                                                                                                                                    |
