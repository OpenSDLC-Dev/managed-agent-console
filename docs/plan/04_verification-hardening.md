---
status: approved
issue: 31
---

# Verification hardening — make the fixtures provable, make the suite provably able to fail

Requested 2026-08-07. Source material: a read of the `phase-3-verify` sample in
[anthropics-cwc-workshops/how-we-claude-code](https://github.com/anthropics/cwc-workshops), whose
thesis is that **verification is runtime observation at the surface** — you run the thing, drive it,
and read what it actually shows — structured so that CI, a dashboard, and an agent all consume one
truth. Its concrete instruments are a machine-readable DOM contract, named fixtures with adversarial
"probes", a schema check on the declared shape, a `PASS | FAIL | BLOCKED | SKIP` verdict vocabulary,
and a fixture **designed to fail** so the framework proves it catches lies rather than only confirming
truths.

This console's verification is already far thicker than that sample's (474 unit / 38 e2e / 5 live,
axe gates, a stateful mock platform, a real-stack tier). What it is missing is not volume but three
structural guarantees, each of which the sample supplies an instrument for:

1. **Nothing proves the fixtures resemble the platform.** The whole suite could be green and wrong.
2. **Nothing proves the suite would go red** if a surface actually broke.
3. **The Chrome fidelity pass CLAUDE.md mandates is unenumerated** — it covers whatever was navigated
   to that day.

This plan takes the instruments and leaves the framework. See Declined for what is deliberately not
copied and why. A second source arrived mid-drafting and shaped slice 1: Anthropic's official
TypeScript SDK publishes generated types for this exact resource surface, which gives the
transcription a reference to be diffed against for the first time (decision 8) — as an audit, not a
dependency.

## Ground truth (verified 2026-08-07 against this checkout)

- **The fixtures are unvalidated, and are load-bearing for the entire default suite.**
  [test/mock-platform/fixtures.mjs](../../test/mock-platform/fixtures.mjs) is 449 lines of
  hand-written JS (`agents`, `agentVersions`, `environments`, `sessions`, `sessionEvents`, `vaults`,
  `vaultCredentials`, `skills`, `skillVersions`, `files`). Nothing checks it against
  [src/lib/platform/types.ts](../../src/lib/platform/types.ts), and nothing can today:
  [tsconfig.json](../../tsconfig.json) `include` covers `**/*.ts` and `**/*.mts` but **not `.mjs`**,
  and `checkJs` is off — so the file is not typechecked at all. Every unit test's stub responses and
  every e2e assertion sit on top of it. This is exactly CLAUDE.md principle 1's named failure mode
  (guessing at wire shapes), one layer down from where the principle is usually applied.
- **`types.ts` is itself a hand transcription, and therefore a second drift point.**
  `src/lib/platform/types.ts:1-10`: "Transcribed 2026-08-02 from the platform checkout (file:line
  cites below)". A fixture that conforms perfectly still only proves conformance to _our reading_ of
  the platform, taken on one day. Closing drift needs two links, not one.
- **All 42 consumers of `types.ts` import it type-only.** Verified by grep over `src/` + `test/`:
  42 `import type { … } from "@/lib/platform/types"`, zero value imports. This is the fact that makes
  deriving the types from runtime schemas free — nothing pulls the module at runtime today, so
  nothing will pull zod into a client bundle tomorrow.
- **The mock does not only replay fixtures — it constructs write-path responses field by field, and
  exposes no handle to drive it in-process.** `createAgent` (`test/mock-platform/server.mjs:126-147`)
  assembles an agent from the request body rather than a fixture, and the session, event, skill,
  vault, and file write paths do the same. The module also has **zero exports** and calls
  `server.listen` on import, so nothing can start it on an ephemeral port today. Both facts shape
  link A: validating the exported collections alone would leave every create/update/upload/stream
  response unchecked.
- **The mock platform runs as plain Node, with no TS transform.**
  [playwright.config.ts](../../playwright.config.ts):26 starts it as `node test/mock-platform/server.mjs`.
  Fixtures must therefore stay `.mjs` and stay plain-Node-loadable; conformance has to be asserted
  from Vitest (which transforms and can import the `.mjs`), not by converting the fixtures to
  TypeScript and leaning on `tsc`.
- **Vitest only collects from `src/`.** [vitest.config.ts](../../vitest.config.ts):8 —
  `include: ["src/**/*.test.{ts,tsx}"]`. A conformance test placed under `test/` would be collected
  by nothing and would silently never run. It goes under `src/lib/platform/`.
- **Coverage gates at lines/statements/functions ≥ 90, branches ≥ 85** over `src/**` minus vendored
  `src/components/ui` (vitest.config.ts:13-27). New modules under `src/` are inside the gate.
- **e2e asserts formatted display strings.** `test/e2e/session-live.spec.ts:34` and `:84` assert
  `"5,412 in · 890 out · 3,100 cache read"` — thousands separators, unit words, `·` separators and
  ordering all inside one string. `playwright.config.ts:19` already pins `locale: "en-US"` with the
  comment "Assertions include `toLocaleString()` output — don't let the host's locale pick the digit
  separators", which is the same fragility acknowledged once already. Any copy or format change
  reddens tests whose subject did not change.
- **The state-attribute convention already exists, unnamed.** `src/` carries 12 `data-testid`s and,
  notably, `data-state` on `stream-state` and `data-event-type` on event rows — the console reached
  for a semantic attribute exactly where it needed a stable machine surface. There is no framework to
  add here, only a convention to name and extend.
- **The live tier can carry a real-response check with almost no new machinery.**
  [test/e2e-live/live.spec.ts](../../test/e2e-live/live.spec.ts):41-58 already holds `platformGet` /
  `platformPost` helpers returning parsed JSON from the real stack; validating those payloads is a
  call at existing sites, not a new suite.
- **zod is not a dependency today** (no `node_modules/zod`, absent from package.json); latest is
  4.4.3.
- **Anthropic's official TypeScript SDK ships types for this exact surface, and no runtime schemas.**
  `@anthropic-ai/sdk` 0.115.0 (6.8 MB unpacked) exports Stainless-generated interfaces covering
  every resource this console renders — `BetaManagedAgentsAgent`, `BetaManagedAgentsSession` and its
  event union, `BetaEnvironment` with the networking/config unions, `BetaManagedAgentsVault` /
  `…Credential` with the three auth arms, skills, files (verified 2026-08-07 against the SDK's
  generated `api.md`). They are **types only**: the SDK's zod surface (`zodOutputFormat`,
  `betaZodTool`) is Messages-API helper machinery and carries no resource schemas, so the SDK cannot
  supply link A's runtime validator. What it can supply is a **third reference point** — see
  decision 8.
- **The platform already tracks the SDK's shapes by name.** `internal/api/agents.go:15-16`:
  "agentJSON is the **BetaManagedAgentsAgent** wire shape: every field is `api:"required"` and always
  rendered." The reference-wire diff is therefore not an outside imposition — it compares our
  transcription against the same artifact the platform authors were reading, which is what makes a
  difference between them diagnostic rather than merely interesting.
- **A four-shape sample of that diff, pre-run 2026-08-07 against the local SDK checkout
  (`@anthropic-ai/sdk` 0.115.0) and resolved against the platform source, found no transcription
  bugs and four real divergences** — all in the same direction, the reference being looser than what
  the platform renders:

  | Field                   | Ours (`types.ts`) | Reference SDK                               | Platform source                                           | Resolution                            |
  | ----------------------- | ----------------- | ------------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
  | `Agent.system`          | `string`          | `string \| null`                            | `System string` (`internal/domain/agent.go:61`)           | ours correct — divergence             |
  | `Agent.description`     | `string`          | `string \| null`                            | `Description string` (`:62`)                              | ours correct — divergence             |
  | `Session.title`         | `string`          | `string \| null`                            | `Title string` (`internal/api/sessions.go:33`)            | ours correct — divergence             |
  | `Session.deployment_id` | `null` (required) | `deployment_id?: string \| null` (optional) | `*string`, "deployments are post-v1: always null" (`:40`) | ours correct and tighter — divergence |

  Two consequences. First, the sampled surface is sound — the audit is not expected to be a bug
  hunt. Second, the divergence class is real and would otherwise be invisible: had any of these gone
  the other way (reference non-null, platform nullable), the console would be rendering a value the
  wire can serve as `null`. Environments, vaults/credentials, skills, files, the session-event union,
  `model` (the reference carries `effort`, which our `ModelRef` does not), `stats`, and `usage` are
  **not** sampled and are slice-1 work.

## Design decisions

1. **Schemas are the source; the types are `z.infer` of them.** A new
   `src/lib/platform/schemas.ts` holds the zod objects and inherits the platform file:line citations
   that `types.ts` carries today. `types.ts` shrinks to inferred re-exports
   (`export type Agent = z.infer<typeof AgentSchema>`) imported **type-only**, so the schema module is
   erased from every client build. The preconditions are already met (42/42 type-only consumers) and
   an eslint `no-restricted-imports` rule pins it: no value import of `@/lib/platform/schemas` outside
   `src/lib/platform/**` and test files. Without that rule this decision quietly decays into shipping
   zod to the browser.
2. **The schemas describe the wire as observed, and never gate the running console.** They are a
   verification instrument only — no response is validated in the browser or the proxy. Objects are
   **loose** (zod v4 `z.looseObject`), so a platform that adds a field passes. CLAUDE.md principle 4
   forbids client-side validation stricter than the wire's, and principle 3's wire-neutrality means a
   wire-compatible endpoint that renders one extra key must not be rejected. Strictness lives in the
   tests that assert _our fixtures_ are complete, not in the console's runtime path.
3. **Two links, two tiers, one vocabulary.** Link A (**everything the mock serves** ↔ schemas — its
   static fixtures _and_ the responses it constructs on write paths) runs in CI on every PR and
   catches mock drift. Link B (schemas ↔ the real platform) runs only in the live tier, where real
   responses exist, and catches transcription drift. Neither alone is sufficient, and the failure
   each misses is the other's whole point: A stays green against a stale transcription that the
   fixtures faithfully match, and B cannot run in CI. Both must be built, or decision 3 is a claim
   the plan does not deliver.
4. **`BLOCKED` is adopted as a distinct outcome in the live tier only.** A surface the deployment does
   not serve is _not observable_ — distinct from a surface observed and wrong. This does **not** relax
   the existing live-tier contract: missing _configuration_ still fails loudly (CLAUDE.md, enforced in
   `test/e2e-live/env.ts:17-24`). BLOCKED covers an unimplemented _platform surface_, which is a
   different fact and must not be reported as either a pass or a shape failure.
5. **State attributes carry semantics; exactly one test per format carries the formatting.** e2e reads
   `data-*` values (raw numbers, enum values); the human-readable string keeps one dedicated assertion
   so formatting stays covered, and the Chrome fidelity pass owns appearance. This preserves coverage
   while removing the coupling that makes a copy edit look like a regression.
6. **The fidelity manifest is a list, not a route.** No `/verify`-style route ships in the product
   build: this console is a credentialed operator surface built into a standalone Docker image, and a
   route that enumerates internal state is a net liability there. The manifest is a plain array under
   `test/`, walked by a script.
7. **The probe rule is applied where adversarial input actually arrives, not globally.** The sample
   requires every unit to declare a probe fixture; across 57 test files that would be busywork.
   Adversarial input reaches this console at two seams — the SSE/trace reconciliation layer and wire
   parsing — and that is where the rule is enforced.
8. **The official SDK's types are a divergence detector, run once as an audit — not a dependency and
   not a source of truth.** CLAUDE.md principle 1 is explicit that API truth is the platform's
   implemented surface, _not_ the reference product's, so `@anthropic-ai/sdk`'s types can never
   define ours. But every place our transcription disagrees with them is one of exactly two things:
   a transcription bug (fix it) or a real platform divergence (record it) — and the console has no
   mechanism today that surfaces either. Diffing the two therefore closes the transcription gap that
   link A alone cannot. It runs as a **one-shot audit inside slice 1**, reading the SDK's generated
   types from a checkout (or a temporary devDependency) and recording the divergence table under
   `docs/` — the reference is consulted, never depended on, and nothing lands in `package.json`.
   That is deliberately not a standing CI check. The recurring version costs a 6.8 MB dependency on a _beta_
   surface that Dependabot bumps weekly, where each bump can shift the snapshot and redden CI for a
   reference-product release that says nothing about this console; and link B already watches the
   platform, which is the truth that actually matters. Slice 1's PR records the command so the audit
   is repeatable on demand. If ongoing detection later proves worth the churn, the upgrade path is a
   pinned expected-divergence snapshot test — deliberately not taken now.

## Slices (each lands as its own PR; docs move with the code per CLAUDE.md)

1. **The wire schemas become the source of truth (link A).**
   - Add `zod`. New `src/lib/platform/schemas.ts` transcribing the shapes `types.ts` holds today,
     carrying over the platform `internal/api/*.go` / `internal/domain/*.go` file:line cites; loose
     objects per decision 2. `types.ts` becomes inferred re-exports via type-only import — its
     transcription header stays, repointed at the schema module.
   - eslint `no-restricted-imports` guard per decision 1.
   - **Reference-wire audit** (decision 8), run while transcribing and before the schemas are
     final, extending the four-shape sample in Ground truth to the rest of the surface: diff each
     schema against its counterpart (`BetaManagedAgentsAgent`, `BetaManagedAgentsSession` + the
     event union, `BetaEnvironment`, `BetaManagedAgentsVault` / `…Credential`, skills, files —
     `model`/`effort`, `stats`, and `usage` explicitly included). Every
     difference resolves one of two ways: our transcription was wrong (fix the schema, and say so —
     it means shipped code was reading a shape the platform doesn't serve), or the platform
     genuinely diverges (record it in a `docs/` divergence table with the platform `internal/…`
     cite, in the format the sample table already uses). The sample suggests the common case is the
     reference being looser than the platform, which is the benign direction; the direction that
     matters is the inverse, and finding none of it is itself the result worth recording. Note the
     reference also carries whole surfaces the platform has deferred (memory stores, deployments).
     Those are documentation only: principle 1 keeps them out of the console until the platform
     serves them, and this table must not be read as a backlog.
   - `src/lib/platform/schemas.test.ts`: validate every collection exported by
     `test/mock-platform/fixtures.mjs` (including the `sessionEvents` / `agentVersions` /
     `skillVersions` / `vaultCredentials` maps, whose values are arrays), failing with the zod issue
     path so a mismatch names the field.
   - **Link A must also cover the mock's _constructed_ responses, not just its static exports**
     (review finding, PR #32). Every write and stream path builds its payload in `server.mjs`
     independently of `fixtures.mjs` — `createAgent` at :126-147 assembles an agent field by field,
     and sessions, events, skills, vaults, and files do the same. Validating only the exported
     collections would let a malformed generated shape keep conformance green while the whole default
     e2e suite runs against the wrong wire, which is the exact failure this slice exists to prevent.
     Two changes: make `server.mjs` export its `server` and guard the auto-`listen` behind a
     run-as-main check (it has no exports today and listens on import, so nothing can drive it
     in-process), then have the conformance test start it on an ephemeral port and validate the
     response of each write path it exercises — create/update agent, create session, send event,
     create environment/vault/credential, upload skill and file — against the same schemas.
   - **Link B — validate real platform responses in the live tier** (review finding, PR #32).
     Decision 3 declares two links and, as first drafted, no slice delivered the second: fixtures and
     transcription could stay mutually consistent while both drift from the platform, and link A
     would still pass. `test/e2e-live/live.spec.ts:41-58` already funnels every real call through
     `platformGet` / `platformPost`, so this is a schema parse at two existing helpers rather than a
     new suite. Parse there, and surface a mismatch as a failure naming the field and the endpoint.
     Coverage follows whatever the live suite already touches — agents, sessions, events,
     environments; anything it does not reach is honestly out of link B's reach too, and the plan
     does not pretend otherwise.
   - → verify: the divergence table lands under `docs/`, with every entry either a fixed
     transcription bug (named in the PR and the CHANGELOG) or a divergence carrying its platform
     cite, and no SDK entry in `package.json`; conformance green over both the static fixtures **and**
     the mock's constructed write-path responses; the live tier parses real responses through the
     schemas and `pnpm test:e2e:live` stays 5/5 against the local stack (link B is not verifiable in
     CI by construction — the run and its output go in the PR); a
     deliberately corrupted field locally produces a readable
     `path: ["sessions", 0, "usage", "input_tokens"]`-style failure and that transcript goes in the PR;
     the existing 474 unit / 38 e2e stay green untouched (the inferred types are structurally identical
     — if any test changes, the transcription was wrong and that is a finding worth recording);
     lint / typecheck / coverage green.
2. **The suite proves it can fail.**
   - A canary in the conformance test: an inline object deliberately violating a schema, asserted to
     **fail** validation (the sample's `EXPECTED_FAIL`). It stays out of `fixtures.mjs`, which the mock
     server loads and which must remain valid. Disabling the schema check turns the canary red.
   - Contract-violation fixtures for the layers that face adversarial input: an event missing `id`,
     out-of-order / duplicate SSE frames, a `content_delta` for an event that never persists, an
     unknown event type, a `session.usage` missing a field. Assertions are that the console **degrades
     honestly** — the plan-03 unknown-event JSON fallback, null-safe timing — or surfaces an error;
     never that it silently renders a wrong value.
   - A meta-test over `src/lib/session-trace/` asserting the adversarial cases are present, so the seam
     cannot regress to happy-path-only coverage (decision 7).
   - → verify: canary red when the gate is disabled (transcript in the PR); trace-layer violations
     produce the documented fallback, not a blank or a wrong number; suites green.
3. **Semantic state attributes replace formatted-text assertions.**
   - Name and document the convention (a short CLAUDE.md line under the UI section), then extend it to
     the surfaces rendering derived state: session chips (token counts as raw integers), the event list
     (visible / total), the pager (cursor state), list filters (current value). `data-state` on
     `stream-state` and `data-event-type` are the existing precedent, not new invention.
   - Rewrite `test/e2e/session-live.spec.ts:34,84` and their siblings to read attributes; keep one
     assertion per format for the rendered string.
   - → verify: session-live e2e green reading attributes; changing a number-format helper reddens only
     the single format assertion, not the trace suite — that experiment's transcript goes in the PR.
4. **The Chrome fidelity pass gets a manifest.**
   - `test/fidelity/surfaces.ts`: `{id, route, fixture, description}` over the console's 17 routes and
     their meaningful states — empty / populated / error, a session with a pending approval, both
     themes.
   - `pnpm fidelity:shots`: a Playwright script walking the manifest against the mock platform, writing
     to a gitignored `fidelity-shots/`.
   - CLAUDE.md's fidelity clause gains "walk the manifest"; PRs cite which surfaces they re-shot, so
     the pass reports coverage instead of effort.
   - → verify: the script emits one shot per manifest entry; one real Chrome comparison against
     [docs/design-reference.md](../design-reference.md) run and recorded in the PR.

## Known gaps (recorded, not addressed here)

- **CLAUDE.md principle 3's feature detection is stated but not implemented.** The principle says an
  unimplemented surface returning 404/501 hides its UI; in practice every 404 becomes an `ErrorState`
  (`src/components/console/bits.tsx`, pinned by `src/app/(console)/agents/[id]/page.test.tsx:109-120`),
  so "the platform lacks this capability" and "this resource does not exist" are indistinguishable.
  It costs nothing today — the console implements only surfaces the platform serves — and it is
  product behavior rather than verification capability, so it stays out of this plan. Tracked as its
  own issue; decision 4's BLOCKED / FAIL split is the vocabulary it will want.

## Declined (with reasons)

- **The `VerifiableUnit` / registry / runner framework.** In a five-component sample it is the
  product; in a 57-test-file console it becomes a second, parallel test system with its own
  registration ceremony competing with Vitest + Testing Library, which already mount components in
  isolation. Straight collision with CLAUDE.md's "Simplicity first / no speculative abstractions".
  The instruments are taken; the scaffolding is not.
- **`/verify/:unit/:fixture` routes in the product build** — decision 6.
- **Adopting `@anthropic-ai/sdk`'s types as the console's types, or depending on the SDK at all
  beyond the slice-1 audit.** Its `BetaManagedAgents*` interfaces describe Anthropic's Managed
  Agents product; CLAUDE.md principle 1 names the platform's implemented surface as API truth
  precisely because the two differ. Taking them wholesale would import fields the platform does not
  serve and would silently re-shape the console on a reference-product release — the exact coupling
  principle 3's wire-neutrality forbids. It also cannot do link A's job: the SDK ships types, not
  runtime schemas. Its value is the one-shot diff (decision 8), and that value is fully banked by an
  audit whose output is a checked-in table.
- **Runtime `propsSchema` validation on components.** TypeScript strict already checks internal props
  at compile time; runtime re-checking of our own call sites is redundant. The schema instrument is
  aimed at the fixture/wire boundary, where the shapes are genuinely unverified, not at the component
  boundary, where they are not.
- **Validating platform responses in the browser or the proxy** — decision 2 (principles 3 and 4).
- **`window.__verify`-style agent handle.** Its value in the sample is letting an agent discover and
  drive states; here that role is served by the slice-4 manifest plus deep-linkable routes the console
  already has, without shipping an introspection API into a credentialed build.
- **The replay recorder (`bun run record`).** Playwright already records video and traces, retained on
  failure and uploaded by CI (`.github/workflows/ci.yml`). Nothing to add.
