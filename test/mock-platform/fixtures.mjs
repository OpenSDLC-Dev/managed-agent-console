// Fixture data for the mock platform. Shapes mirror the platform's rendered
// wire objects exactly (see src/lib/platform/types.ts and the file:line
// citations there); the e2e suite asserts against these.

const T0 = "2026-08-01T09:00:00Z";
const T1 = "2026-08-01T10:30:00Z";
const T2 = "2026-08-02T08:15:00Z";

// sessionresources.go:memoryResourceJSON; memory resources have no ordinary id.
export const memoryResources = [
  {
    type: "memory_store",
    memory_store_id: "memstore_projectnotes000001",
    access: "read_write",
    instructions: null,
    description: "Shared project notes",
    name: "Project notes",
    mount_path: "/mnt/memory/project-notes",
  },
];

export const memoryStores = [
  {
    id: "memstore_projectnotes000001",
    type: "memory_store",
    name: "Project notes",
    description: "Durable research context shared across sessions.",
    metadata: { owner: "research" },
    created_at: T0,
    updated_at: T2,
    archived_at: null,
  },
  {
    id: "memstore_archivednotes0001",
    type: "memory_store",
    name: "Archived notes",
    description: "Read-only historical context.",
    metadata: {},
    created_at: T0,
    updated_at: T1,
    archived_at: T2,
  },
];

export const memories = [
  {
    id: "mem_projectbrief000000001",
    type: "memory",
    memory_store_id: memoryStores[0].id,
    path: "/brief.md",
    content: "# Project brief\n\nShip the managed-agent console.",
    content_size_bytes: 48,
    content_sha256:
      "174672c520e3883deb34f600e0dab64d46a71b41d00a06a498100dd0b52388a8",
    memory_version_id: "memver_briefmodified000001",
    created_at: T0,
    updated_at: T2,
  },
  {
    id: "mem_decision0000000000001",
    type: "memory",
    memory_store_id: memoryStores[0].id,
    path: "/decisions/architecture.md",
    content: "Use the platform wire as the source of truth.",
    content_size_bytes: 45,
    content_sha256:
      "4d095793145837da606846eecdcbae980a9e8121863767ae77fbe2a20be51b50",
    memory_version_id: "memver_decisioncreated0001",
    created_at: T1,
    updated_at: T1,
  },
];

export const memoryVersions = [
  {
    id: "memver_briefmodified000001",
    type: "memory_version",
    memory_store_id: memoryStores[0].id,
    memory_id: memories[0].id,
    operation: "modified",
    path: memories[0].path,
    content: memories[0].content,
    content_size_bytes: memories[0].content_size_bytes,
    content_sha256: memories[0].content_sha256,
    created_by: { type: "user_actor", user_id: "principal_research" },
    created_at: T2,
    redacted_at: null,
    redacted_by: null,
  },
  {
    id: "memver_decisioncreated0001",
    type: "memory_version",
    memory_store_id: memoryStores[0].id,
    memory_id: memories[1].id,
    operation: "created",
    path: memories[1].path,
    content: memories[1].content,
    content_size_bytes: memories[1].content_size_bytes,
    content_sha256: memories[1].content_sha256,
    created_by: {
      type: "session_actor",
      session_id: "sesn_research0000000000001",
    },
    created_at: T1,
    redacted_at: null,
    redacted_by: null,
  },
  {
    id: "memver_briefcreated0000001",
    type: "memory_version",
    memory_store_id: memoryStores[0].id,
    memory_id: memories[0].id,
    operation: "created",
    path: "/brief.md",
    content: null,
    content_size_bytes: null,
    content_sha256: null,
    created_by: { type: "api_actor", api_key_id: "apikey_ci01" },
    created_at: T0,
    redacted_at: T1,
    redacted_by: { type: "user_actor", user_id: "principal_admin" },
  },
];

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

// roster.go:storedRoster — agent responses pin each member to one version.
agents[0].multiagent = {
  type: "coordinator",
  agents: [
    { id: agents[0].id, type: "agent", version: agents[0].version },
    { id: agents[1].id, type: "agent", version: agents[1].version },
  ],
};

// Version history for the researcher (agentJSON shape; updated_at is the
// version row's created_at).
// Every agent has a version history (the platform snapshots version 1 at
// create), so the mock must serve /versions for all of them.
export const agentVersions = {
  agent_researcher00000000001: [3, 2, 1].map((version) => ({
    ...agents[0],
    version,
    multiagent: {
      ...agents[0].multiagent,
      agents: agents[0].multiagent.agents.map((member) =>
        member.id === agents[0].id ? { ...member, version } : { ...member },
      ),
    },
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
const threadAgentOf = (agent) => ({
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
});

const snapshotOf = (agent) => ({
  ...threadAgentOf(agent),
  multiagent: agent.multiagent
    ? {
        type: "coordinator",
        agents: agent.multiagent.agents.map((member) =>
          threadAgentOf(agents.find((candidate) => candidate.id === member.id)),
        ),
      }
    : null,
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
    outcome_evaluations: [
      {
        type: "outcome_evaluation",
        outcome_id: "outc_survey00000000000001",
        description: "Produce a comparative survey document.",
        explanation:
          "The survey compares six frameworks and cites each primary source.",
        iteration: 0,
        result: "satisfied",
        completed_at: T2,
      },
    ],
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

export const deployments = [
  {
    id: "depl_weeklyresearch000001",
    type: "deployment",
    name: "Weekly research digest",
    description: "Collect and summarize the week's agent-platform changes.",
    agent: {
      type: "agent",
      id: agents[0].id,
      version: agents[0].version,
    },
    environment_id: environments[0].id,
    vault_ids: ["vlt_github00000000000001"],
    initial_events: [
      { type: "user.message", content: "Prepare the weekly research digest." },
    ],
    resources: [
      { type: "file", file_id: "file_notes0000000000001" },
      {
        type: "memory_store",
        memory_store_id: memoryResources[0].memory_store_id,
        access: "read_write",
        instructions: null,
      },
    ],
    metadata: { owner: "research" },
    schedule: {
      type: "cron",
      expression: "0 9 * * 1",
      timezone: "UTC",
      last_run_at: T1,
      upcoming_runs_at: [
        "2026-08-10T09:00:00Z",
        "2026-08-17T09:00:00Z",
        "2026-08-24T09:00:00Z",
        "2026-08-31T09:00:00Z",
      ],
    },
    status: "active",
    paused_reason: null,
    created_at: T0,
    updated_at: T2,
    archived_at: null,
  },
  {
    id: "depl_manualtask000000001",
    type: "deployment",
    name: "Manual task runner",
    description: null,
    agent: {
      type: "agent",
      id: agents[1].id,
      version: agents[1].version,
    },
    environment_id: environments[1].id,
    vault_ids: [],
    initial_events: [{ type: "user.message", content: "Run the queued task." }],
    resources: [],
    metadata: {},
    schedule: null,
    status: "paused",
    paused_reason: { type: "manual" },
    created_at: T1,
    updated_at: T2,
    archived_at: null,
  },
];

export const deploymentRuns = [
  {
    id: "drun_deleted00000000001",
    type: "deployment_run",
    deployment_id: deployments[0].id,
    trigger_context: { type: "schedule", scheduled_at: T1 },
    session_id: null,
    error: null,
    agent: deployments[0].agent,
    created_at: T1,
  },
  {
    id: "drun_failed000000000001",
    type: "deployment_run",
    deployment_id: deployments[0].id,
    trigger_context: { type: "schedule", scheduled_at: T2 },
    session_id: null,
    error: {
      type: "session_create_error",
      message: "The configured environment was temporarily unavailable.",
    },
    agent: deployments[0].agent,
    created_at: T2,
  },
];

// dreams.go:dreamJSON — every one of the fourteen fields is always rendered.
export const dreams = [
  {
    id: "drm_completedresearch000001",
    type: "dream",
    status: "completed",
    inputs: [
      { type: "memory_store", memory_store_id: memoryStores[0].id },
      {
        type: "sessions",
        session_ids: [sessions[0].id, sessions[1].id],
      },
    ],
    outputs: [
      {
        type: "memory_store",
        memory_store_id: "memstore_dreamoutput000001",
      },
    ],
    model: { id: "claude-sonnet-4-8", speed: "fast" },
    instructions: "Keep decisions and cited research; remove transient notes.",
    output_behavior: { type: "create_new" },
    session_id: sessions[0].id,
    created_at: T1,
    ended_at: T2,
    archived_at: null,
    usage: {
      input_tokens: 18400,
      output_tokens: 2130,
      cache_read_input_tokens: 9200,
      cache_creation_input_tokens: 420,
    },
    error: null,
  },
  {
    id: "drm_pendingresearch0000001",
    type: "dream",
    status: "pending",
    inputs: [
      { type: "memory_store", memory_store_id: memoryStores[0].id },
      { type: "sessions", session_ids: [sessions[1].id] },
    ],
    outputs: [],
    model: { id: "claude-opus-4-8" },
    instructions: null,
    output_behavior: {
      type: "update_existing",
      memory_store_id: memoryStores[0].id,
    },
    session_id: null,
    created_at: T2,
    ended_at: null,
    archived_at: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    error: null,
  },
  {
    id: "drm_failedarchived0000001",
    type: "dream",
    status: "failed",
    inputs: [
      { type: "memory_store", memory_store_id: memoryStores[0].id },
      { type: "sessions", session_ids: [sessions[0].id] },
    ],
    outputs: [],
    model: { id: "claude-sonnet-4-8" },
    instructions: null,
    output_behavior: { type: "create_new" },
    session_id: null,
    created_at: T0,
    ended_at: T1,
    archived_at: T2,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    error: { type: "session_create_error", message: "Worker unavailable." },
  },
];

const emptyUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation: {
    ephemeral_1h_input_tokens: 0,
    ephemeral_5m_input_tokens: 0,
  },
};

const primaryResearchThread = "sthr_primaryresearch000001";
const childResearchThread = "sthr_taskrunnerresearch0001";

// threads.go:threadJSON — every session has a primary; coordinator sessions
// add child threads as agents are spawned.
export const sessionThreads = {
  sesn_gatedbash00000000001: [
    {
      id: "sthr_gatedbashprimary00001",
      type: "session_thread",
      session_id: "sesn_gatedbash00000000001",
      parent_thread_id: null,
      agent: threadAgentOf(agents[1]),
      status: "idle",
      usage: structuredClone(sessions[0].usage),
      stats: { active_seconds: 0, duration_seconds: 0, startup_seconds: 0 },
      created_at: T1,
      updated_at: T2,
      archived_at: null,
    },
  ],
  sesn_research0000000000001: [
    {
      id: primaryResearchThread,
      type: "session_thread",
      session_id: "sesn_research0000000000001",
      parent_thread_id: null,
      agent: threadAgentOf(agents[0]),
      status: "running",
      usage: structuredClone(sessions[1].usage),
      stats: { active_seconds: 8, duration_seconds: 12, startup_seconds: 1 },
      created_at: T2,
      updated_at: T2,
      archived_at: null,
    },
    {
      id: childResearchThread,
      type: "session_thread",
      session_id: "sesn_research0000000000001",
      parent_thread_id: primaryResearchThread,
      agent: threadAgentOf(agents[1]),
      status: "idle",
      usage: { ...structuredClone(emptyUsage), input_tokens: 240 },
      stats: { active_seconds: 2, duration_seconds: 4, startup_seconds: 1 },
      created_at: T2,
      updated_at: T2,
      archived_at: null,
    },
  ],
};

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
      processed_at: "2026-08-01T10:30:03Z",
      model_request_start_id: "sevt_000000000000000003",
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
      type: "user.define_outcome",
      processed_at: T2,
      description: "Produce a comparative survey document.",
      max_iterations: 3,
      outcome_id: "outc_survey00000000000001",
      rubric: { type: "text", content: "Covers at least five frameworks." },
    },
    {
      id: "sevt_000000000000000103",
      type: "session.status_running",
      processed_at: T2,
    },
    {
      id: "sevt_000000000000000105",
      type: "span.outcome_evaluation_start",
      processed_at: T2,
      outcome_id: "outc_survey00000000000001",
      iteration: 0,
    },
    {
      id: "sevt_000000000000000106",
      type: "span.outcome_evaluation_ongoing",
      processed_at: T2,
      outcome_id: "outc_survey00000000000001",
      iteration: 0,
    },
    {
      id: "sevt_000000000000000107",
      type: "span.outcome_evaluation_end",
      processed_at: T2,
      outcome_id: "outc_survey00000000000001",
      outcome_evaluation_start_id: "sevt_000000000000000105",
      iteration: 0,
      result: "satisfied",
      explanation:
        "The survey compares six frameworks and cites each primary source.",
      usage: {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 800,
        input_tokens: 1200,
        output_tokens: 92,
        speed: null,
      },
    },
    {
      id: "sevt_000000000000000104",
      type: "agent.tool_use",
      processed_at: T2,
      name: "bash",
      input: { command: "collect framework notes" },
      evaluated_permission: "allow",
      session_thread_id: childResearchThread,
      agent_name: "General task agent",
    },
  ],
};

export const sessionThreadEvents = {
  sesn_gatedbash00000000001: {
    sthr_gatedbashprimary00001: sessionEvents.sesn_gatedbash00000000001,
  },
  sesn_research0000000000001: {
    [primaryResearchThread]: sessionEvents.sesn_research0000000000001,
    [childResearchThread]: [
      {
        ...sessionEvents.sesn_research0000000000001.at(-1),
        session_thread_id: null,
      },
      {
        id: "sevt_000000000000000105",
        type: "session.thread_status_idle",
        processed_at: T2,
        stop_reason: { type: "end_turn" },
        session_thread_id: childResearchThread,
        agent_name: "General task agent",
      },
    ],
  },
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
    display_name: "Excel spreadsheets",
    latest_version_id: "skillver_xlsx00000000001",
    source: { type: "anthropic" },
    created_at: T0,
    updated_at: T0,
  },
  {
    id: "skill_reportwriter0000001",
    type: "skill",
    display_name: "Weekly report writer",
    latest_version_id: "skillver_rw2000000000001",
    source: { type: "custom" },
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
      name: "report-writer",
      description: "Writes the weekly status report from repo activity.",
      created_at: T2,
    },
    {
      id: "skillver_rw1000000000001",
      type: "skill_version",
      skill_id: "skill_reportwriter0000001",
      name: "report-writer",
      description: "Initial version.",
      created_at: T1,
    },
  ],
  xlsx: [
    {
      id: "skillver_xlsx00000000001",
      type: "skill_version",
      skill_id: "xlsx",
      name: "xlsx",
      description: "Read and write Excel workbooks.",
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

/**
 * Console API (plan 07): environment keys, keyed by environment id.
 *
 * Only the self-hosted environment has any — the platform refuses to issue a
 * key for a cloud environment (internal/api/consoleapi.go:200-205), so a cloud
 * entry here would describe a state the platform cannot reach.
 *
 * `prod-runner-01` is live; `retired-laptop` is expired but unrevoked, which
 * the platform's listing deliberately still returns
 * (internal/api/envkeys.go:105-106) so an operator can see the credential their
 * worker is failing on. No plaintext appears here, by construction: the
 * platform stores only a hash of it.
 */
/**
 * The live key's expiry is computed, not pinned — alone among these fixtures.
 *
 * Active-vs-expired is the one thing the console derives against the wall
 * clock, so a fixed `2027-08-01` would make the e2e assertion that this key
 * reads `active` a test that passes until that date and then fails forever
 * (PR #89 review). The expired key stays pinned: a date in the past does not
 * stop being in the past.
 */
const oneYearOut = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

export const environmentKeys = {
  env_byoc0000000000000001: [
    {
      id: "envkey_prod00000000000001",
      name: "prod-runner-01",
      created_at: T0,
      expires_at: oneYearOut,
    },
    {
      id: "envkey_stale0000000000001",
      name: "retired-laptop",
      created_at: "2025-01-01T09:00:00Z",
      expires_at: "2026-01-01T09:00:00Z",
    },
  ],
};
