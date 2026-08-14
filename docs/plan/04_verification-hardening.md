---
status: archived
issue: 31
---

# Verification hardening (plan 04)

Requested 2026-08-07 after reading the `phase-3-verify` sample in
[anthropics-cwc-workshops/how-we-claude-code](https://github.com/anthropics/cwc-workshops). The
console's suite was already thick (474 unit / 38 e2e / 5 live); what it lacked was three structural
guarantees — that the fixtures resemble the platform, that the suite can go red, and that the Chrome
fidelity pass covers a known set of surfaces. Four slices, PRs #32–#38.

What shipped: `src/lib/platform/schemas.ts` (which carries decisions 1–2 in its own header),
`schemas.test.ts`, the `probe:` tests and `pnpm probes:check`, `test/fidelity/surfaces.ts`, and
[docs/wire-divergences.md](../wire-divergences.md).

## Decisions

1. **Schemas are the source; types are `z.infer` of them.** An eslint `no-restricted-imports` rule
   pins it — without that rule the decision quietly decays into shipping zod to the browser.
2. **The schemas never gate the running console.** A verification instrument only: no response is
   validated in the browser or the proxy. Principle 4 forbids validation stricter than the wire's,
   and principle 3 means an endpoint rendering one extra field must not be rejected.
   **Amended in slice 1, on evidence:** the plan said `z.looseObject`; probing zod 4.4.3 showed plain
   `z.object` already _strips_ unknown keys (only `z.strictObject` rejects), while `looseObject`'s
   inferred `[k: string]: unknown` would have deleted typo protection across all 42 consumers. It is
   kept for `SessionEvent` and `ContentBlock`, the two shapes whose transcription genuinely carries
   an index signature.
3. **Two links, two tiers.** Link A (everything the mock serves ↔ schemas) runs in CI and catches
   mock drift; link B (schemas ↔ the real platform) runs in the live tier and catches transcription
   drift. Neither is sufficient alone: A stays green against a stale transcription its fixtures
   faithfully match, and B cannot run in CI.
4. **`BLOCKED` is a live-tier outcome only** — a surface the deployment does not serve is _not
   observable_, distinct from observed-and-wrong. Missing _configuration_ still fails loudly.
5. **State attributes carry semantics; exactly one test per format carries the formatting.** Removes
   the coupling that made a copy edit look like a regression.
6. **The fidelity manifest is a list, not a route.** No `/verify`-style route ships into a
   credentialed operator image; the manifest is a plain array under `test/`, walked by a script.
7. **The probe rule applies where adversarial input arrives** — SSE/trace reconciliation and wire
   parsing — not across all 57 test files, where it would be busywork.
8. **The official SDK's types are a divergence detector, run once as an audit.** Principle 1 says the
   platform's surface is API truth, so `@anthropic-ai/sdk` can never define ours; but every
   disagreement is either a transcription bug or a real divergence worth recording. Not a standing CI
   check: it is a 6.8 MB weekly-bumped dependency on a _beta_ surface whose releases say nothing
   about this console, and link B already watches the truth that matters. Nothing landed in
   `package.json`; the repeat command is in wire-divergences.md.

## Known gap (recorded, not addressed here)

**Principle 3's feature detection is stated but unimplemented** — every 404 renders as `ErrorState`,
so "the platform lacks this capability" and "this resource does not exist" are indistinguishable
(issue #33). It costs nothing while the console implements only served surfaces, and decision 4's
BLOCKED/FAIL split is the vocabulary it will want.

## Declined (with reasons)

- **The sample's `VerifiableUnit` registry/runner framework** — in a 57-test-file console it becomes
  a second test system competing with Vitest + Testing Library. The instruments are taken; the
  scaffolding is not.
- **Adopting the SDK's types, or depending on the SDK at all** — it describes Anthropic's product,
  not this platform, and it ships types rather than runtime schemas, so it cannot do link A's job.
- **Runtime prop-schema validation on components** — TypeScript strict already checks internal call
  sites; the instrument belongs at the fixture/wire boundary, where shapes are genuinely unverified.
- **A `window.__verify` agent handle and a replay recorder** — the fidelity manifest plus
  deep-linkable routes serve the first; Playwright's traces and video already serve the second.
