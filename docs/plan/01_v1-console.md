---
status: archived
---

# managed-agent-console v1 — the operator console (plan 01)

Requested 2026-08-02, delivered in five slices (PRs #1–#9): agents, environments, sessions with a
live event trace and human-in-the-loop tool approval, vaults, skills, files — against a self-hosted
[managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform) deployment.

The wire facts this was built around now live, with `file:line` cites into the platform checkout, in
`src/lib/platform/schemas.ts`; the shape of the app is `src/app` + `src/lib` + `test/mock-platform`.
Only what those cannot say is kept here.

## Settled decisions

| Dimension         | Decision, and what it rules out                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack             | Next.js App Router, TypeScript strict, Tailwind + shadcn/ui, TanStack Query + Table, pnpm                                                                               |
| Platform access   | **BFF only** — route handlers forward to `PLATFORM_BASE_URL` injecting `x-api-key`, SSE re-streamed through them. No `NEXT_PUBLIC_*` credential, ever                   |
| Console auth      | Optional shared password; deployment protection, not a user system (superseded by plans 06 and 08)                                                                      |
| Config editor     | Rendered form **and** raw editor with a JSON↔YAML toggle. JSON is the wire truth and the save format; YAML is editor sugar                                              |
| API client        | Hand-written thin typed client over `fetch`, no Anthropic SDK — the SDK pins api.anthropic.com beta semantics the console does not need, and the BFF is its only caller |
| Feature detection | Surfaces the platform does not serve are **absent** from nav, not greyed out; capability tracked by release notes until the platform serves a capability endpoint       |
| Testing           | Vitest + Playwright against an in-repo mock platform; live tier opt-in, where missing configuration **fails** rather than skips                                         |
| Delivery          | Docker image, Next standalone output. Apache-2.0, public, PR-only                                                                                                       |

## Platform constraints that shaped the architecture

Discovered by reading the platform, and the reason the console is shaped as it is:

- **No CORS, no OPTIONS handling anywhere** — a browser cannot call the platform cross-origin, which
  makes the BFF structural rather than merely a key-hiding convenience (principle 2).
- **`EventSource` cannot set `x-api-key`** — the SSE stream must be proxied server-side.
- **No health endpoint** — the connectivity probe is `GET /v1/agents?limit=1`.
- **Management-lane download of user-uploaded files returns 400** (`downloadable: false`) — the Files
  page offers download only where the platform allows it.
- **No history replay and no `Last-Event-ID` on the SSE stream** — the trace store must seed from
  `GET …/events`, then tail and dedupe the overlap by event id.

## Non-goals (v1)

Deployments, memory stores, outcomes, multiagent and MCP management — the platform does not serve
them, and principle 1 keeps them out until it does. Template gallery and AI-generated configs, and
any model-credential surface: the console holds a management key only. Usage/cost analytics: the
platform computes no stats. Multi-user/RBAC/SSO (taken up by plan 08) and BYOC worker key issuance
(by plan 07), each once the platform grew the surface.
