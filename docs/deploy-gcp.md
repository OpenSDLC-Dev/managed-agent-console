# Deploying to GCP

How the console reaches the staging cluster, what proves a deployment worked, and what to do when
one does not. The objects are [deploy/k8s/](../deploy/k8s/) — each field's reason is a comment beside
it — and the pipeline is [.github/workflows/deploy.yml](../.github/workflows/deploy.yml).

This is deployment, not release: a release publishes a versioned multi-arch image to GHCR for anyone
to pull ([docs/releasing.md](./releasing.md)); this pushes a commit-tagged image to a private
Artifact Registry and rolls one cluster. Staging runs `main`, not the newest tag.

## Where it goes

Nowhere this file names. The one deployment it was proven against is described by variable, because
this repository is public ([plan 06's D5](./plan/06_google-sign-in.md#deployment-identifiers-in-a-public-repository)).
Each is a GitHub Actions **variable**, not a secret — none of them grants anything, and the Workload
Identity Federation trust policy is what protects the deployment.

| Variable                  | What it names                                                                  |
| ------------------------- | ------------------------------------------------------------------------------ |
| `GCP_PROJECT_ID`          | the project everything lives in                                                |
| `GKE_CLUSTER`, `GCP_ZONE` | the cluster and its zone                                                       |
| `K8S_NAMESPACE`           | the namespace, shared with the platform                                        |
| `ARTIFACT_REGISTRY_HOST`  | the registry host Docker authenticates to                                      |
| `CONSOLE_IMAGE_REPO`      | the image repository; the tag is always the commit sha                         |
| `CONSOLE_HOST`            | the hostname the console answers on                                            |
| `WIF_PROVIDER`            | the Workload Identity Federation provider the job's OIDC token is exchanged at |
| `DEPLOY_SERVICE_ACCOUNT`  | the identity that provider lets this repository impersonate                    |
| `PLATFORM_BASE_URL`       | the control plane's in-cluster Service URL                                     |

The workflow's **first step asserts every one is set and non-empty**, before it authenticates or
builds. An unset variable renders as the empty string, and `gcloud --project ""`, `kubectl -n ""` and
an image tag with no repository all fail late and confusingly.

The console sits in the platform's namespace, so it reaches the control plane over cluster DNS and
**no request carrying the management key crosses a public network**. That is narrower than "the key
never leaves the cluster": the deploy job reads it out of Secret Manager onto a runner to write the
Kubernetes Secret. What bounds that handling is the job — masked, written to a file rather than an
argv, shredded on exit.

## The pipeline

Push to `main` plus `workflow_dispatch`. With one environment, "merged" and "deployed" are the same
event; a manual promotion step would only be a button somebody forgets. Runs are serialized and
**never cancelled** — killing one mid-rollout leaves the cluster holding half of each revision.

**No secrets in this repository.** The job asks GitHub for a short-lived OIDC token, WIF exchanges it
for an impersonation of `DEPLOY_SERVICE_ACCOUNT`, and the one credential the deployment needs —
Secret Manager's `controlplane-api-key`, the same value the platform chart installs as
`controlplane.apiKey` — is read inside the job into `console-secrets/platform-api-key`. It must be a
**single line**, and the job strips a trailing newline before writing: `--data-file=-` stores the
Enter you pressed, and that byte rides in as an `x-api-key` Node refuses to send at all.

The WIF provider only accepts tokens from repositories owned by `OpenSDLC-Dev`, and the deploy
identity holds exactly what CD needs — push images, drive the cluster, read secrets — and notably
**not** permissions to change infrastructure. **CD does not run Terraform**: the cluster, registry,
WIF pool, service account and secrets are human-driven on purpose.

**Rotating a credential means adding a Secret Manager version and re-running the workflow** — never
editing anything here, never a `kubectl` command afterwards. The run writes a
`console-secrets/checksum` annotation (a `sha256` of the payload) into the pod template, so a
rotation on an unchanged `main` is a new revision and the pod actually rolls. Without it the
re-applied Deployment is byte-identical, `rollout status` returns instantly green, and the pod keeps
running the old credential — a re-deploy that reports success and did nothing.

### What the workflow substitutes

Literal `sed` on bare-word placeholders, each value escaped first — the reasons are commented at the
substitution step in `deploy.yml`.

| Placeholder        | Becomes                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONSOLE_IMAGE`    | `CONSOLE_IMAGE_REPO`, tagged with this run's commit sha                                                                                                    |
| `SECRETS_CHECKSUM` | `sha256` of the Secret Manager payload this run read                                                                                                       |
| `CONTROLPLANE_URL` | `PLATFORM_BASE_URL` — spelled differently from the container variable it is assigned to, since a `sed` on that name would rewrite the key beside the value |
| `CONSOLE_HOST`     | `CONSOLE_HOST` — a leftover placeholder in an image tag is a readable pull failure; one in `ManagedCertificate.spec.domains` is a rejected DNS name        |

The **namespace is not in these files** — every `kubectl` call takes `-n`. Keep it that way: a
namespace in one file and a flag on the command line is how an object lands somewhere nobody looks.

`spec.selector` is immutable, so the pipeline compares the live selector against the declared one and
deletes the Deployment when they differ, letting the apply recreate rather than patch. That guard is
not anticipatory: the cluster carried a hand-applied `console` Deployment selecting on `app: console`
while this pipeline was being proven, and without the guard the first run would have failed _after_
building and pushing an image.

## What the smoke gate proves

`kubectl rollout status` only proves the container starts and answers the **shallow** readiness probe,
which reads configuration and touches no network — a revision passes it with a wrong key, a wrong
base URL, or no platform at all. Two steps follow, because two things need proving from two places.

**Can this revision serve? — from inside the pod.** `GET /api/health?deep=1` makes the console call
the platform with the management key and must answer 200. The job runs it with `kubectl exec` over
`127.0.0.1` because it holds no Google identity IAP would accept, and it picks the pod by image:
`kubectl exec` on a Deployment prefers the pod ready longest, which right after a rollout can still
be the revision being replaced.

**Is the public address gated? — from outside.** An anonymous `GET /` and an anonymous
`GET /api/platform/v1/agents` — the path that actually spends the key — must both be 401 **carrying
`x-goog-iap-generated-response`**. The status alone is far too weak: a 401 can come from the
application, a misrouted backend, or a load balancer with no policy at all, and each passes a bare
code check while the gate is simply absent. Both requests send `Accept: application/json`, because
**IAP content-negotiates its refusal** — a default `curl` sends `*/*`, which IAP reads as "can render
HTML" and answers with a 302 to accounts.google.com. Both are polled, because `iap.enabled` takes a
couple of minutes to take effect; polling for a _closed_ gate is safe in the direction that matters.
Backend reachability is read from the Ingress' `ingress.kubernetes.io/backends` annotation rather
than `gcloud`, because **CD holds no compute permissions**.

**The order of the apply is part of the gate.** The production container has no authentication of its
own, so the edge, the `NetworkPolicy` and the Service are applied first and the job waits for the
hostname to actually refuse an anonymous request before the Deployment goes in — noticing a missing
IAP header afterwards does not undo having served. Before all of it, the job asserts the
`ManagedCertificate` reports `Active`, so a still-provisioning certificate (15–60 minutes,
unhurriable) reads as one clear line rather than a TLS timeout followed by a needless rollback.

Two things it deliberately does not prove: **that the platform can run anything** (that is the
platform pipeline's gate), and **that the UI renders** (Playwright's job, on the PR, before the merge
that deploys).

## Rolling back

**The pipeline rolls itself back, to a revision it named before it started.** Readiness is the
shallow check, so a revision with a rejected key passes `rollout status` while the RollingUpdate
retires the pod that worked. The target is captured rather than defaulted: `kubectl rollout undo`
with no argument means "the revision before the current one", which is not "the last one that
worked". Three limits, all reported as warnings:

- **A first deployment has nothing to undo to.** The job says so and tells you to scale to zero by
  hand; a broken console on a public hostname should not stay up because the pipeline had no history.
- **It restores the image, not the credential.** `PLATFORM_API_KEY` is a `secretKeyRef` that keeps
  reading the _current_ Secret, so after a rotation an older image runs with the newer credential. If
  a rotation is what broke the deploy, disable that Secret Manager version and re-run the workflow.
- **It reaches back three revisions.** `revisionHistoryLimit: 3` is a security boundary rather than
  housekeeping: an old ReplicaSet keeps its whole pod template, `secretKeyRef`s included, so an
  unbounded history means no credential can ever be retired — there is always one more template
  holding it open.

The image tag is the commit sha and is never reused, so every image the cluster has run stays
addressable by tag even when its revision does not. To roll back by hand, load the variables first —
`gh variable list` only prints a table, and an `eval` of nothing at all succeeds, so without the
guard a rollback under pressure continues into `gcloud --project ""`:

```bash
exports="$(gh variable list --json name,value --jq '.[] | "export \(.name)=\(.value | @sh)"')"
[ -n "$exports" ] && eval "$exports"
: "${GCP_PROJECT_ID:?}" "${GCP_ZONE:?}" "${GKE_CLUSTER:?}" "${K8S_NAMESPACE:?}"

gcloud container clusters get-credentials "$GKE_CLUSTER" --zone "$GCP_ZONE" --project "$GCP_PROJECT_ID"
kubectl rollout undo deployment/console -n "$K8S_NAMESPACE"      # back one revision
kubectl rollout history deployment/console -n "$K8S_NAMESPACE"   # what else is there
kubectl set image deployment/console console="$CONSOLE_IMAGE_REPO:<sha>" -n "$K8S_NAMESPACE"
```

The next push to `main` deploys over it — a rollback buys time to fix forward, it does not pin.

## The public address, and who may reach it

The console answers on `CONSOLE_HOST` over HTTPS, behind a global external Application Load Balancer
with a Google-managed certificate; plain HTTP redirects rather than being refused. Three parts are
human-driven and not in CD: the **global** static IP (a global forwarding rule cannot take a regional
address), the **DNS-only** A record, and the first certificate issuance.

**The gate is Google sign-in, enforced at the load balancer by IAP, restricted to the Workspace
domain.** The production console runs no authentication code at all — `CONSOLE_PASSWORD` is unset, so
`src/proxy.ts` returns `next()` before any check. That is not a gap: a request reaching the process
has already been authorized by something the process cannot be talked out of, and the pod's port is
closed to the rest of the cluster by `networkpolicy.yaml`.

Three lines of `BackendConfig` switch IAP on, and **no OAuth client secret enters the cluster** —
omitting `oauthclientCredentials` selects the Google-managed client (GKE 1.29.4+). Who is admitted
is not in this repository and cannot be: `roles/iap.httpsResourceAccessor` bound to the Workspace
domain, on the **backend service**. Two consequences:

- **IAP with no binding denies everyone** — the right way for this to fail. There is no window in
  which enabling it opens anything. GKE generates the backend service's name, so recreating the
  Ingress or Service loses the binding and the console fails **closed** until it is re-applied.
- **Bound at the project it would inherit downward**, so the next application to enable IAP would be
  open to the whole domain the moment it was switched on, with no separate grant to review.

The binding resolves the principal against the Workspace directory rather than comparing an e-mail
string, which is the reason it was chosen over every application-level alternative
([plan 06](./plan/06_google-sign-in.md)). Use a Google Group as soon as any application wants a
narrower audience.

**IAP refuses anonymous callers, not authorized ones**, so a signed-in Workspace member can fetch
`?deep=1` from a browser. That is not an escalation — the same person can drive every page, and every
page spends the same key. What this deployment removes is the anonymous internet and the rest of the
cluster, not the operator.

## The probes

Readiness takes the **shallow** `/api/health` (configuration only), the deploy gate takes **deep**
(`?deep=1`, which spends the management key), and liveness takes `/login` — which reads no
configuration at all, so a missing environment variable is reported as a readiness failure rather
than erased by a restart loop. Why each depth answers what it answers, and why `PLATFORM_API_KEY`
stops being required for readiness once identity is configured, is in the route itself:
[src/app/api/health/route.ts](../src/app/api/health/route.ts).
