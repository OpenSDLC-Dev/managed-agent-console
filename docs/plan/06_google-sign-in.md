---
status: draft
---

# Google sign-in — the staging console stops being a shared password on a bare IP

Requested 2026-08-09. Staging today is a shared password typed over plain HTTP into a bare public
IPv4, and the thing behind it is a full-power platform management key. This plan replaces that with
**Google sign-in restricted to `@hhstudio.ai`, enforced at the load balancer by GCP IAP**, and takes
the password out of production entirely. The console gains no authentication code — it loses the
authentication code it has.

Four decisions were taken by the maintainer before drafting (2026-08-09):

- **D1 — Casdoor is not part of this.** The maintainer keeps a checkout of
  [casdoor/casdoor](https://github.com/casdoor/casdoor) and asked whether it could serve this; the
  answer, after reading it, is that it could but should not (below). Nothing here waits on it, and
  nothing here forecloses it — [what changes if a second service ever needs the same
  login](#if-a-second-service-ever-needs-the-same-login) is costed at the end.
- **D2 — `CONSOLE_PASSWORD` stays for local development and the test suites, and leaves production.**
  The GCP pod gets no password path at all.
- **D3 — scope is the console UI.** The platform's own control-plane API keeps its public load
  balancer and its `x-api-key`, unchanged and ungated by this work.
- **D4 — the hostname is not yet chosen.** This plan assumes `console.hhstudio.ai` throughout; it
  appears in three places and one of them cannot be changed by redeploying (below).

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
- **This project is under the maintainer's Workspace organization.** `gcloud projects describe
hh-opensdlc-managed-agents --format='value(parent.type,parent.id)'` → `organization 578372022138`;
  `gcloud organizations list` → `hhstudio.ai`, `578372022138`, customer `C01p525ih`. And
  `hhstudio.ai` resolves `MX 1 smtp.google.com` with nameservers `dns1/dns2.registrar-servers.com`
  (Namecheap) — Workspace mail, DNS edited by hand.

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
- **`domain:hhstudio.ai` is a valid IAM principal**
  ([cloud.google.com/iam/docs/principal-identifiers](https://docs.cloud.google.com/iam/docs/principal-identifiers)),
  and IAP documents Workspace domains as principals for `roles/iap.httpsResourceAccessor`. This is a
  membership check against the Workspace directory, not a string match on an email suffix — see the
  decision below for why that difference decides this plan.
- **IAP is free** ([cloud.google.com/iap/pricing](https://cloud.google.com/iap/pricing)). The
  Ingress replaces the existing network load balancer rather than adding one.
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
  "only `@hhstudio.ai`", and its reject branch at `controllers/auth.go:932-935` has no `return`;
  `ResponseError` writes JSON without aborting the Beego handler, and :938 proceeds into sign-in. The
  adjacent failure branch at :930 _does_ return, so this is an omission rather than a soft warning.
  The mechanism that does hold is `EnableSignUp=false` plus pre-created users — a whitelist with one
  row on it.

## The decision

**GCP IAP on a GKE Ingress, with access granted by the IAM binding `domain:hhstudio.ai`.** The console
keeps no identity code, gains no container, and holds no OAuth credential; production runs the image
with `CONSOLE_PASSWORD` unset and the gate lives entirely at the load balancer.

Three reasons, in the order the project's principles put them:

1. **It is the literal implementation of principle 5.** _"The optional console login gate is
   deployment protection, not a user system."_ Deployment protection belongs to the deployment. After
   this change the production console has no accounts, no roles, no per-user state and no
   authorization branch anywhere in `src/` — a smaller authentication surface than today's 5 files,
   not a larger one.
2. **`domain:hhstudio.ai` is a stronger check than any email-suffix rule.** IAM resolves the principal
   against the Workspace directory. Every application-level alternative — a hand-rolled `hd` check, an
   `--email-domain` flag on a proxy, Casdoor's `EmailRegex` — compares a string, and a consumer Google
   account carrying a verified `@hhstudio.ai` address satisfies a string comparison while not being a
   member of anything. Getting the strongest form of the rule for zero lines of code is the whole
   argument.
3. **Nothing in the repository becomes GCP-specific.** IAP is configuration of one deployment, not
   code in the image. A self-hoster keeps `CONSOLE_PASSWORD` and the semantics they have today; the
   published GHCR image is byte-identical in behaviour.

| Option                          | Why it loses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GCP IAP**                     | **Chosen.** 3 lines of YAML, one IAM binding, $0, membership-based rule, nothing new to operate or patch.                                                                                                                                                                                                                                                                                                                                                                                              |
| Casdoor                         | Not disqualified — disproportionate. 88k LOC of Go, 309 module requirements, a 319-file React admin, an LDAP and a RADIUS listener started unconditionally (`main.go:144-152`), a first-boot `built-in/admin` / `123` (`object/init.go:170`), a second hostname, a second certificate and a second database — to express a rule whose working form is a one-row whitelist, via a field that is broken. See [below](#if-a-second-service-ever-needs-the-same-login) for the future in which this flips. |
| oauth2-proxy sidecar            | The right answer to a question D1 removed. It buys issuer portability — the same container speaks OIDC to Google today and to Casdoor later — at the cost of a container to patch, two new secrets, a widening of CD's credential pipeline from two payloads to four, and a domain rule that is a string comparison rather than a membership check. Kept as the documented upgrade path, not adopted now.                                                                                              |
| In-app OIDC relying party       | ~250 lines of production code plus ~400 of tests, a client secret in the process that already holds the management key, a session cookie format to redesign (today's has no expiry), and under D2 no way for CD's in-pod deep check to authenticate at all. Principle 4 says the console owns presentation.                                                                                                                                                                                            |
| Cloudflare Access               | Free tier fits, but the free plan requires full-zone setup: `hhstudio.ai`'s nameservers move off Namecheap, and that zone carries the Workspace MX. The blast radius of a DNS migration is company email. Policy also lives in a dashboard rather than in git.                                                                                                                                                                                                                                         |
| ingress-nginx + `auth-url`      | Run and patch an ingress controller, give up ManagedCertificate, and inherit `proxy_buffering: on` — an SSE hazard to remember to switch off.                                                                                                                                                                                                                                                                                                                                                          |
| Cloud Armor source-IP allowlist | Not authentication; no roaming, no phones. Worth three lines only if slice 1 slips by more than a week, and it expires the moment the Service becomes ClusterIP.                                                                                                                                                                                                                                                                                                                                       |

**What would reverse this:** a second service needing the same login inside the next year. IAP secures
one load balancer; it does not become an issuer for anything else. The cost of being wrong is bounded
and is stated in [the last section](#if-a-second-service-ever-needs-the-same-login).

## Precondition: a hostname and TLS

Identical for every option in the table, so none of it is wasted whatever is decided later. **CD does
not do any of it** — [deploy.yml](../../.github/workflows/deploy.yml) owns build, push, deploy, smoke
and explicitly _"does not run Terraform"_; static IPs, DNS and IAM stay human and interactive.

1. **Reserve a global static IPv4.** A `gce`-class Ingress fronts a _global_ external Application Load
   Balancer, whose forwarding rule requires a global address; the current ephemeral _regional_ IP of
   the passthrough NLB cannot be promoted to one. **The public IP changes** — accepted deliberately,
   because the alternative that preserves it (regional Gateway API + Certificate Manager DNS
   authorization) costs an interactive cluster change to buy back an IP that was never published.

   ```bash
   gcloud compute addresses create console-ip --global --project hh-opensdlc-managed-agents
   gcloud compute addresses describe console-ip --global \
     --project hh-opensdlc-managed-agents --format='value(address)'
   ```

2. **Add one A record at Namecheap.** Advanced DNS → Host Records → `A Record`, host `console`, value
   from step 1. Not a CNAME and not a URL redirect — GCP requires the record to point at the load
   balancer with nothing in the path. **Touch no MX record.** Confirm with
   `dig +short console.hhstudio.ai @8.8.8.8`.

3. **Apply the edge objects by hand and wait for the certificate**, before slice 1's PR merges (see
   the slice for why):

   ```bash
   gcloud container clusters get-credentials map-staging \
     --zone us-central1-a --project hh-opensdlc-managed-agents
   kubectl apply -n map -f deploy/k8s/edge.yaml
   kubectl annotate svc console -n map \
     cloud.google.com/backend-config='{"default":"console"}'
   kubectl patch svc console -n map -p '{"spec":{"type":"ClusterIP"}}'
   kubectl get managedcertificate console -n map -w   # until certificateStatus: Active
   ```

   First issuance is typically 15–60 minutes after DNS resolves, and the load balancer may take up to
   30 more to serve it. `FAILED_NOT_VISIBLE` is a waiting state, not a failure — deleting and
   recreating only restarts the clock.

4. **Prove the backend is healthy on the pinned path** — the trap that otherwise presents as a
   permanently 502 hostname with a green rollout:

   ```bash
   gcloud compute backend-services list --global
   gcloud compute backend-services get-health NAME --global          # HEALTHY
   gcloud compute health-checks describe NAME --global \
     --format='yaml(httpHealthCheck)'                                # requestPath: /api/health
   ```

5. **Grant access** (slice 2's precondition). `cd-deployer` needs it too, if the smoke gate is to make
   an authenticated request:

   ```bash
   gcloud projects add-iam-policy-binding hh-opensdlc-managed-agents \
     --member='domain:hhstudio.ai' --role='roles/iap.httpsResourceAccessor'
   gcloud projects add-iam-policy-binding hh-opensdlc-managed-agents \
     --member='serviceAccount:cd-deployer@hh-opensdlc-managed-agents.iam.gserviceaccount.com' \
     --role='roles/iap.httpsResourceAccessor'
   ```

6. **Rotate `console-password`.** It has been crossing the public internet in the clear for as long as
   staging has existed. Do this even though D2 removes it — it is still the local-development and test
   credential, and it is compromised.

## Slices

### Slice 1 — `feat(deploy): publish the console on console.hhstudio.ai with managed TLS`

TLS and a hostname, **with the gate untouched**: the password stays, `307 → /login` stays the
assertion. Independently correct and independently valuable — even if everything below were abandoned,
this stops the password and every session cookie crossing the wire in the clear.

- **New `deploy/k8s/edge.yaml`** (~70 lines with comments; four objects in one file — the apply loop
  already handles multi-document files, and this directory is deliberately not a chart):
  - `Ingress`: `kubernetes.io/ingress.class: gce`,
    `kubernetes.io/ingress.global-static-ip-name: console-ip`,
    `networking.gke.io/managed-certificates: console`,
    `networking.gke.io/v1beta1.FrontendConfig: console`, one host rule.
  - `ManagedCertificate`: `spec.domains: [console.hhstudio.ai]`.
  - `BackendConfig`: `healthCheck.requestPath: /api/health` and `port: 3000` — **both traps live
    here**; and `timeoutSec: 3600` for SSE. Each gets a comment naming the failure it prevents,
    because both failures are silent.
  - `FrontendConfig`: `redirectToHttps.enabled: true`. Do **not** set
    `kubernetes.io/ingress.allow-http: "false"` — the redirect needs HTTP listening.
- **`deploy/k8s/service.yaml`**: drop `type: LoadBalancer` (ClusterIP is the default), add the
  backend-config annotation, rewrite the header comment at :1-7 and the `port: 80` comment at :22 —
  both now assert things that are false. ~−6/+10.
- **`.github/workflows/deploy.yml`**: add `CONSOLE_HOST: console.hhstudio.ai` to the `env:` block;
  delete the external-IP polling loop (a ClusterIP Service has no `status.loadBalancer.ingress`) and
  target `https://$CONSOLE_HOST` directly; add a fail-fast check that `managedcertificate console`
  reports `Active`, so a still-issuing certificate reads as one clear message instead of a 300-second
  timeout followed by an automatic rollback of a healthy revision. Every assertion otherwise
  unchanged. ~−20/+25.
- **Docs, same PR**: `deploy/k8s/README.md`'s "Known limitation: plain HTTP on a bare IP" section and
  its migration checklist, `docs/deploy-gcp.md`'s corresponding section and its two references to the
  bare IP, `README.md`, `CHANGELOG.md` under `## [Unreleased]`, `STATE.md`.
- **`src/`: no change. Tests: no change. Fidelity: no re-shoots.**
- **Proves it worked**: `curl -sSI https://console.hhstudio.ai/` returns 307 to `/login`; one green CD
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
- **Close the pod's lateral exposure, in this same PR** — the container currently listens on
  `0.0.0.0:3000` (`Dockerfile`:30) and after this PR nothing gates it, with a management-key-injecting
  BFF behind it. Preferred fix: set `HOSTNAME: 127.0.0.1` in the pod's `env`, overriding the image
  default, which means the two `httpGet` probes must become `exec` probes (probes run in the
  container's network namespace, so loopback is reachable). Fallback if the base image lacks a usable
  `wget`: a `NetworkPolicy` admitting only the GCLB health-check ranges and the NEG path. **One of the
  two ships with this PR; removing the password without it is the one sequencing error this plan
  cannot absorb.**
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
- **Proves it worked**: anonymous `curl` of `https://console.hhstudio.ai/` is refused by IAP rather
  than served; `henry@hhstudio.ai` reaches `/agents` in a browser; a Google account outside the
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
3. **The gate is closed** (replaces the `307 → /login` assertion). An anonymous request to
   `https://$CONSOLE_HOST/` must be **401** — IAP returns 302 only when the client advertises it can
   handle HTML, so a default `curl` receives 401. This is a stronger claim than today's: the refusal
   happens in a different system and the request never reaches the application.
4. **The management-key path is not anonymous** (new, one line). Anonymous
   `GET https://$CONSOLE_HOST/api/platform/v1/agents` must not be 200 — asserting on the risk itself
   rather than on a proxy for it.
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
  loopback bind (or NetworkPolicy) in slice 2. It also means the published GHCR image run anywhere
  without a proxy and without `CONSOLE_PASSWORD` is wide open — which is exactly today's documented
  behaviour for an unset password, unchanged, but it is now the shape the reference deployment uses.
  An explicit "I am behind a proxy" affirmation was considered and rejected: it would declare intent
  rather than observe evidence, would be copied along with any manifest it was meant to protect, and
  would be a breaking change to a published image. Smoke assertions 3, 4 and 5 observe the same
  property instead.
- **IAP is GCP-only.** Self-hosters are unaffected and keep the password gate; but this repository's
  reference deployment now demonstrates something a reader cannot reproduce off GCP. Say so in
  `deploy/k8s/README.md` rather than letting the manifests imply otherwise.
- **This does not cover the platform API.** Per D3 the control plane keeps its own public load
  balancer and `x-api-key`. "We added Google sign-in" will be read as broader than it is; state the
  boundary in both deployment docs.
- **The IP changes.** Anything bookmarking or allowlisting the old address breaks.
- **`domain:hhstudio.ai` admits every current and future Workspace account.** Correct for a
  single-operator staging deployment, and wider than the shared password it replaces. A Google Group
  binding narrows it later without touching anything in this repository.
- **SSE across the new path is a real risk with a silent failure mode.** `timeoutSec` is the known
  half and slice 1 fixes it; whether IAP adds buffering of its own is not documented either way, which
  is why slice 2's acceptance requires a trace that streams for over two minutes rather than one that
  merely opens. IAP authorizes per request, so an expiring session mid-stream is a second unknown with
  the same shape — the client retries with backoff and reports nothing.
- **Break-glass needs no second door on the internet.** A second `@hhstudio.ai` account is the first
  answer. If IAP or Google is unavailable, `kubectl -n map port-forward deploy/console 3000:3000`
  reaches an ungated console — appropriate, not a hole: anyone who can port-forward can also read
  `console-secrets` and drive the platform directly, so the console grants strictly less. Note that
  exporting `CONSOLE_PASSWORD` in a local shell does nothing; `src/proxy.ts`:5 reads the _running
  container's_ environment.
- **Verifying `x-goog-iap-jwt-assertion` is deliberately not done.** IAP recommends it against the
  case where IAP is disabled or bypassed; the concrete bypass in this deployment is the pod's own
  port, which slice 2 closes at the bind address. Also the assertion's `aud` embeds the backend
  service ID, which changes whenever the Ingress is recreated — hard-coding it would lock everyone out
  on a rebuild. Revisit only if a second backend or a second reader appears.

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

| Question                                                                                                                                                                                                                                                                         | What settles it                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D4 — the hostname.** It appears in `ManagedCertificate.spec.domains`, the Ingress host rule, and (if IAP ever moves to a self-managed OAuth client) a Google OAuth client's redirect URI. The last cannot be changed by redeploying.                                           | The maintainer, before precondition step 1.                                                                                                             |
| Is `map-staging` VPC-native? If not, the Service needs `NodePort` and `BackendConfig.healthCheck.port` must name the node port instead of 3000.                                                                                                                                  | `gcloud container clusters describe map-staging --zone us-central1-a --format='value(ipAllocationPolicy.useIpAliases)'`                                 |
| Is the `HttpLoadBalancing` addon enabled? If not the Ingress object sits there and never gets an address.                                                                                                                                                                        | `… --format='value(addonsConfig.httpLoadBalancing.disabled)'`                                                                                           |
| Does a ClusterIP Service need an explicit `cloud.google.com/neg` annotation here, or does GKE create the NEG automatically?                                                                                                                                                      | After precondition step 3: `kubectl get svc console -n map -o jsonpath='{.metadata.annotations}'`                                                       |
| Can `cd-deployer` create `Ingress`, `BackendConfig` and `ManagedCertificate` in `map`? `docs/deploy-gcp.md` says it holds cluster-driving but explicitly not infrastructure permissions.                                                                                         | `kubectl auth can-i create ingress -n map --as=<SA>`, or the first CD run after slice 1 merges.                                                         |
| With the Google-managed OAuth client, what audience does CI use to mint an id_token for an authenticated smoke request? If there is no stable answer, smoke assertion 2 stays as the backend-health poll and only the negative assertions (3, 4) run against the public address. | After IAP is enabled: `gcloud iap settings get --resource-type=backend-services --service=NAME`, or one CI request with a token.                        |
| Does `node:24-alpine` ship a usable BusyBox `wget` for the `exec` probes the loopback bind requires?                                                                                                                                                                             | `docker run --rm node:24-alpine wget --help`                                                                                                            |
| Does `kubectl port-forward` still reach the container after the loopback bind? Break-glass depends on it.                                                                                                                                                                        | After slice 2: `kubectl port-forward -n map deploy/console 3000:3000` then `curl -I http://localhost:3000/login`                                        |
| Can `map-staging` enforce a `NetworkPolicy`, if the loopback bind proves unworkable?                                                                                                                                                                                             | `gcloud container clusters describe map-staging --zone us-central1-a --format='value(networkConfig.datapathProvider,addonsConfig.networkPolicyConfig)'` |
| Does IAP buffer or time out SSE beyond `timeoutSec`? No documentation says either way.                                                                                                                                                                                           | Slice 2's two-minute trace, observed once by hand before the surface is called done.                                                                    |
