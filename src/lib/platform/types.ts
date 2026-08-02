/**
 * TypeScript transcription of the platform's rendered wire shapes.
 * Transcribed 2026-08-02 from the platform checkout (file:line cites below);
 * per CLAUDE.md principle 1, update against the source, never from memory.
 *
 * Conventions (internal/api/wire.go, errors.go): timestamps are RFC 3339 UTC
 * strings; nullable timestamps are string|null; collections render [] and
 * maps render {} — never null; reserved seams (multiagent, deployment_id)
 * render literal null.
 */

// ---- agents (internal/api/agents.go:18-43, internal/domain/agent.go:59-67)

export interface ModelRef {
  id: string;
  speed?: "standard" | "fast"; // omitted when unset
}

export interface Agent {
  id: string;
  type: "agent";
  name: string;
  version: number;
  model: ModelRef;
  system: string;
  description: string;
  tools: unknown[];
  mcp_servers: unknown[];
  skills: { type: "anthropic" | "custom"; skill_id: string; version: string }[];
  multiagent: null;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string; // on version entries: the version row's created_at
  archived_at: string | null;
}

// ---- environments (internal/api/environments.go:18-53)

export type Networking =
  | { type: "unrestricted" }
  | {
      type: "limited";
      allowed_hosts: string[];
      allow_mcp_servers: boolean;
      allow_package_managers: boolean;
    };

export interface Packages {
  apt: string[];
  cargo: string[];
  gem: string[];
  go: string[];
  npm: string[];
  pip: string[];
}

export type EnvironmentConfig =
  | { type: "self_hosted" }
  | { type: "cloud"; networking: Networking; packages: Packages };

export interface Environment {
  id: string;
  type: "environment";
  name: string;
  description: string;
  config: EnvironmentConfig;
  scope: "organization";
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

// ---- sessions (internal/api/sessions.go:22-54, internal/domain/session.go)

export type SessionStatus = "idle" | "running" | "rescheduling" | "terminated";

export interface SessionUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation: {
    ephemeral_1h_input_tokens: number;
    ephemeral_5m_input_tokens: number;
  };
}

/** Immutable agent snapshot on a session (domain.ResolvedAgent). */
export interface SessionAgent {
  type: "agent";
  id: string;
  version: number;
  name: string;
  model: ModelRef;
  system: string;
  description: string;
  tools: unknown[];
  mcp_servers: unknown[];
  skills: unknown[];
  multiagent: null;
}

export interface SessionResource {
  id: string;
  type: "file";
  file_id: string;
  mount_path: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  type: "session";
  agent: SessionAgent;
  environment_id: string;
  status: SessionStatus;
  title: string;
  metadata: Record<string, string>;
  usage: SessionUsage;
  stats: { active_seconds: number; duration_seconds: number }; // zeros in v1
  outcome_evaluations: unknown[]; // always [] in v1
  resources: SessionResource[];
  vault_ids: string[];
  deployment_id: null; // deployments are post-v1
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

// ---- session events (internal/api/events.go:754-773)

export interface StopReason {
  type: "end_turn" | "requires_action" | "retries_exhausted";
  event_ids?: string[]; // only on requires_action
}

export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  speed: string | null;
}

export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Wire event: the stored payload's flat fields merged with exactly three
 * envelope keys (id, type, processed_at). Payload keys vary per type; the
 * ones the console reads are typed here, the rest stay index-accessible.
 */
export interface SessionEvent {
  id: string;
  type: string; // "{domain}.{action}"
  processed_at: string | null;
  content?: ContentBlock[] | null;
  name?: string; // agent.tool_use
  input?: unknown; // agent.tool_use
  evaluated_permission?: "allow" | "ask" | "deny";
  tool_use_id?: string;
  is_error?: boolean | null;
  result?: "allow" | "deny";
  deny_message?: string | null;
  stop_reason?: StopReason;
  model_usage?: ModelUsage; // span.model_request_end
  error?: { type: string; message: string; retry_status?: { type: string } };
  session_thread_id?: null;
  [key: string]: unknown;
}

// ---- vaults + credentials (internal/api/vaults.go, vaultcredentials.go,
//      vaultcredauth.go — auth renders secret-free by construction)

export interface Vault {
  id: string;
  type: "vault";
  display_name: string;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export type CredentialAuth =
  | {
      type: "mcp_oauth";
      mcp_server_url: string;
      expires_at: string | null;
      refresh: {
        client_id: string;
        token_endpoint: string;
        token_endpoint_auth: {
          type: "none" | "client_secret_basic" | "client_secret_post";
        };
        resource: string | null;
        scope: string | null;
      } | null;
    }
  | { type: "static_bearer"; mcp_server_url: string }
  | {
      type: "environment_variable";
      secret_name: string;
      networking:
        { type: "unrestricted" } | { type: "limited"; allowed_hosts: string[] };
      injection_location: { body: boolean; header: boolean };
    };

export interface VaultCredential {
  id: string;
  type: "vault_credential";
  vault_id: string;
  display_name: string | null;
  auth: CredentialAuth;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

// ---- skills (internal/api/skills.go:25-57)

export interface Skill {
  id: string; // skill_… or a catalog short name like "xlsx"
  type: "skill";
  display_title: string;
  latest_version: string; // "" once every version is deleted
  source: "custom" | "anthropic";
  created_at: string;
  updated_at: string;
}

export interface SkillVersion {
  id: string;
  type: "skill_version";
  skill_id: string;
  version: string; // epoch-microsecond digits, as a string
  name: string;
  description: string;
  directory: string;
  created_at: string;
}

// ---- files (internal/api/files.go:31-58)

export interface PlatformFile {
  id: string;
  type: "file";
  filename: string;
  mime_type: string;
  size_bytes: number;
  downloadable: boolean;
  scope: { id: string; type: "session" } | null;
  created_at: string;
}
