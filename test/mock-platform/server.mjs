// Minimal mock of managed-agent-platform's control plane for tests.
// Implements exactly what the console under test needs; shapes follow the
// platform's wire (error envelope, keyset/bi/classic pages, SSE framing,
// request-id header) as documented in docs/plan/01_v1-console.md § Ground
// truth. Sessions carry a tiny state machine so e2e can exercise the HITL
// approval round trip and streamed replies.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import {
  agents,
  agentVersions,
  deployments,
  deploymentRuns,
  dreams,
  environments,
  environmentKeys,
  files,
  memoryResources,
  memories,
  memoryStores,
  memoryVersions,
  sessions as sessionFixtures,
  sessionEvents as eventFixtures,
  sessionThreads as threadFixtures,
  sessionThreadEvents as threadEventFixtures,
  skills,
  skillVersions,
  vaultCredentials,
  vaults,
} from "./fixtures.mjs";
import { PORT as OIDC_PORT, oidcServer, resetOidc } from "./oidc.mjs";

const API_KEY = process.env.MOCK_PLATFORM_KEY ?? "test-key";
const PORT = Number(process.env.MOCK_PLATFORM_PORT ?? 18080);
/** Surfaces this run pretends not to implement, e.g. "skills,files". */
const UNIMPLEMENTED = (process.env.MOCK_PLATFORM_UNIMPLEMENTED ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/** Toggled per test via POST /__unimplemented; back to UNIMPLEMENTED on reset. */
let unimplemented = [...UNIMPLEMENTED];
/**
 * Set by POST /__expire-identity so a spec can watch the console react to a
 * token the platform stopped accepting — the case that cannot be produced by
 * waiting, and the one the sign-out bounce exists for. Declared up here with the
 * other mutable flags because `resetStore()` runs at module load and would find
 * a `let` further down still in its temporal dead zone.
 */
let identityRejected = false;
/**
 * Wire paths this run answers 403 on, as the platform does for a human whose
 * role does not reach a route (`requireRole`). Set by POST /__forbid; cleared by
 * /__reset. The message is the platform's own shape: it names **the role the
 * route requires** and never the caller's.
 */
let forbidden = [];

let requestCounter = 0;
let eventCounter = 1000;
const nextEventId = () => `sevt_mock${String(eventCounter++).padStart(6, "0")}`;
let outcomeCounter = 1;
const nextOutcomeId = () =>
  `outc_mock${String(outcomeCounter++).padStart(20, "0")}`;
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

// ---- mutable session store (reset via POST /__reset) ---------------------

/** @type {Map<string, {session: any, events: any[], subscribers: Set<any>, threads: any[], threadEvents: Record<string, any[]>, threadSubscribers: Map<string, Set<any>>}>} */
const store = new Map();

// Agents mutate too (create/update/archive) — cloned from fixtures on reset.
let agentsStore = [];
let agentVersionsStore = {};
let agentCounter = 1;
let environmentsStore = [];
let environmentCounter = 1;
let filesStore = [];
let fileCounter = 1;
let sessionCounter = 1;
let deploymentsStore = [];
let deploymentRunsStore = [];
let deploymentCounter = 1;
let deploymentRunCounter = 1;
let dreamsStore = [];
let dreamCounter = 1;
let memoryStoresStore = [];
let memoriesStore = [];
let memoryVersionsStore = [];
let memoryStoreCounter = 1;
let memoryCounter = 1;
let memoryVersionCounter = 1;
let threadCounter = 1;
let resourceCounter = 1;
let vaultsStore = [];
let vaultCredsStore = {};
let vaultCounter = 1;
let credCounter = 1;
let skillsStore = [];
let skillVersionsStore = {};
let skillCounter = 1;
let skillVersionCounter = 1;
// Console API (plan 07): environment id -> issued keys, newest first. The
// plaintext is never stored — the platform keeps only a hash, and so does this.
let envKeysStore = {};
let envKeyCounter = 1;
// The other console namespace (plan 07 slice 4): management keys, newest first.
// The plaintext is never stored here either — only the hint the listing shows.
let apiKeysStore = [];
let apiKeyCounter = 1;

/** Marks a management key this platform minted (internal/api/auth.go). */
const ISSUED_KEY_PREFIX = "sk-map-api01-";

/**
 * The platform's own masking rule, transcribed (internal/api/auth.go,
 * `partialKeyHint`): an **issued** key publishes three characters of its body,
 * `...`, then four more, because its prefix is public by construction. An
 * **operator-chosen** `CONTROLPLANE_API_KEY` may hide anything, so nothing in
 * it is assumed public and only its last four characters are shown. Both refuse
 * to produce a hint at all below a length floor — a masked value that is mostly
 * the value is worse than an empty column, since `key_hash` is an unsalted
 * SHA-256 that a mostly-known plaintext makes searchable offline.
 *
 * Transcribed rather than approximated because the alternative is what this
 * file already got wrong once: a fixture that agrees with the tests reading it
 * and with nothing on the wire.
 */
function partialKeyHint(key) {
  const lead = 3;
  const tail = 4;
  if (key.startsWith(ISSUED_KEY_PREFIX)) {
    const body = [...key.slice(ISSUED_KEY_PREFIX.length)];
    if (body.length < 2 * (lead + tail)) return "";
    const head = body.slice(0, lead).join("");
    return `${ISSUED_KEY_PREFIX}${head}...${body.slice(-tail).join("")}`;
  }
  const runes = [...key];
  if (runes.length < 4 * tail) return "";
  return `...${runes.slice(-tail).join("")}`;
}

/**
 * The seeded rows. The first has **no issuer**, which is the platform's mark of
 * a key managed by `CONTROLPLANE_API_KEY`: every mutation on it is refused,
 * because its lifecycle is rotation-by-restart. A fixture without one would let
 * the console ship a row of controls that always 400.
 */
const API_KEYS_SEED = [
  {
    id: "apikey_bootstrap01",
    type: "api_key",
    name: "control-plane",
    workspace_id: null,
    created_at: "2026-08-01T09:00:00Z",
    created_by: null,
    // This row *is* the key this server authenticates, so its hint is derived
    // from that value rather than written down: a fixed string would describe a
    // credential the mock does not accept, and the default `test-key` is short
    // enough that the platform's floor publishes **no hint at all** — a state
    // the console has to render, and would otherwise never meet.
    partial_key_hint: partialKeyHint(API_KEY),
    status: "active",
    expires_at: null,
    principal: null,
  },
  {
    id: "apikey_ci01",
    type: "api_key",
    name: "ci-deploy",
    workspace_id: null,
    created_at: "2026-08-02T10:30:00Z",
    created_by: { id: "principal_op01", type: "principal" },
    partial_key_hint: "sk-map-api01-Cid...ploy",
    status: "active",
    expires_at: "2026-12-01T00:00:00Z",
    principal: null,
  },
];

function resetStore() {
  unimplemented = [...UNIMPLEMENTED];
  identityRejected = false;
  forbidden = [];
  // Authorization codes in flight, never the stub provider's signing key:
  // rotating that mid-run would leave the console verifying against a key set
  // jose refuses to refetch for thirty seconds (see oidc.mjs).
  resetOidc();
  for (const state of store.values()) {
    for (const timer of state.timers ?? []) clearTimeout(timer);
    for (const res of state.subscribers) res.end();
    for (const subscribers of state.threadSubscribers.values())
      for (const res of subscribers) res.end();
  }
  store.clear();
  for (const fixture of sessionFixtures) {
    store.set(fixture.id, {
      session: structuredClone(fixture),
      events: structuredClone(eventFixtures[fixture.id] ?? []),
      subscribers: new Set(),
      threads: structuredClone(threadFixtures[fixture.id] ?? []),
      threadEvents: structuredClone(threadEventFixtures[fixture.id] ?? {}),
      threadSubscribers: new Map(),
      timers: new Set(),
    });
  }
  apiKeysStore = structuredClone(API_KEYS_SEED);
  apiKeyCounter = 1;
  agentsStore = structuredClone(agents);
  agentVersionsStore = structuredClone(agentVersions);
  environmentsStore = structuredClone(environments);
  deploymentsStore = structuredClone(deployments);
  deploymentRunsStore = structuredClone(deploymentRuns);
  dreamsStore = structuredClone(dreams);
  memoryStoresStore = structuredClone(memoryStores);
  memoriesStore = structuredClone(memories);
  memoryVersionsStore = structuredClone(memoryVersions);
  filesStore = structuredClone(files);
  vaultsStore = structuredClone(vaults);
  vaultCredsStore = structuredClone(vaultCredentials);
  skillsStore = structuredClone(skills);
  skillVersionsStore = structuredClone(skillVersions);
  agentCounter = 1;
  environmentCounter = 1;
  memoryStoreCounter = 1;
  memoryCounter = 1;
  memoryVersionCounter = 1;
  fileCounter = 1;
  sessionCounter = 1;
  deploymentCounter = 1;
  deploymentRunCounter = 1;
  dreamCounter = 1;
  threadCounter = 1;
  resourceCounter = 1;
  outcomeCounter = 1;
  vaultCounter = 1;
  credCounter = 1;
  skillCounter = 1;
  skillVersionCounter = 1;
  envKeysStore = structuredClone(environmentKeys);
  envKeyCounter = 1;
}
resetStore();

// ---- agent write routes ---------------------------------------------------

const AGENT_KEYS = new Set([
  "name",
  "model",
  "system",
  "description",
  "tools",
  "mcp_servers",
  "skills",
  "metadata",
  "multiagent",
  "version",
]);

function validateAgentBody(body, { requireCore, self }) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return "agent body must be an object";
  for (const key of Object.keys(body)) {
    if (!AGENT_KEYS.has(key)) return `unknown field "${key}"`;
  }
  if (body.multiagent != null) {
    if (
      typeof body.multiagent !== "object" ||
      Array.isArray(body.multiagent) ||
      body.multiagent.type !== "coordinator" ||
      !Array.isArray(body.multiagent.agents) ||
      body.multiagent.agents.length < 1 ||
      body.multiagent.agents.length > 20
    ) {
      return "multiagent must be a coordinator with 1–20 agents";
    }
    const seen = new Set();
    let selfSeen = false;
    for (const [index, entry] of body.multiagent.agents.entries()) {
      let id;
      let version;
      let isSelf = false;
      if (typeof entry === "string") {
        id = entry;
      } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        if (entry.type === "self") {
          if (Object.keys(entry).some((key) => key !== "type"))
            return `multiagent.agents[${index}] has unknown fields`;
          isSelf = true;
          id = self?.id ?? "__self";
        } else if (
          entry.type === "agent" &&
          typeof entry.id === "string" &&
          Object.keys(entry).every((key) =>
            ["type", "id", "version"].includes(key),
          )
        ) {
          id = entry.id;
          version = entry.version;
          isSelf = self?.id === id;
        } else {
          return `multiagent.agents[${index}] must be an agent id, agent reference, or self`;
        }
      } else {
        return `multiagent.agents[${index}] must be an agent id, agent reference, or self`;
      }
      if (!id) return `multiagent.agents[${index}] id must not be empty`;
      if (version !== undefined && (!Number.isInteger(version) || version < 1))
        return `multiagent.agents[${index}] version must be a positive integer`;
      if (isSelf) {
        if (selfSeen)
          return `multiagent.agents[${index}] references self more than once`;
        selfSeen = true;
        if (
          version !== undefined &&
          version !== self.version &&
          version !== self.version + 1
        )
          return `multiagent.agents[${index}] does not reference the current self version`;
      } else {
        const target = agentsStore.find((agent) => agent.id === id);
        if (!target) return `multiagent.agents[${index}] agent ${id} not found`;
        if (target.archived_at)
          return `multiagent.agents[${index}] agent ${id} is archived`;
        const pinned = version ?? target.version;
        const snapshot = agentVersionsStore[id]?.find(
          (candidate) => candidate.version === pinned,
        );
        if (!snapshot)
          return `multiagent.agents[${index}] agent ${id} version ${pinned} not found`;
        if (snapshot.multiagent)
          return `multiagent.agents[${index}] agent ${id} is a coordinator`;
      }
      if (seen.has(id))
        return `multiagent.agents[${index}] agent ${id} is referenced more than once`;
      seen.add(id);
    }
  }
  if (requireCore) {
    if (typeof body.name !== "string" || body.name.length === 0)
      return "name is required";
    if (body.model === undefined) return "model is required";
  }
  if (body.model !== undefined) {
    const ok =
      typeof body.model === "string" ||
      (typeof body.model === "object" &&
        body.model !== null &&
        typeof body.model.id === "string");
    if (!ok) return "model must be a string or {id, speed}";
  }
  return null;
}

const normalizeModel = (model) =>
  typeof model === "string" ? { id: model } : model;

function createAgent(body) {
  const timestamp = now();
  const agent = {
    id: `agent_mock${String(agentCounter++).padStart(6, "0")}`,
    type: "agent",
    name: body.name,
    version: 1,
    model: normalizeModel(body.model),
    system: body.system ?? "",
    description: body.description ?? "",
    tools: body.tools ?? [],
    mcp_servers: body.mcp_servers ?? [],
    skills: body.skills ?? [],
    multiagent: null,
    metadata: body.metadata ?? {},
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  };
  agent.multiagent = resolveMockRoster(body.multiagent, agent);
  agentsStore.unshift(agent);
  agentVersionsStore[agent.id] = [structuredClone(agent)];
  return agent;
}

function updateAgent(agent, body) {
  if (body.version !== undefined && body.version !== agent.version) {
    return { conflict: `version conflict: agent is at v${agent.version}` };
  }
  for (const key of ["name", "model", "system", "description"]) {
    if (body[key] !== undefined)
      agent[key] = key === "model" ? normalizeModel(body[key]) : body[key];
  }
  for (const key of ["tools", "mcp_servers", "skills"]) {
    if (body[key] !== undefined) agent[key] = body[key] ?? [];
  }
  if (body.metadata !== undefined) {
    for (const [k, v] of Object.entries(body.metadata ?? {})) {
      if (v === null) delete agent.metadata[k];
      else agent.metadata[k] = v;
    }
  }
  agent.version += 1;
  if (body.multiagent !== undefined) {
    agent.multiagent = resolveMockRoster(body.multiagent, agent);
  } else if (agent.multiagent) {
    agent.multiagent.agents = agent.multiagent.agents.map((member) =>
      member.id === agent.id ? { ...member, version: agent.version } : member,
    );
  }
  agent.updated_at = now();
  agentVersionsStore[agent.id] = [
    { ...structuredClone(agent) },
    ...(agentVersionsStore[agent.id] ?? []),
  ];
  return { agent };
}

function resolveMockRoster(raw, self) {
  if (raw == null) return null;
  return {
    type: "coordinator",
    agents: raw.agents.map((entry) => {
      const isSelf = entry?.type === "self" || entry?.id === self.id;
      const id = isSelf
        ? self.id
        : typeof entry === "string"
          ? entry
          : entry.id;
      const target = isSelf
        ? self
        : agentsStore.find((agent) => agent.id === id);
      return {
        id,
        type: "agent",
        version: isSelf
          ? self.version
          : (entry?.version ?? target?.version ?? 1),
      };
    }),
  };
}

function mockThreadAgent(agent) {
  return {
    id: agent.id,
    type: "agent",
    version: agent.version,
    name: agent.name,
    description: agent.description,
    model: agent.model,
    system: agent.system,
    tools: agent.tools,
    mcp_servers: agent.mcp_servers,
    skills: agent.skills,
  };
}

function mockSessionAgent(agent) {
  return {
    ...mockThreadAgent(agent),
    multiagent: agent.multiagent
      ? {
          type: "coordinator",
          agents: agent.multiagent.agents.map((member) => {
            const version = agentVersionsStore[member.id]?.find(
              (candidate) => candidate.version === member.version,
            );
            return mockThreadAgent(version ?? agent);
          }),
        }
      : null,
  };
}

function frame(res, name, payload) {
  res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
}

const threadAddressableTypes = new Set([
  "agent.tool_use",
  "agent.mcp_tool_use",
  "agent.custom_tool_use",
  "user.tool_confirmation",
  "user.custom_tool_result",
  "user.tool_result",
  "user.interrupt",
]);

function broadcast(state, event, routedThreadId) {
  state.events.push(event);
  for (const res of state.subscribers) frame(res, event.type, event);
  const threadId =
    routedThreadId ??
    (typeof event.session_thread_id === "string"
      ? event.session_thread_id
      : undefined);
  if (!threadId) return;
  const own = threadAddressableTypes.has(event.type)
    ? { ...event, session_thread_id: null }
    : event;
  (state.threadEvents[threadId] ??= []).push(own);
  for (const res of state.threadSubscribers.get(threadId) ?? [])
    frame(res, own.type, own);
}

function broadcastRaw(state, name, payload, threadId) {
  for (const res of state.subscribers) frame(res, name, payload);
  if (threadId)
    for (const res of state.threadSubscribers.get(threadId) ?? [])
      frame(res, name, payload);
}

function appendEvent(state, type, fields = {}, threadId) {
  const event = { id: nextEventId(), type, processed_at: now(), ...fields };
  broadcast(state, event, threadId);
  return event;
}

function setStatus(state, status, stopReason, threadId) {
  if (threadId) {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (thread) {
      thread.status = status;
      thread.updated_at = now();
    }
    appendEvent(
      state,
      `session.thread_status_${status}`,
      {
        session_thread_id: threadId,
        agent_name: thread?.agent.name,
        ...(status === "running" ? {} : { stop_reason: stopReason }),
      },
      threadId,
    );
    return;
  }
  state.session.status = status;
  appendEvent(
    state,
    status === "running" ? "session.status_running" : "session.status_idle",
    status === "running" ? {} : { stop_reason: stopReason },
  );
}

/** Unanswered ask-gated tool_use events (mirrors requires_action bookkeeping). */
function pendingAsks(state, threadId) {
  const answered = new Set(
    state.events
      .filter(
        (event) =>
          event.type === "user.tool_confirmation" &&
          (threadId
            ? event.session_thread_id === threadId
            : event.session_thread_id == null),
      )
      .map((e) => e.tool_use_id),
  );
  const lifecyclePrefix = threadId
    ? "session.thread_status_"
    : "session.status_";
  const boundary = [...state.events]
    .reverse()
    .find(
      (event) =>
        event.type.startsWith(lifecyclePrefix) &&
        (threadId ? event.session_thread_id === threadId : true),
    );
  const idleType = `${lifecyclePrefix}idle`;
  const ids =
    boundary?.type === idleType &&
    boundary.stop_reason?.type === "requires_action"
      ? (boundary.stop_reason.event_ids ?? [])
      : [];
  return ids.filter((id) => !answered.has(id));
}

function schedule(state, ms, fn) {
  const timer = setTimeout(() => {
    state.timers.delete(timer);
    fn();
  }, ms);
  state.timers.add(timer);
}

/** An interrupt cancels any in-flight streamed reply. */
function cancelStreams(state) {
  for (const timer of state.timers) clearTimeout(timer);
  state.timers.clear();
}

/** Streamed agent reply: event_start + content_delta frames, then persist. */
function streamReply(state, text, threadId) {
  const id = nextEventId();
  broadcastRaw(
    state,
    "event_start",
    {
      type: "event_start",
      event: { id, type: "agent.message" },
    },
    threadId,
  );
  const pieces = [text.slice(0, 8), text.slice(8, 16), text.slice(16)].filter(
    Boolean,
  );
  // Spaced enough that e2e can interact (e.g. click Interrupt) mid-stream.
  let delay = 250;
  for (const piece of pieces) {
    schedule(state, delay, () => {
      broadcastRaw(
        state,
        "event_delta",
        {
          type: "event_delta",
          event_id: id,
          delta: {
            type: "content_delta",
            index: 0,
            content: { type: "text", text: piece },
          },
        },
        threadId,
      );
    });
    delay += 250;
  }
  schedule(state, delay + 40, () => {
    const event = {
      id,
      type: "agent.message",
      processed_at: now(),
      content: [{ type: "text", text }],
    };
    broadcast(state, event, threadId);
    setStatus(state, "idle", { type: "end_turn" }, threadId);
  });
}

function handleInbound(state, incoming) {
  const batchInterrupts = incoming.some(
    (candidate) => candidate?.type === "user.interrupt",
  );
  if (
    incoming.filter((candidate) => candidate?.type === "user.define_outcome")
      .length > 1
  )
    return { error: "only one outcome is supported at a time" };
  for (const raw of incoming) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return { error: "event must be an object" };
    if (
      ![
        "user.message",
        "user.interrupt",
        "user.tool_confirmation",
        "user.define_outcome",
      ].includes(raw.type)
    )
      return { error: `unsupported inbound event type "${raw.type}"` };
    if (
      raw.type === "user.message" &&
      Object.prototype.hasOwnProperty.call(raw, "session_thread_id")
    )
      return { error: "user.message does not accept session_thread_id" };
    if (raw.type === "user.define_outcome") {
      const allowed = new Set([
        "type",
        "description",
        "rubric",
        "max_iterations",
      ]);
      if (Object.keys(raw).some((key) => !allowed.has(key)))
        return { error: "user.define_outcome has an unknown field" };
      if (typeof raw.description !== "string" || raw.description.length === 0)
        return { error: "description is required" };
      const rubric = raw.rubric;
      if (!rubric || typeof rubric !== "object" || Array.isArray(rubric))
        return { error: "rubric is required" };
      if (
        rubric.type === "text"
          ? typeof rubric.content !== "string" ||
            rubric.content.length === 0 ||
            [...rubric.content].length > 262_144 ||
            Object.keys(rubric).some(
              (key) => !["type", "content"].includes(key),
            )
          : rubric.type === "file"
            ? typeof rubric.file_id !== "string" ||
              rubric.file_id.length === 0 ||
              Object.keys(rubric).some(
                (key) => !["type", "file_id"].includes(key),
              ) ||
              !filesStore.some(
                (file) =>
                  file.id === rubric.file_id && file.size_bytes <= 256 * 1024,
              )
            : true
      )
        return {
          error: "rubric must be valid text or a file of at most 256 KiB",
        };
      if (
        raw.max_iterations !== undefined &&
        (!Number.isInteger(raw.max_iterations) ||
          raw.max_iterations < 1 ||
          raw.max_iterations > 20)
      )
        return { error: "max_iterations must be between 1 and 20" };
      const active = state.session.outcome_evaluations.some(
        (entry) =>
          ![
            "satisfied",
            "max_iterations_reached",
            "failed",
            "interrupted",
          ].includes(entry.result),
      );
      if (active && !batchInterrupts)
        return { error: "only one outcome is supported at a time" };
    }
    const threadId = raw.session_thread_id;
    if (threadId !== undefined && threadId !== null) {
      const thread = state.threads.find(
        (candidate) => candidate.id === threadId,
      );
      if (!thread) return { error: `no such thread "${threadId}"` };
      if (thread.archived_at || thread.status === "terminated")
        return { error: `thread "${threadId}" is terminated` };
    }
  }

  const posted = [];
  const definitions = [];
  for (const raw of incoming) {
    const threadId = raw.session_thread_id;
    const event = { id: nextEventId(), type: raw.type, processed_at: now() };
    switch (raw.type) {
      case "user.message":
        event.content = raw.content;
        broadcast(state, event);
        break;
      case "user.interrupt":
        event.session_thread_id = threadId ?? null;
        broadcast(state, event, threadId);
        break;
      case "user.tool_confirmation":
        event.tool_use_id = raw.tool_use_id;
        event.result = raw.result;
        event.deny_message = raw.deny_message ?? null;
        event.session_thread_id = threadId ?? null;
        broadcast(state, event, threadId);
        break;
      case "user.define_outcome":
        event.description = raw.description;
        event.rubric = structuredClone(raw.rubric);
        event.max_iterations = raw.max_iterations ?? 3;
        event.outcome_id = nextOutcomeId();
        broadcast(state, event);
        definitions.push(event);
        break;
      default:
        return { error: `unsupported inbound event type "${raw.type}"` };
    }
    posted.push({ ...event });
  }

  // React to the batch after appending it, mirroring the platform's
  // interrupt → confirmation → message precedence.
  const interrupt = incoming.find((e) => e.type === "user.interrupt");
  const confirmations = incoming.filter(
    (e) => e.type === "user.tool_confirmation",
  );
  const messages = incoming.filter((e) => e.type === "user.message");

  if (interrupt) {
    cancelStreams(state);
    const threadId = interrupt.session_thread_id;
    for (const id of pendingAsks(state, threadId)) {
      appendEvent(
        state,
        "agent.tool_result",
        {
          tool_use_id: id,
          content: [{ type: "text", text: "Interrupted by the user." }],
          is_error: true,
        },
        threadId,
      );
    }
    setStatus(state, "idle", { type: "end_turn" }, interrupt.session_thread_id);
  }

  if (interrupt) {
    for (const entry of state.session.outcome_evaluations) {
      if (
        [
          "satisfied",
          "max_iterations_reached",
          "failed",
          "interrupted",
        ].includes(entry.result)
      )
        continue;
      entry.result = "interrupted";
      entry.explanation =
        "The outcome was interrupted by a user.interrupt before evaluation completed.";
      entry.completed_at = now();
      appendEvent(state, "span.outcome_evaluation_end", {
        outcome_id: entry.outcome_id,
        outcome_evaluation_start_id: "",
        iteration: entry.iteration,
        result: entry.result,
        explanation: entry.explanation,
        usage: {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          speed: null,
        },
      });
    }
  }

  for (const definition of definitions) {
    state.session.outcome_evaluations.push({
      type: "outcome_evaluation",
      outcome_id: definition.outcome_id,
      description: definition.description,
      explanation: "",
      iteration: 0,
      result: "pending",
      completed_at: null,
    });
  }

  for (const confirmation of confirmations) {
    const threadId = confirmation.session_thread_id;
    const denied = confirmation.result === "deny";
    appendEvent(
      state,
      "agent.tool_result",
      {
        tool_use_id: confirmation.tool_use_id,
        content: [
          {
            type: "text",
            text: denied
              ? (confirmation.deny_message ??
                "The user declined this tool call.")
              : "total 0\n-rw-r--r-- lockfile",
          },
        ],
        is_error: denied,
      },
      threadId,
    );
    const remaining = pendingAsks(state, threadId);
    if (remaining.length > 0) {
      setStatus(
        state,
        "idle",
        { type: "requires_action", event_ids: remaining },
        threadId,
      );
    } else {
      setStatus(state, "running", undefined, threadId);
      streamReply(
        state,
        denied ? "Understood — skipping that step." : "Dependencies installed.",
        threadId,
      );
    }
  }

  // A message runs the session — including the interrupt+message redirect
  // batch, where the interrupt settles the old turn and the message starts
  // the next one.
  if (messages.length > 0 && confirmations.length === 0) {
    setStatus(state, "running", undefined);
    streamReply(state, "Working on it now.");
  }
  if (definitions.length > 0 && messages.length === 0) {
    setStatus(state, "running", undefined);
  }

  return { posted };
}

// ---- request plumbing -----------------------------------------------------

function envelope(type, message) {
  return JSON.stringify({
    type: "error",
    request_id: `req_mock${requestCounter}`,
    error: { type, message },
  });
}

// ---- credential dispatch -------------------------------------------------
//
// Mirrors internal/api/server.go's dispatchManagementAuth, because the console's
// BFF is written against its ordering and a mock that authenticated differently
// would let a console bug pass: **the machine key first and outright**, then the
// human lane, then today's 401 whose message never says whether SSO is on.
//
// The JWT here is decoded, never verified — signature checking belongs to the
// platform, and the console's job (the thing these tests exercise) is to send
// the right credential in the right header and to act on the refusal.

/** internal/identity.LooksLikeJWT: three non-empty base64url segments. */
const looksLikeJwt = (s) =>
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);

/** internal/api.apiKeyOffered: every field, and a repeat is ambiguous, not absent. */
function apiKeyOffered(req) {
  const raw = req.headers["x-api-key"];
  if (Array.isArray(raw)) return true;
  return typeof raw === "string" && raw !== "";
}

function authenticate(req, res) {
  const deny = (message) => {
    res.setHeader("content-type", "application/json");
    res.writeHead(401);
    res.end(envelope("authentication_error", message));
    return false;
  };

  if (apiKeyOffered(req)) {
    const key = req.headers["x-api-key"];
    if (Array.isArray(key) || key !== API_KEY) return deny("invalid x-api-key");
    return true;
  }

  const authorization = req.headers["authorization"] ?? "";
  const bearer = /^Bearer (.+)$/.exec(String(authorization))?.[1];
  if (bearer !== undefined && looksLikeJwt(bearer)) {
    // identitylane.go: one constant string for every rejection, so a caller
    // learns nothing about which check failed.
    if (identityRejected) return deny("authentication failed");
    let payload;
    try {
      payload = JSON.parse(
        Buffer.from(bearer.split(".")[1], "base64url").toString("utf8"),
      );
    } catch {
      return deny("authentication failed");
    }
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return deny("authentication failed");
    }
    return true;
  }

  // Neither credential — including a Bearer that is not JWT-shaped, which the
  // platform leaves for the environment-key lane and which then falls through
  // to exactly this message.
  return deny("missing x-api-key header");
}

// Opaque index cursor standing in for the platform's keyset tokens.
const cursor = (index) => Buffer.from(`m1|${index}`).toString("base64");
const parseCursor = (token) => {
  if (!token) return 0;
  const decoded = Buffer.from(token, "base64").toString();
  return decoded.startsWith("m1|") ? Number(decoded.slice(3)) : NaN;
};

function keysetPage(rows, url, { bi = false } = {}) {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 1000);
  const start = parseCursor(url.searchParams.get("page"));
  if (Number.isNaN(start)) return null;
  const data = rows.slice(start, start + limit);
  const page = {
    data,
    next_page: start + limit < rows.length ? cursor(start + limit) : null,
  };
  if (bi)
    page.prev_page = start > 0 ? cursor(Math.max(0, start - limit)) : null;
  return page;
}

const notArchived = (row) => row.archived_at === null;

function route(req, url) {
  const path = url.pathname;
  const includeArchived = url.searchParams.get("include_archived") === "true";

  if (req.method !== "GET") return null;

  if (path === "/v1/agents") {
    let rows = includeArchived ? agentsStore : agentsStore.filter(notArchived);
    const createdGte = url.searchParams.get("created_at[gte]");
    if (createdGte) rows = rows.filter((r) => r.created_at >= createdGte);
    return keysetPage(rows, url);
  }
  const agentMatch = path.match(/^\/v1\/agents\/([^/]+)$/);
  if (agentMatch)
    return agentsStore.find((a) => a.id === agentMatch[1]) ?? null;
  const versionsMatch = path.match(/^\/v1\/agents\/([^/]+)\/versions$/);
  if (versionsMatch) {
    const versions = agentVersionsStore[versionsMatch[1]];
    return versions ? keysetPage(versions, url) : null;
  }

  if (path === "/v1/environments") {
    return keysetPage(
      includeArchived
        ? environmentsStore
        : environmentsStore.filter(notArchived),
      url,
    );
  }
  const envMatch = path.match(/^\/v1\/environments\/([^/]+)$/);
  if (envMatch)
    return environmentsStore.find((e) => e.id === envMatch[1]) ?? null;

  if (path === "/v1/sessions") {
    let rows = [...store.values()].map((s) => s.session);
    if (!includeArchived) rows = rows.filter(notArchived);
    const statuses = url.searchParams.getAll("statuses[]");
    for (const s of url.searchParams.getAll("statuses")) statuses.push(s);
    if (statuses.length > 0)
      rows = rows.filter((r) => statuses.includes(r.status));
    const agentId = url.searchParams.get("agent_id");
    if (agentId) rows = rows.filter((r) => r.agent.id === agentId);
    const createdGte = url.searchParams.get("created_at[gte]");
    if (createdGte) rows = rows.filter((r) => r.created_at >= createdGte);
    // Platform keyset order is (created_at, id), descending by default.
    const ascending = url.searchParams.get("order") === "asc";
    rows = [...rows].sort((a, b) => {
      const byTime = a.created_at.localeCompare(b.created_at);
      const key = byTime !== 0 ? byTime : a.id.localeCompare(b.id);
      return ascending ? key : -key;
    });
    return keysetPage(rows, url, { bi: true });
  }
  const sessionMatch = path.match(/^\/v1\/sessions\/([^/]+)$/);
  if (sessionMatch) return store.get(sessionMatch[1])?.session ?? null;

  if (path === "/v1/deployments") {
    let rows = includeArchived
      ? deploymentsStore
      : deploymentsStore.filter(notArchived);
    const status = url.searchParams.get("status");
    if (status) rows = rows.filter((row) => row.status === status);
    const agentId = url.searchParams.get("agent_id");
    if (agentId) rows = rows.filter((row) => row.agent.id === agentId);
    const createdGte = url.searchParams.get("created_at[gte]");
    const createdLte = url.searchParams.get("created_at[lte]");
    if (createdGte) rows = rows.filter((row) => row.created_at >= createdGte);
    if (createdLte) rows = rows.filter((row) => row.created_at <= createdLte);
    return keysetPage(rows, url);
  }
  const deploymentMatch = path.match(/^\/v1\/deployments\/([^/]+)$/);
  if (deploymentMatch)
    return (
      deploymentsStore.find((row) => row.id === deploymentMatch[1]) ?? null
    );

  if (path === "/v1/deployment_runs") {
    let rows = deploymentRunsStore;
    const deploymentId = url.searchParams.get("deployment_id");
    if (deploymentId)
      rows = rows.filter((row) => row.deployment_id === deploymentId);
    const triggerType = url.searchParams.get("trigger_type");
    if (triggerType)
      rows = rows.filter((row) => row.trigger_context.type === triggerType);
    const hasError = url.searchParams.get("has_error");
    if (hasError !== null)
      rows = rows.filter((row) => !!row.error === (hasError === "true"));
    return keysetPage(rows, url);
  }
  const deploymentRunMatch = path.match(/^\/v1\/deployment_runs\/([^/]+)$/);
  if (deploymentRunMatch)
    return (
      deploymentRunsStore.find((row) => row.id === deploymentRunMatch[1]) ??
      null
    );

  if (path === "/v1/dreams") {
    let rows = includeArchived ? dreamsStore : dreamsStore.filter(notArchived);
    const statuses = url.searchParams.getAll("statuses[]");
    for (const status of url.searchParams.getAll("statuses"))
      statuses.push(status);
    if (statuses.length)
      rows = rows.filter((row) => statuses.includes(row.status));
    const createdGt = url.searchParams.get("created_at[gt]");
    const createdLt = url.searchParams.get("created_at[lt]");
    if (createdGt) rows = rows.filter((row) => row.created_at > createdGt);
    if (createdLt) rows = rows.filter((row) => row.created_at < createdLt);
    rows = [...rows].sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    );
    return keysetPage(rows, url);
  }
  const dreamMatch = path.match(/^\/v1\/dreams\/([^/]+)$/);
  if (dreamMatch)
    return dreamsStore.find((row) => row.id === dreamMatch[1]) ?? null;

  if (path === "/v1/memory_stores") {
    let rows = includeArchived
      ? memoryStoresStore
      : memoryStoresStore.filter(notArchived);
    const createdGte = url.searchParams.get("created_at[gte]");
    const createdLte = url.searchParams.get("created_at[lte]");
    if (createdGte) rows = rows.filter((row) => row.created_at >= createdGte);
    if (createdLte) rows = rows.filter((row) => row.created_at <= createdLte);
    return keysetPage(rows, url);
  }
  const memoryStoreMatch = path.match(/^\/v1\/memory_stores\/([^/]+)$/);
  if (memoryStoreMatch)
    return (
      memoryStoresStore.find((row) => row.id === memoryStoreMatch[1]) ?? null
    );
  const memoriesMatch = path.match(/^\/v1\/memory_stores\/([^/]+)\/memories$/);
  if (memoriesMatch) {
    if (!memoryStoresStore.some((row) => row.id === memoriesMatch[1]))
      return null;
    const prefix = url.searchParams.get("path_prefix") ?? "/";
    const depth = Number(url.searchParams.get("depth") ?? 0);
    const full = url.searchParams.get("view") === "full";
    const byPath = memoriesStore
      .filter(
        (memory) =>
          memory.memory_store_id === memoriesMatch[1] &&
          memory.path.startsWith(prefix),
      )
      .sort((a, b) => a.path.localeCompare(b.path));
    let rows = byPath;
    if (depth === 1) {
      const seen = new Set();
      rows = [];
      for (const memory of byPath) {
        const remainder = memory.path.slice(prefix.length);
        const slash = remainder.indexOf("/");
        if (slash === -1) {
          rows.push(memory);
          continue;
        }
        const rolled = `${prefix}${remainder.slice(0, slash + 1)}`;
        if (seen.has(rolled)) continue;
        seen.add(rolled);
        rows.push({ type: "memory_prefix", path: rolled });
      }
    }
    rows = rows.map((row) =>
      row.type === "memory" && !full ? { ...row, content: null } : row,
    );
    return keysetPage(rows, url);
  }
  const memoryMatch = path.match(
    /^\/v1\/memory_stores\/([^/]+)\/memories\/([^/]+)$/,
  );
  if (memoryMatch) {
    const memory = memoriesStore.find(
      (row) =>
        row.memory_store_id === memoryMatch[1] && row.id === memoryMatch[2],
    );
    if (!memory) return null;
    return url.searchParams.get("view") === "basic"
      ? { ...memory, content: null }
      : memory;
  }
  const memoryVersionsMatch = path.match(
    /^\/v1\/memory_stores\/([^/]+)\/memory_versions$/,
  );
  if (memoryVersionsMatch) {
    if (!memoryStoresStore.some((row) => row.id === memoryVersionsMatch[1]))
      return null;
    let rows = memoryVersionsStore.filter(
      (version) => version.memory_store_id === memoryVersionsMatch[1],
    );
    for (const [param, field] of [
      ["memory_id", "memory_id"],
      ["operation", "operation"],
      ["session_id", "session_id"],
      ["api_key_id", "api_key_id"],
      ["service_account_id", "service_account_id"],
    ]) {
      const value = url.searchParams.get(param);
      if (!value) continue;
      rows = rows.filter((version) =>
        field in version
          ? version[field] === value
          : version.created_by?.[field] === value,
      );
    }
    const createdGte = url.searchParams.get("created_at[gte]");
    const createdLte = url.searchParams.get("created_at[lte]");
    if (createdGte) rows = rows.filter((row) => row.created_at >= createdGte);
    if (createdLte) rows = rows.filter((row) => row.created_at <= createdLte);
    if (url.searchParams.get("view") !== "full")
      rows = rows.map((row) => ({ ...row, content: null }));
    return keysetPage(rows, url);
  }
  const versionMatch = path.match(
    /^\/v1\/memory_stores\/([^/]+)\/memory_versions\/([^/]+)$/,
  );
  if (versionMatch) {
    const version = memoryVersionsStore.find(
      (row) =>
        row.memory_store_id === versionMatch[1] && row.id === versionMatch[2],
    );
    if (!version) return null;
    return url.searchParams.get("view") === "basic"
      ? { ...version, content: null }
      : version;
  }

  const threadsMatch = path.match(/^\/v1\/sessions\/([^/]+)\/threads$/);
  if (threadsMatch) {
    const state = store.get(threadsMatch[1]);
    return state ? keysetPage(state.threads, url) : null;
  }
  const threadEventsMatch = path.match(
    /^\/v1\/sessions\/([^/]+)\/threads\/([^/]+)\/events$/,
  );
  if (threadEventsMatch) {
    const state = store.get(threadEventsMatch[1]);
    const rows = state?.threadEvents[threadEventsMatch[2]];
    return rows ? keysetPage(rows, url) : null;
  }
  const threadMatch = path.match(/^\/v1\/sessions\/([^/]+)\/threads\/([^/]+)$/);
  if (threadMatch) {
    return (
      store
        .get(threadMatch[1])
        ?.threads.find((thread) => thread.id === threadMatch[2]) ?? null
    );
  }

  const eventsMatch = path.match(/^\/v1\/sessions\/([^/]+)\/events$/);
  if (eventsMatch) {
    const state = store.get(eventsMatch[1]);
    if (!state) return null;
    let rows = state.events;
    if (url.searchParams.get("order") === "desc") rows = [...rows].reverse();
    const types = url.searchParams.getAll("types[]");
    for (const t of url.searchParams.getAll("types")) types.push(t);
    if (types.length > 0) rows = rows.filter((r) => types.includes(r.type));
    return keysetPage(rows, url);
  }

  if (path === "/v1/vaults") {
    return keysetPage(
      includeArchived ? vaultsStore : vaultsStore.filter(notArchived),
      url,
    );
  }
  const vaultMatch = path.match(/^\/v1\/vaults\/([^/]+)$/);
  if (vaultMatch)
    return vaultsStore.find((v) => v.id === vaultMatch[1]) ?? null;
  const credsMatch = path.match(/^\/v1\/vaults\/([^/]+)\/credentials$/);
  if (credsMatch) {
    const creds = vaultCredsStore[credsMatch[1]];
    if (!creds) return null; // missing vault → 404, not an empty page
    return keysetPage(includeArchived ? creds : creds.filter(notArchived), url);
  }

  if (path === "/v1/skills") {
    let rows = skillsStore;
    const source = url.searchParams.get("source");
    if (source) rows = rows.filter((s) => s.source.type === source);
    return keysetPage(rows, url);
  }
  const skillVersionsMatch = path.match(/^\/v1\/skills\/([^/]+)\/versions$/);
  if (skillVersionsMatch) {
    const versions = skillVersionsStore[skillVersionsMatch[1]];
    return versions ? keysetPage(versions, url) : null;
  }
  const skillMatch = path.match(/^\/v1\/skills\/([^/]+)$/);
  if (skillMatch)
    return skillsStore.find((s) => s.id === skillMatch[1]) ?? null;

  if (path === "/v1/files") {
    // Classic Files pagination: after_id/before_id + has_more envelope.
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 1000);
    const afterId = url.searchParams.get("after_id");
    let rows = filesStore;
    if (afterId) {
      const at = rows.findIndex((f) => f.id === afterId);
      rows = at === -1 ? [] : rows.slice(at + 1);
    }
    const data = rows.slice(0, limit);
    return {
      data,
      has_more: rows.length > limit,
      first_id: data.length > 0 ? data[0].id : null,
      last_id: data.length > 0 ? data[data.length - 1].id : null,
    };
  }
  const fileMatch = path.match(/^\/v1\/files\/([^/]+)$/);
  if (fileMatch) return filesStore.find((f) => f.id === fileMatch[1]) ?? null;

  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

const server = createServer(async (req, res) => {
  requestCounter += 1;
  res.setHeader("request-id", `req_mock${requestCounter}`);

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Test hook: restore fixtures between e2e tests. No auth on purpose.
  if (req.method === "POST" && url.pathname === "/__reset") {
    resetStore();
    res.setHeader("content-type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Test hook: answer 403 on these paths, as the platform does for a human
  // whose role does not reach the route. `/__reset` puts it back.
  if (req.method === "POST" && url.pathname === "/__forbid") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    forbidden = Array.isArray(body.paths) ? body.paths : [];
    res.setHeader("content-type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, paths: forbidden }));
    return;
  }

  // Test hook: refuse every identity token from here on, as a platform does
  // once a provider revokes one. `/__reset` puts it back. No auth, on purpose —
  // the whole point is to reach it while the console's own credential is dead.
  if (req.method === "POST" && url.pathname === "/__expire-identity") {
    identityRejected = true;
    res.setHeader("content-type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Test hook: pretend to be a deployment that does not serve these surfaces.
  // `/__reset` puts it back, so a spec that forgets cannot leak into the next.
  if (req.method === "POST" && url.pathname === "/__unimplemented") {
    const body = JSON.parse((await readBody(req)).toString() || "{}");
    unimplemented = Array.isArray(body.surfaces) ? body.surfaces : [];
    res.setHeader("content-type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, surfaces: unimplemented }));
    return;
  }

  if (!authenticate(req, res)) return;

  // Authenticated, and not allowed. The role check runs AFTER authentication on
  // the platform too (requireIdentity then requireRole), and the message names
  // the role the route requires rather than the caller's — which is what lets
  // the console quote it verbatim.
  if (forbidden.some((p) => url.pathname.startsWith(`/${p}`))) {
    res.setHeader("content-type", "application/json");
    res.writeHead(403);
    res.end(envelope("permission_error", "this route requires the admin role"));
    return;
  }

  // A deployment that does not serve some surfaces. The platform has no 501:
  // an unregistered route falls through its router's catch-all to a plain
  // 404/not_found_error (internal/api/server.go), which is what this replays
  // so e2e can prove the console hides the surface instead of erroring.
  if (
    unimplemented.some((surface) =>
      url.pathname.startsWith(
        `/v1/${surface === "memory-stores" ? "memory_stores" : surface}`,
      ),
    )
  ) {
    res.setHeader("content-type", "application/json");
    res.writeHead(404);
    res.end(envelope("not_found_error", `no such endpoint: ${url.pathname}`));
    return;
  }
  // The same hook for the console API: `environment-keys` stands for a platform
  // that predates plan 30 and never registered the namespace.
  if (
    unimplemented.includes("environment-keys") &&
    url.pathname.startsWith("/api/oauth/")
  ) {
    res.setHeader("content-type", "application/json");
    res.writeHead(404);
    res.end(envelope("not_found_error", `no such endpoint: ${url.pathname}`));
    return;
  }

  // ---- management keys (internal/api/consoleapikeys.go), the OTHER console
  // namespace, reached through the console's /api/console passthrough. A
  // deployment predating the surface answers 404 through its router catch-all,
  // which is what the console reads as "not implemented here".
  if (
    unimplemented.includes("api-keys") &&
    url.pathname.startsWith("/api/console/")
  ) {
    res.setHeader("content-type", "application/json");
    res.writeHead(404);
    res.end(envelope("not_found_error", `no such endpoint: ${url.pathname}`));
    return;
  }

  const apiKeysMatch = url.pathname.match(
    /^\/api\/console\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api_keys$/,
  );
  const apiKeyMatch = url.pathname.match(
    /^\/api\/console\/organizations\/([^/]+)\/workspaces\/([^/]+)\/api_keys\/([^/]+)$/,
  );
  if (apiKeysMatch || apiKeyMatch) {
    res.setHeader("content-type", "application/json");
    const [, org, workspace] = apiKeysMatch ?? apiKeyMatch;
    // Both segments answer the same 404 shape, so the namespace is no better an
    // enumeration oracle than /v1 is.
    if (org !== "default") {
      res.writeHead(404);
      res.end(envelope("not_found_error", `organization ${org} not found`));
      return;
    }
    if (workspace !== "default") {
      res.writeHead(404);
      res.end(envelope("not_found_error", `workspace ${workspace} not found`));
      return;
    }

    // `expired` is DERIVED from expires_at and outranked by archived — the
    // platform renders it, never stores it, and refuses it as an input.
    const render = (k) => {
      const lapsed =
        k.expires_at != null && Date.parse(k.expires_at) <= Date.now();
      const status = k.status === "archived" || !lapsed ? k.status : "expired";
      return { ...k, status };
    };

    if (apiKeysMatch && req.method === "GET") {
      res.writeHead(200);
      // A bare array: no envelope, no paging, which is what the reference's
      // own console listing returns.
      res.end(JSON.stringify(apiKeysStore.map(render)));
      return;
    }

    if (apiKeysMatch && req.method === "POST") {
      let body;
      try {
        body = JSON.parse((await readBody(req)).toString() || "{}");
      } catch {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "invalid JSON body"));
        return;
      }
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || [...name].length > 128) {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "name must be 1-128 characters"),
        );
        return;
      }
      // Absent and explicit null both mean "never" (consoleapikeys.go).
      const expiresAt =
        body.expires_at == null ? null : String(body.expires_at);
      const id = `apikey_new${String(apiKeyCounter++).padStart(2, "0")}`;
      // The platform's own prefix, measured on a real stack (its
      // internal/api/auth.go: `IssuedKeyPrefix = "sk-map-api01-"`). The hint is
      // derived from the value actually minted, by the same rule the platform
      // uses, so a test can match a listing row against the secret it was shown
      // — exactly as an operator does.
      // Long enough to clear the hint's length floor, as every real minted key
      // is: the platform's bodies are 43 base64url characters.
      const rawKey = `${ISSUED_KEY_PREFIX}mock-${id}-secret`;
      const row = {
        id,
        type: "api_key",
        name,
        workspace_id: null,
        created_at: new Date().toISOString(),
        created_by: { id: "principal_op01", type: "principal" },
        partial_key_hint: partialKeyHint(rawKey),
        status: "active",
        expires_at: expiresAt,
        principal: null,
      };
      apiKeysStore.unshift(row);
      // `noStore(...)` wraps this route and only this one on the platform
      // (server.go), because it is the one response that carries a plaintext
      // credential. The mock mirrors it so the console's header forwarding is
      // actually exercised rather than assumed.
      res.setHeader("cache-control", "no-store");
      // 200, not 201: the platform answers this through its typed `handle`
      // adapter, which writes StatusOK for every success that carries a body
      // (server.go). Measured on a real stack, 2026-08-14.
      res.writeHead(200);
      // The whole resource plus the plaintext, appended last — NOT the RFC 6749
      // shape the environment-key surface answers with. Two dialects, two
      // surfaces, mirrored where each was observed.
      res.end(
        JSON.stringify({
          ...render(row),
          raw_key: rawKey,
        }),
      );
      return;
    }

    if (apiKeyMatch && req.method === "POST") {
      const keyId = apiKeyMatch[3];
      let body;
      try {
        body = JSON.parse((await readBody(req)).toString() || "{}");
      } catch {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "invalid JSON body"));
        return;
      }
      const row = apiKeysStore.find((k) => k.id === keyId);
      if (!row) {
        res.writeHead(404);
        res.end(envelope("not_found_error", `api key ${keyId} not found`));
        return;
      }
      // The platform's guards, in its order — the env-var one FIRST, because a
      // rotated deployment holds archived rows with no issuer and telling that
      // operator "archived is permanent" never mentions the thing they can act
      // on.
      if (!row.created_by) {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            `api key ${keyId} is managed by CONTROLPLANE_API_KEY; rotate it by restarting the control plane with a new value`,
          ),
        );
        return;
      }
      if (row.status === "archived") {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            `api key ${keyId} is archived, and an archived key cannot be updated`,
          ),
        );
        return;
      }
      const status = body.status == null ? null : String(body.status);
      if (
        status !== null &&
        !["active", "inactive", "archived"].includes(status)
      ) {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            "status must be one of active, inactive, archived",
          ),
        );
        return;
      }
      const lapsed =
        row.expires_at != null && Date.parse(row.expires_at) <= Date.now();
      // A lapsed key admits exactly one operation: archiving it.
      if (lapsed && !(body.name == null && status === "archived")) {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            `api key ${keyId} has expired; an expired key can only be archived, not renamed or re-activated`,
          ),
        );
        return;
      }
      if (status !== null) row.status = status;
      if (typeof body.name === "string") row.name = body.name.trim();
      res.writeHead(200);
      res.end(JSON.stringify(render(row)));
      return;
    }

    res.writeHead(405);
    res.end(envelope("invalid_request_error", "method not allowed"));
    return;
  }

  // ---- console API (internal/api/consoleapi.go), reached through the
  // console's own /api/oauth passthrough. `default` is the only organization
  // v1 answers for (consoleapi.go:52-53).
  const tokensMatch = url.pathname.match(
    /^\/api\/oauth\/organizations\/([^/]+)\/environments\/([^/]+)\/tokens$/,
  );
  const revokeMatch = url.pathname.match(
    /^\/api\/oauth\/organizations\/([^/]+)\/environments\/([^/]+)\/tokens\/([^/]+)\/revoke$/,
  );
  if (tokensMatch || revokeMatch) {
    res.setHeader("content-type", "application/json");
    const [, org, envId] = tokensMatch ?? revokeMatch;
    if (org !== "default") {
      res.writeHead(404);
      res.end(envelope("not_found_error", `organization ${org} not found`));
      return;
    }
    const env = environmentsStore.find((e) => e.id === envId);
    if (!env) {
      res.writeHead(404);
      res.end(envelope("not_found_error", `environment ${envId} not found`));
      return;
    }
    envKeysStore[envId] ??= [];

    if (tokensMatch && req.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      // `WHERE ... revoked_at IS NULL` (envkeys.go:121,133) — a revoked row stays
      // in the table and leaves the listing. `revoked_at` is the mock's own
      // bookkeeping, so the projection is explicit rather than a spread.
      const all = envKeysStore[envId].filter((k) => !k.revoked_at);
      const data = all.slice(offset, offset + limit).map((k) => ({
        id: k.id,
        name: k.name,
        created_at: k.created_at,
        expires_at: k.expires_at,
      }));
      res.writeHead(200);
      res.end(
        JSON.stringify({
          data,
          pagination: {
            total: all.length,
            limit,
            offset,
            has_more: offset + data.length < all.length,
          },
        }),
      );
      return;
    }

    if (tokensMatch && req.method === "POST") {
      let body;
      try {
        body = JSON.parse((await readBody(req)).toString() || "{}");
      } catch {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "invalid JSON body"));
        return;
      }
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || [...name].length > 128) {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "name must be 1-128 characters"),
        );
        return;
      }
      // Both refusals the platform makes, in its order (consoleapi.go:200-205).
      if (env.config?.type !== "self_hosted") {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            `environment ${envId} is a ${env.config?.type} environment; only a self_hosted environment runs a worker that authenticates with an environment key`,
          ),
        );
        return;
      }
      if (env.archived_at) {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", `environment ${envId} is archived`),
        );
        return;
      }
      const n = envKeyCounter++;
      const id = `envkey_new${String(n).padStart(14, "0")}`;
      const created = now();
      envKeysStore[envId].unshift({
        id,
        name,
        created_at: created,
        expires_at: new Date(
          Date.parse(created) + 365 * 24 * 3600 * 1000,
        ).toISOString(),
      });
      // RFC 6749 token response: the plaintext, and nothing that identifies the
      // row (consoleapi.go:74-79). `no-store` is the platform's own header on
      // this one route (consoleapi.go noStore).
      res.setHeader("cache-control", "no-store");
      res.writeHead(200);
      res.end(
        JSON.stringify({
          access_token: `sk-map-env01-mock${String(n).padStart(4, "0")}`,
          expires_in: 31536000,
        }),
      );
      return;
    }

    if (revokeMatch && req.method === "POST") {
      const tokenId = revokeMatch[3];
      const key = envKeysStore[envId].find((k) => k.id === tokenId);
      // Idempotent: `SET revoked_at = coalesce(revoked_at, now())` matches on
      // id + environment alone (envkeys.go:161-168), so revoking an already
      // revoked key answers 204 again. Only an id this environment never
      // issued reaches the 404 — verified against a live platform 2026-08-14.
      if (!key) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "environment key not found"));
        return;
      }
      key.revoked_at ??= now();
      // Bodiless 204 — the shape `handleNoContent` answers with.
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(405);
    res.end(envelope("invalid_request_error", "method not allowed"));
    return;
  }

  // SSE live tail — named frames, ping keepalive, no history replay.
  const streamMatch = url.pathname.match(
    /^\/v1\/sessions\/([^/]+)\/events\/stream$/,
  );
  const threadStreamMatch = url.pathname.match(
    /^\/v1\/sessions\/([^/]+)\/threads\/([^/]+)\/stream$/,
  );
  if (req.method === "GET" && (streamMatch || threadStreamMatch)) {
    const match = streamMatch ?? threadStreamMatch;
    const state = store.get(match[1]);
    if (!state) {
      res.setHeader("content-type", "application/json");
      res.writeHead(404);
      res.end(envelope("not_found_error", "no such session"));
      return;
    }
    if (
      threadStreamMatch &&
      !state.threads.some((thread) => thread.id === threadStreamMatch[2])
    ) {
      res.setHeader("content-type", "application/json");
      res.writeHead(404);
      res.end(envelope("not_found_error", "no such thread"));
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    });
    // Flush headers plus a first byte immediately — intermediaries (the
    // console's BFF included) may hold the response until bytes flow.
    res.flushHeaders?.();
    res.write(": connected\n\n");
    const subscribers = threadStreamMatch
      ? (state.threadSubscribers.get(threadStreamMatch[2]) ?? new Set())
      : state.subscribers;
    if (threadStreamMatch)
      state.threadSubscribers.set(threadStreamMatch[2], subscribers);
    subscribers.add(res);
    const ping = setInterval(() => frame(res, "ping", { type: "ping" }), 15000);
    req.on("close", () => {
      clearInterval(ping);
      subscribers.delete(res);
    });
    return;
  }

  const archiveThreadMatch = url.pathname.match(
    /^\/v1\/sessions\/([^/]+)\/threads\/([^/]+)\/archive$/,
  );
  if (req.method === "POST" && archiveThreadMatch) {
    res.setHeader("content-type", "application/json");
    const state = store.get(archiveThreadMatch[1]);
    const thread = state?.threads.find(
      (candidate) => candidate.id === archiveThreadMatch[2],
    );
    if (!thread) {
      res.writeHead(404);
      res.end(envelope("not_found_error", "no such thread"));
      return;
    }
    if (thread.parent_thread_id === null || thread.status !== "idle") {
      res.writeHead(400);
      res.end(
        envelope(
          "invalid_request_error",
          thread.parent_thread_id === null
            ? "the primary thread cannot be archived; archive the session"
            : "only an idle thread can be archived",
        ),
      );
      return;
    }
    thread.status = "terminated";
    thread.archived_at ??= now();
    thread.updated_at = thread.archived_at;
    appendEvent(
      state,
      "session.thread_status_terminated",
      {
        session_thread_id: thread.id,
        agent_name: thread.agent.name,
      },
      thread.id,
    );
    res.writeHead(200);
    res.end(JSON.stringify(thread));
    return;
  }

  // Environment writes: create, update (kind immutable), archive, delete.
  if (url.pathname.startsWith("/v1/environments")) {
    const idMatch = url.pathname.match(/^\/v1\/environments\/([^/]+)$/);
    const archiveMatch = url.pathname.match(
      /^\/v1\/environments\/([^/]+)\/archive$/,
    );
    if (req.method === "DELETE" && idMatch) {
      res.setHeader("content-type", "application/json");
      const env = environmentsStore.find((e) => e.id === idMatch[1]);
      if (!env) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such environment"));
        return;
      }
      const inUse = [...store.values()].some(
        (s) => s.session.environment_id === env.id,
      );
      if (inUse) {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "environment still has sessions"),
        );
        return;
      }
      environmentsStore = environmentsStore.filter((e) => e.id !== env.id);
      res.writeHead(200);
      res.end(JSON.stringify({ id: env.id, type: "environment_deleted" }));
      return;
    }
    if (req.method === "POST" && archiveMatch) {
      res.setHeader("content-type", "application/json");
      const env = environmentsStore.find((e) => e.id === archiveMatch[1]);
      if (!env) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such environment"));
        return;
      }
      env.archived_at ??= now();
      res.writeHead(200);
      res.end(JSON.stringify(env));
      return;
    }
    if (
      req.method === "POST" &&
      (url.pathname === "/v1/environments" || idMatch)
    ) {
      res.setHeader("content-type", "application/json");
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "invalid JSON body"));
        return;
      }
      const allowed = new Set([
        "name",
        "description",
        "config",
        "scope",
        "metadata",
      ]);
      for (const key of Object.keys(body)) {
        if (!allowed.has(key)) {
          res.writeHead(400);
          res.end(envelope("invalid_request_error", `unknown field "${key}"`));
          return;
        }
      }
      if (url.pathname === "/v1/environments") {
        if (typeof body.name !== "string" || !body.name) {
          res.writeHead(400);
          res.end(envelope("invalid_request_error", "name is required"));
          return;
        }
        const kind = body.config?.type;
        if (kind !== "cloud" && kind !== "self_hosted") {
          res.writeHead(400);
          res.end(
            envelope(
              "invalid_request_error",
              'config.type must be "cloud" or "self_hosted"',
            ),
          );
          return;
        }
        const timestamp = now();
        const env = {
          id: `env_mock${String(environmentCounter++).padStart(6, "0")}`,
          type: "environment",
          name: body.name,
          description: body.description ?? "",
          config:
            kind === "self_hosted"
              ? { type: "self_hosted" }
              : {
                  type: "cloud",
                  networking: body.config.networking ?? {
                    type: "unrestricted",
                  },
                  packages: {
                    apt: [],
                    cargo: [],
                    gem: [],
                    go: [],
                    npm: [],
                    pip: [],
                    ...(body.config.packages ?? {}),
                  },
                },
          scope: "organization",
          metadata: body.metadata ?? {},
          created_at: timestamp,
          updated_at: timestamp,
          archived_at: null,
        };
        environmentsStore.unshift(env);
        res.writeHead(200);
        res.end(JSON.stringify(env));
        return;
      }
      const env = environmentsStore.find((e) => e.id === idMatch[1]);
      if (!env) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such environment"));
        return;
      }
      if (body.config?.type && body.config.type !== env.config.type) {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "environment kind is immutable"),
        );
        return;
      }
      if (body.name !== undefined) env.name = body.name;
      if (body.description !== undefined) env.description = body.description;
      if (body.config && env.config.type === "cloud") {
        if (body.config.networking)
          env.config.networking = body.config.networking;
        if (body.config.packages)
          env.config.packages = {
            ...env.config.packages,
            ...body.config.packages,
          };
      }
      env.updated_at = now();
      res.writeHead(200);
      res.end(JSON.stringify(env));
      return;
    }
  }

  // File upload (multipart) — enough parsing to retain the file part's exact
  // content size. Outcome file rubrics enforce their limit on content bytes,
  // excluding the multipart headers and boundary.
  if (req.method === "POST" && url.pathname === "/v1/files") {
    res.setHeader("content-type", "application/json");
    const body = await readBody(req);
    const filename =
      /filename="([^"]+)"/.exec(body)?.[1] ?? `upload-${fileCounter}`;
    const mime =
      /Content-Type:\s*([^\r\n]+)/i.exec(body)?.[1] ??
      "application/octet-stream";
    const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(
      req.headers["content-type"] ?? "",
    );
    const separator = Buffer.from("\r\n\r\n");
    const contentStart = body.indexOf(separator);
    const contentEnd = boundary
      ? body.indexOf(
          Buffer.from(`\r\n--${boundary[1] ?? boundary[2]}`),
          contentStart + separator.length,
        )
      : -1;
    const contentSize =
      contentStart >= 0 && contentEnd >= 0
        ? contentEnd - contentStart - separator.length
        : body.length;
    const file = {
      id: `file_mock${String(fileCounter++).padStart(6, "0")}`,
      type: "file",
      filename,
      mime_type: mime.trim(),
      size_bytes: contentSize,
      downloadable: false,
      scope: null,
      created_at: now(),
    };
    filesStore.unshift(file);
    res.writeHead(200);
    res.end(JSON.stringify(file));
    return;
  }
  const fileDeleteMatch = url.pathname.match(/^\/v1\/files\/([^/]+)$/);
  if (req.method === "DELETE" && fileDeleteMatch) {
    res.setHeader("content-type", "application/json");
    const file = filesStore.find((f) => f.id === fileDeleteMatch[1]);
    if (!file) {
      res.writeHead(404);
      res.end(envelope("not_found_error", "no such file"));
      return;
    }
    filesStore = filesStore.filter((f) => f.id !== file.id);
    res.writeHead(200);
    res.end(JSON.stringify({ id: file.id, type: "file_deleted" }));
    return;
  }

  // Session lifecycle: internal/api/sessions.go and wire.go:patchMetadata.
  const sessionWriteMatch = url.pathname.match(
    /^\/v1\/sessions\/([^/]+)(\/archive)?$/,
  );
  if (
    sessionWriteMatch &&
    (req.method === "POST" ||
      (req.method === "DELETE" && !sessionWriteMatch[2]))
  ) {
    const state = store.get(sessionWriteMatch[1]);
    res.setHeader("content-type", "application/json");
    const fail = (status, message) => {
      res.writeHead(status);
      res.end(
        envelope(
          status === 404 ? "not_found_error" : "invalid_request_error",
          message,
        ),
      );
    };
    if (!state) {
      fail(404, "no such session");
      return;
    }
    const session = state.session;
    const archiving = !!sessionWriteMatch[2];
    if (
      (archiving || req.method === "DELETE") &&
      session.status === "running"
    ) {
      fail(
        400,
        "session is running; send user.interrupt before archiving or deleting",
      );
      return;
    }
    if (req.method === "DELETE") {
      for (const timer of state.timers ?? []) clearTimeout(timer);
      broadcastRaw(state, "session.deleted", {
        id: nextEventId(),
        type: "session.deleted",
        processed_at: now(),
      });
      for (const subscriber of state.subscribers) subscriber.end();
      for (const subscribers of state.threadSubscribers.values())
        for (const subscriber of subscribers) subscriber.end();
      store.delete(session.id);
      res.writeHead(200);
      res.end(JSON.stringify({ id: session.id, type: "session_deleted" }));
      return;
    }
    if (archiving) {
      if (!session.archived_at)
        session.updated_at = session.archived_at = now();
    } else {
      if (session.archived_at) {
        fail(400, "session is archived");
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        fail(400, "invalid JSON body");
        return;
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        fail(400, "expected object");
        return;
      }
      if (
        Object.keys(body).some((key) => !["title", "metadata"].includes(key))
      ) {
        fail(400, "unsupported session field");
        return;
      }
      if (body.title != null && typeof body.title !== "string") {
        fail(400, "title must be a string");
        return;
      }
      const metadata = { ...session.metadata };
      if (body.metadata != null) {
        if (typeof body.metadata !== "object" || Array.isArray(body.metadata)) {
          fail(400, "metadata must be an object");
          return;
        }
        for (const [key, value] of Object.entries(body.metadata)) {
          if (value !== null && typeof value !== "string") {
            fail(400, "metadata values must be strings or null");
            return;
          }
          if (value === null) delete metadata[key];
          else
            Object.defineProperty(metadata, key, {
              value,
              enumerable: true,
              configurable: true,
              writable: true,
            });
        }
      }
      if ("title" in body) session.title = body.title ?? "";
      session.metadata = metadata;
      session.updated_at = now();
      appendEvent(state, "session.updated", { title: session.title, metadata });
    }
    res.writeHead(200);
    res.end(JSON.stringify(session));
    return;
  }

  // Deployments: persisted templates plus their pause/run lifecycle.
  if (req.method === "POST" && url.pathname.startsWith("/v1/deployments")) {
    res.setHeader("content-type", "application/json");
    const actionMatch = url.pathname.match(
      /^\/v1\/deployments\/([^/]+)\/(archive|pause|unpause|run)$/,
    );
    let body;
    try {
      const rawBody = (await readBody(req)).toString("utf8");
      body = actionMatch && rawBody.trim() === "" ? {} : JSON.parse(rawBody);
    } catch {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", "invalid JSON body"));
      return;
    }
    if (actionMatch) {
      const deployment = deploymentsStore.find(
        (candidate) => candidate.id === actionMatch[1],
      );
      if (!deployment) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such deployment"));
        return;
      }
      const action = actionMatch[2];
      if (deployment.archived_at && action !== "archive") {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "deployment is archived"));
        return;
      }
      if (action === "archive") {
        deployment.archived_at ??= now();
        deployment.updated_at = deployment.archived_at;
        // The platform computes archived deployments as active regardless of
        // the pause columns it retains internally.
        deployment.status = "active";
        deployment.paused_reason = null;
        res.writeHead(200);
        res.end(JSON.stringify(deployment));
        return;
      }
      if (action === "pause" || action === "unpause") {
        deployment.status = action === "pause" ? "paused" : "active";
        deployment.paused_reason =
          action === "pause" ? { type: "manual" } : null;
        deployment.updated_at = now();
        res.writeHead(200);
        res.end(JSON.stringify(deployment));
        return;
      }

      const sourceAgent =
        agentVersionsStore[deployment.agent.id]?.find(
          (candidate) => candidate.version === deployment.agent.version,
        ) ??
        agentsStore.find((candidate) => candidate.id === deployment.agent.id);
      const timestamp = now();
      const sessionResources = deployment.resources.map((resource) => {
        if (resource.type === "memory_store") {
          const memory = memoryResources.find(
            (candidate) =>
              candidate.memory_store_id === resource.memory_store_id,
          );
          return {
            ...structuredClone(memory),
            access: resource.access ?? "read_write",
            instructions: resource.instructions ?? null,
          };
        }
        if (resource.type === "github_repository") {
          return {
            id: `sesrsc_mock${String(resourceCounter++).padStart(4, "0")}`,
            type: "github_repository",
            url: resource.url,
            mount_path:
              resource.mount_path ??
              `/workspace/${resource.url
                .split("/")
                .at(-1)
                .replace(/\.git$/, "")}`,
            checkout: resource.checkout ?? null,
            created_at: timestamp,
            updated_at: timestamp,
          };
        }
        return {
          id: `sesrsc_mock${String(resourceCounter++).padStart(4, "0")}`,
          type: "file",
          file_id: resource.file_id,
          mount_path:
            resource.mount_path ?? `/mnt/session/uploads/${resource.file_id}`,
          created_at: timestamp,
          updated_at: timestamp,
        };
      });
      const session = {
        id: `sesn_deploy${String(sessionCounter++).padStart(6, "0")}`,
        type: "session",
        agent: mockSessionAgent(sourceAgent),
        environment_id: deployment.environment_id,
        status: "idle",
        title: "",
        metadata: {},
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation: {
            ephemeral_1h_input_tokens: 0,
            ephemeral_5m_input_tokens: 0,
          },
        },
        stats: { active_seconds: 0, duration_seconds: 0 },
        outcome_evaluations: [],
        resources: sessionResources,
        vault_ids: structuredClone(deployment.vault_ids),
        deployment_id: deployment.id,
        created_at: timestamp,
        updated_at: timestamp,
        archived_at: null,
      };
      const thread = {
        id: `sthr_deploy${String(threadCounter++).padStart(6, "0")}`,
        type: "session_thread",
        session_id: session.id,
        parent_thread_id: null,
        agent: mockThreadAgent(sourceAgent),
        status: "idle",
        usage: structuredClone(session.usage),
        stats: { active_seconds: 0, duration_seconds: 0, startup_seconds: 0 },
        created_at: timestamp,
        updated_at: timestamp,
        archived_at: null,
      };
      const events = deployment.initial_events.map((event) => ({
        ...structuredClone(event),
        id: nextEventId(),
        processed_at: timestamp,
      }));
      store.set(session.id, {
        session,
        events,
        subscribers: new Set(),
        threads: [thread],
        threadEvents: { [thread.id]: structuredClone(events) },
        threadSubscribers: new Map(),
        timers: new Set(),
      });
      const run = {
        id: `drun_mock${String(deploymentRunCounter++).padStart(6, "0")}`,
        type: "deployment_run",
        deployment_id: deployment.id,
        trigger_context: { type: "manual" },
        session_id: session.id,
        error: null,
        agent: structuredClone(deployment.agent),
        created_at: timestamp,
      };
      deploymentRunsStore.unshift(run);
      res.writeHead(200);
      res.end(JSON.stringify(run));
      return;
    }

    const itemMatch = url.pathname.match(/^\/v1\/deployments\/([^/]+)$/);
    const existing = itemMatch
      ? deploymentsStore.find((candidate) => candidate.id === itemMatch[1])
      : null;
    if (itemMatch && !existing) {
      res.writeHead(404);
      res.end(envelope("not_found_error", "no such deployment"));
      return;
    }
    if (existing?.archived_at) {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", "deployment is archived"));
      return;
    }
    const allowed = new Set([
      "name",
      "description",
      "agent",
      "environment_id",
      "vault_ids",
      "initial_events",
      "resources",
      "metadata",
      "schedule",
    ]);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", `unknown field "${key}"`));
        return;
      }
    }
    const required = ["name", "agent", "environment_id", "initial_events"];
    if (!existing && required.some((key) => !(key in body))) {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", "missing required field"));
      return;
    }
    if (
      "initial_events" in body &&
      (!Array.isArray(body.initial_events) || body.initial_events.length === 0)
    ) {
      res.writeHead(400);
      res.end(
        envelope("invalid_request_error", "initial_events must be non-empty"),
      );
      return;
    }
    const currentAgent = body.agent ?? existing?.agent;
    const agentId =
      typeof currentAgent === "string" ? currentAgent : currentAgent?.id;
    const requestedVersion =
      typeof currentAgent === "object" ? currentAgent?.version : undefined;
    const agent = requestedVersion
      ? agentVersionsStore[agentId]?.find(
          (candidate) => candidate.version === requestedVersion,
        )
      : agentsStore.find((candidate) => candidate.id === agentId);
    if (!agent || agent.archived_at) {
      res.writeHead(agent ? 400 : 404);
      res.end(
        envelope(
          agent ? "invalid_request_error" : "not_found_error",
          agent ? "agent is archived" : "no such agent",
        ),
      );
      return;
    }
    const environmentId = body.environment_id ?? existing?.environment_id;
    const environment = environmentsStore.find(
      (candidate) => candidate.id === environmentId,
    );
    if (!environment || environment.archived_at) {
      res.writeHead(environment ? 400 : 404);
      res.end(
        envelope(
          environment ? "invalid_request_error" : "not_found_error",
          environment ? "environment is archived" : "no such environment",
        ),
      );
      return;
    }
    const vaultIds = body.vault_ids ?? existing?.vault_ids ?? [];
    if (!Array.isArray(vaultIds)) {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", "vault_ids must be an array"));
      return;
    }
    if (
      vaultIds.some(
        (id) =>
          !vaultsStore.some((vault) => vault.id === id && !vault.archived_at),
      )
    ) {
      res.writeHead(404);
      res.end(envelope("not_found_error", "no such live vault"));
      return;
    }
    if ("resources" in body && body.resources !== null) {
      if (!Array.isArray(body.resources)) {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "resources must be an array"),
        );
        return;
      }
      for (const resource of body.resources) {
        const valid =
          (resource.type === "file" &&
            filesStore.some((file) => file.id === resource.file_id)) ||
          (resource.type === "memory_store" &&
            memoryResources.some(
              (memory) => memory.memory_store_id === resource.memory_store_id,
            ) &&
            [undefined, "read_only", "read_write"].includes(resource.access)) ||
          (resource.type === "github_repository" &&
            typeof resource.authorization_token === "string" &&
            resource.authorization_token.length > 0 &&
            /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
              resource.url ?? "",
            ));
        if (!valid) {
          res.writeHead(400);
          res.end(
            envelope("invalid_request_error", "invalid deployment resource"),
          );
          return;
        }
      }
    }
    if (
      body.schedule != null &&
      (body.schedule.type !== "cron" ||
        typeof body.schedule.expression !== "string" ||
        typeof body.schedule.timezone !== "string")
    ) {
      res.writeHead(400);
      res.end(
        envelope(
          "invalid_request_error",
          'schedule requires type "cron", expression, and timezone',
        ),
      );
      return;
    }
    const timestamp = now();
    const cleanResources = (body.resources ?? existing?.resources ?? []).map(
      (resource) => {
        const clean = { ...resource };
        delete clean.authorization_token;
        return clean;
      },
    );
    const renderedSchedule =
      body.schedule === undefined
        ? (existing?.schedule ?? null)
        : body.schedule === null
          ? null
          : {
              type: body.schedule.type,
              expression: body.schedule.expression,
              timezone: body.schedule.timezone,
              last_run_at: existing?.schedule?.last_run_at ?? null,
              upcoming_runs_at: Array.from({ length: 5 }, (_, index) =>
                new Date(Date.now() + (index + 1) * 86_400_000)
                  .toISOString()
                  .replace(/\.\d{3}Z$/, "Z"),
              ),
            };
    if (existing) {
      if ("name" in body) existing.name = body.name;
      if ("description" in body) existing.description = body.description;
      existing.agent = { type: "agent", id: agent.id, version: agent.version };
      existing.environment_id = environment.id;
      if ("vault_ids" in body) existing.vault_ids = body.vault_ids ?? [];
      if ("initial_events" in body)
        existing.initial_events = body.initial_events;
      if ("resources" in body) existing.resources = cleanResources;
      if ("metadata" in body) {
        const next = { ...existing.metadata };
        for (const [key, value] of Object.entries(body.metadata ?? {}))
          if (value === null) delete next[key];
          else next[key] = value;
        existing.metadata = next;
      }
      existing.schedule = renderedSchedule;
      existing.updated_at = timestamp;
      res.writeHead(200);
      res.end(JSON.stringify(existing));
      return;
    }
    const deployment = {
      id: `depl_mock${String(deploymentCounter++).padStart(6, "0")}`,
      type: "deployment",
      name: body.name,
      description: body.description ?? null,
      agent: { type: "agent", id: agent.id, version: agent.version },
      environment_id: environment.id,
      vault_ids: body.vault_ids ?? [],
      initial_events: body.initial_events,
      resources: cleanResources,
      metadata: body.metadata ?? {},
      schedule: renderedSchedule,
      status: "active",
      paused_reason: null,
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    };
    deploymentsStore.unshift(deployment);
    res.writeHead(200);
    res.end(JSON.stringify(deployment));
    return;
  }

  // Dreams — asynchronous consolidation jobs. The mock accepts writes and
  // holds new jobs pending; no timer simulates a model runner.
  if (url.pathname.startsWith("/v1/dreams")) {
    res.setHeader("content-type", "application/json");
    const fail = (status, message) => {
      res.writeHead(status);
      res.end(
        envelope(
          status === 404 ? "not_found_error" : "invalid_request_error",
          message,
        ),
      );
    };
    const itemMatch = url.pathname.match(/^\/v1\/dreams\/([^/]+)$/);
    const cancelMatch = url.pathname.match(/^\/v1\/dreams\/([^/]+)\/cancel$/);
    const archiveMatch = url.pathname.match(/^\/v1\/dreams\/([^/]+)\/archive$/);
    const find = (id) => dreamsStore.find((item) => item.id === id);

    if (req.method === "POST" && cancelMatch) {
      const item = find(cancelMatch[1]);
      if (!item) return fail(404, `dream ${cancelMatch[1]} not found`);
      if (!["pending", "running", "canceled"].includes(item.status))
        return fail(
          400,
          `dream ${item.id} is ${item.status}; only a pending or running dream can be canceled`,
        );
      if (item.status !== "canceled") {
        item.status = "canceled";
        item.ended_at = now();
      }
      res.writeHead(200);
      res.end(JSON.stringify(item));
      return;
    }

    if (req.method === "POST" && archiveMatch) {
      const item = find(archiveMatch[1]);
      if (!item) return fail(404, `dream ${archiveMatch[1]} not found`);
      if (["pending", "running"].includes(item.status))
        return fail(400, `dream ${item.id} is ${item.status}; cancel it first`);
      item.archived_at ??= now();
      res.writeHead(200);
      res.end(JSON.stringify(item));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/dreams") {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return fail(400, "invalid JSON body");
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return fail(400, "dream body must be an object");
      const allowed = new Set([
        "inputs",
        "model",
        "instructions",
        "output_behavior",
      ]);
      for (const key of Object.keys(body))
        if (!allowed.has(key)) return fail(400, `unknown field "${key}"`);
      if (!Array.isArray(body.inputs)) return fail(400, "inputs is required");
      const storeInputs = body.inputs.filter(
        (item) => item?.type === "memory_store",
      );
      const sessionInputs = body.inputs.filter(
        (item) => item?.type === "sessions",
      );
      if (
        storeInputs.length !== 1 ||
        sessionInputs.length !== 1 ||
        body.inputs.length !== 2
      )
        return fail(
          400,
          "inputs must carry exactly one memory_store input and one sessions input",
        );
      if (
        Object.keys(storeInputs[0]).some(
          (key) => !["type", "memory_store_id"].includes(key),
        )
      )
        return fail(400, "invalid memory_store input");
      if (
        Object.keys(sessionInputs[0]).some(
          (key) => !["type", "session_ids"].includes(key),
        )
      )
        return fail(400, "invalid sessions input");
      const inputStore = memoryStoresStore.find(
        (item) => item.id === storeInputs[0].memory_store_id,
      );
      if (!inputStore || inputStore.archived_at)
        return fail(
          400,
          inputStore ? "memory store is archived" : "memory store not found",
        );
      const sessionIds = sessionInputs[0].session_ids;
      if (
        !Array.isArray(sessionIds) ||
        sessionIds.length < 1 ||
        sessionIds.length > 100 ||
        sessionIds.some((id) => typeof id !== "string" || !id)
      )
        return fail(400, "session_ids must carry 1 to 100 session ids");
      if (
        new Set(sessionIds.map((id) => id.replace(/^session_/, "sesn_")))
          .size !== sessionIds.length
      )
        return fail(400, "session_ids must not repeat");
      if (sessionIds.some((id) => !store.has(id.replace(/^session_/, "sesn_"))))
        return fail(400, "session not found");
      const model =
        typeof body.model === "string" ? { id: body.model } : body.model;
      if (
        !model ||
        typeof model.id !== "string" ||
        !model.id ||
        Object.keys(model).some((key) => !["id", "speed"].includes(key)) ||
        (model.speed !== undefined &&
          !["standard", "fast"].includes(model.speed))
      )
        return fail(400, "invalid model");
      if (
        body.instructions != null &&
        (typeof body.instructions !== "string" ||
          [...body.instructions].length < 1 ||
          [...body.instructions].length > 4096)
      )
        return fail(400, "instructions must be 1 to 4096 characters");
      const behavior = body.output_behavior ?? { type: "create_new" };
      if (
        !behavior ||
        !["create_new", "update_existing"].includes(behavior.type)
      )
        return fail(400, "invalid output_behavior");
      if (
        behavior.type === "create_new" &&
        Object.keys(behavior).some((key) => key !== "type")
      )
        return fail(400, "invalid output_behavior");
      if (
        behavior.type === "update_existing" &&
        (behavior.memory_store_id !== inputStore.id ||
          Object.keys(behavior).some(
            (key) => !["type", "memory_store_id"].includes(key),
          ))
      )
        return fail(
          400,
          "output_behavior.memory_store_id must be the job's own memory_store input",
        );
      const timestamp = now();
      const item = {
        id: `drm_mock${String(dreamCounter++).padStart(20, "0")}`,
        type: "dream",
        status: "pending",
        inputs: structuredClone(body.inputs),
        outputs: [],
        model,
        instructions: body.instructions ?? null,
        output_behavior: behavior,
        session_id: null,
        created_at: timestamp,
        ended_at: null,
        archived_at: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        error: null,
      };
      dreamsStore.unshift(item);
      res.writeHead(200);
      res.end(JSON.stringify(item));
      return;
    }

    if (req.method !== "GET" && (itemMatch || cancelMatch || archiveMatch))
      return fail(405, "method not allowed");
  }

  // Session create — exact top-level keys; initial_events is NOT accepted.
  if (req.method === "POST" && url.pathname === "/v1/sessions") {
    res.setHeader("content-type", "application/json");
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", "invalid JSON body"));
      return;
    }
    const allowed = new Set([
      "agent",
      "environment_id",
      "title",
      "metadata",
      "resources",
      "vault_ids",
    ]);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", `unknown field "${key}"`));
        return;
      }
    }
    const agentId =
      typeof body.agent === "string" ? body.agent : body.agent?.id;
    const agent = agentsStore.find((a) => a.id === agentId);
    if (!agent) {
      res.writeHead(404);
      res.end(envelope("not_found_error", "no such agent"));
      return;
    }
    const env = environmentsStore.find((e) => e.id === body.environment_id);
    if (!env || env.archived_at) {
      res.writeHead(env ? 400 : 404);
      res.end(
        envelope(
          env ? "invalid_request_error" : "not_found_error",
          env ? "environment is archived" : "no such environment",
        ),
      );
      return;
    }
    const resources = [];
    for (const resource of body.resources ?? []) {
      if (resource.type === "github_repository") {
        const checkout = resource.checkout ?? null;
        const checkoutValid =
          checkout === null ||
          (checkout &&
            !Array.isArray(checkout) &&
            ((checkout.type === "branch" &&
              typeof checkout.name === "string" &&
              checkout.name.length > 0 &&
              Object.keys(checkout).every((key) =>
                ["type", "name"].includes(key),
              )) ||
              (checkout.type === "commit" &&
                typeof checkout.sha === "string" &&
                /^[0-9a-fA-F]{40}$/.test(checkout.sha) &&
                Object.keys(checkout).every((key) =>
                  ["type", "sha"].includes(key),
                ))));
        if (
          !resource.authorization_token ||
          !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
            resource.url ?? "",
          ) ||
          !checkoutValid
        ) {
          res.writeHead(400);
          res.end(
            envelope(
              "invalid_request_error",
              "repository URL and authorization token are required",
            ),
          );
          return;
        }
        resources.push({
          id: `sesrsc_mock${String(resourceCounter++).padStart(4, "0")}`,
          type: "github_repository",
          url: resource.url,
          mount_path:
            resource.mount_path ||
            `/workspace/${resource.url
              .split("/")
              .at(-1)
              .replace(/\.git$/, "")}`,
          checkout,
          created_at: now(),
          updated_at: now(),
        });
        continue;
      }
      if (resource.type === "memory_store") {
        const access = resource.access ?? "read_write";
        const instructions = resource.instructions ?? null;
        const memory = memoryResources.find(
          (item) => item.memory_store_id === resource.memory_store_id,
        );
        if (
          !memory ||
          !["read_only", "read_write"].includes(access) ||
          (instructions !== null &&
            (typeof instructions !== "string" ||
              [...instructions].length > 4096))
        ) {
          res.writeHead(400);
          res.end(
            envelope(
              "session_resource_not_found_error",
              "memory store not found",
            ),
          );
          return;
        }
        resources.push({
          ...memory,
          access,
          instructions,
        });
        continue;
      }
      if (resource.type !== "file") {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            `'${resource.type}' resources are not supported yet`,
          ),
        );
        return;
      }
      if (!filesStore.some((f) => f.id === resource.file_id)) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such file"));
        return;
      }
      const timestamp = now();
      resources.push({
        id: `sesrsc_mock${String(resourceCounter++).padStart(4, "0")}`,
        type: "file",
        file_id: resource.file_id,
        mount_path:
          resource.mount_path ?? `/mnt/session/uploads/${resource.file_id}`,
        created_at: timestamp,
        updated_at: timestamp,
      });
    }
    const timestamp = now();
    const session = {
      id: `sesn_mock${String(sessionCounter++).padStart(6, "0")}`,
      type: "session",
      agent: mockSessionAgent(agent),
      environment_id: env.id,
      status: "idle",
      title: body.title ?? "",
      metadata: body.metadata ?? {},
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_1h_input_tokens: 0,
          ephemeral_5m_input_tokens: 0,
        },
      },
      stats: { active_seconds: 0, duration_seconds: 0 },
      outcome_evaluations: [],
      resources,
      vault_ids: body.vault_ids ?? [],
      deployment_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    };
    const primaryThread = {
      id: `sthr_mock${String(threadCounter++).padStart(6, "0")}`,
      type: "session_thread",
      session_id: session.id,
      parent_thread_id: null,
      agent: mockThreadAgent(agent),
      status: session.status,
      usage: structuredClone(session.usage),
      stats: { active_seconds: 0, duration_seconds: 0, startup_seconds: 0 },
      created_at: timestamp,
      updated_at: timestamp,
      archived_at: null,
    };
    store.set(session.id, {
      session,
      events: [],
      subscribers: new Set(),
      threads: [primaryThread],
      threadEvents: { [primaryThread.id]: [] },
      threadSubscribers: new Map(),
      timers: new Set(),
    });
    res.writeHead(200);
    res.end(JSON.stringify(session));
    return;
  }

  // Memory stores, live memories, and their append-only version history.
  if (url.pathname.startsWith("/v1/memory_stores")) {
    res.setHeader("content-type", "application/json");
    const storeItem = url.pathname.match(/^\/v1\/memory_stores\/([^/]+)$/);
    const storeArchive = url.pathname.match(
      /^\/v1\/memory_stores\/([^/]+)\/archive$/,
    );
    const memoryCollection = url.pathname.match(
      /^\/v1\/memory_stores\/([^/]+)\/memories$/,
    );
    const memoryItem = url.pathname.match(
      /^\/v1\/memory_stores\/([^/]+)\/memories\/([^/]+)$/,
    );
    const versionRedact = url.pathname.match(
      /^\/v1\/memory_stores\/([^/]+)\/memory_versions\/([^/]+)\/redact$/,
    );
    const fail = (status, type, message) => {
      res.writeHead(status);
      res.end(envelope(type, message));
    };
    const storeFor = (id) =>
      memoryStoresStore.find((candidate) => candidate.id === id);
    const writeStore = (id) => {
      const item = storeFor(id);
      if (!item) {
        fail(404, "not_found_error", `memory store ${id} not found`);
        return null;
      }
      if (item.archived_at) {
        fail(400, "invalid_request_error", `memory store ${id} is archived`);
        return null;
      }
      return item;
    };
    const renderMemory = (memory) =>
      url.searchParams.get("view") === "full"
        ? memory
        : { ...memory, content: null };
    const validPath = (path) =>
      typeof path === "string" &&
      path.startsWith("/") &&
      path !== "/" &&
      path.length <= 1024 &&
      !path
        .slice(1)
        .split("/")
        .some(
          (segment) => segment === "" || segment === "." || segment === "..",
        );
    const digest = (content) =>
      createHash("sha256").update(content).digest("hex");
    const actor = { type: "api_actor", api_key_id: "apikey_ci01" };
    const readJSON = async () => {
      try {
        return JSON.parse(await readBody(req));
      } catch {
        fail(400, "invalid_request_error", "invalid JSON body");
        return null;
      }
    };

    if (req.method === "POST" && url.pathname === "/v1/memory_stores") {
      const body = await readJSON();
      if (!body) return;
      if (typeof body.name !== "string" || body.name.length === 0) {
        fail(400, "invalid_request_error", "name is required");
        return;
      }
      if (
        body.metadata != null &&
        (typeof body.metadata !== "object" ||
          Array.isArray(body.metadata) ||
          Object.values(body.metadata).some(
            (value) => typeof value !== "string",
          ))
      ) {
        fail(400, "invalid_request_error", "metadata values must be strings");
        return;
      }
      const timestamp = now();
      const item = {
        id: `memstore_mock${String(memoryStoreCounter++).padStart(6, "0")}`,
        type: "memory_store",
        name: body.name,
        description: body.description ?? "",
        metadata: body.metadata ?? {},
        created_at: timestamp,
        updated_at: timestamp,
        archived_at: null,
      };
      memoryStoresStore.unshift(item);
      res.writeHead(200);
      res.end(JSON.stringify(item));
      return;
    }

    if (req.method === "POST" && storeArchive) {
      const item = storeFor(storeArchive[1]);
      if (!item) {
        fail(404, "not_found_error", "memory store not found");
        return;
      }
      item.archived_at ??= now();
      res.writeHead(200);
      res.end(JSON.stringify(item));
      return;
    }

    if (req.method === "POST" && storeItem) {
      const item = writeStore(storeItem[1]);
      if (!item) return;
      const body = await readJSON();
      if (!body) return;
      if ("name" in body && (typeof body.name !== "string" || !body.name)) {
        fail(400, "invalid_request_error", "name cannot be cleared");
        return;
      }
      if (
        body.metadata != null &&
        (typeof body.metadata !== "object" ||
          Array.isArray(body.metadata) ||
          Object.values(body.metadata).some(
            (value) => value !== null && typeof value !== "string",
          ))
      ) {
        fail(
          400,
          "invalid_request_error",
          "metadata values must be strings or null",
        );
        return;
      }
      const before = JSON.stringify([
        item.name,
        item.description,
        item.metadata,
      ]);
      if ("name" in body) item.name = body.name;
      if ("description" in body) item.description = body.description ?? "";
      if (body.metadata != null) {
        const metadata = { ...item.metadata };
        for (const [key, value] of Object.entries(body.metadata)) {
          if (value === null) delete metadata[key];
          else metadata[key] = value;
        }
        item.metadata = metadata;
      }
      if (
        before !== JSON.stringify([item.name, item.description, item.metadata])
      )
        item.updated_at = now();
      res.writeHead(200);
      res.end(JSON.stringify(item));
      return;
    }

    if (req.method === "DELETE" && storeItem) {
      const index = memoryStoresStore.findIndex(
        (item) => item.id === storeItem[1],
      );
      if (index < 0) {
        fail(404, "not_found_error", "memory store not found");
        return;
      }
      const [removed] = memoryStoresStore.splice(index, 1);
      memoriesStore = memoriesStore.filter(
        (memory) => memory.memory_store_id !== removed.id,
      );
      memoryVersionsStore = memoryVersionsStore.filter(
        (version) => version.memory_store_id !== removed.id,
      );
      res.writeHead(200);
      res.end(JSON.stringify({ id: removed.id, type: "memory_store_deleted" }));
      return;
    }

    if (req.method === "POST" && memoryCollection) {
      if (!writeStore(memoryCollection[1])) return;
      const body = await readJSON();
      if (!body) return;
      if (!validPath(body.path) || typeof body.content !== "string") {
        fail(400, "invalid_request_error", "path and content are required");
        return;
      }
      if (
        memoriesStore.some(
          (memory) =>
            memory.memory_store_id === memoryCollection[1] &&
            memory.path === body.path,
        )
      ) {
        fail(409, "memory_path_conflict_error", "memory path is occupied");
        return;
      }
      const timestamp = now();
      const memoryId = `mem_mock${String(memoryCounter++).padStart(8, "0")}`;
      const versionId = `memver_mock${String(memoryVersionCounter++).padStart(8, "0")}`;
      const memory = {
        id: memoryId,
        type: "memory",
        memory_store_id: memoryCollection[1],
        path: body.path,
        content: body.content,
        content_size_bytes: Buffer.byteLength(body.content),
        content_sha256: digest(body.content),
        memory_version_id: versionId,
        created_at: timestamp,
        updated_at: timestamp,
      };
      memoryVersionsStore.unshift({
        id: versionId,
        type: "memory_version",
        memory_store_id: memory.memory_store_id,
        memory_id: memory.id,
        operation: "created",
        path: memory.path,
        content: memory.content,
        content_size_bytes: memory.content_size_bytes,
        content_sha256: memory.content_sha256,
        created_by: actor,
        created_at: timestamp,
        redacted_at: null,
        redacted_by: null,
      });
      memoriesStore.push(memory);
      res.writeHead(200);
      res.end(JSON.stringify(renderMemory(memory)));
      return;
    }

    if (req.method === "POST" && memoryItem) {
      if (!writeStore(memoryItem[1])) return;
      const memory = memoriesStore.find(
        (item) =>
          item.memory_store_id === memoryItem[1] && item.id === memoryItem[2],
      );
      if (!memory) {
        fail(404, "not_found_error", "memory not found");
        return;
      }
      const body = await readJSON();
      if (!body) return;
      const path = body.path ?? memory.path;
      const content = body.content ?? memory.content;
      if (!("path" in body) && !("content" in body)) {
        fail(400, "invalid_request_error", "update requires content or path");
        return;
      }
      if (!validPath(path) || typeof content !== "string") {
        fail(400, "invalid_request_error", "invalid memory update");
        return;
      }
      const unchanged = path === memory.path && content === memory.content;
      if (
        body.precondition?.content_sha256 &&
        body.precondition.content_sha256 !== memory.content_sha256 &&
        !unchanged
      ) {
        fail(409, "memory_precondition_failed_error", "memory content changed");
        return;
      }
      if (
        path !== memory.path &&
        memoriesStore.some(
          (item) =>
            item.memory_store_id === memoryItem[1] &&
            item.id !== memory.id &&
            item.path === path,
        )
      ) {
        fail(409, "memory_path_conflict_error", "memory path is occupied");
        return;
      }
      if (!unchanged) {
        const timestamp = now();
        const versionId = `memver_mock${String(memoryVersionCounter++).padStart(8, "0")}`;
        Object.assign(memory, {
          path,
          content,
          content_size_bytes: Buffer.byteLength(content),
          content_sha256: digest(content),
          memory_version_id: versionId,
          updated_at: timestamp,
        });
        memoryVersionsStore.unshift({
          id: versionId,
          type: "memory_version",
          memory_store_id: memory.memory_store_id,
          memory_id: memory.id,
          operation: "modified",
          path,
          content,
          content_size_bytes: memory.content_size_bytes,
          content_sha256: memory.content_sha256,
          created_by: actor,
          created_at: timestamp,
          redacted_at: null,
          redacted_by: null,
        });
      }
      res.writeHead(200);
      res.end(JSON.stringify(renderMemory(memory)));
      return;
    }

    if (req.method === "DELETE" && memoryItem) {
      if (!writeStore(memoryItem[1])) return;
      const index = memoriesStore.findIndex(
        (item) =>
          item.memory_store_id === memoryItem[1] && item.id === memoryItem[2],
      );
      if (index < 0) {
        fail(404, "not_found_error", "memory not found");
        return;
      }
      const memory = memoriesStore[index];
      const expected = url.searchParams.get("expected_content_sha256");
      if (expected && expected !== memory.content_sha256) {
        fail(409, "memory_precondition_failed_error", "memory content changed");
        return;
      }
      const timestamp = now();
      memoryVersionsStore.unshift({
        id: `memver_mock${String(memoryVersionCounter++).padStart(8, "0")}`,
        type: "memory_version",
        memory_store_id: memory.memory_store_id,
        memory_id: memory.id,
        operation: "deleted",
        path: memory.path,
        content: null,
        content_size_bytes: null,
        content_sha256: null,
        created_by: actor,
        created_at: timestamp,
        redacted_at: null,
        redacted_by: null,
      });
      memoriesStore.splice(index, 1);
      res.writeHead(200);
      res.end(JSON.stringify({ id: memory.id, type: "memory_deleted" }));
      return;
    }

    if (req.method === "POST" && versionRedact) {
      const storeItem = storeFor(versionRedact[1]);
      if (!storeItem) {
        fail(404, "not_found_error", "memory store not found");
        return;
      }
      const version = memoryVersionsStore.find(
        (item) =>
          item.memory_store_id === versionRedact[1] &&
          item.id === versionRedact[2],
      );
      if (!version) {
        fail(404, "not_found_error", "memory version not found");
        return;
      }
      if (version.redacted_at) {
        res.writeHead(200);
        res.end(JSON.stringify(version));
        return;
      }
      const head = memoriesStore.find(
        (memory) => memory.memory_version_id === version.id,
      );
      if (head && !storeItem.archived_at) {
        fail(
          400,
          "invalid_request_error",
          "current memory head cannot be redacted",
        );
        return;
      }
      if (head) {
        head.content = "";
        head.content_size_bytes = 0;
        head.content_sha256 = digest("");
        head.updated_at = now();
      }
      version.path = null;
      version.content = null;
      version.content_size_bytes = null;
      version.content_sha256 = null;
      version.redacted_at = now();
      version.redacted_by = actor;
      res.writeHead(200);
      res.end(JSON.stringify(version));
      return;
    }
  }

  // Vault + credential writes. Secrets are write-only: the stored render is
  // built here without them, mirroring vaultcredauth.go.
  if (url.pathname.startsWith("/v1/vaults")) {
    const vaultIdMatch = url.pathname.match(/^\/v1\/vaults\/([^/]+)$/);
    const vaultArchiveMatch = url.pathname.match(
      /^\/v1\/vaults\/([^/]+)\/archive$/,
    );
    const credsPostMatch = url.pathname.match(
      /^\/v1\/vaults\/([^/]+)\/credentials$/,
    );
    const credItemMatch = url.pathname.match(
      /^\/v1\/vaults\/([^/]+)\/credentials\/([^/]+)$/,
    );
    const credArchiveMatch = url.pathname.match(
      /^\/v1\/vaults\/([^/]+)\/credentials\/([^/]+)\/archive$/,
    );
    const credValidateMatch = url.pathname.match(
      /^\/v1\/vaults\/([^/]+)\/credentials\/([^/]+)\/mcp_oauth_validate$/,
    );

    if (req.method === "POST" && url.pathname === "/v1/vaults") {
      res.setHeader("content-type", "application/json");
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "invalid JSON body"));
        return;
      }
      if (typeof body.display_name !== "string" || !body.display_name) {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "display_name is required"));
        return;
      }
      const timestamp = now();
      const vault = {
        id: `vlt_mock${String(vaultCounter++).padStart(6, "0")}`,
        type: "vault",
        display_name: body.display_name,
        metadata: body.metadata ?? {},
        created_at: timestamp,
        updated_at: timestamp,
        archived_at: null,
      };
      vaultsStore.unshift(vault);
      vaultCredsStore[vault.id] = [];
      res.writeHead(200);
      res.end(JSON.stringify(vault));
      return;
    }
    if (req.method === "POST" && vaultArchiveMatch) {
      res.setHeader("content-type", "application/json");
      const vault = vaultsStore.find((v) => v.id === vaultArchiveMatch[1]);
      if (!vault) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such vault"));
        return;
      }
      vault.archived_at ??= now();
      for (const cred of vaultCredsStore[vault.id] ?? []) {
        cred.archived_at ??= vault.archived_at;
      }
      res.writeHead(200);
      res.end(JSON.stringify(vault));
      return;
    }
    if (req.method === "DELETE" && vaultIdMatch) {
      res.setHeader("content-type", "application/json");
      const vault = vaultsStore.find((v) => v.id === vaultIdMatch[1]);
      if (!vault) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such vault"));
        return;
      }
      vaultsStore = vaultsStore.filter((v) => v.id !== vault.id);
      delete vaultCredsStore[vault.id];
      res.writeHead(200);
      res.end(JSON.stringify({ id: vault.id, type: "vault_deleted" }));
      return;
    }
    if (req.method === "POST" && credValidateMatch) {
      res.setHeader("content-type", "application/json");
      const cred = (vaultCredsStore[credValidateMatch[1]] ?? []).find(
        (c) => c.id === credValidateMatch[2],
      );
      if (!cred || cred.auth.type !== "mcp_oauth") {
        res.writeHead(cred ? 400 : 404);
        res.end(
          envelope(
            cred ? "invalid_request_error" : "not_found_error",
            cred ? "credential is not mcp_oauth" : "no such credential",
          ),
        );
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ type: "mcp_oauth_validation", status: "ok" }));
      return;
    }
    if (req.method === "POST" && credsPostMatch) {
      res.setHeader("content-type", "application/json");
      const creds = vaultCredsStore[credsPostMatch[1]];
      if (!creds) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such vault"));
        return;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "invalid JSON body"));
        return;
      }
      const auth = body.auth ?? {};
      // Strip write-only fields into the secret-free rendered document.
      let rendered;
      if (auth.type === "mcp_oauth") {
        if (!auth.access_token) {
          res.writeHead(400);
          res.end(
            envelope("invalid_request_error", "access_token is required"),
          );
          return;
        }
        rendered = {
          type: "mcp_oauth",
          mcp_server_url: auth.mcp_server_url ?? "",
          expires_at: auth.expires_at ?? null,
          refresh: auth.refresh
            ? {
                client_id: auth.refresh.client_id ?? "",
                token_endpoint: auth.refresh.token_endpoint ?? "",
                token_endpoint_auth: {
                  type: auth.refresh.token_endpoint_auth?.type ?? "none",
                },
                resource: auth.refresh.resource ?? null,
                scope: auth.refresh.scope ?? null,
              }
            : null,
        };
      } else if (auth.type === "static_bearer") {
        if (!auth.token) {
          res.writeHead(400);
          res.end(envelope("invalid_request_error", "token is required"));
          return;
        }
        rendered = {
          type: "static_bearer",
          mcp_server_url: auth.mcp_server_url ?? "",
        };
      } else if (auth.type === "environment_variable") {
        if (!auth.secret_name || !auth.secret_value) {
          res.writeHead(400);
          res.end(
            envelope(
              "invalid_request_error",
              "secret_name and secret_value are required",
            ),
          );
          return;
        }
        rendered = {
          type: "environment_variable",
          secret_name: auth.secret_name,
          networking: auth.networking ?? { type: "unrestricted" },
          injection_location: auth.injection_location ?? {
            body: true,
            header: true,
          },
        };
      } else {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "unknown auth type"));
        return;
      }
      const timestamp = now();
      const credential = {
        id: `vcred_mock${String(credCounter++).padStart(6, "0")}`,
        type: "vault_credential",
        vault_id: credsPostMatch[1],
        display_name: body.display_name ?? null,
        auth: rendered,
        metadata: body.metadata ?? {},
        created_at: timestamp,
        updated_at: timestamp,
        archived_at: null,
      };
      creds.unshift(credential);
      res.writeHead(200);
      res.end(JSON.stringify(credential));
      return;
    }
    if (req.method === "POST" && credArchiveMatch) {
      res.setHeader("content-type", "application/json");
      const cred = (vaultCredsStore[credArchiveMatch[1]] ?? []).find(
        (c) => c.id === credArchiveMatch[2],
      );
      if (!cred) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such credential"));
        return;
      }
      cred.archived_at ??= now();
      res.writeHead(200);
      res.end(JSON.stringify(cred));
      return;
    }
    if (req.method === "DELETE" && credItemMatch) {
      res.setHeader("content-type", "application/json");
      const creds = vaultCredsStore[credItemMatch[1]] ?? [];
      const cred = creds.find((c) => c.id === credItemMatch[2]);
      if (!cred) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such credential"));
        return;
      }
      vaultCredsStore[credItemMatch[1]] = creds.filter((c) => c.id !== cred.id);
      res.writeHead(200);
      res.end(
        JSON.stringify({ id: cred.id, type: "vault_credential_deleted" }),
      );
      return;
    }
  }

  // Resource mutations: sessionresources.go (add files, remove files/memory,
  // rotate repository tokens). Tokens are deliberately never stored or echoed.
  const resourceMatch = url.pathname.match(
    /^\/v1\/sessions\/([^/]+)\/resources(?:\/([^/]+))?$/,
  );
  if (resourceMatch && ["POST", "DELETE"].includes(req.method)) {
    res.setHeader("content-type", "application/json");
    const state = store.get(resourceMatch[1]);
    const fail = (status, message) => {
      res.writeHead(status);
      res.end(
        envelope(
          status === 404 ? "not_found_error" : "invalid_request_error",
          message,
        ),
      );
    };
    if (!state) {
      fail(404, "no such session");
      return;
    }
    if (state.session.archived_at) {
      fail(400, "session is archived");
      return;
    }
    const resources = state.session.resources;
    const resourceId = resourceMatch[2];
    const resource = resources.find(
      (item) =>
        (item.type === "memory_store" ? item.memory_store_id : item.id) ===
        resourceId,
    );
    if (resourceId && !resource) {
      fail(404, "no such resource");
      return;
    }
    if (req.method === "DELETE") {
      if (!resource) {
        fail(404, "no such resource");
        return;
      }
      if (resource.type === "github_repository") {
        fail(400, "repositories are attached for the lifetime of the session");
        return;
      }
      state.session.resources = resources.filter((item) => item !== resource);
      res.writeHead(200);
      res.end(
        JSON.stringify({ id: resourceId, type: "session_resource_deleted" }),
      );
      return;
    }
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      fail(400, "invalid JSON");
      return;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      fail(400, "expected object");
      return;
    }
    if (resource) {
      if (resource.type !== "github_repository") {
        fail(400, "only repository tokens can be updated");
        return;
      }
      if (
        typeof body.authorization_token !== "string" ||
        !body.authorization_token
      ) {
        fail(400, "authorization_token is required");
        return;
      }
      resource.updated_at = now();
      res.writeHead(200);
      res.end(JSON.stringify(resource));
      return;
    }
    if (body.type !== "file") {
      fail(400, "only file resources can be added to an existing session");
      return;
    }
    if (!filesStore.some((file) => file.id === body.file_id)) {
      fail(404, "no such file");
      return;
    }
    const mount = body.mount_path || `/mnt/session/uploads/${body.file_id}`;
    if (resources.some((item) => item.mount_path === mount)) {
      fail(400, "mount_path is already in use");
      return;
    }
    const added = {
      id: `sesrsc_mock${String(resourceCounter++).padStart(4, "0")}`,
      type: "file",
      file_id: body.file_id,
      mount_path: mount,
      created_at: now(),
      updated_at: now(),
    };
    resources.push(added);
    res.writeHead(200);
    res.end(JSON.stringify(added));
    return;
  }

  // Skill writes: multipart upload, versions, deletes, zip download.
  if (url.pathname.startsWith("/v1/skills")) {
    const versionsPostMatch = url.pathname.match(
      /^\/v1\/skills\/([^/]+)\/versions$/,
    );
    const versionItemMatch = url.pathname.match(
      /^\/v1\/skills\/([^/]+)\/versions\/([^/]+)$/,
    );
    const contentMatch = url.pathname.match(
      /^\/v1\/skills\/([^/]+)\/versions\/([^/]+)\/content$/,
    );
    const skillItemMatch = url.pathname.match(/^\/v1\/skills\/([^/]+)$/);

    const mintVersion = (skillId, name) => {
      const entry = {
        id: `skver_mock${String(skillVersionCounter++).padStart(4, "0")}`,
        type: "skill_version",
        skill_id: skillId,
        name,
        description: "Uploaded via console",
        created_at: now(),
      };
      skillVersionsStore[skillId] = [
        entry,
        ...(skillVersionsStore[skillId] ?? []),
      ];
      return entry;
    };

    if (req.method === "POST" && url.pathname === "/v1/skills") {
      res.setHeader("content-type", "application/json");
      const body = await readBody(req);
      const head = body.toString("latin1");
      const title =
        /name="display_name"\r?\n\r?\n([^\r\n]+)/.exec(head)?.[1] ??
        `skill-${skillCounter}`;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const skill = {
        id: `skill_mock${String(skillCounter++).padStart(6, "0")}`,
        type: "skill",
        display_name: title,
        latest_version_id: "",
        source: { type: "custom" },
        created_at: now(),
        updated_at: now(),
      };
      const version = mintVersion(skill.id, slug);
      skill.latest_version_id = version.id;
      skillsStore.unshift(skill);
      res.writeHead(200);
      res.end(JSON.stringify(skill));
      return;
    }
    if (req.method === "POST" && versionsPostMatch) {
      res.setHeader("content-type", "application/json");
      const skill = skillsStore.find((s) => s.id === versionsPostMatch[1]);
      if (!skill) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such skill"));
        return;
      }
      if (skill.source.type !== "custom") {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "anthropic skills are read-only"),
        );
        return;
      }
      await readBody(req);
      const version = mintVersion(skill.id, skill.display_name);
      skill.latest_version_id = version.id;
      skill.updated_at = now();
      res.writeHead(200);
      res.end(JSON.stringify(version));
      return;
    }
    if (req.method === "GET" && versionItemMatch) {
      const skill = skillsStore.find((s) => s.id === versionItemMatch[1]);
      const versionId =
        versionItemMatch[2] === "latest"
          ? skill?.latest_version_id
          : versionItemMatch[2];
      const version = (skillVersionsStore[versionItemMatch[1]] ?? []).find(
        (v) => v.id === versionId,
      );
      res.setHeader("content-type", "application/json");
      res.writeHead(version ? 200 : 404);
      res.end(
        version
          ? JSON.stringify(version)
          : envelope("not_found_error", "no such version"),
      );
      return;
    }
    if (req.method === "GET" && contentMatch) {
      const exists = (skillVersionsStore[contentMatch[1]] ?? []).some(
        (v) => v.id === contentMatch[2],
      );
      if (!exists) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(envelope("not_found_error", "no such version"));
        return;
      }
      const zip = Buffer.from("PK\x03\x04mock-zip");
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-length": zip.length,
        "content-disposition": `attachment; filename="skill.zip"`,
      });
      res.end(zip);
      return;
    }
    if (req.method === "DELETE" && versionItemMatch) {
      res.setHeader("content-type", "application/json");
      const versions = skillVersionsStore[versionItemMatch[1]] ?? [];
      const entry = versions.find((v) => v.id === versionItemMatch[2]);
      if (!entry) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such version"));
        return;
      }
      if (versions.length === 1) {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            "cannot delete a Skill's only version. Delete the skill instead.",
          ),
        );
        return;
      }
      skillVersionsStore[versionItemMatch[1]] = versions.filter(
        (v) => v.id !== entry.id,
      );
      const skill = skillsStore.find((s) => s.id === versionItemMatch[1]);
      if (skill) {
        skill.latest_version_id =
          skillVersionsStore[versionItemMatch[1]][0]?.id ?? "";
      }
      res.writeHead(200);
      res.end(JSON.stringify({ id: entry.id, type: "skill_version_deleted" }));
      return;
    }
    if (req.method === "DELETE" && skillItemMatch) {
      res.setHeader("content-type", "application/json");
      const skill = skillsStore.find((s) => s.id === skillItemMatch[1]);
      if (!skill) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such skill"));
        return;
      }
      if (skill.source.type !== "custom") {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "anthropic skills are read-only"),
        );
        return;
      }
      delete skillVersionsStore[skill.id];
      skillsStore = skillsStore.filter((s) => s.id !== skill.id);
      res.writeHead(200);
      res.end(JSON.stringify({ id: skill.id, type: "skill_deleted" }));
      return;
    }
  }

  // Agent writes: create, update (optimistic version lock), archive.
  if (req.method === "POST" && url.pathname.startsWith("/v1/agents")) {
    res.setHeader("content-type", "application/json");
    const archiveMatch = url.pathname.match(/^\/v1\/agents\/([^/]+)\/archive$/);
    if (archiveMatch) {
      const agent = agentsStore.find((a) => a.id === archiveMatch[1]);
      if (!agent) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such agent"));
        return;
      }
      agent.archived_at ??= now();
      res.writeHead(200);
      res.end(JSON.stringify(agent));
      return;
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", "invalid JSON body"));
      return;
    }

    const updateMatch = url.pathname.match(/^\/v1\/agents\/([^/]+)$/);
    if (url.pathname === "/v1/agents" || updateMatch) {
      const agent = updateMatch
        ? agentsStore.find((candidate) => candidate.id === updateMatch[1])
        : undefined;
      if (updateMatch && !agent) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such agent"));
        return;
      }
      const problem = validateAgentBody(body, {
        requireCore: url.pathname === "/v1/agents",
        self: agent,
      });
      if (problem) {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", problem));
        return;
      }
      if (url.pathname === "/v1/agents") {
        res.writeHead(200);
        res.end(JSON.stringify(createAgent(body)));
        return;
      }
      if (agent.archived_at) {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "agent is archived"));
        return;
      }
      const outcome = updateAgent(agent, body);
      if (outcome.conflict) {
        res.writeHead(409);
        res.end(envelope("invalid_request_error", outcome.conflict));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(outcome.agent));
      return;
    }
  }

  // Inbound events — drives the mock state machine.
  const postMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/events$/);
  if (req.method === "POST" && postMatch) {
    const state = store.get(postMatch[1]);
    res.setHeader("content-type", "application/json");
    if (!state) {
      res.writeHead(404);
      res.end(envelope("not_found_error", "no such session"));
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", "invalid JSON body"));
      return;
    }
    if (!Array.isArray(parsed?.events) || parsed.events.length === 0) {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", "events must be non-empty"));
      return;
    }
    const outcome = handleInbound(state, parsed.events);
    if (outcome.error) {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", outcome.error));
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ data: outcome.posted }));
    return;
  }

  res.setHeader("content-type", "application/json");
  const result = route(req, url);
  if (result === null) {
    res.writeHead(404);
    res.end(envelope("not_found_error", `not found: ${url.pathname}`));
    return;
  }
  res.writeHead(200);
  res.end(JSON.stringify(result));
});

// Playwright's webServer runs this file directly (`node …/server.mjs`); the
// conformance suite imports it instead and drives it on an ephemeral port, so
// the listen has to be conditional or the import would bind 18080.
if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  // The stub identity provider binds first, and the platform only inside its
  // callback. Playwright's webServer probes the platform's URL alone, so
  // chaining them is what makes "the platform answered" mean "the provider is
  // up too" — otherwise the console's first `/api/auth/login` could outrun a
  // listen that had not landed yet, and lose a whole pass to one flaky shot.
  //
  // A second port rather than a path prefix on this one: a deployment's issuer
  // is not its platform, and sharing an origin would let a console that
  // confused the two keep passing (#99).
  oidcServer.listen(OIDC_PORT, "127.0.0.1", () => {
    console.log(`mock oidc listening on http://127.0.0.1:${OIDC_PORT}`);
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`mock platform listening on http://127.0.0.1:${PORT}`);
    });
  });
}

export { API_KEY, resetStore, server };
