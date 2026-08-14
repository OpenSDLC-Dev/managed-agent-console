# History

One entry per archived plan: what it delivered, and what **running** it proved or broke — the part
no diff records. The decisions and their rejected alternatives stay in the plan files linked here;
a change's narrative is in [CHANGELOG.md](../CHANGELOG.md) and [docs/changelog/](./changelog/).

## [Plan 08](./plan/08_console-sso-rbac.md) — console SSO and role-aware UI (archived 2026-08-14)

Issue #56, PRs #92–#96, #100. Browser OIDC login, and the BFF forwarding the operator's own token in
place of the management key.

**Acceptance, against the bundled Casdoor:** a `map-viewer` had its environment-create refused in the
platform's own words, and a `map-admin` issued an environment key. The pair is the proof, not either
half — a viewer refused and an admin allowed on the same route is what shows the operator's token
travelled. Two defects it found, both invisible to CI: a completed sign-in landed on
`http://0.0.0.0:3300/agents`, the address the standalone server binds rather than the host the
browser used; and every query retried refusals, so a 403 was asked twice and the denial waited out a
backoff. The SSO login page and the account block cannot be walked while both automated tiers run in
password mode — compared by hand in Chrome, filed as #99.

## [Plan 07](./plan/07_console-issued-keys.md) — console-issued credentials (archived 2026-08-14)

Issue #56, PRs #86–#98. Environment-key and API-key issuance, on the two different console
namespaces the reference actually uses — `/api/oauth/…` and `/api/console/…` — each mirrored where it
was observed rather than unified into an invented one.

**Acceptance, against a real compose stack:** the real `ant beta:worker poll`, invoked exactly as the
console's setup guide prints it, authenticated on a console-issued key; the platform confirmed it
positively rather than by silence (`workers_polling: 1`, which only the authenticated poll path
produces), and revoking the key stopped the worker within one poll. Repeatable as
`test/e2e-live/keys.spec.ts`, spending no model tokens. Three things it found that green CI never
would: **the mock had invented the management-key prefix** (`sk-map-adm01-` against the platform's
`sk-map-api01-`) and it survived every tier because the mock and its assertions agreed with each
other; the same fixture answered `201` where the platform answers `200`; and the page put its primary
action under the table where every other list page puts it in the header. One trap for whoever
repeats the walkthrough: the browser extension's network panel labels the revoke **503** — it is not,
the response is 204 by three independent measurements. The artifact is in the observer.

## [Plan 06](./plan/06_google-sign-in.md) — Google sign-in (archived 2026-08-09)

Issues #69, #74; PRs #68–#80. A hostname with managed TLS, IAP in front of every request, and the
password out of the production pod — which ends up running no authentication code at all.

**Verified against the live deployment, not inferred from a green pipeline:** a Workspace account
reaches `/agents` with no password page; anonymous requests are refused by IAP; a Google account
_outside_ the Workspace is refused (confirmed by the maintainer); and a real session trace held open
for **252 seconds**, taking all sixteen 15-second `ping` frames as separate chunks and ending on
`session.deleted` — the proof that `timeoutSec: 3600` reached the load balancer the ingress
controller actually built. Four things it found by running: **IAP content-negotiates its refusal**
(JSON gets 401, a default `curl` gets a 302 to accounts.google.com — the plan had this backwards
until it was measured, so the smoke gate requires the `x-goog-iap-generated-response` header rather
than a bare 401); binding the container to `127.0.0.1` would have broken the deployment rather than
hardened it, quietly, because container-native load balancing delivers to the Pod IP;
`kubectl apply` cannot remove an env var a `rollout undo` re-added, so the removal is stated with
`kubectl set env`; and an unbounded revision history means no credential can ever be retired, since
old ReplicaSets keep their whole pod template — `revisionHistoryLimit: 3` is a security boundary here,
not housekeeping.

## [Plan 05](./plan/05_release-management.md) — release management (archived 2026-08-08)

PRs #42–#54, release PR #46. Versions, tags, hand-written release notes, and a multi-arch image at
`ghcr.io/opensdlc-dev/managed-agent-console`.

**Proven by cutting 0.2.0 through the finished machinery** rather than by describing it. Four things
it found: the first release PR would have failed CI forever, because release-please writes its
manifest compactly and `format:check` runs over a file no human edits; the GHCR package is **private
on first publish** even for a public repository, so the README's `docker run` fails for outside
readers until it is flipped by hand; the release-notes rewrite sat behind the image build, so a
failed build would have left a published release wearing a placeholder body; and `release:prepare`
bumped README's image pins but not its status line.

## [Plan 04](./plan/04_verification-hardening.md) — verification hardening (archived 2026-08-07)

Issue #31, PRs #32–#38. Zod schemas as the transcription of record, contract-violation probes with a
`pnpm probes:check` ratchet, semantic `data-*` attributes in e2e, and an enumerated fidelity
manifest.

The one-shot audit against Anthropic's TypeScript SDK found **zero transcription bugs** and 22 benign
divergences ([docs/wire-divergences.md](./wire-divergences.md)); the probes found and fixed a real
page-killing unguarded `usage` read on two surfaces. Two findings about the work itself: the first
fidelity run passed 46/46 while shooting six lists of **skeleton bars**, because `DataTable` carried
no `aria-busy` marker; and slice 3's first implementation broke its own convention.

## [Plan 03](./plan/03_ux-parity.md) — UX parity from already-served data (archived 2026-08-04)

Issue #24, PRs #25–#29. Trace readability (offsets, span durations, idle bands, honest JSON
fallback), the wire filters that had been served since v1 and never rendered, the Transcript | Debug
split, and the agent-editor reshape.

## [Plan 02](./plan/02_quality-guardrails.md) — quality guardrails (archived 2026-08-02)

Issue #11, PRs #12, #20. `.gitattributes`, a 3-OS matrix behind a stable `ci-ok` join check,
SHA-pinned actions, Dependabot, CodeQL, a trivy gate, and coverage ≥90% enforced in config.

The trivy gate caught 6 real fixable CVEs on its first run and the axe smoke caught 5 unlabeled
controls; the suite went 20 → 415 tests against an honest 10.3% baseline. Codex's first review landed
on the archival PR itself, caught a real defect, and blocked the merge until it was resolved.

## [Plan 01](./plan/01_v1-console.md) — v1 console (archived 2026-08-02)

PRs #1–#9. The whole operator console in five slices: shell and BFF, read-only pages, the live SSE
trace with HITL approval, the write paths, then polish.

Live acceptance ran 2026-08-02 against a real compose stack (MiniMax-M3 endpoint) and passed the full
UI-driven loop — `always_ask` bash agent, file upload and mount, vault and sealed credential, live
trace, deny-then-approve round trip to completion.
