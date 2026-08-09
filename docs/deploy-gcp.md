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
| `console-password`     | the `console-password` key of the same Secret → `CONSOLE_PASSWORD`              |

`controlplane-api-key` is the same value the platform chart installs as
`controlplane.apiKey` — one secret, two readers, which is what makes the
console's key valid at all.

Both must be a **single line**, and the job rejects the run if either is not.
A trailing newline is the easy way to get this wrong — `--data-file=-` stores
the Enter you pressed — so the job strips one before writing the Kubernetes
Secret. Without that, a password nobody can type would deploy green: the smoke
gate logs in with the container's _own_ copy of the value, so it proves the gate
closes, never that a human can open it.

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
sessions only — it is a lever that spends the management key, and this console
sits on a bare public IP — so the step runs it with `kubectl exec` against the
pod carrying the image just pushed, over `127.0.0.1`, logging in with the
`CONSOLE_PASSWORD` the container already holds. The credential never leaves the
pod. The response body names environment variables and a status code and carries
no URL and no key, which is why the job prints it.

**Is the public address gated? — from outside.** The last step polls the
Service's external IP and requires three things of it: `GET /api/health` (the
shallow depth, which stays anonymous for the kubelet's sake) answers **200**, so
the load balancer routes and the pod is serving; that body reports `login_gate:
true`; and an anonymous `GET /` answers **307 to `/login`** rather than a page.
The third is the one that matters and the only one that is evidence — that a
non-empty `console-password` existed in Secret Manager at deploy time is a
different claim from "the pod answering on the internet is gated", and what is
behind this IP is a full-power platform management key on plain HTTP.

Two things it deliberately does not prove:

- **That the platform can run anything.** `/v1/agents` answers on a control
  plane with no model providers configured. Whether the platform is fit to serve
  sessions is the platform's own pipeline's gate, not this one's.
- **That the UI renders.** This is a reachability gate, not an e2e run; the
  Playwright suites are CI's job, on the PR, before the merge that deploys.

The job also fails, before it touches the cluster, if `console-password` is
empty in Secret Manager — an unset gate on a public URL is treated as a broken
deployment rather than a configuration choice. That check is the cheap one, and
it is not the evidence: what proves the deployed console is gated is the
anonymous request above, made against the address the internet uses.

## Rolling back

**The pipeline rolls itself back.** A gate that only reports is not much of a
gate: readiness is the shallow check, so a revision with a rejected key, an
unreachable control plane, or an ungated public address passes `rollout status`
while the RollingUpdate retires the pod that worked. If any step after the apply
fails, the job runs `kubectl rollout undo` and waits for the previous revision,
so a red run leaves the last working console serving rather than the broken one.
(The platform gets the same behaviour from `helm upgrade --atomic`.) Two things
it cannot do, both reported as warnings in the run:

- **A first deployment has nothing to undo to** — and one the selector guard
  recreated has lost its history with the old object. The job says so and tells
  you to scale the Deployment to zero by hand; an ungated console on a public IP
  should not stay up because the pipeline had no previous revision.
- **It restores the image, not the credentials.** Everything below is likewise
  image-only: `rollout undo` and `set image` change the pod template, and
  `PLATFORM_API_KEY`/`CONSOLE_PASSWORD` are `secretKeyRef`s that keep reading
  the _current_ `console-secrets`. After a rotation, an older image runs with
  the newer credentials — and its restored `console-secrets/checksum`
  annotation then names a payload the Secret no longer holds. If a rotation is
  what broke the deploy, disable that Secret Manager version and re-run the
  workflow; do not expect a rollback to undo it.

The image tag is the commit sha and is never reused, so every revision the
cluster has run is still addressable.

Run these with the same values the workflow uses — `gh variable list` prints
them:

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

## Known limitation: plain HTTP on a bare IP

The console is published by a `type: LoadBalancer` Service on port 80. **There
is no domain, no TLS, and no Ingress yet.** The login gate is the only thing
between the internet and the console, and the password crosses the wire in the
clear.

This is a deliberate, temporary staging shape: an Ingress needs a hostname to
key its rules off and cert-manager needs a domain to prove control of, and there
is neither. It is why `CONSOLE_PASSWORD` is mandatory here rather than optional
as it is everywhere else in this repository.

What changes when a domain arrives is small and listed in
[deploy/k8s/README.md](../deploy/k8s/README.md) — the Service becomes
`ClusterIP`, an Ingress and a certificate go in front of it, and the smoke test
targets the hostname instead of polling for an IP. Nothing in the Deployment
changes.
