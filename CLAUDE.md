# CLAUDE.md

Guidance for Claude Code (and contributors) working in this repository.

## What this is

The **web console for [managed-agent-platform](https://github.com/OpenSDLC-Dev/managed-agent-platform)** — an open-source, self-hostable platform for long-horizon AI agents whose REST API is wire-compatible with Anthropic's Claude Managed Agents. This repo is the operator-facing frontend: manage agents, environments, and sessions (live event traces, human-in-the-loop tool approval), plus vaults, skills, and files, on a platform deployment you run yourself.

Two distinct references, two distinct roles:

- **UI reference:** the Managed Agents section of Anthropic's Claude Console (platform.claude.com) — layout, resource pages, and interaction patterns are modeled on it, adapted where self-hosting calls for something different.
- **API truth:** the **platform's implemented surface**, not the reference product's. The console never ships a feature the platform doesn't serve; surfaces the platform has deferred (scheduled deployments, memory stores) stay out of the console until the platform lands them.

## Plans, state, and backlog

Conventions mirror the platform repo:

- **Plans live in [docs/plan/](./docs/plan/)** — one file per plan, named `NN_short-name.md`, opening with YAML frontmatter `status: draft | approved | in-progress | archived` (plus optional `issue:`). Plan files carry no progress tracking.
- **[STATE.md](./STATE.md)** — the active-work tracker and nothing else: current plan/issue and its task checklist, ~30-line budget. Read it at the start of a session; update it in every PR that starts, advances, or finishes tracked work.
- **The backlog is GitHub issues** — the only backlog. A change's narrative is written once, in [CHANGELOG.md](./CHANGELOG.md) — which holds the **cycle in progress** and an index; a released cycle is filed as its own [docs/changelog/X.Y.Z.md](./docs/changelog/) by `pnpm release:prepare` and is not edited afterwards.

Plans 01–05 are complete and archived; each is summarized in [docs/HISTORY.md](./docs/HISTORY.md), which is the fastest way to learn why the repo is shaped as it is.

## Non-negotiable design principles

1. **The platform API is the single source of truth — never guess at a wire shape.** Resolution order: the platform checkout's source (`internal/api/` route registration and handlers, `internal/domain/` types — sibling checkout at `../managed-agent-platform`, `/add-dir` it when needed) → the platform's docs (`docs/ARCHITECTURE.md`, `docs/DIVERGENCES.md`) → observing a locally running compose stack. Record any assumption a plan or PR rests on in the plan file or the issue.
2. **The management API key never reaches the browser.** Every platform call — SSE streams included — goes through the console's own server (route handlers acting as a thin proxy). No `NEXT_PUBLIC_*` variable ever carries a credential, and no platform response is passed through with secrets intact.
3. **Wire-neutral where it is free.** The console sends `x-api-key` and `anthropic-beta` headers like any wire-compatible client — or, where the deployment configures identity, the operator's own `Authorization: Bearer`, which is no less neutral for being the other of the two credentials the protocol defines — so it can in principle drive any endpoint speaking the same protocol — but it never depends on behavior the platform doesn't implement, and platform-specific divergences are handled by feature detection (an unimplemented surface returning 404/501 hides its UI), not by hard-coding a vendor.
4. **Thin console.** The platform owns semantics; the console owns presentation and interaction state. No domain logic client-side beyond what rendering requires — no recomputing session state from events when the platform already serves it, no client-side validation rules stricter than the wire's.
5. **Identity belongs to the platform; the console is its relying party.** _Amended 2026-08-14 (plan 08 slice 2), because the condition this principle named has been met: the platform now verifies OIDC tokens, resolves each request to a principal, and enforces one of three roles per route._ Until then it read "single-tenant v1 — no RBAC/SSO/user accounts until the platform grows them", and the shared `CONSOLE_PASSWORD` gate was all there was. What is unchanged is the reason: the console never invents authority. It runs a browser sign-in against the deployment's identity provider and forwards the operator's own token in place of the management key, **never both** — the platform's dispatcher takes an `x-api-key` and drops the role, so sending both would serve every operator as root without failing anything — and it **fails closed without a session**. It does **not** mirror the platform's claim→role mapping, keep a user table, or decide who may do what — a second copy of the authority rules is a drift bug waiting to happen (principle 4 puts semantics on the platform). `CONSOLE_PASSWORD` survives as a distinct mode for local development and the suites, and it remains deployment protection rather than a user system: where identity is configured, a password session authorizes nothing on the platform.

## Stack (settled by plan 01)

Next.js (App Router, TypeScript strict) · Tailwind CSS + shadcn/ui · TanStack Query + Table · pnpm · Vitest (unit/component) + Playwright (e2e) · Docker (standalone output).

## Development

```bash
pnpm dev             # console against a platform base URL from .env.local
pnpm build           # production build
pnpm test            # unit/component tests — no network, no money
pnpm test:coverage   # the same suite under the CI thresholds
pnpm test:e2e        # Playwright against the mock platform server
pnpm test:e2e:live   # the live tier, against a real local platform stack
pnpm lint            # eslint; format:check (prettier) and typecheck (tsc) are separate scripts — CI runs all three
pnpm probes:check    # the adversarial-probe ratchet: `probe: …` tests still collected, per seam
pnpm fidelity:shots  # one Chrome screenshot per surface per theme, into fidelity-shots/
pnpm release:prepare # file the changelog section a release ships with — see docs/releasing.md
```

Testing mirrors the platform's tiered philosophy: the default suites run against **recorded fixtures and a mock platform server** and spend nothing; a live tier (opt-in via `RUN_LIVE_CONSOLE_TESTS=1`) drives a real local platform stack (`deploy/compose` in the platform repo). Once opted in, missing configuration **fails** rather than skips. `.env*` files are gitignored — never commit a real key.

## Iteration workflow

Every change lands through a PR; **never commit directly to `main`** (the repo-bootstrap commit is the sole exception).

1. Branch off fresh `main`: `git checkout -b <type>/<short-name>` (`feat/`, `fix/`, `chore/`, `docs/`).
2. Develop on the branch. **Docs move with code, in the same PR:** a CHANGELOG.md entry under `## [Unreleased]` for every notable change; STATE.md updated whenever the change starts, advances, or finishes tracked work; the active plan's frontmatter status flipped by the PR that changes its lifecycle.
3. Push, open the PR (`gh pr create`), wait for CI green (`gh pr checks --watch`); settle every review thread. **The PR title is a Conventional Commit** (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`, `build:`, `ci:`, `revert:`, optional `(scope)`, `!` for breaking) — squash merge makes it the commit subject and release-please reads those subjects to decide the next version, so a prose title is not a style slip but a release that silently does not happen. Enforced by the `pr-title` check.
4. **Squash merge** (`gh pr merge --squash --delete-branch`), then sync local `main`.

Releases are their own flow — release-please proposes the version, a human writes the narrative: [docs/releasing.md](./docs/releasing.md).

## How to work here

- **Think before coding; state assumptions.** This repo's specific failure mode is inherited from the platform: guessing at wire shapes or at platform behavior. Verify per principle 1 instead.
- **Simplicity first.** Minimum code that solves the problem; no speculative abstractions; no configurability nobody asked for. The test: would a senior frontend engineer call this overcomplicated?
- **Surgical changes.** Every changed line traces to the request; match existing style; clean up only orphans your change created.
- **Report only what you can evidence.** Progress claims cite a test run, a diff, or a screenshot from this session; failures are reported with output; done-and-verified is stated plainly.
- **UI work reads the design reference first, and fidelity is verified in Chrome — walking the manifest.** The console's visual style must stay consistent with Anthropic's Claude Console (a standing product decision, 2026-08-02). Before building or reshaping UI, extract the current reference's design facts (computed fonts, colors, spacing, layout) from platform.claude.com in Chrome; after building, load the local console in Chrome and compare screenshots against the reference side by side. The surfaces to compare are enumerated in [test/fidelity/surfaces.ts](./test/fidelity/surfaces.ts) — run `pnpm fidelity:shots` to write one shot per surface per theme into the gitignored `fidelity-shots/`. **The PR names which surfaces it re-shot**, so the pass reports coverage rather than effort; a UI change that touches a surface the manifest lacks adds it. A UI slice is not done until this pass has run; note its outcome in the PR. Diverge only where self-hosting demands it, and record the divergence and its reason in [docs/design-reference.md](./docs/design-reference.md) — not only in the PR, which nobody re-reads — under its "Deliberate divergences" heading.
- **Derived state carries a `data-*` attribute; e2e reads the attribute, not the sentence.** A surface that renders state through a formatter (`5,412 in · 890 out`, `3s`, `2 of 7`) also exposes it machine-readably: raw integers, enum values, booleans — `data-input-tokens={usage.input_tokens}`, `data-state`, `data-event-type`, `data-filter`, `data-has-next`. Tests assert on those; **exactly one** test per formatter asserts the human string, so a copy edit or a locale tweak reddens that one assertion instead of a whole suite. Appearance is the Chrome fidelity pass's job, not an e2e string match.
