# Wire divergences — our transcription vs. the reference SDK

The console's wire types are transcribed from the **platform's** implemented surface
(`src/lib/platform/schemas.ts`), per principle 1. Anthropic also publishes generated types for the
reference product in [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript);
those can never define ours, but every place the two disagree is exactly one of two things — a
**transcription bug** (shipped code reading a shape the platform does not serve) or a **real
divergence** worth recording. This file is that diff, plus the divergences later work added.

**Run 2026-08-07** against `@anthropic-ai/sdk` 0.115.0 and the platform checkout. A one-shot audit,
not a standing CI check (plan 04 decision 8); nothing was added to `package.json`. To repeat it,
clone the SDK anywhere and diff `src/resources/beta/managed-agents/*.ts` against `schemas.ts`.

## Result

Historical result for the 2026-08-07 snapshot below. Its Skills rows (16–18)
are superseded by platform plan 39: the current source of truth is
`internal/api/skills.go`'s GA renderers and the model-free contract suite in
`test/contracts/skills.spec.ts`. The earlier conclusion does not establish
compatibility with a newer platform.

**Zero transcription bugs.** Every difference is the reference being _looser_ than what the platform
renders — with one inversion, `processed_at` (#19), where the reference is _tighter_ and adopting it
would have made the console wrong. Finding no bug is the result worth recording: it is the evidence
that the hand transcription held, and the reason the schemas could become the source of truth in one
step rather than a repair. The platform's authors were reading the same artifact — three of its
handlers cite the reference by type name.

## Divergence table

Ours = `schemas.ts`. Reference = the SDK's generated types. Platform = `../managed-agent-platform`,
cited at file:line.

| #   | Field                                  | Ours                        | Reference                         | Platform                                                                                                                                       | Resolution                                                              |
| --- | -------------------------------------- | --------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | `Agent.system`                         | `string`                    | `string \| null`                  | `System string` — `internal/domain/agent.go:61`                                                                                                | ours correct                                                            |
| 2   | `Agent.description`                    | `string`                    | `string \| null`                  | `Description string` — `:62`                                                                                                                   | ours correct                                                            |
| 3   | `Agent.multiagent`                     | `null`                      | `Multiagent \| null`              | `json.RawMessage`, "reserved seam: always null in v1" — `:66`                                                                                  | ours correct, tighter                                                   |
| 4   | `ModelRef`                             | `{id, speed?}`              | `+ effort?` (5-level union)       | `Model{ID, Speed omitempty}` — `agent.go:11-14`; no effort field                                                                               | ours correct; `effort` is unimplemented here                            |
| 5   | `Agent.skills[]`                       | `{type, skill_id, version}` | looser union                      | normalized to exactly these three keys, `type ∈ {anthropic, custom}`, empty version → `"latest"` — `api/wire.go:506-538`                       | ours correct, and guaranteed by the platform's write-path normalization |
| 6   | `Session.title`                        | `string`                    | `string \| null`                  | `Title string` — `internal/api/sessions.go:47`                                                                                                 | ours correct                                                            |
| 7   | `Session.deployment_id`                | `null` (required)           | `?: string \| null`               | `*string`, "deployments are post-v1: always null" — `:54`                                                                                      | ours correct, tighter                                                   |
| 8   | `SessionUsage.*` (4 fields)            | all required                | all optional                      | `domain.Usage`, all non-pointer — `session.go:20-25`; key set pinned by `sessions_test.go:362-364`                                             | ours correct                                                            |
| 9   | `SessionUsage.cache_creation.*`        | both required               | optional                          | `CacheCreation` non-pointer — `session.go:28-31`                                                                                               | ours correct                                                            |
| 10  | `Session.stats.*`                      | both required               | both optional                     | `statsJSON` float64, non-pointer — `api/sessions.go:35-38`                                                                                     | ours correct                                                            |
| 11  | `SessionAgent.system` / `.description` | `string`                    | `string \| null`                  | embeds `AgentSpec` (same as #1/#2)                                                                                                             | ours correct                                                            |
| 12  | `SessionResource`                      | 6 required keys             | looser                            | `fileResourceJSON{id, created_at, file_id, mount_path, type, updated_at}` — `api/sessionresources.go:44-51`                                    | ours correct                                                            |
| 13  | `Environment.scope`                    | `"organization"` required   | `?: 'organization' \| 'account'`  | `Scope string`, "single-tenant v1: always organization" — `environments.go:24`; the parser rejects `account` with "not supported yet" (`:225`) | ours correct, tighter                                                   |
| 14  | `Packages`                             | 6 arrays                    | + `type?: 'packages'`             | 6 arrays                                                                                                                                       | the reference carries an optional discriminator we don't need           |
| 15  | `VaultCredential.display_name`         | `string \| null` required   | `?: string \| null`               | `*string`, no omitempty — `vaultcredentials.go:24`                                                                                             | ours correct                                                            |
| 16  | `Skill.display_title`                  | `string`                    | `string \| null`                  | `DisplayTitle string` — `skills.go:28`                                                                                                         | ours correct                                                            |
| 17  | `Skill.latest_version`                 | `string` (`""` when none)   | `string \| null`                  | `LatestVersion string` — `:29`                                                                                                                 | ours correct — same semantic, different encoding (`""` vs `null`)       |
| 18  | `Skill.source` / `.type`               | narrowed unions             | bare `string`                     | validated `"custom" \| "anthropic"` — `skills.go:233-234`                                                                                      | ours correct; the narrowing matches platform validation                 |
| 19  | **`SessionEvent.processed_at`**        | **`string \| null`**        | **`string` (non-null)**           | nullable — the platform echoes inbound events with a null stamp and settles it later (`docs/DIVERGENCES.md`)                                   | **ours correct — the one case where the reference is TIGHTER**          |
| 20  | `PlatformFile.downloadable`            | `boolean` required          | `?: boolean`                      | `bool` — `files.go:38`                                                                                                                         | ours correct                                                            |
| 21  | `PlatformFile.scope`                   | `{…} \| null` required      | `?: … \| null`                    | `*fileScopeJSON`, no omitempty — `:39`                                                                                                         | ours correct                                                            |
| 22  | `ModelUsage`                           | 4 token counts + `speed`    | `BetaManagedAgentsSpanModelUsage` | exact match, incl. `Speed *string` — `internal/events/span_test.go:89-93`                                                                      | match                                                                   |

**#19 is the entire argument for principle 1.** The reference declares `processed_at: string`; the
platform serves `null` on echoed inbound events and stamps the real time at settlement. Plan 03 made
every trace time calculation null-safe because of it, and adopting the reference's type wholesale
would have deleted that safety — a runtime bug the type system would have been actively hiding.

Row #17 was reached independently by both sides: the platform's own source records it in a comment
at `internal/api/skills.go:23-24`. Two registries agreeing without having consulted each other is
the corroboration this audit was looking for.

## Enum narrowing — a second strictness axis

`z.object` strips unknown _keys_, but an unknown _enum value_ turns a valid response into a
conformance failure, so each narrowing was checked against the platform's own validation. All ten
are exact: `SessionStatus` (`domain/session.go:10-13`), `StopReason.type` (`domain/event.go:109-111`),
`evaluated_permission` (`domain/agent.go:49-51`), `user.tool_confirmation`'s `result`
(`events/inbound.go:190-192`), `CredentialAuth.type` and `token_endpoint_auth.type`
(`api/vaultcredauth.go:66-68,109,216,232`), `Networking.type` (`api/environments.go:176`),
`Environment.scope` (`:24,225`), `Skill.source` (`api/skills.go:233-234`), and `Agent.skills[].type`
(`api/wire.go:523-524`).

## Deliberately loose spots

- **`SessionAgent.skills`** is `unknown[]` while `Agent.skills` is typed. The platform normalizes
  both identically (#5), so typing it would be safe — but the console does not read it, and it would
  tighten a public type that slice did not set out to change. A decision, not an oversight.
- **`Agent.tools` / `Agent.mcp_servers`** are `unknown[]`: the platform stores them as
  `[]json.RawMessage` and the agent editor owns their interpretation. Typing the toolset union here
  would duplicate that logic in a second place.
- **`SessionEvent` and `ContentBlock`** keep an index signature. `z.object` is the default and these
  two are the deliberate exceptions — the only `z.looseObject`s in `schemas.ts` — because each is one
  envelope over a per-type payload union, rendered through an honest JSON fallback for unknown types.
  Narrowing either would strip forward-compatible payloads.

## Feature-detecting the console API (plan 07)

`isUnimplemented` (`src/lib/platform/surfaces.ts`) is valid **only on collection routes**: the
platform has no 501, and an unregistered route falls through the router's catch-all to the same 404
envelope a missing resource gets. A collection path carries no id that could be missing, so a 404
there can only mean the endpoint is.

The console API's listing route breaks that precondition — it carries an environment id, and the
platform 404s a missing environment on the same route. Two of the three 404 branches are closed by
construction from the environment detail page (the org segment is the literal the platform pins; the
id came from the platform's own listing). The third is not: an environment is mutable, and another
operator can delete it while the page is open, at which point the same 404 would read as "this
deployment does not implement environment keys" — a wrong and permanent-looking answer to a
transient fact (found in review, PR #89).

So on a 404 from the tokens route the console **re-reads the environment** and hides the section only
when that confirms it is still there. A wrongly shown error is a nuisance; a wrongly hidden surface
is a lie. The extra request runs only on that 404. Telling the two apart by message prose was
rejected — both are `not_found_error`, and matching on platform prose is the guessing principle 1
forbids.

## Identity cannot be feature-detected, and the console does not try (plan 08)

Principle 3 says divergences are handled by feature detection. Whether a deployment authenticates its
operators is the one thing that rule cannot reach, for three separate reasons, any one sufficient:

1. **The platform hides it on purpose** — an unauthenticated request gets the same answer either way
   (`internal/api/server.go:324-327`). There is no probe whose result differs.
2. **A 403 is not "surface absent"** — a route that exists and refuses this caller should stay shown
   and erroring, which is right for a permission error and wrong for a mode question.
3. **The console needs the answer before it makes any call** — which credential the BFF attaches, and
   which login page the browser is sent to, are decided while composing the first request.

So the console's **own configuration** carries its mode (`src/lib/identity/`), reported at
`/api/health` as `identity.mode`. The variable names are the platform's own, and two values must
agree across the two processes: the issuer, and the console's client id, which the platform must
expect as `IDENTITY_OIDC_AUDIENCE`. The URL rules are transcribed from the platform's verifier rather
than invented, because a URL this console accepts and the platform refuses is a deployment that boots
and then cannot serve. The platform's third mode, `trusted_proxy`, is **refused** rather than
ignored: reading it as "identity off" would leave a deployment that believes it authenticates
operators serving them unauthenticated.

## Reference surfaces the platform has deferred

Documentation only — principle 1 keeps these out until the platform serves them: memory stores,
scheduled deployments, session threads, tunnels, user profiles. The reference also has one interface
per session-event type where ours is deliberately one envelope. A checklist of fields the console
_could_ surface, never a shape to adopt.
