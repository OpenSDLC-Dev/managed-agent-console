# Deploying to GCP

How the console reaches the staging cluster, what proves a deployment worked,
and what to do when one does not. The objects themselves are in
[deploy/k8s/](../deploy/k8s/); the pipeline is
[.github/workflows/deploy.yml](../.github/workflows/deploy.yml).

This is deployment, not release. A release publishes a versioned, multi-arch
image to GHCR for anyone to pull ([docs/releasing.md](./releasing.md)); this
pushes a commit-tagged image to a private Artifact Registry and rolls one
cluster. The two are independent — staging runs `main`, not the newest tag.

## Where it goes

Nowhere this file names. **`deploy/` is a reference deployment, not a template**
— it demonstrates a shape that works, and the one deployment it was proven
against is described here by variable rather than by name, because this
repository is public. Each of these is a GitHub Actions **variable** (Settings →
Secrets and variables → Actions → Variables), not a secret: none of them grants
anything, the credentials live in Secret Manager, and the Workload Identity
Federation trust policy is what actually protects the deployment. They are held
outside the repository because naming them here would hand a reader a target
list and would tie an open-source project to one operator's cluster.

| Variable                  | What it names                                                                  |
| ------------------------- | ------------------------------------------------------------------------------ |
| `GCP_PROJECT_ID`          | the project everything below lives in                                          |
| `GKE_CLUSTER`, `GCP_ZONE` | the cluster and its zone                                                       |
| `K8S_NAMESPACE`           | the namespace, shared with the platform                                        |
| `ARTIFACT_REGISTRY_HOST`  | the registry host Docker authenticates to                                      |
| `CONSOLE_IMAGE_REPO`      | the image repository; the tag is always the commit sha                         |
| `WIF_PROVIDER`            | the Workload Identity Federation provider the job's OIDC token is exchanged at |
| `DEPLOY_SERVICE_ACCOUNT`  | the identity that provider lets this repository impersonate                    |
| `PLATFORM_BASE_URL`       | the control plane's in-cluster Service URL                                     |

The workflow's **first step asserts every one of them is set and non-empty**,
before it authenticates or builds anything. An unset variable renders as the
empty string rather than failing, and `gcloud --project ""`, `kubectl -n ""` and
an image tag with no repository all fail late and confusingly; the point of that
step is that a deployment missing its configuration says so in one line.

One environment, called staging. The console sits beside the platform rather
than in a namespace of its own, so it reaches the control plane over cluster DNS
and **no request carrying the management key crosses a public network**. It
never reaches a browser (CLAUDE.md principle 2) and it never rides the console's
own public address; every call that spends it is pod-to-Service inside the
namespace. `deployment.yaml` therefore carries the placeholder
`CONTROLPLANE_URL`, substituted from `PLATFORM_BASE_URL` at apply time — spelled
differently from the container variable it is assigned to on purpose, since a
`sed` on that name would rewrite the key beside the value.

That is the runtime guarantee, and it is narrower than "the key never leaves the
cluster": the deploy job below reads it out of Secret Manager onto a GitHub
runner in order to write the Kubernetes Secret in the first place. What bounds
that handling is the job, not the cluster — the value is masked, written to a
file rather than an argv, and shredded on exit.

## The trigger

Push to `main`, plus `workflow_dispatch`. With a single environment, "merged"
and "deployed" are the same event; a manual promotion step would only be a
button somebody forgets to press. Dispatch exists for the deploys that follow no
commit — a rotated secret, a cluster rebuilt under the same name — and it does
something on an unchanged `main` because the pod template carries a checksum of
the two secret payloads (below), not only because the workflow re-runs.

Runs are serialized and **never cancelled** (`concurrency: cancel-in-progress:
false`). Two pushes in a minute queue; killing one mid-rollout would leave the
cluster holding half of each revision.

## Identity: no secrets in this repository

There is no `GCP_SA_KEY`, and there is nothing to leak from GitHub settings. The
job asks GitHub for a short-lived OIDC token, Workload Identity Federation
exchanges it for an impersonation of the `DEPLOY_SERVICE_ACCOUNT`, and the
credentials the deployment itself needs are read from Secret Manager **inside**
the job:

| Secret Manager secret  | Becomes                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `controlplane-api-key` | the `platform-api-key` key of the `console-secrets` Secret → `PLATFORM_API_KEY` |
| `console-password`     | the `console-password` key of the same Secret — mounted by no current revision  |

`controlplane-api-key` is the same value the platform chart installs as
`controlplane.apiKey` — one secret, two readers, which is what makes the
console's key valid at all.

`console-password` is the console's own gate, and **this deployment does not use
it**: authentication is IAP's. It is still written because `rollout undo` below
can restore a revision from before that change, which mounts the key — and the
Secret is replaced rather than patched, so dropping the key would turn a
rollback into an outage. It stops being read now and stops existing in a
follow-up, once no revision in history mounts it.

Both must be a **single line**, and the job rejects the run if either is not. A
trailing newline is the easy way to get this wrong — `--data-file=-` stores the
Enter you pressed — and that byte rides into the container as an `x-api-key`
Node refuses to send at all, so the job strips one before writing the Kubernetes
Secret.

The WIF provider only accepts tokens from repositories owned by `OpenSDLC-Dev`,
and each repository is separately bound to impersonate the deploy identity. That
identity holds exactly what CD needs — push images, drive the cluster, read
secrets — and notably **not** the permissions to change infrastructure.

**CD does not run Terraform.** The cluster, the registry, the WIF pool, the
service account, and the secrets are human-driven and interactive on purpose.
This pipeline owns four verbs: build, push, deploy, smoke.

The image is built on the runner with `docker build` and pushed, rather than
submitted to Cloud Build. The runner already holds the deploy identity, so
`docker` is the shorter path — and a Cloud Build submission in this project needs
an explicit `--service-account=` naming the deploy identity, because a project
created under an organization no longer grants Editor to the Compute Engine
default service account and that default identity cannot even stage the source
bucket.

Rotating a credential therefore means adding a Secret Manager version and
re-running the workflow (`workflow_dispatch`) — never editing anything here, and
never a `kubectl` command afterwards. The run writes a `console-secrets/checksum`
annotation, a `sha256` of the two payloads, into the pod template, so a rotation
on an unchanged `main` is a **new revision** and the pod actually rolls. Without
that the re-applied Deployment would be byte-identical, `rollout status` would
return instantly green, and the pod would keep running with the old credentials
— a re-deploy that reports success and did nothing, which is the failure mode
`workflow_dispatch` exists to avoid.

## What the smoke gate proves

`kubectl rollout status` only proves the container starts and answers the
shallow readiness probe — which reads configuration and touches no network. A
revision can pass that with a wrong key, a wrong base URL, or a platform that
is not there.

Two steps follow it, because two different things need proving and they are
reachable from two different places.

**Can this revision serve? — from inside the pod.** `GET /api/health?deep=1`
makes the console call `/v1/agents?limit=1` on the platform with the management
key, and must answer **200**: both environment variables are set, and the
platform accepts the key. A wrong key answers 401 and the gate reports it; an
unreachable control plane reports `reachable: false`. That depth answers
sessions only, and this job holds no Google identity IAP would accept — so the
step runs it with `kubectl exec` against the pod carrying the image just pushed,
over `127.0.0.1`. That is the supported path, not the only reachable one: IAP
refuses **anonymous** callers, so a signed-in member of the Workspace can fetch
`?deep=1` from a browser. No escalation follows — the same person can drive
every page of the console, and every page spends the same key. The response body
names environment variables and a status code and carries no URL and no key,
which is why the job prints it.

**Is the public address gated? — from outside.** Every path through the front
door is a 401 now, so a request can no longer distinguish "gated" from "broken".
Reachability is therefore taken from the load balancer's own view — the GCLB
backend must report `HEALTHY`, which is the same signal it routes on — and the
gate is asserted separately, twice.

That health state is read from the Ingress' `ingress.kubernetes.io/backends`
annotation rather than from `gcloud compute backend-services get-health`, and
the reason is the identity above: **CD holds no compute permissions**, so the
gcloud form fails with `Required 'compute.backendServices.list' permission`.
The ingress controller publishes the same state it reads from GCLB onto that
annotation, which `kubectl` can already see. Widening the deploy identity to
read all of Compute in order to run one assertion would have been the wrong
trade.

The two gate assertions are:

- an anonymous `GET /` must be **401**, and
- an anonymous `GET /api/platform/v1/agents` — the path that actually spends the
  management key — must be too.

**Both must carry `x-goog-iap-generated-response`.** The status code alone is far
too weak: a 401 can come from the application, from a misrouted backend, or from
a load balancer with no policy on it whatsoever, and every one of those passes a
bare code check while the gate is simply absent. That header is the only part of
the response nothing but IAP can produce.

Both requests send `Accept: application/json`, and that is not cosmetic: **IAP
content-negotiates its refusal.** A default `curl` sends `Accept: */*`, which
IAP reads as "can render HTML" and answers **302** to `accounts.google.com`;
only a client asking for JSON gets 401. Pinning the header makes the expected
code a fixed value rather than a property of whatever `curl` defaults to.

Both are also **polled** rather than asked once. Applying `iap.enabled` is a
request to the ingress controller, which then configures the backend service, so
on a run that turns IAP on the gate is not closed the instant `kubectl apply`
returns — measured at about two minutes on this deployment. Polling for a
_closed_ gate is safe in the direction that matters: a console that is genuinely
open never satisfies the condition, the deadline expires, and the run fails.

This is a stronger claim than the one it replaces: the refusal now happens in a
different system, and the request never reaches the application.

Before any of them, it asserts the `ManagedCertificate` reports `Active`. That
check is not an assertion about this revision at all; it is there so a
certificate still provisioning — which takes 15–60 minutes and cannot be hurried
— reads as one clear line instead of a five-minute TLS timeout followed by this
job rolling back a revision that is in every way healthy.

Two things it deliberately does not prove:

- **That the platform can run anything.** `/v1/agents` answers on a control
  plane with no model providers configured. Whether the platform is fit to serve
  sessions is the platform's own pipeline's gate, not this one's.
- **That the UI renders.** This is a reachability gate, not an e2e run; the
  Playwright suites are CI's job, on the PR, before the merge that deploys.

The job also fails, before it touches the cluster, if either Secret Manager
payload is empty. Those checks are the cheap ones, and neither is evidence about
the gate: what proves the deployed console is gated is the pair of anonymous
requests above, made against the address the internet uses, and checked for the
header only IAP can write.

**The order of the apply is itself part of the gate.** The production container
has no authentication of its own, and `iap.enabled` is a _request_ to the ingress
controller rather than an immediate state — about two minutes on this deployment.
Applying everything at once would roll a passwordless pod into a backend whose
gate was still opening, and noticing the IAP header afterwards does not undo
having served. So the edge, the `NetworkPolicy` and the Service are applied
first, the job waits for the hostname to actually refuse an anonymous request,
and only then is the Deployment applied. Where IAP is already on — every run
after the first — the wait returns on its first probe.

## Rolling back

**The pipeline rolls itself back, to a revision it named before it started.** A
gate that only reports is not much of a gate: readiness is the shallow check, so
a revision with a rejected key or an unreachable control plane passes `rollout
status` while the RollingUpdate retires the pod that worked.

The target is captured, not defaulted. `kubectl rollout undo` with no argument
means "the revision before the current one", which is not the same claim as "the
last one that worked" — and one deploy here can add two revisions, since the
apply is followed by the `kubectl set env` that removes `CONSOLE_PASSWORD`. The
default would then restore the revision _between_ them: this run's unverified
image, still carrying the password. The job reads the serving revision before it
touches anything and rolls back to that number. If any step after the apply
fails, the job runs `kubectl rollout undo` and waits for the previous revision,
so a red run leaves the last working console serving rather than the broken one.
(The platform gets the same behaviour from `helm upgrade --atomic`.) Two things
it cannot do, both reported as warnings in the run:

- **A first deployment has nothing to undo to** — and one the selector guard
  recreated has lost its history with the old object. The job says so and tells
  you to scale the Deployment to zero by hand; a broken console on a public
  hostname should not stay up because the pipeline had no previous revision.
- **It restores the image, not the credential.** Everything below is likewise
  image-only: `rollout undo` and `set image` change the pod template, and
  `PLATFORM_API_KEY` is a `secretKeyRef` that keeps reading the _current_
  `console-secrets`. After a rotation, an older image runs with
  the newer credential — and its restored `console-secrets/checksum`
  annotation then names a payload the Secret no longer holds. If a rotation is
  what broke the deploy, disable that Secret Manager version and re-run the
  workflow; do not expect a rollback to undo it.

The image tag is the commit sha and is never reused, so every revision the
cluster has run is still addressable.

Run these with the same values the workflow uses. `gh variable list` on its own
only prints a table — nothing is exported into your shell, and every command
below would then run with empty arguments — so load them first:

```bash
exports="$(gh variable list --json name,value \
  --jq '.[] | "export \(.name)=\(.value | @sh)"')"
[ -n "$exports" ] && eval "$exports"
: "${GCP_PROJECT_ID:?}" "${GCP_ZONE:?}" "${GKE_CLUSTER:?}" "${K8S_NAMESPACE:?}"
```

That exports every repository variable under its own name, which is why the
commands below spell them `GKE_CLUSTER` rather than the workflow's shorter
`CLUSTER`.

The last line is the point of the first three. `gh` reports a failure — an
expired token, no permission on the repository — on stderr and through its exit
status, and an `eval` of nothing at all succeeds; without that guard a rollback
under pressure would continue into `gcloud --project ""` and `kubectl -n ""`,
which is the failure this whole change exists to make loud. `:?` names the first
variable that did not load and stops there, without closing an interactive
shell. Then:

```bash
gcloud container clusters get-credentials "$GKE_CLUSTER" \
  --zone "$GCP_ZONE" --project "$GCP_PROJECT_ID"

kubectl rollout undo deployment/console -n "$K8S_NAMESPACE"      # back one revision
kubectl rollout history deployment/console -n "$K8S_NAMESPACE"   # what else is there
kubectl rollout status deployment/console -n "$K8S_NAMESPACE"
```

To land on a specific commit rather than "one back":

```bash
kubectl set image deployment/console \
  console="$CONSOLE_IMAGE_REPO:<sha>" \
  -n "$K8S_NAMESPACE"
```

Either way the next push to `main` deploys over it — a rollback buys time to fix
forward, it does not pin anything.

## The public address

The console answers on the hostname in the `CONSOLE_HOST` variable, over HTTPS,
behind a global external Application Load Balancer with a Google-managed
certificate. Plain HTTP redirects rather than being refused, so typing the bare
hostname works. The objects are `deploy/k8s/edge.yaml` and the settings that are
load-bearing — a pinned health-check path, and an SSE-sized backend timeout —
are explained in [deploy/k8s/README.md](../deploy/k8s/README.md), along with why
each one's absence fails silently.

Three parts of this are human-driven and are not in CD, consistent with the rest
of this file: the **global** static IP (`console-ip` — a global forwarding rule
cannot take a regional address, which is why the console's public IP changed
when this landed), the **DNS-only** A record pointing at it, and the first
certificate issuance. CD asserts the certificate is `Active`; it never waits for
one.

## Who may reach it

**Google sign-in, enforced at the load balancer by IAP, restricted to the
Workspace domain.** The production console has no authentication code running in
it: `CONSOLE_PASSWORD` is not set in the pod, so `src/proxy.ts` returns
`next()` before any check. That is not a gap — a request that reaches the
process has already been authorized by something the process cannot be talked
out of, and the pod's port is closed to the rest of the cluster by a
`NetworkPolicy` in the same directory.

`CONSOLE_PASSWORD` still exists, for local development and the test suites. It
is simply not part of this deployment.

Three lines of `BackendConfig` switch IAP on, and **no OAuth client secret
enters the cluster** — omitting `oauthclientCredentials` selects the
Google-managed client (GKE 1.29.4+). Who is admitted is not in this repository
and cannot be: it is `roles/iap.httpsResourceAccessor`, bound to the Workspace
domain, on the **backend service**. Bound at the project instead, it would apply
to every IAP-secured resource in the project including ones that do not exist
yet — the next application to enable IAP would be open to the whole domain the
moment it was switched on, with no separate grant for anyone to review.

The domain binding resolves the principal against the Workspace directory, which
is the reason to prefer it over an application-level rule. A hand-rolled `hd`
check, a proxy's `--email-domain`, or an identity provider's e-mail regex all
compare a **string**, and a consumer Google account carrying a verified address
in the domain satisfies a string comparison without being a member of anything.
