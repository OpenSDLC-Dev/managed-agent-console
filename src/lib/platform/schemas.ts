/**
 * Zod transcription of the platform's rendered wire shapes — the single source
 * of truth for both the console's types (`./types` infers from here) and the
 * fixture-conformance suite (`./schemas.test.ts`).
 *
 * Transcribed from the platform checkout (file:line cites below); per CLAUDE.md
 * principle 1, update against the source, never from memory. Reference-wire
 * audit against `@anthropic-ai/sdk`'s generated types: docs/wire-divergences.md.
 *
 * **Verification instrument only.** Nothing here runs in the browser or the
 * proxy — no response is validated on the console's runtime path (plan 04
 * decision 2). Every consumer imports the inferred types from `./types`, and an
 * eslint rule keeps zod out of the client bundle.
 *
 * **Objects are `z.object`, not `z.strictObject`** — zod strips unknown keys
 * rather than rejecting them, so a platform that renders one extra field still
 * conforms (principle 3's wire-neutrality; principle 4's "no validation
 * stricter than the wire's"). `z.looseObject` appears only where the
 * transcription genuinely carries an index signature, because its inferred type
 * adds `[k: string]: unknown` — which would erase typo protection everywhere it
 * were used.
 *
 * Conventions (internal/api/wire.go, errors.go): timestamps are RFC 3339 UTC
 * strings; nullable timestamps are string|null; collections render [] and maps
 * render {} — never null; reserved seams (multiagent, deployment_id) render
 * literal null.
 */
import { z } from "zod";

// ---- agents (internal/api/agents.go:18-30, internal/domain/agent.go:59-67)

/** internal/domain/agent.go:11-14 — `effort` is a reference-only field. */
export const ModelRefSchema = z.object({
  id: z.string(),
  speed: z.enum(["standard", "fast"]).optional(), // omitted when unset
});

/** internal/api/wire.go:506-538 — normalized to exactly these three keys. */
export const SkillRefSchema = z.object({
  type: z.enum(["anthropic", "custom"]),
  skill_id: z.string(),
  version: z.string(), // "" is normalized to "latest" on write
});

export const AgentSchema = z.object({
  id: z.string(),
  type: z.literal("agent"),
  name: z.string(),
  version: z.number(),
  model: ModelRefSchema,
  system: z.string(),
  description: z.string(),
  tools: z.array(z.unknown()),
  mcp_servers: z.array(z.unknown()),
  skills: z.array(SkillRefSchema),
  multiagent: z.null(),
  metadata: z.record(z.string(), z.string()),
  created_at: z.string(),
  updated_at: z.string(), // on version entries: the version row's created_at
  archived_at: z.string().nullable(),
});

// ---- environments (internal/api/environments.go:18-28)

/** internal/api/environments.go:176 pins the two accepted values. */
export const NetworkingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("unrestricted") }),
  z.object({
    type: z.literal("limited"),
    allowed_hosts: z.array(z.string()),
    allow_mcp_servers: z.boolean(),
    allow_package_managers: z.boolean(),
  }),
]);

export const PackagesSchema = z.object({
  apt: z.array(z.string()),
  cargo: z.array(z.string()),
  gem: z.array(z.string()),
  go: z.array(z.string()),
  npm: z.array(z.string()),
  pip: z.array(z.string()),
});

export const EnvironmentConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("self_hosted") }),
  z.object({
    type: z.literal("cloud"),
    networking: NetworkingSchema,
    packages: PackagesSchema,
  }),
]);

export const EnvironmentSchema = z.object({
  id: z.string(),
  type: z.literal("environment"),
  name: z.string(),
  description: z.string(),
  config: EnvironmentConfigSchema,
  // environments.go:24 "single-tenant v1: always organization"; the parser
  // rejects `account` with "not supported yet" (:225).
  scope: z.literal("organization"),
  metadata: z.record(z.string(), z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

// ---- sessions (internal/api/sessions.go:40-58, internal/domain/session.go)

/** internal/domain/session.go:10-13. */
export const SessionStatusSchema = z.enum([
  "idle",
  "running",
  "rescheduling",
  "terminated",
]);

/** internal/domain/session.go:20-31 — every field non-pointer. */
export const SessionUsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_input_tokens: z.number(),
  cache_creation: z.object({
    ephemeral_1h_input_tokens: z.number(),
    ephemeral_5m_input_tokens: z.number(),
  }),
});

/** Immutable agent snapshot on a session (domain.ResolvedAgent). */
export const SessionAgentSchema = z.object({
  type: z.literal("agent"),
  id: z.string(),
  version: z.number(),
  name: z.string(),
  model: ModelRefSchema,
  system: z.string(),
  description: z.string(),
  tools: z.array(z.unknown()),
  mcp_servers: z.array(z.unknown()),
  skills: z.array(z.unknown()),
  multiagent: z.null(),
});

/** internal/api/sessionresources.go:44-51 (`fileResourceJSON`). */
export const SessionResourceSchema = z.object({
  id: z.string(),
  type: z.literal("file"),
  file_id: z.string(),
  mount_path: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SessionSchema = z.object({
  id: z.string(),
  type: z.literal("session"),
  agent: SessionAgentSchema,
  environment_id: z.string(),
  status: SessionStatusSchema,
  title: z.string(),
  metadata: z.record(z.string(), z.string()),
  usage: SessionUsageSchema,
  // sessions.go:35-38 — float64, non-pointer; zeros in v1.
  stats: z.object({
    active_seconds: z.number(),
    duration_seconds: z.number(),
  }),
  outcome_evaluations: z.array(z.unknown()), // always [] in v1
  resources: z.array(SessionResourceSchema),
  vault_ids: z.array(z.string()),
  deployment_id: z.null(), // sessions.go:54 "deployments are post-v1: always null"
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

// ---- session events (internal/api/events.go:754-773)

/** internal/domain/event.go:109-111. */
export const StopReasonSchema = z.object({
  type: z.enum(["end_turn", "requires_action", "retries_exhausted"]),
  event_ids: z.array(z.string()).optional(), // only on requires_action
});

/** internal/events/span_test.go:89-93 — `speed` is *string (nullable). */
export const ModelUsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number(),
  cache_read_input_tokens: z.number(),
  speed: z.string().nullable(),
});

export const ContentBlockSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
});

/**
 * Wire event: the stored payload's flat fields merged with exactly three
 * envelope keys (id, type, processed_at). Payload keys vary per type; the
 * ones the console reads are typed here, the rest stay index-accessible —
 * the one shape whose index signature is deliberate.
 *
 * `processed_at` is nullable: the platform echoes inbound events with a null
 * stamp and settles it later. The reference SDK types it non-null; ours is the
 * correct one (docs/wire-divergences.md).
 */
export const SessionEventSchema = z.looseObject({
  id: z.string(),
  type: z.string(), // "{domain}.{action}"
  processed_at: z.string().nullable(),
  content: z.array(ContentBlockSchema).nullable().optional(),
  name: z.string().optional(), // agent.tool_use
  // `.optional()` is load-bearing: a bare z.unknown() infers a *required* key.
  input: z.unknown().optional(), // agent.tool_use
  // internal/domain/agent.go:49-51.
  evaluated_permission: z.enum(["allow", "ask", "deny"]).optional(),
  tool_use_id: z.string().optional(),
  is_error: z.boolean().nullable().optional(),
  // internal/events/inbound.go:190-192 — `result must be "allow" or "deny"`.
  result: z.enum(["allow", "deny"]).optional(),
  deny_message: z.string().nullable().optional(),
  stop_reason: StopReasonSchema.optional(),
  model_usage: ModelUsageSchema.optional(), // span.model_request_end
  error: z
    .object({
      type: z.string(),
      message: z.string(),
      retry_status: z.object({ type: z.string() }).optional(),
    })
    .optional(),
  session_thread_id: z.null().optional(),
});

// ---- vaults + credentials (internal/api/vaults.go, vaultcredentials.go,
//      vaultcredauth.go — auth renders secret-free by construction)

export const VaultSchema = z.object({
  id: z.string(),
  type: z.literal("vault"),
  display_name: z.string(),
  metadata: z.record(z.string(), z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

/** internal/api/vaultcredauth.go:66-68 pins the three auth types. */
export const CredentialAuthSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mcp_oauth"),
    mcp_server_url: z.string(),
    expires_at: z.string().nullable(),
    refresh: z
      .object({
        client_id: z.string(),
        token_endpoint: z.string(),
        // vaultcredauth.go:216,232 pins the three values.
        token_endpoint_auth: z.object({
          type: z.enum(["none", "client_secret_basic", "client_secret_post"]),
        }),
        resource: z.string().nullable(),
        scope: z.string().nullable(),
      })
      .nullable(),
  }),
  z.object({ type: z.literal("static_bearer"), mcp_server_url: z.string() }),
  z.object({
    type: z.literal("environment_variable"),
    secret_name: z.string(),
    // vaultcredauth.go:335-367 — no allow_* flags on the credential form.
    networking: z.discriminatedUnion("type", [
      z.object({ type: z.literal("unrestricted") }),
      z.object({
        type: z.literal("limited"),
        allowed_hosts: z.array(z.string()),
      }),
    ]),
    injection_location: z.object({ body: z.boolean(), header: z.boolean() }),
  }),
]);

export const VaultCredentialSchema = z.object({
  id: z.string(),
  type: z.literal("vault_credential"),
  vault_id: z.string(),
  display_name: z.string().nullable(), // vaultcredentials.go:25 — *string, no omitempty
  auth: CredentialAuthSchema,
  metadata: z.record(z.string(), z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

// ---- skills (internal/api/skills.go:25-33)

export const SkillSchema = z.object({
  id: z.string(), // skill_… or a catalog short name like "xlsx"
  type: z.literal("skill"),
  display_title: z.string(),
  latest_version: z.string(), // "" once every version is deleted
  source: z.enum(["custom", "anthropic"]), // skills.go:233-234
  created_at: z.string(),
  updated_at: z.string(),
});

export const SkillVersionSchema = z.object({
  id: z.string(),
  type: z.literal("skill_version"),
  skill_id: z.string(),
  version: z.string(), // epoch-microsecond digits, as a string
  name: z.string(),
  description: z.string(),
  directory: z.string(),
  created_at: z.string(),
});

// ---- files (internal/api/files.go:31-47)

export const PlatformFileSchema = z.object({
  id: z.string(),
  type: z.literal("file"),
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  downloadable: z.boolean(),
  // files.go:42-47 — *fileScopeJSON, no omitempty.
  scope: z.object({ id: z.string(), type: z.literal("session") }).nullable(),
  created_at: z.string(),
});

// ---- environment keys, the console API (internal/api/consoleapi.go)
//
// This is the off-wire console namespace, not `/v1`: paths and field names are
// mirrored segment-for-segment from the reference console's private API
// (consoleapi.go:39-48). It is reached through the console's own
// `/api/oauth/...` passthrough.

/**
 * consoleapi.go:83-89 — a key as the listing renders it. `expires_at` is
 * nullable: a key minted before the platform's migration 0021 has none and
 * never expires. The secret is never in this shape.
 */
export const EnvironmentKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  expires_at: z.string().nullable(),
});

/** consoleapi.go:99-104 — the offset block this dialect pages with. */
export const PaginationSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  has_more: z.boolean(),
});

/** consoleapi.go:92-97 — `data` plus the offset block, not a keyset cursor. */
export const EnvironmentKeyPageSchema = z.object({
  data: z.array(EnvironmentKeySchema),
  pagination: PaginationSchema,
});

/**
 * consoleapi.go:74-79 — the issuance response: an RFC 6749 token response
 * carrying **no id, name or timestamps**, so a caller that wants the new row
 * re-reads the list. `access_token` is the only time the secret exists outside
 * the platform's hash of it.
 */
export const EnvironmentKeyIssuedSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
});

// ---- management keys, the other console namespace (consoleapikeys.go)
//
// A second dialect on a second prefix (`/api/console/`), mirrored from the
// reference the same way — and deliberately *not* made to match the
// environment-key shapes above. The reference runs two dialects on two
// surfaces: environment keys answer issuance with an RFC 6749 token response,
// management keys answer with the whole resource plus one extra field.

/**
 * consoleapikeys.go — the actor that issued a key: `{id, type}`. Our type
 * vocabulary is `principal` (a human over SSO) or `api_key` (the machine
 * credential that issued it); the reference's has only `user`, because it has
 * a `user_` id to give and we do not. Null on a key seeded from the control
 * plane's own environment variable, which nobody issued.
 */
export const KeyActorSchema = z.object({
  id: z.string(),
  type: z.string(),
});

/**
 * consoleapikeys.go — a management key as both the listing and an update
 * render it. `workspace_id` and `principal` are always null on this platform
 * and are kept in the shape because the reference sends them null too.
 *
 * `status` is a plain string rather than an enum on purpose: `expired` is
 * *derived* from `expires_at` by the platform and is not settable, so the set a
 * caller may send and the set it may receive are different sets. Narrowing the
 * read shape to today's four would also turn a platform that grows a fifth into
 * a parse failure across the whole page — the console renders what it is told.
 */
export const ApiKeySchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  workspace_id: z.string().nullable(),
  created_at: z.string(),
  created_by: KeyActorSchema.nullable(),
  partial_key_hint: z.string(),
  status: z.string(),
  expires_at: z.string().nullable(),
  principal: KeyActorSchema.nullable(),
});

/**
 * consoleapikeys.go — the create response: the whole resource with `raw_key`
 * appended. The only time the secret exists outside the platform's hash of it,
 * which is why the surface that renders it renders it exactly once.
 */
export const ApiKeyIssuedSchema = ApiKeySchema.extend({
  raw_key: z.string(),
});

/**
 * The listing is a **bare array** — no envelope, no paging. That is the third
 * list shape this console parses, and it is what the reference's own console
 * list returns; the `/v1` keyset envelope and files' classic envelope both stay
 * where they belong.
 */
export const ApiKeyListSchema = z.array(ApiKeySchema);

// ---- inferred types (re-exported by ./types, which is what consumers import)

export type ModelRef = z.infer<typeof ModelRefSchema>;
export type SkillRef = z.infer<typeof SkillRefSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type Networking = z.infer<typeof NetworkingSchema>;
export type Packages = z.infer<typeof PackagesSchema>;
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type SessionUsage = z.infer<typeof SessionUsageSchema>;
export type SessionAgent = z.infer<typeof SessionAgentSchema>;
export type SessionResource = z.infer<typeof SessionResourceSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type StopReason = z.infer<typeof StopReasonSchema>;
export type ModelUsage = z.infer<typeof ModelUsageSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type Vault = z.infer<typeof VaultSchema>;
export type CredentialAuth = z.infer<typeof CredentialAuthSchema>;
export type VaultCredential = z.infer<typeof VaultCredentialSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type SkillVersion = z.infer<typeof SkillVersionSchema>;
export type PlatformFile = z.infer<typeof PlatformFileSchema>;
export type EnvironmentKey = z.infer<typeof EnvironmentKeySchema>;
export type EnvironmentKeyPage = z.infer<typeof EnvironmentKeyPageSchema>;
export type EnvironmentKeyIssued = z.infer<typeof EnvironmentKeyIssuedSchema>;
export type KeyActor = z.infer<typeof KeyActorSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ApiKeyIssued = z.infer<typeof ApiKeyIssuedSchema>;
