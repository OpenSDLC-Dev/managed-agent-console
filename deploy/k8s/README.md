# deploy/k8s

The two objects the console needs in a cluster that already runs
[managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform):
a Deployment and a Service. They are applied by
[.github/workflows/deploy.yml](../../.github/workflows/deploy.yml) on every push
to `main`; the pipeline as a whole is described in
[docs/deploy-gcp.md](../../docs/deploy-gcp.md).

Nothing here is a chart. Two files with no templating are the honest shape of a
single-tenant staging deployment, and a chart would be configurability nobody
asked for.

## What the pipeline substitutes

| Placeholder        | Becomes                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `CONSOLE_IMAGE`    | `us-central1-docker.pkg.dev/hh-opensdlc-managed-agents/map-images/console:<sha>` |
| `SECRETS_CHECKSUM` | `sha256` of the two Secret Manager payloads this run read                        |

Two literal `sed` expressions on two placeholders, rather than `envsubst`, which
would also expand every other `$` in the file.

The **namespace is not in these files** — the workflow passes `-n map` to every
`kubectl` call. Keep it that way if you edit them: a namespace in one file and a
flag on the command line is how an object lands somewhere nobody looks.

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

Both credentials come from a Secret named `console-secrets` with two keys:

| Key                | Value              | Source (Secret Manager, project `hh-opensdlc-managed-agents`)                                                                                    |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform-api-key` | `PLATFORM_API_KEY` | `controlplane-api-key` — the same value the platform chart installs as `controlplane.apiKey`, which is what makes the console's key valid at all |
| `console-password` | `CONSOLE_PASSWORD` | `console-password`                                                                                                                               |

The workflow reads the latest enabled version of each and writes the Secret with
`kubectl create … --dry-run=client -o yaml | kubectl apply -f -`, so re-running
it is idempotent. The values are never checked in and never echoed.

**`console-password` may not be empty, and the pipeline fails if it is.** The
console is published on a public IP; an unset gate there is an open page in
front of a full-power management key, not a convenience. The pipeline does not
stop at the Secret Manager payload either — after the rollout it asserts against
the public address that the deployed console reports `login_gate: true` _and_
that an anonymous `GET /` is bounced to `/login`.

**Rotating a secret rolls the pod, without a commit.** Add the new version in
Secret Manager and re-run the workflow (`workflow_dispatch`); the run reads the
latest version, applies the Secret, and writes a `console-secrets/checksum`
annotation — a `sha256` of the two payloads — into the pod template. Without that
annotation the re-applied Deployment would be byte-identical, nothing would roll,
`rollout status` would return instantly green, and the pod would keep serving
with the old credentials. The platform chart carries the same annotation on its
control-plane Deployment, for the same reason. (It is a hash, not a value — and
anyone who can read this annotation can generally read the Secret itself.)

## The health endpoint, and which depth goes where

`/api/health` answers two different questions
([src/app/api/health/route.ts](../../src/app/api/health/route.ts)):

- **shallow** (`/api/health`) — configuration only, no network. This is what the
  readiness and liveness probes call. A probe that also called the platform
  would remove the console from service during a platform outage, when a console
  that can still render its own error is the more useful thing to have.
- **deep** (`/api/health?deep=1`) — additionally calls the platform with the
  management key. That is the deploy gate, run once per rollout.

The route is exempt from the console's login gate
([src/proxy.ts](../../src/proxy.ts)) because the shallow caller cannot hold a
session: a kubelet reading a 401 as an unhealthy container would never mark the
pod ready. So the shallow depth is anonymous, and written for anonymous callers
— it names environment variables and reports the platform's status code, and
carries no URL and no key.

**The deep depth gates itself.** It is a lever rather than a report: repeating it
makes the console spend the management key against the control plane, and this
Service is a bare public IP. So on a gated console the route requires the same
session every page does, and the deploy runs it **from inside the pod** —

```bash
kubectl exec -n map "$pod" -- node -e '…fetch("http://127.0.0.1:3000/api/health?deep=1")…'
```

— logging in over loopback with the `CONSOLE_PASSWORD` the container already
holds. The pipeline picks the pod by image rather than passing `deploy/console`,
because `kubectl exec` on a Deployment prefers the pod that has been ready
longest, which right after a rollout can still be the revision being replaced.
(With `CONSOLE_PASSWORD` unset there is no gate to hold a session against and no
console to protect, so the deep depth is open — as every other route is.)

## Known limitation: plain HTTP on a bare IP

`type: LoadBalancer` on port 80. There is no domain, no TLS, and no Ingress. The
login gate is therefore the only thing between the internet and the console, and
the password crosses the wire in the clear. This is a deliberate, temporary
staging shape, not a pattern to copy.

When a domain and a certificate arrive, the change is contained:

1. Flip the Service to `type: ClusterIP` (delete the `type:` line) — it stops
   being the public edge and becomes the Ingress' backend.
2. Add an Ingress (or a Gateway) with the host, and cert-manager or a
   Google-managed certificate for it.
3. Point the public assertions in `deploy.yml` at the hostname instead of polling
   `status.loadBalancer.ingress[0].ip`; keep them exactly as they are otherwise
   (shallow health 200, `login_gate: true`, anonymous `GET /` → 307 `/login`).
   The deep check is unaffected — it already runs inside the pod.

Nothing in the Deployment changes: the container already listens on 3000, is
already reachable only through a Service, and its cluster-DNS `PLATFORM_BASE_URL`
is unaffected by how the console itself is published. The session cookie gains
`Secure` on its own, since the login route sets that from the request's scheme.
