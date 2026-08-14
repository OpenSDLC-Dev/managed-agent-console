# deploy/k8s

What the console needs in a cluster that already runs
[managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform):
a Deployment, a Service, the edge that publishes it — an Ingress, a
Google-managed certificate, and the two load-balancer settings this application
does not survive the defaults of — and a `NetworkPolicy`, which is what stands in
front of port 3000 now that the production container has no gate of its own.
They are applied by
[.github/workflows/deploy.yml](../../.github/workflows/deploy.yml) on every push
to `main`; the pipeline as a whole is described in
[docs/deploy-gcp.md](../../docs/deploy-gcp.md).

Nothing here is a chart. Four files with no templating are the honest shape of a
single-tenant staging deployment, and a chart would be configurability nobody
asked for.

## What the pipeline substitutes

| Placeholder        | Becomes                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `CONSOLE_IMAGE`    | the `CONSOLE_IMAGE_REPO` variable, tagged with this run's commit sha |
| `SECRETS_CHECKSUM` | `sha256` of the Secret Manager payload this run read                 |
| `CONTROLPLANE_URL` | the `PLATFORM_BASE_URL` variable — the control plane's Service URL   |
| `CONSOLE_HOST`     | the `CONSOLE_HOST` variable — the hostname the console answers on    |

Literal `sed` expressions on bare-word placeholders, rather than `envsubst`,
which would also expand every other `$` in the file — and rather than
`${SHELL_STYLE}` tokens, which `kubectl apply` would submit to the API server
verbatim if one ever escaped the substitution, since kubectl expands nothing.
`CONSOLE_HOST` is where that convention stops being a habit and starts having
teeth: a leftover `${…}` in an image tag is a pull failure anyone can read,
while one in `ManagedCertificate.spec.domains` is a rejected DNS name.

Each value is escaped before substitution. `sed`'s replacement text is not
literal — `&` expands to the matched token, `\` opens an escape, `|` closes the
expression — so a URL containing `&` would render as a plausible-looking string
that deploys green and points nowhere.

`CONTROLPLANE_URL` is deliberately not spelled `PLATFORM_BASE_URL`: that is the
name of the container variable it is assigned to, and a `sed` on that word would
rewrite the `name:` key beside the value.

The values come from repository **variables**, not from this file — see
[docs/deploy-gcp.md](../../docs/deploy-gcp.md). This directory is a **reference
deployment, not a template**: it shows a shape that works, without naming the
cluster it was proven against.

The **namespace is not in these files** — the workflow passes `-n "$NAMESPACE"`,
from the `K8S_NAMESPACE` variable, to every `kubectl` call. Keep it that way if
you edit them: a namespace in one file and a flag on the command line is how an
object lands somewhere nobody looks.

`SECRETS_CHECKSUM` is substituted **inside quotes** in `deployment.yaml`, and the
quotes are load-bearing: annotation values are strings, and a `sha256` that
happens to be all decimal digits is read by YAML as an integer, which the API
server rejects with `cannot convert int64 to string` — a failure that depends on
the digest and so cannot be reproduced from the diff.

## Changing the Deployment's selector

`spec.selector` is **immutable**, so `kubectl apply` cannot carry an existing
workload across a change to it — it fails outright:

```text
The Deployment "console" is invalid: spec.selector: Invalid value:
{"matchLabels":{"app.kubernetes.io/name":"console"}}: field is immutable
```

The pipeline handles it: before applying, it compares the live
`spec.selector.matchLabels` against the one these files declare and deletes the
Deployment when they differ, so the apply below it recreates rather than patches.
The comparison runs against the live object, so on every run where the selector
already matches it costs one `kubectl get`.

That guard exists because the condition was real, not anticipated: the staging
cluster carried a `console` Deployment applied by hand while this pipeline was
being proven, selecting on `app: console`, and these files select on
`app.kubernetes.io/name: console` — the label the Service and the smoke step both
key off. Without it, the first run of the workflow would have failed on the error
above _after_ building and pushing an image.

## The Secret

A Secret named `console-secrets` with one key:

| Key                | Value              | Source (Secret Manager, in the `GCP_PROJECT_ID` project)                                                                                         |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform-api-key` | `PLATFORM_API_KEY` | `controlplane-api-key` — the same value the platform chart installs as `controlplane.apiKey`, which is what makes the console's key valid at all |

It had a second key, `console-password`, for longer than the console read it,
and **why it lingered is the part worth keeping**. The Deployment stopped
referencing it when authentication moved to IAP, but old ReplicaSets keep their
whole pod template — `secretKeyRef`s included — so every revision from before
that change was still asking for the key, and this Secret is written with
`create … --dry-run=client | apply`, which **replaces rather than patches**.
Dropping it while such a revision was reachable would have made
`kubectl rollout undo` restore a pod template the kubelet cannot start
(`CreateContainerConfigError`): the step whose entire purpose is to leave the
last working console serving would instead have produced an outage, in exactly
the situation where something has already gone wrong.

What ended it is `revisionHistoryLimit` on the Deployment, which is why that
field is a security boundary here rather than housekeeping. An unbounded history
means no credential can ever be retired — there is always one more template
holding it open. Bounding it turned the wait into a decision, and lowering the
limit prunes immediately rather than at the next rollout.

The workflow reads the latest enabled version and writes the Secret with
`kubectl create … --dry-run=client -o yaml | kubectl apply -f -`, so re-running
it is idempotent. That same command is what **deleted** the old key rather than
merely stopping its refresh: apply computes deletions from the last-applied
annotation, which still listed both. The value is never checked in and never
echoed.

**It may not be empty, and the pipeline fails if it is** — without
`platform-api-key` the console cannot authenticate to the platform at all. The
pipeline does not stop at the Secret Manager payload either: after the rollout it
asserts, against the public hostname, that an anonymous request is refused **and
that IAP is what refused it**.

**Rotating a secret rolls the pod, without a commit.** Add the new version in
Secret Manager and re-run the workflow (`workflow_dispatch`); the run reads the
latest version, applies the Secret, and writes a `console-secrets/checksum`
annotation — a `sha256` of the payload — into the pod template. Without that
annotation the re-applied Deployment would be byte-identical, nothing would roll,
`rollout status` would return instantly green, and the pod would keep serving
with the old credential. The platform chart carries the same annotation on its
control-plane Deployment, for the same reason.

The annotation is a `sha256` of the payload, not the value itself, and it is
one-way.

## The health endpoint, and which depth goes where

`/api/health` answers two different questions
([src/app/api/health/route.ts](../../src/app/api/health/route.ts)):

- **shallow** (`/api/health`) — configuration only, no network. This is what the
  **readiness** probe calls. A probe that also called the platform would remove
  the console from service during a platform outage, when a console that can
  still render its own error is the more useful thing to have.
- **deep** (`/api/health?deep=1`) — additionally calls the platform with the
  management key. That is the deploy gate, run once per rollout.

**`PLATFORM_API_KEY` is required for readiness unless identity is configured**,
which is the same question as whether browser-initiated calls still spend it.
With identity off they do — the BFF resolves the key on every proxied request
and 500s without it — so reporting Ready would admit a pod that answers nothing
but errors. In identity mode (plan 08) those calls carry the operator's own
token, and the key is only the deep check's **dedicated service credential**: the
one console→platform call that can never act as a user, since CD runs it with no
user in sight. Requiring it there would make such a rollout permanently NotReady
over a credential it does not use.

Asked for the deep depth without it, the route answers `degraded` with
`platform.checked: false` rather than reporting the platform unreachable —
nothing was asked, and the two call for opposite fixes.

The body also names which identity mode the process is in (`identity.mode`), the
one thing about this console no probe of the platform can discover — see
[docs/wire-divergences.md](../../docs/wire-divergences.md).

`/api/health` is not the only route outside the console's own password gate.
**Everything under `/api/auth/` is too**, and has to be: nobody holds a session
before signing in, so a gated `/api/auth/login` would redirect the browser to
`/login` and a gated `/api/auth/callback` would drop the identity provider's
redirect on the password form. Those routes are written for the anonymous caller
that creates: they mint no session without a state cookie they issued
themselves, and on a deployment with no identity configured they answer 404
rather than starting anything. Nothing untrusted is reflected back — a failure
becomes one of four codes the console authored, never the provider's text or
anything else from the query string. The one query value that survives is
`return_to`, and only after it has been narrowed to a same-origin path, because
it is what sends the operator back where they were.

Opening this namespace is not what gates an identity-mode deployment. **The BFF
is**: with `IDENTITY_MODE=oidc` a platform call without a valid session gets 401
and the management key is not sent. That check cannot live in the middleware —
it runs in the Edge runtime and cannot see the session store, which is Node-side
module state — and it does not need to, because every byte a page shows comes
through the BFF.

The **liveness** probe calls neither: it takes `/login`. A configuration error
makes the shallow check answer 503, and a restart cannot supply a missing
environment variable — liveness pointed at it would turn the readiness failure
the rollout is waiting to report into a restart loop that erases it. Liveness
asks only whether the process still answers HTTP, and `/login` answers that
without reading any of the three variables.

The route is exempt from the console's login gate
([src/proxy.ts](../../src/proxy.ts)) because the shallow caller cannot hold a
session: a kubelet reading a 401 as an unhealthy container would never mark the
pod ready. So the shallow depth is anonymous, and written for anonymous callers
— it names environment variables and reports the platform's status code, and
carries no URL and no key.

**The deep depth is a lever rather than a report:** repeating it makes the
console spend the management key against the control plane. It gates itself
whenever `CONSOLE_PASSWORD` is set — and here it is not, so the route is open at
the application layer, as every other route is. Nothing needs to protect it
there: IAP refuses anonymous requests from the internet, and
`networkpolicy.yaml` refuses them from the rest of the cluster.

Be precise about what that leaves. IAP refuses **anonymous** callers, not
authorized ones, so a signed-in member of the Workspace can fetch `?deep=1` from
a browser. That is not an escalation — the same person can drive every page of
the console, and every page spends the same key. What this deployment removes is
the anonymous internet and the rest of the cluster, not the operator.

The deploy runs it **from inside the pod**, because the CD job holds no Google
identity IAP would accept:

```bash
kubectl exec -n "$NAMESPACE" "$pod" -- node -e '…fetch("http://127.0.0.1:3000/api/health?deep=1")…'
```

The pipeline picks the pod by image rather than passing `deploy/console`, because
`kubectl exec` on a Deployment prefers the pod that has been ready longest, which
right after a rollout can still be the revision being replaced.

## Who may enter, and where that is written

**Not in this repository, and it cannot be.** IAP is switched on by three lines
in `edge.yaml`; who it admits is an IAM policy on the **backend service** —
`roles/iap.httpsResourceAccessor` bound to the Workspace domain — applied
out-of-band alongside the static IP and the DNS record.

Two consequences worth knowing before touching any of it:

- **IAP with no binding denies everyone**, which is the right way for this to
  fail. There is no window in which enabling it opens anything.
- **The binding is on the backend service, not the project, deliberately.** IAM
  inherits downward, so a project-level grant would apply to every IAP-secured
  resource in the project including ones that do not exist yet: the next
  application to switch IAP on would be open to the whole domain the moment it
  was enabled, silently, with no separate grant for anyone to review. The
  backend service's name is generated by GKE, so if the Ingress or the Service
  is ever recreated the binding must be re-applied to the new name — until it
  is, the console is closed to everyone rather than open to anyone.

Use a Google Group rather than the whole domain as soon as any application wants
a narrower audience; group membership is managed in Workspace and never reaches
git.

## The edge

`edge.yaml` holds four objects: an `Ingress` (`gce` class, so a global external
Application Load Balancer on the reserved `console-ip` address), a
`ManagedCertificate`, a `BackendConfig`, and a `FrontendConfig` that redirects
plain HTTP to HTTPS. The Service is `ClusterIP` and is the Ingress' backend,
not the public edge.

**Two of these settings exist because the GCLB defaults break this application
silently.** Both are in the `BackendConfig`, and both failure modes look like
something other than what they are:

- **`healthCheck.requestPath: /api/health`.** The default health check is
  `GET /`, which this application answers with a 307 to `/login` whenever the
  login gate is on. GCLB reads a 307 as unhealthy, so the default produces a
  **permanently 502 hostname while the pod is Ready, `rollout status` is green
  and the logs are clean.** Nothing in the cluster looks wrong.
  `healthCheck.port` is `3000` — the Pod's port, not the Service's 80, because
  the cluster is VPC-native and the load balancer is container-native. On a
  cluster that is not VPC-native the Service becomes `NodePort` and this names
  the node port instead.
- **`timeoutSec: 3600`.** The GCLB backend timeout defaults to 30 seconds and
  is a **request-and-response** timeout, not an idle one — it caps the whole
  exchange regardless of traffic. A session trace is SSE held open for as long
  as the session runs, so the default cuts every trace at 30 seconds while the
  browser reconnects with backoff and re-walks history. The console looks slow
  and drops events, and nothing reports an error.

The `kubernetes.io/ingress.class: gce` annotation draws a deprecation warning
from the API server. **Do not act on it**: GKE's controller keys off the
annotation, and this cluster has no `IngressClass` objects at all, so
`spec.ingressClassName` would name nothing and leave an Ingress no controller
claims — an Ingress that simply never gets an address.

Certificate provisioning is the slow part: 15–60 minutes from first issuance,
and up to 30 more before the load balancer serves it. `FAILED_NOT_VISIBLE` is a
**waiting** state, not an error, and deleting the object only restarts the
clock. If it persists, suspect DNS rather than these files — a CDN-proxied
record (Cloudflare's orange cloud) resolves to the provider's anycast addresses,
so Google never sees what it needs, and that reads as "still waiting" forever.
The deploy asserts `certificateStatus == Active` before it tries the hostname,
so a still-issuing certificate is one clear message rather than a TLS timeout
followed by a rollback of a perfectly healthy revision.

Nothing in the Deployment changed when this landed: the container already
listened on 3000, was already reachable only through a Service, and its
cluster-DNS `PLATFORM_BASE_URL` is unaffected by how the console is published.
The session cookie gained `Secure` on its own, since the login route sets that
from the request's scheme.

**The gate is Google sign-in, enforced here rather than in the application.**
The `BackendConfig` carries `iap.enabled: true` and no `oauthclientCredentials`,
which on GKE 1.29.4+ selects the Google-managed OAuth client — so no client ID
and no client secret enter the cluster or this repository.
