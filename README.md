# managed-agent-console

The web console for [managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform) — an open-source, self-hostable platform for long-horizon AI agents, wire-compatible with Anthropic's Claude Managed Agents API.

This console is the operator-facing frontend for a platform deployment you run yourself: create and manage **agents** (rendered form or raw JSON↔YAML editor), **environments**, and **sessions** — including live event traces over SSE and human-in-the-loop tool approval — plus **vaults**, **skills**, **files**, and the credentials that let a self-hosted worker connect. Its UI is modeled on the Managed Agents section of Anthropic's Claude Console; its feature scope follows what the platform actually implements.

**Status: v0.5.0 — the v1 feature set is complete.** Changes are in [CHANGELOG.md](./CHANGELOG.md); active work is in [STATE.md](./STATE.md) and the [issue tracker](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## How it holds your key

A thin server-side proxy: every platform call — SSE included — goes through the console's own server, and **no credential ever reaches the browser.** Which credential the server attaches depends on the deployment, and the two are never sent together:

- **No identity configured** — the server attaches the management key (`PLATFORM_API_KEY`). A shared-password gate (`CONSOLE_PASSWORD`) is built in; unset, the console is open, which is fine for `localhost` and for nothing else, since anyone who reaches an ungated console can drive the platform with a full-power key. **Something must stand in front of the console on any deployment reachable by anyone else**, and this gate is the option that needs no infrastructure.
- **Identity configured** — the console signs the operator in against the deployment's provider and forwards **their own token**, never the management key ([docs/plan/08](./docs/plan/08_console-sso-rbac.md)). Without a session it fails closed. `PLATFORM_API_KEY` stays only as the deep health check's service credential, which no browser request can spend.

| Variable            | Required | Meaning                                                |
| ------------------- | -------- | ------------------------------------------------------ |
| `PLATFORM_BASE_URL` | yes      | Control-plane base URL, e.g. `http://localhost:8080`   |
| `PLATFORM_API_KEY`  | yes\*\*  | The platform's management key (`CONTROLPLANE_API_KEY`) |
| `CONSOLE_PASSWORD`  | no\*     | Enables the login gate when set; unset ⇒ no gate       |

\* Optional only on `localhost`, or where something else authenticates in front of the console — as
on the GKE deployment below. Otherwise mandatory. \*\* Required unless identity is configured, where
browser calls carry the operator's token and the key serves only the deep health check.

## Quickstart (Docker)

```bash
docker run --rm -p 3000:3000 \
  -e PLATFORM_BASE_URL=http://host.docker.internal:8080 \
  -e PLATFORM_API_KEY=your-controlplane-api-key \
  -e CONSOLE_PASSWORD=choose-a-password \
  ghcr.io/opensdlc-dev/managed-agent-console:0.5.0
```

Then open http://localhost:3000. Images are multi-arch (`linux/amd64`, `linux/arm64`); pin a version as above, `latest` follows the newest release. Building from a checkout works too — `docker build -t managed-agent-console .` — and is what CI gates on every PR.

### Next to the platform's compose stack

Join the platform's network and talk to the `controlplane` service directly:

```yaml
console:
  image: ghcr.io/opensdlc-dev/managed-agent-console:0.5.0
  ports:
    - "127.0.0.1:3000:3000"
  environment:
    PLATFORM_BASE_URL: http://controlplane:8080
    PLATFORM_API_KEY: ${CONTROLPLANE_API_KEY:?set CONTROLPLANE_API_KEY in .env}
    CONSOLE_PASSWORD: ${CONSOLE_PASSWORD:-}
  depends_on:
    - controlplane
```

Or with `docker run --network managed-agent-platform_default` and the same three variables.

## Deploying to a cluster

[deploy/k8s/](./deploy/k8s/) holds what the console needs beside a platform running in Kubernetes, and [docs/deploy-gcp.md](./docs/deploy-gcp.md) describes the pipeline that applies them — build → push → deploy → smoke, on every push to `main`, with no long-lived credential in this repository.

That deployment publishes the console on the public internet behind **Google sign-in restricted to one Workspace domain, enforced at the load balancer by GCP IAP**, so the pod runs with no `CONSOLE_PASSWORD` and no authentication code at all. None of that is baked into the published image, which behaves identically wherever it runs.

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

The live tier drives a **real platform stack** (the platform repo's `deploy/compose`) and spends real
model tokens:

```bash
RUN_LIVE_CONSOLE_TESTS=1 pnpm test:e2e:live
```

Once opted in, missing configuration **fails** rather than skips. It creates `live-e2e-`-prefixed resources, archives its agents on the way out, and runs exactly one model-driven session.

## Contributing

Read [CLAUDE.md](./CLAUDE.md) first — the design principles (notably: the platform's implemented API is the single source of truth, never guess at wire shapes) and the PR-based workflow. Why the repo is shaped as it is: [docs/HISTORY.md](./docs/HISTORY.md).

## License

[Apache-2.0](./LICENSE)
