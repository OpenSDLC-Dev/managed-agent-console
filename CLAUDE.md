# CLAUDE.md

Guidance for Claude Code (and contributors) working in this repository.

## What this is

The **web console for [managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform)** — an open-source, self-hostable platform for long-horizon AI agents whose REST API is wire-compatible with Anthropic's Claude Managed Agents. This repo is the operator-facing frontend: agents, environments, sessions (live event traces, human-in-the-loop approval), vaults, skills, files, and credential issuance, on a deployment you run yourself.

Two references, two roles:

- **UI reference:** the Managed Agents section of Anthropic's Claude Console (platform.claude.com) — layout and interaction patterns are modeled on it, adapted where self-hosting calls for something different.
- **API truth:** the **platform's implemented surface**, not the reference product's. The console never ships a feature the platform doesn't serve.

## Non-negotiable design principles

1. **The platform API is the single source of truth — never guess at a wire shape.** Resolution order: the platform checkout's source (`internal/api/` route registration and handlers, `internal/domain/` types — sibling checkout at `../managed-agent-platform`, `/add-dir` it when needed) → the platform's docs → observing a locally running compose stack. Record any assumption a plan or PR rests on in the plan file or the issue.
2. **The management API key never reaches the browser.** Every platform call — SSE streams included — goes through the console's own server (route handlers acting as a thin proxy). No `NEXT_PUBLIC_*` variable ever carries a credential, and no platform response is passed through with secrets intact.
3. **Wire-neutral where it is free.** The console sends `x-api-key` and `anthropic-beta` headers like any wire-compatible client — or, where the deployment configures identity, the operator's own `Authorization: Bearer` — so it can in principle drive any endpoint speaking the same protocol. It never depends on behavior the platform doesn't implement, and platform-specific divergences are handled by feature detection (an unimplemented surface returning 404/501 hides its UI), not by hard-coding a vendor.
4. **Thin console.** The platform owns semantics; the console owns presentation and interaction state. No domain logic client-side beyond what rendering requires — no recomputing session state from events the platform already serves, no client-side validation stricter than the wire's.
5. **Identity belongs to the platform; the console is its relying party.** _Amended 2026-08-14, when the platform grew OIDC verification and per-route roles ([plan 08](./docs/plan/08_console-sso-rbac.md)); before that it forbade SSO/RBAC outright._ The console never invents authority: it runs a browser sign-in against the deployment's identity provider and forwards the operator's own token in place of the management key, **never both** — the platform's dispatcher takes an `x-api-key` and drops the role, so sending both would serve every operator as root without failing anything — and it **fails closed without a session**. It does not mirror the platform's claim→role mapping, keep a user table, or decide who may do what. `CONSOLE_PASSWORD` survives as a distinct mode for local development and the suites; where identity is configured, a password session authorizes nothing on the platform.

## Stack (settled by plan 01)

Next.js (App Router, TypeScript strict) · Tailwind CSS + shadcn/ui · TanStack Query + Table · pnpm · Vitest (unit/component) + Playwright (e2e) · Docker (standalone output).

## Development

```bash
pnpm dev             # console against a platform base URL from .env.local
pnpm test            # unit/component tests — no network, no money
pnpm test:coverage   # the same suite under the CI thresholds
pnpm test:e2e        # Playwright against the mock platform server
pnpm test:e2e:live   # the live tier, against a real local platform stack
pnpm lint            # eslint; format:check and typecheck are separate scripts — CI runs all three
pnpm probes:check    # the adversarial-probe ratchet: `probe: …` tests still collected, per seam
pnpm fidelity:shots  # one Chrome screenshot per surface per theme, into fidelity-shots/
pnpm release:prepare # file the changelog section a release ships with — docs/releasing.md
```

Testing mirrors the platform's tiered philosophy: the default suites run against recorded fixtures and a mock platform server and spend nothing; the live tier (`RUN_LIVE_CONSOLE_TESTS=1`) drives a real local platform stack. Once opted in, missing configuration **fails** rather than skips. `.env*` files are gitignored — never commit a real key.

## Where things live

| File                                 | Holds                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| [STATE.md](./STATE.md)               | active work and its checklist, and nothing else. ~30 lines. Read it first              |
| [CHANGELOG.md](./CHANGELOG.md)       | the cycle in progress; released cycles are filed under `docs/changelog/`               |
| [docs/plan/](./docs/plan/)           | one plan per file, `NN_short-name.md`, frontmatter `status:` — decisions, not progress |
| [docs/HISTORY.md](./docs/HISTORY.md) | archived plans: what each delivered, and what running it proved or broke               |
| GitHub issues                        | the backlog — the only backlog                                                         |

## Iteration workflow

Every change lands through a PR; **never commit directly to `main`**.

1. Branch off fresh `main`: `git checkout -b <type>/<short-name>` (`feat/`, `fix/`, `chore/`, `docs/`).
2. Develop there. **Docs move with code, in the same PR**: a CHANGELOG entry under `## [Unreleased]` for every notable change; STATE.md whenever the change starts, advances or finishes tracked work; the active plan's `status:` flipped by the PR that changes its lifecycle.
3. Push, open the PR (`gh pr create`), wait for CI green (`gh pr checks --watch`), settle every review thread. **The PR title is a Conventional Commit** — squash merge makes it the commit subject and release-please reads those subjects to decide the next version, so a prose title is not a style slip but a release that silently does not happen. Enforced by the `pr-title` check.
4. **Squash merge** (`gh pr merge --squash --delete-branch`), then sync local `main`.

Releases are their own flow: [docs/releasing.md](./docs/releasing.md).

## How to work here

- **Think before coding; state assumptions.** This repo's failure mode is inherited from the platform: guessing at wire shapes or platform behavior. Verify per principle 1 instead.
- **Simplicity first.** Minimum code that solves the problem; no speculative abstractions; no configurability nobody asked for. Would a senior frontend engineer call this overcomplicated?
- **Surgical changes.** Every changed line traces to the request; match existing style; clean up only orphans your change created.
- **Report only what you can evidence.** Progress claims cite a test run, a diff, or a screenshot from this session; failures are reported with output.
- **UI work reads the design reference first, and fidelity is verified in Chrome — walking the manifest.** Before building UI, extract the current reference's design facts from platform.claude.com in Chrome; after building, compare screenshots side by side. The surfaces are enumerated in [test/fidelity/surfaces.ts](./test/fidelity/surfaces.ts) — `pnpm fidelity:shots` writes one shot per surface per theme. **The PR names which surfaces it re-shot**, so the pass reports coverage rather than effort; a UI change touching a surface the manifest lacks adds it. Diverge only where self-hosting demands it, and record the divergence and its reason in [docs/design-reference.md](./docs/design-reference.md).
- **Derived state carries a `data-*` attribute; e2e reads the attribute, not the sentence.** A surface that renders state through a formatter (`5,412 in · 890 out`, `3s`, `2 of 7`) also exposes it machine-readably. **Exactly one** test per formatter asserts the human string, so a copy edit reddens that one assertion instead of a whole suite.

## Writing it down

**Docs carry what the code cannot: external facts, decisions with the alternatives they rejected, and procedures a human runs.** Before writing a sentence, ask whether a reader could get it from the code, a comment, a config file, or `git log` — if so, cite the path instead of restating it. Code and comments are the truth; a doc that repeats them is a second copy that will be wrong first.

- **One fact, one home.** A fact stated in two files is a fact that will disagree with itself. Link instead of repeating.
- **Put the "why" next to the thing.** A field's rationale belongs in a comment beside the field, not in a README describing the file.
- **Prefer bullets and tables to paragraphs**, and the shortest form that survives review: a decision is a sentence and its reason, not an essay. A CHANGELOG entry is what changed and why it matters — not how it was built.
- **Size is a signal.** A doc past ~200 lines has usually absorbed narrative that belongs in the code. Move it back rather than reorganizing it.
- **Write down what running it found.** The empirical residue — what a live run proved, what a default broke, what an observer got wrong — is the one thing no diff records, and it is worth more than a description of the change.
