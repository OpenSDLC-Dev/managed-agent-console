# History

Archived plans, summarized. The full narrative of individual changes lives in [CHANGELOG.md](../CHANGELOG.md).

## Plan 02 — quality guardrails (approved 2026-08-02, archived 2026-08-02)

[docs/plan/02_quality-guardrails.md](./plan/02_quality-guardrails.md) hardened the repo in three slices (PRs #12, #20, and the archival PR; issue #11):

1. **Cross-platform + CI hardening** — `.gitattributes` (LF everywhere, kills the Windows CRLF noise class), a 3-OS verify matrix (ubuntu/windows/macos) behind a stable `ci-ok` join check, zero-warning lint, SHA-pinned actions, Dependabot (npm + actions, grouped), CodeQL, a trivy HIGH/CRITICAL gate on the Docker image (which caught 6 real fixable CVEs on its first run), Playwright failure artifacts, and an axe-core a11y smoke (which caught 5 unlabeled controls). Branch protection on `main` and secret scanning codified via API.
2. **Coverage ≥90% enforced** — Vitest v8 coverage gates CI over everything we wrote (`src/**` minus vendored `src/components/ui/**`); the suite grew 20 → 415 tests, landing at 99.6% lines / 96.8% branches against an honest 10.3% baseline.
3. **Codex as second reviewer** — via the Codex GitHub App (installed org-side, no repo workflow), joined by an `AGENTS.md` mirroring the platform repo's pattern so automated reviewers see the repo's conventions. The merge gate — CI green plus zero unresolved review threads — was already author-agnostic, so Codex threads block merges with no gate change.

Decisions of record: GitHub App over an API-key review workflow (operator choice, 2026-08-02); declined as ceremony without payoff today — bundle-size budgets, license scanning, commit-message lint, CODEOWNERS, preview deployments, and scheduled live-tier CI (live acceptance stays a manual, credentialed run).

## Plan 01 — v1 console (approved 2026-08-02, archived 2026-08-02)

[docs/plan/01_v1-console.md](./plan/01_v1-console.md) delivered the entire operator console in five slices (PRs #1–#9):

1. **Scaffold + shell** — Next.js App Router (TS strict, Tailwind, shadcn/ui) themed to the extracted Claude Console palette; the BFF proxy that keeps the management key server-side (SSE passthrough included); optional shared-password login gate; CI, Dockerfile, mock-platform e2e harness.
2. **Read-only resource pages** — agents, environments, sessions (full event trace), vaults (secret-free credential rendering), skills, files; wire types transcribed from the platform source with citations.
3. **Live session trace + HITL** — SSE tail through the BFF with a pure reconcile store (no replay on the wire: seed + dedup + delta-append + preview-replace), approval banner (`user.tool_confirmation`), composer (`user.message`, interrupt, interrupt+redirect).
4. **Write paths** — agent editor (rendered form + raw JSON↔YAML, optimistic-version 409 handling), environment CRUD, session create (vaults + file mounts), vault/credential/skill/file writes with write-only-secret handling.
5. **Polish + deploy docs** — standardized envelope error toasts (copyable request-id), dark mode from the reference design system's dark tokens, Ctrl+K resource search, skeleton loading states, README quickstart, this archive.

Scope decisions of record: platform-implemented surface only (no deployments/memory stores/outcomes/multiagent/MCP execution); single-tenant with a deployment-protection gate rather than a user system; visual fidelity to Anthropic's Claude Console verified in Chrome per slice; the raw editor's YAML view is client-side sugar — JSON is what saves.

Live acceptance ran 2026-08-02 against a real compose stack (MiniMax-M3 endpoint) and passed — the full UI-driven loop: `always_ask` bash agent, file upload + mount, vault + sealed credential, live SSE trace, deny-then-approve HITL round trip to completion (record in CHANGELOG.md). Default suites continue to run against the in-repo mock platform.
