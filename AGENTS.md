# AGENTS.md

For AI coding agents and reviewers (Codex, CodeRabbit, and similar).

**[CLAUDE.md](./CLAUDE.md) is the canonical contributor guide** — read it before making or reviewing
a change. These are the rules most often violated by tools that skip it:

- **Never guess a wire shape.** The platform's implemented surface is the single source of truth
  (`../managed-agent-platform`'s `internal/api/`, `internal/domain/`). A wire shape without a source
  is a defect.
- **The management API key never reaches the browser.** No `NEXT_PUBLIC_*` carries a credential;
  `.env*` is gitignored — flag any real key in a diff.
- **Never commit to `main`.** Branch → PR → CI green **and** zero unresolved review threads → squash
  merge, with a Conventional Commit PR title.
- **Green means:** `pnpm lint` (zero warnings), `format:check`, `typecheck`, `test:coverage`,
  `test:e2e`, on a 3-OS matrix plus a trivy-gated Docker build.
- **Thin console.** The platform owns semantics; no client-side recomputation of platform state, no
  validation stricter than the wire's, no speculative abstractions.
- **Docs move with code, in the same PR**, and stay terse — see CLAUDE.md's "Writing it down".
