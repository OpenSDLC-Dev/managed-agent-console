# Changelog

Notable changes, newest first. Each entry is the one place a change's narrative is written.

## Unreleased

- **Slice 1 — scaffold + shell** (2026-08-02): Next.js (App Router, TS strict) app with Tailwind + shadcn/ui, themed to the extracted Claude Console palette ([docs/design-reference.md](./docs/design-reference.md)); BFF proxy (`/api/platform/*`) injecting the platform key server-side with streaming passthrough; optional shared-password login gate (`CONSOLE_PASSWORD`, Next 16 `proxy.ts` convention) whose native-submit fallback never leaks the password into the URL; sidebar shell with the six resource sections and a connection probe (`GET /v1/agents?limit=1`) surfacing the platform error envelope + request-id; Vitest unit tests, Playwright e2e against an in-repo mock platform (e2e runs the production build — dev-mode cold compiles were slow enough to outrun hydration on Windows), GitHub Actions CI, standalone Dockerfile. Plan 01 approved (with a JSON↔YAML raw-editor scope addition) and flipped `in-progress`; visual-fidelity-verified-in-Chrome added as a standing UI convention (CLAUDE.md).
- **Repo bootstrap** (2026-08-02): CLAUDE.md (working conventions and design principles), the v1 console design plan ([docs/plan/01_v1-console.md](./docs/plan/01_v1-console.md), `draft`), STATE.md, README, Apache-2.0 license. No code yet.
