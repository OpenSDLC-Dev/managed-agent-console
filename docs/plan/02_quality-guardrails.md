---
status: archived
issue: 11
---

# Quality guardrails (plan 02)

Requested 2026-08-02: the console must be developable on Windows, macOS and Linux; CI guardrails
materially stronger; **Codex** joins CodeRabbit as a second automated reviewer; coverage to 90%+.
Three slices, PRs #12 and #20 plus the archival PR.

The baseline that justified it: coverage counted honestly over `src/**` was **9.7% lines** (the 91%
figure counted only test-touched files), CI was one ubuntu job with tag-referenced actions and
warnings tolerated, and no `.gitattributes` meant Windows checkouts produced recurring prettier
false-failures. What shipped is now the CI workflows, `vitest.config.ts` thresholds and
`.gitattributes` themselves.

## Decisions

- **Coverage excludes `src/components/ui/**`** — vendored shadcn primitives are third-party code;
  everything written here counts. Thresholds live in `vitest.config.ts`, not in a script flag, so
  they cannot be waived per invocation.
- **A single `ci-ok` join job** in front of the 3-OS matrix, so branch protection has one stable
  required-check name that survives matrix changes.
- **Codex arrives as a GitHub App**, not an API-key workflow (operator choice, 2026-08-02): it is
  installed org-side, so no repo workflow ships and no key is held here. The merge gate needed no
  change — it counts unresolved threads regardless of author, so a bot's thread blocks a merge.

## Declined (with reasons)

Bundle-size budgets (premature for a self-hosted operator console), license scanning, commit-message
lint, CODEOWNERS (ceremony without payoff on a solo-maintained repo), preview deployments (the
product is self-hosted — the compose quickstart is the preview), and scheduled live-tier CI (needs
standing credentials and a runner; live acceptance stays a manual, credentialed run).
