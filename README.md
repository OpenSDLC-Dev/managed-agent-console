# managed-agent-console

The web console for [managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform) — an open-source, self-hostable platform for long-horizon AI agents, wire-compatible with Anthropic's Claude Managed Agents API.

This console is the operator-facing frontend for a platform deployment you run yourself: create and manage **agents** (rendered form or raw JSON↔YAML editor), **environments**, and **sessions** — including live event traces over SSE and human-in-the-loop tool approval — plus **vaults**, **skills**, and **files**. Its UI is modeled on the Managed Agents section of Anthropic's Claude Console; its feature scope follows what the platform actually implements.

**Status: v0.3.0 — the v1 feature set is complete.** Changes are recorded in [CHANGELOG.md](./CHANGELOG.md); active work is tracked in [STATE.md](./STATE.md) and the [issue tracker](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## How it holds your key

The console is a Next.js app with a thin server-side proxy: every platform call — SSE streams included — goes through the console's own server, which injects the management key. **The key never reaches the browser.** A shared-password login gate (`CONSOLE_PASSWORD`) protects non-loopback deployments; unset, the console is open, which is fine for `localhost` and for nothing else — anyone who can reach an ungated console can drive the platform with a full-power management key. On any deployment reachable beyond loopback it is **mandatory**, and the GKE pipeline below refuses to deploy without it.

| Variable            | Required | Meaning                                                |
| ------------------- | -------- | ------------------------------------------------------ |
| `PLATFORM_BASE_URL` | yes      | Control-plane base URL, e.g. `http://localhost:8080`   |
| `PLATFORM_API_KEY`  | yes      | The platform's management key (`CONTROLPLANE_API_KEY`) |
| `CONSOLE_PASSWORD`  | no\*     | Enables the login gate when set; unset ⇒ no gate       |

\* Optional only on `localhost`. Mandatory anywhere the console is reachable by
anyone else.

## Quickstart (Docker)

Run the published image against a platform control plane:

```bash
docker run --rm -p 3000:3000 \
  -e PLATFORM_BASE_URL=http://host.docker.internal:8080 \
  -e PLATFORM_API_KEY=your-controlplane-api-key \
  -e CONSOLE_PASSWORD=choose-a-password \
  ghcr.io/opensdlc-dev/managed-agent-console:0.3.0
```

Then open http://localhost:3000.

Images are multi-arch (`linux/amd64`, `linux/arm64`). Pin a version as above; `latest` follows the newest release. Building from a checkout still works — `docker build -t managed-agent-console .` — and is what CI gates on every PR.

### Next to the platform's compose stack

If the platform is running via its [deploy/compose](https://github.com/OpenSDLC-Dev/managed-agent-platform/tree/main/deploy/compose) stack, join its network and talk to the `controlplane` service directly:

```bash
docker run --rm -p 3000:3000 \
  --network managed-agent-platform_default \
  -e PLATFORM_BASE_URL=http://controlplane:8080 \
  -e PLATFORM_API_KEY=your-controlplane-api-key \
  -e CONSOLE_PASSWORD=choose-a-password \
  ghcr.io/opensdlc-dev/managed-agent-console:0.3.0
```

Or as a service inside the same `docker-compose.yml`:

```yaml
console:
  image: ghcr.io/opensdlc-dev/managed-agent-console:0.3.0
  ports:
    - "127.0.0.1:3000:3000"
  environment:
    PLATFORM_BASE_URL: http://controlplane:8080
    PLATFORM_API_KEY: ${CONTROLPLANE_API_KEY:?set CONTROLPLANE_API_KEY in .env}
    CONSOLE_PASSWORD: ${CONSOLE_PASSWORD:-}
  depends_on:
    - controlplane
```

## Deploying to a cluster

[deploy/k8s/](./deploy/k8s/) holds the two objects the console needs beside a
platform running in Kubernetes — a Deployment and a `LoadBalancer` Service — and
[docs/deploy-gcp.md](./docs/deploy-gcp.md) describes the pipeline that applies
them: build → push → deploy → smoke, on every push to `main`, with no long-lived
credential stored in this repository (Workload Identity Federation, and the
runtime secrets read from Secret Manager inside the job).

That deployment publishes the console on a **public IP over plain HTTP**, so
`CONSOLE_PASSWORD` is not optional there: it is the only thing between the
internet and a management key that can do anything to the platform, and the
pipeline both refuses to deploy without it and asserts after the rollout that an
anonymous request is actually bounced to `/login`.

## Development

```bash
pnpm install
cp .env.example .env.local   # fill in PLATFORM_BASE_URL / PLATFORM_API_KEY
pnpm dev                     # console on http://localhost:3000
```

Checks — the default suites spend no money and need no network:

```bash
pnpm test       # Vitest unit/component tests
pnpm test:e2e   # Playwright against the in-repo mock platform server
pnpm lint       # eslint; pnpm typecheck and pnpm format:check also exist
```

The e2e tier builds the production bundle first, and the mock platform (`test/mock-platform/`) speaks the same wire shapes as the real control plane.

The live tier (`test/e2e-live/`) drives a **real platform stack** — the platform repo's `deploy/compose` — and spends real model tokens:

```bash
RUN_LIVE_CONSOLE_TESTS=1 pnpm test:e2e:live
```

It is opt-in via `RUN_LIVE_CONSOLE_TESTS=1`; once opted in, missing configuration **fails** rather than skips. `PLATFORM_BASE_URL`/`PLATFORM_API_KEY` come from the environment or `.env.local`; the model id is inferred from an existing agent (override with `LIVE_MODEL_ID`). The suite creates `live-e2e-`-prefixed resources, archives its agents on the way out, and runs exactly one model-driven session (two HITL turns: approve, deny) — everything else asserts wire shapes without spending.

## Contributing

Read [CLAUDE.md](./CLAUDE.md) first — it documents the design principles (notably: the platform's implemented API is the single source of truth; never guess at wire shapes) and the PR-based iteration workflow. The v1 design narrative lives in [docs/plan/01_v1-console.md](./docs/plan/01_v1-console.md) and [docs/HISTORY.md](./docs/HISTORY.md).

## License

[Apache-2.0](./LICENSE)
