// Fixture data for the mock platform. Shapes mirror the platform's rendered
// wire objects exactly (see src/lib/platform/types.ts and the file:line
// citations there); the e2e suite asserts against these.

const T0 = "2026-08-01T09:00:00Z";
const T1 = "2026-08-01T10:30:00Z";
const T2 = "2026-08-02T08:15:00Z";

export const agents = [
  {
    id: "agent_researcher00000000001",
    type: "agent",
    name: "Deep researcher",
    version: 3,
    model: { id: "claude-opus-4-8" },
    system: "You are a careful researcher.",
    description: "Multi-step web research with citations.",
    tools: [{ type: "agent_toolset_20260401" }],
    mcp_servers: [],
    skills: [{ type: "anthropic", skill_id: "xlsx", version: "latest" }],
    multiagent: null,
    metadata: { team: "research" },
    created_at: T0,
    updated_at: T2,
    archived_at: null,
  },
  {
    id: "agent_taskrunner0000000001",
    type: "agent",
    name: "General task agent",
    version: 1,
    model: { id: "claude-sonnet-4-8", speed: "fast" },
    system: "",
    description: "Bash + files + web, gated on approval.",
    tools: [
      {
        type: "agent_toolset_20260401",
        default_config: { permission_policy: { type: "always_ask" } },
      },
    ],
    mcp_servers: [],
    skills: [],
    multiagent: null,
    metadata: {},
    created_at: T1,
    updated_at: T1,
    archived_at: null,
  },
  {
    id: "agent_retired000000000001",
    type: "agent",
    name: "Retired agent",
    version: 2,
    model: { id: "claude-haiku-4-5" },
    system: "",
    description: "",
    tools: [],
    mcp_servers: [],
    skills: [],
    multiagent: null,
    metadata: {},
    created_at: T0,
    updated_at: T1,
    archived_at: T2,
  },
];

// Version history for the researcher (agentJSON shape; updated_at is the
// version row's created_at).
// Every agent has a version history (the platform snapshots version 1 at
// create), so the mock must serve /versions for all of them.
export const agentVersions = {
  agent_researcher00000000001: [3, 2, 1].map((version) => ({
    ...agents[0],
    version,
    updated_at: version === 3 ? T2 : version === 2 ? T1 : T0,
  })),
  agent_taskrunner0000000001: [{ ...agents[1] }],
  agent_retired000000000001: [2, 1].map((version) => ({
    ...agents[2],
    version,
    updated_at: version === 2 ? T1 : T0,
  })),
};

export const environments = [
  {
    id: "env_cloudlimited000000001",
    type: "environment",
    name: "cloud-limited",
    description: "Cloud sandbox, restricted egress.",
    config: {
      type: "cloud",
      networking: {
        type: "limited",
        allowed_hosts: ["api.github.com", "registry.npmjs.org"],
        allow_mcp_servers: false,
        allow_package_managers: true,
      },
      packages: {
        apt: ["ripgrep"],
        cargo: [],
        gem: [],
        go: [],
        npm: ["typescript"],
        pip: [],
      },
    },
    scope: "organization",
    metadata: {},
    created_at: T0,
    updated_at: T1,
    archived_at: null,
  },
  {
    id: "env_byoc0000000000000001",
    type: "environment",
    name: "byoc-workers",
    description: "Self-hosted worker fleet.",
    config: { type: "self_hosted" },
    scope: "organization",
    metadata: { region: "on-prem" },
    created_at: T1,
    updated_at: T1,
    archived_at: null,
  },
];

// Session agent snapshots mirror domain.ResolvedAgent: the agent's spec at
// the pinned version, without metadata/created_at/archived_at.
const snapshotOf = (agent) => ({
  type: "agent",
  id: agent.id,
  version: agent.version,
  name: agent.name,
  model: agent.model,
  system: agent.system,
  description: agent.description,
  tools: agent.tools,
  mcp_servers: agent.mcp_servers,
  skills: agent.skills,
  multiagent: null,
});

const researcherSnapshot = snapshotOf(agents[0]);

export const sessions = [
  {
    id: "sesn_gatedbash00000000001",
    type: "session",
    agent: snapshotOf(agents[1]),
    environment_id: "env_cloudlimited000000001",
    status: "idle",
    title: "Install deps and run tests",
    metadata: {},
    usage: {
      input_tokens: 5412,
      output_tokens: 890,
      cache_read_input_tokens: 3100,
      cache_creation: {
        ephemeral_1h_input_tokens: 0,
        ephemeral_5m_input_tokens: 1200,
      },
    },
    stats: { active_seconds: 0, duration_seconds: 0 },
    outcome_evaluations: [],
    resources: [],
    vault_ids: [],
    deployment_id: null,
    created_at: T1,
    updated_at: T2,
    archived_at: null,
  },
  {
    id: "sesn_research0000000000001",
    type: "session",
    agent: researcherSnapshot,
    environment_id: "env_cloudlimited000000001",
    status: "running",
    title: "Survey agent frameworks",
    metadata: {},
    usage: {
      input_tokens: 120034,
      output_tokens: 15220,
      cache_read_input_tokens: 98000,
      cache_creation: {
        ephemeral_1h_input_tokens: 20000,
        ephemeral_5m_input_tokens: 0,
      },
    },
    stats: { active_seconds: 0, duration_seconds: 0 },
    outcome_evaluations: [],
    resources: [
      {
        id: "sesrsc_upload000000000001",
        type: "file",
        file_id: "file_notes0000000000001",
        mount_path: "/mnt/session/uploads/file_notes0000000000001",
        created_at: T1,
        updated_at: T1,
      },
    ],
    vault_ids: [],
    deployment_id: null,
    created_at: T2,
    updated_at: T2,
    archived_at: null,
  },
];

// Event log for sesn_gatedbash…: a turn that parked on an ask-gated bash
// call (requires_action), matching the platform's exact per-type key sets.
export const sessionEvents = {
  sesn_gatedbash00000000001: [
    {
      id: "sevt_000000000000000001",
      type: "user.message",
      processed_at: T1,
      content: [{ type: "text", text: "Install deps and run the test suite." }],
    },
    {
      id: "sevt_000000000000000002",
      type: "session.status_running",
      processed_at: T1,
    },
    {
      id: "sevt_000000000000000003",
      type: "span.model_request_start",
      processed_at: T1,
    },
    {
      id: "sevt_000000000000000004",
      type: "agent.message",
      processed_at: T1,
      content: [
        {
          type: "text",
          text: "I'll install dependencies, then run the tests.",
        },
      ],
    },
    {
      id: "sevt_000000000000000005",
      type: "agent.tool_use",
      processed_at: T1,
      name: "bash",
      input: { command: "pnpm install" },
      evaluated_permission: "ask",
      session_thread_id: null,
    },
    {
      id: "sevt_000000000000000006",
      type: "span.model_request_end",
      processed_at: T1,
      model_usage: {
        cache_creation_input_tokens: 1200,
        cache_read_input_tokens: 3100,
        input_tokens: 5412,
        output_tokens: 890,
        speed: "fast",
      },
    },
    {
      id: "sevt_000000000000000007",
      type: "session.status_idle",
      processed_at: T2,
      stop_reason: {
        type: "requires_action",
        event_ids: ["sevt_000000000000000005"],
      },
    },
  ],
  sesn_research0000000000001: [
    {
      id: "sevt_000000000000000101",
      type: "user.message",
      processed_at: T2,
      content: [
        { type: "text", text: "Survey the agent-framework landscape." },
      ],
    },
    {
      id: "sevt_000000000000000102",
      type: "session.status_running",
      processed_at: T2,
    },
  ],
};

export const vaults = [
  {
    id: "vlt_github00000000000001",
    type: "vault",
    display_name: "GitHub access",
    metadata: { owner: "platform-team" },
    created_at: T0,
    updated_at: T1,
    archived_at: null,
  },
  {
    id: "vlt_retiredvault00000001",
    type: "vault",
    display_name: "Old Jira vault",
    metadata: {},
    created_at: T0,
    updated_at: T2,
    archived_at: T2,
  },
];

// Secret-free auth documents, exactly as the platform renders them
// (vaultcredauth.go — write-only fields never appear).
export const vaultCredentials = {
  vlt_github00000000000001: [
    {
      id: "vcred_ghtoken000000000001",
      type: "vault_credential",
      vault_id: "vlt_github00000000000001",
      display_name: "Repo token",
      auth: {
        type: "environment_variable",
        secret_name: "GITHUB_TOKEN",
        networking: { type: "limited", allowed_hosts: ["api.github.com"] },
        injection_location: { body: false, header: true },
      },
      metadata: {},
      created_at: T0,
      updated_at: T0,
      archived_at: null,
    },
    {
      id: "vcred_ghmcp0000000000001",
      type: "vault_credential",
      vault_id: "vlt_github00000000000001",
      display_name: null,
      auth: {
        type: "mcp_oauth",
        mcp_server_url: "https://api.githubcopilot.com/mcp/",
        expires_at: "2026-09-01T00:00:00Z",
        refresh: {
          client_id: "iv1.abc",
          token_endpoint: "https://github.com/login/oauth/access_token",
          token_endpoint_auth: { type: "client_secret_basic" },
          resource: null,
          scope: "repo",
        },
      },
      metadata: {},
      created_at: T1,
      updated_at: T1,
      archived_at: null,
    },
  ],
  vlt_retiredvault00000001: [],
};

export const skills = [
  {
    id: "xlsx",
    type: "skill",
    display_title: "Excel spreadsheets",
    latest_version: "1754000000000001",
    source: "anthropic",
    created_at: T0,
    updated_at: T0,
  },
  {
    id: "skill_reportwriter0000001",
    type: "skill",
    display_title: "Weekly report writer",
    latest_version: "1754100000000002",
    source: "custom",
    created_at: T1,
    updated_at: T2,
  },
];

export const skillVersions = {
  skill_reportwriter0000001: [
    {
      id: "skillver_rw2000000000001",
      type: "skill_version",
      skill_id: "skill_reportwriter0000001",
      version: "1754100000000002",
      name: "report-writer",
      description: "Writes the weekly status report from repo activity.",
      directory: "report-writer",
      created_at: T2,
    },
    {
      id: "skillver_rw1000000000001",
      type: "skill_version",
      skill_id: "skill_reportwriter0000001",
      version: "1754000000000001",
      name: "report-writer",
      description: "Initial version.",
      directory: "report-writer",
      created_at: T1,
    },
  ],
  xlsx: [
    {
      id: "skillver_xlsx00000000001",
      type: "skill_version",
      skill_id: "xlsx",
      version: "1754000000000001",
      name: "xlsx",
      description: "Read and write Excel workbooks.",
      directory: "xlsx",
      created_at: T0,
    },
  ],
};

export const files = [
  {
    id: "file_notes0000000000001",
    type: "file",
    filename: "research-notes.md",
    mime_type: "text/markdown",
    size_bytes: 48213,
    downloadable: false,
    scope: null,
    created_at: T1,
  },
  {
    id: "file_output000000000001",
    type: "file",
    filename: "summary.xlsx",
    mime_type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size_bytes: 120400,
    downloadable: true,
    scope: { id: "sesn_research0000000000001", type: "session" },
    created_at: T2,
  },
];
