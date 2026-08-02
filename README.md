# managed-agent-console

The web console for [managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform) — an open-source, self-hostable platform for long-horizon AI agents, wire-compatible with Anthropic's Claude Managed Agents API.

This console is the operator-facing frontend for a platform deployment you run yourself: create and manage **agents**, **environments**, and **sessions** — including live session event traces over SSE and human-in-the-loop tool approval — plus **vaults**, **skills**, and **files**. Its UI is modeled on the Managed Agents section of Anthropic's Claude Console; its feature scope follows what the platform actually implements.

> **Status: docs-only.** The v1 design plan is [docs/plan/01_v1-console.md](./docs/plan/01_v1-console.md); implementation has not started. Progress is tracked in [STATE.md](./STATE.md) and the [issue tracker](https://github.com/OpenSDLC-Dev/managed-agent-console/issues).

## Planned shape (see the plan for rationale)

- **Next.js** (App Router, TypeScript) with a thin server-side proxy: the platform management key lives on the console server only and **never reaches the browser**.
- Ships as a single **Docker** image, deployable next to the platform's [compose stack](https://github.com/OpenSDLC-Dev/managed-agent-platform/tree/main/deploy/compose) or Helm release.
- Default test suites run against a mock platform server; an opt-in live tier drives a real local stack.

## Contributing

Read [CLAUDE.md](./CLAUDE.md) first — it documents the design principles (notably: the platform's implemented API is the single source of truth; never guess at wire shapes) and the PR-based iteration workflow.

## License

[Apache-2.0](./LICENSE)
