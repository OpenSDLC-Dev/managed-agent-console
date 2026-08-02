# History

Archived plans, summarized. The full narrative of individual changes lives in [CHANGELOG.md](../CHANGELOG.md).

## Plan 01 — v1 console (approved 2026-08-02, archived 2026-08-02)

[docs/plan/01_v1-console.md](./plan/01_v1-console.md) delivered the entire operator console in five slices (PRs #1–#9):

1. **Scaffold + shell** — Next.js App Router (TS strict, Tailwind, shadcn/ui) themed to the extracted Claude Console palette; the BFF proxy that keeps the management key server-side (SSE passthrough included); optional shared-password login gate; CI, Dockerfile, mock-platform e2e harness.
2. **Read-only resource pages** — agents, environments, sessions (full event trace), vaults (secret-free credential rendering), skills, files; wire types transcribed from the platform source with citations.
3. **Live session trace + HITL** — SSE tail through the BFF with a pure reconcile store (no replay on the wire: seed + dedup + delta-append + preview-replace), approval banner (`user.tool_confirmation`), composer (`user.message`, interrupt, interrupt+redirect).
4. **Write paths** — agent editor (rendered form + raw JSON↔YAML, optimistic-version 409 handling), environment CRUD, session create (vaults + file mounts), vault/credential/skill/file writes with write-only-secret handling.
5. **Polish + deploy docs** — standardized envelope error toasts (copyable request-id), dark mode from the reference design system's dark tokens, Ctrl+K resource search, skeleton loading states, README quickstart, this archive.

Scope decisions of record: platform-implemented surface only (no deployments/memory stores/outcomes/multiagent/MCP execution); single-tenant with a deployment-protection gate rather than a user system; visual fidelity to Anthropic's Claude Console verified in Chrome per slice; the raw editor's YAML view is client-side sugar — JSON is what saves.

Residual (tracked in STATE.md until done): live acceptance against a real compose stack with a configured model endpoint — needs operator credentials; all default suites run against the mock platform.
