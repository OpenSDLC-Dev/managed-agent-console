# Wire divergences — our transcription vs. the reference SDK

The console's wire types are transcribed from the **platform's** implemented surface
(`src/lib/platform/schemas.ts`), per CLAUDE.md principle 1. Anthropic also publishes generated
TypeScript types for the reference product in
[`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript). Those types can
never define ours — the reference product and this platform are different implementations — but
every place the two disagree is exactly one of two things: **a transcription bug** (shipped code
reading a shape the platform doesn't serve) or **a real platform divergence** (worth recording).
Nothing in this repo surfaced either before plan 04.

This file is the result of that diff. It is documentation, **not a backlog**: the reference carries
whole surfaces the platform has deferred (memory stores, deployments, session threads, tunnels,
user profiles), and principle 1 keeps them out of the console until the platform serves them.

**Run 2026-08-07** against `@anthropic-ai/sdk` 0.115.0 (local checkout at
`../../anthropic-sdk-typescript`, `src/resources/beta/managed-agents/`) and the platform checkout at
`../managed-agent-platform`. Per plan 04 decision 8 this is a one-shot audit, not a standing CI
check — the SDK is a 6.8 MB dependency on a beta surface that moves weekly for reasons that say
nothing about this console, and link B (`test/e2e-live/live.spec.ts`) already watches the truth that
matters. Nothing was added to `package.json`. To repeat it, clone the SDK anywhere and diff
`src/resources/beta/managed-agents/*.ts` against `src/lib/platform/schemas.ts`.

## Result

**Zero transcription bugs.** Every difference is the reference being _looser_ than what the platform
renders — with exactly one inversion, `processed_at` (#19), where the reference is _tighter_ and
adopting it would have made the console wrong.

Finding no bug is itself the result worth recording: it is the evidence that the hand transcription
dated 2026-08-02 held, and the reason the schemas could become the source of truth in one step
rather than a repair.

The platform authors were reading the same artifact — three of its handlers cite the reference by
type name: `internal/api/agents.go:15` ("agentJSON is the BetaManagedAgentsAgent wire shape"),
`internal/api/sessions.go:40` (same for sessions), `internal/api/files.go:42` ("fileScopeJSON is
BetaFileScope").

## Divergence table

Ours = `src/lib/platform/schemas.ts`. Reference = the SDK's generated types. Platform =
`../managed-agent-platform` source, cited at file:line.

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

Two rows were independently reached: the platform's own source records #17 in a comment at
`internal/api/skills.go:23-24` — "the SDK types it as a required plain string, and what the reference
echoes there is unrecorded" — and points at its `docs/DIVERGENCES.md`. Our transcription and the
platform's registry agree without having consulted each other, which is the corroboration this audit
was looking for.

### #19 is why the SDK cannot be the source of truth

The reference declares `processed_at: string` on the event envelope. The platform serves `null` on
echoed inbound events and stamps the real time at settlement. Plan 03 made every trace time
calculation null-safe precisely because of this. Adopting the reference's type wholesale would have
deleted that safety and left the console computing durations against `null` — a runtime bug the
type system would have been actively hiding.

It is one row in a table of twenty-two, and it is the entire argument for principle 1.

## Enum narrowing — a second strictness axis

Objects in `schemas.ts` are `z.object`, which strips unknown _keys_ rather than rejecting them, so a
platform that adds a field still conforms (plan 04 decision 2). Unknown _enum values_ are a separate
question: where the platform accepts a value our union omits, a valid response becomes a conformance
failure. Each narrowing was therefore checked against the platform's own validation:

| Union                             | Ours                                             | Platform validation                                                       | Verdict |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- | ------- |
| `SessionStatus`                   | idle / running / rescheduling / terminated       | `internal/domain/session.go:10-13`                                        | exact   |
| `StopReason.type`                 | end_turn / requires_action / retries_exhausted   | `internal/domain/event.go:109-111`                                        | exact   |
| `evaluated_permission`            | allow / ask / deny                               | `internal/domain/agent.go:49-51`                                          | exact   |
| `result` (user.tool_confirmation) | allow / deny                                     | `internal/events/inbound.go:190-192` — `result must be "allow" or "deny"` | exact   |
| `CredentialAuth.type`             | mcp_oauth / static_bearer / environment_variable | `internal/api/vaultcredauth.go:66-68,109`                                 | exact   |
| `token_endpoint_auth.type`        | none / client_secret_basic / client_secret_post  | `internal/api/vaultcredauth.go:216,232`                                   | exact   |
| `Networking.type`                 | unrestricted / limited                           | `internal/api/environments.go:176`                                        | exact   |
| `Environment.scope`               | organization                                     | `internal/api/environments.go:24,225`                                     | exact   |
| `Skill.source`                    | custom / anthropic                               | `internal/api/skills.go:233-234`                                          | exact   |
| `Agent.skills[].type`             | anthropic / custom                               | `internal/api/wire.go:523-524`                                            | exact   |

## Deliberately loose spots

- **`SessionAgent.skills`** is `unknown[]` while `Agent.skills` is typed. The platform normalizes
  both identically (#5), so typing it would be safe — but it would tighten a public type this slice
  did not set out to change, and the console does not read it. Left as-is; noted so the looseness is
  a decision rather than an oversight.
- **`Agent.tools` / `Agent.mcp_servers`** are `unknown[]`. The platform stores them as
  `[]json.RawMessage` (`internal/domain/agent.go:63-64`) and the agent editor owns their
  interpretation. Typing the toolset union here would duplicate that logic in a second place.
- **`SessionEvent`** keeps an index signature: it is one envelope over a per-type payload union, and
  the console renders unknown types through an honest JSON fallback rather than failing. This is the
  only shape where `z.looseObject` is used, because it is the only one whose inferred type should
  carry `[k: string]: unknown`.

## Feature-detecting the console API (plan 07, seam 6)

`isUnimplemented` (`src/lib/platform/surfaces.ts`) is documented as valid **only on collection
routes**: the platform has no 501, an unregistered route falls through the router's catch-all
(`internal/api/server.go:152`), and the 404 it answers is the same envelope a missing resource gets.
A collection path carries no id that could be missing, so a 404 there can only mean the endpoint is.

The console API's listing route breaks that precondition — it carries an environment id, and the
platform 404s a missing environment on the same route (`internal/api/consoleapi.go:127-142`). Two of
`consoleEnvironment`'s three 404 branches are closed by construction from the environment detail
page:

1. the org segment is the literal `default` the platform pins (`consoleapi.go:52-53`), so the
   unrecognized-organization branch is unreachable;
2. the id came from the platform's own listing, so the malformed-id branch is unreachable.

The third — **the environment does not exist** — is not closed by construction, and the first draft
of this treated it as if it were. Having loaded the environment proves it existed _then_: an
environment is mutable, and another operator can delete it while the page is open, at which point
the same 404 arrives and would read as "this deployment does not implement environment keys" — a
wrong and permanent-looking answer to a transient fact (found in review, PR #89).

So: on a 404 from the tokens route, **re-read the environment before concluding anything**, and hide
the section only when that re-read confirms it is still there. A deleted environment keeps the error
visible; so does a re-read that cannot answer. The fail-safe direction is deliberate — a wrongly
shown error is a nuisance, a wrongly hidden surface is a lie — and it matches the rule `useSurfaces`
already follows, where only a confirmed 404 hides anything.

The extra request runs **only on that 404**: a platform serving the surface never pays for it, and
one that does not pays once. The alternative considered and rejected was telling the two 404s apart
by message text (`no such endpoint: …` versus `environment … not found`) — both are
`not_found_error`, so only the prose differs, and matching on platform prose is the guessing
principle 1 forbids.

## Reference surfaces the platform has deferred

Documentation only — principle 1 keeps these out of the console until the platform serves them:
memory stores, scheduled deployments, session threads, tunnels, user profiles. The reference also
has one interface per session-event type; our `SessionEvent` is deliberately one envelope. That list
is useful as a checklist of fields the console _could_ surface, never as a shape to adopt.
