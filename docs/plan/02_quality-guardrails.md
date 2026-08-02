---
status: archived
issue: 11
---

# Quality guardrails — cross-platform dev, hardened CI, second reviewer, 90%+ coverage

Requested 2026-08-02: the console must be developable and runnable on **Windows, macOS, and Linux**; CI guardrails must get materially stronger; **Codex** joins CodeRabbit as a second automated reviewer; unit-test coverage must reach **90%+**.

## Ground truth (baseline, measured 2026-08-02)

- Coverage with only test-touched files counted: 91% lines — an illusion. Honest all-files coverage over `src/**`: **9.7% lines (118/1215), 4% functions**. The 30-test Playwright e2e tier exercises the app end-to-end but contributes nothing to Vitest coverage numbers.
- CI: single `ubuntu-latest` verify job + docker build; actions referenced by tag (mutable); lint passes with warnings; no dependency updates, no code scanning, no image scan, no failure artifacts.
- No `.gitattributes` — Windows checkouts materialize CRLF (`autocrlf`), producing recurring local prettier false-failures (committed blobs are LF; CI unaffected).
- Review gate: CI green + unresolved review-thread count exactly 0 (author-agnostic — any bot's threads join the gate automatically).

## Slices

1. **Cross-platform + CI hardening** (one PR):
   - `.gitattributes`: `* text=auto eol=lf` + binary annotations; renormalize commit. Kills the CRLF noise class on Windows for good.
   - CI verify job becomes a **3-OS matrix** (ubuntu/windows/macos): lint, format, typecheck, unit, e2e on every OS; a single `ci-ok` join job gives branch protection a stable required-check name.
   - `eslint --max-warnings 0`; all actions **pinned by commit SHA**; Dependabot (npm + github-actions, weekly, grouped); **CodeQL** (javascript-typescript, PR + weekly); **trivy** scan of the built image (HIGH/CRITICAL gate) in the docker job; Playwright **traces + report uploaded as artifacts on failure**; **axe-core a11y smoke** e2e on the main surfaces (both themes).
   - Repo settings via API: secret scanning + push protection; **branch protection on `main`** (PR required, `ci-ok` + `docker` required, conversation resolution required) — codifies the existing convention.
   - → verify: matrix green on all three OSes; a deliberately warned lint fails; artifacts appear on a forced e2e failure (spot check).
2. **Coverage ≥90% enforced** (one or more PRs): Vitest v8 coverage over `src/**` **excluding `src/components/ui/**`** (vendored shadcn primitives — third-party code, documented exclusion; everything we wrote counts). Thresholds in config: lines/statements/functions ≥90, branches ≥85. CI runs `test:coverage`; the suite grows until the gate passes honestly — component tests for every page and console component (jsdom + Testing Library + mocked BFF fetch), node-env tests for the BFF proxy route and login/proxy middleware, hook tests for `queries.ts`/`use-session-trace`.
   - → verify: `pnpm test:coverage` green locally and in CI on all three OSes; thresholds in `vitest.config.ts`, not in a script flag.
3. **Codex reviewer** (operator step + one PR): decided 2026-08-02 — the **Codex GitHub App** (`chatgpt-codex-connector`), not an API-key workflow; the operator installed it on the org with code review enabled, so no repo-side workflow ships. The repo adds `AGENTS.md` (mirroring the platform repo's pattern) so Codex and similar tools review against the repo's actual conventions. The merge gate needs no change: it already counts every unresolved thread regardless of author.
   - → verify: a Codex review lands on a PR and its unresolved threads block the merge gate until resolved.

## Declined (with reasons)

- Bundle-size budget — premature for a self-hosted operator console; revisit if first-load regresses.
- License scanning, commit-message lint, CODEOWNERS — solo-maintained repo; ceremony without payoff today.
- Preview deployments — the product is self-hosted; the compose quickstart is the preview.
- Scheduled live-tier CI against a real platform stack — needs standing credentials/runner; stays a manual acceptance (see plan 01's record).
