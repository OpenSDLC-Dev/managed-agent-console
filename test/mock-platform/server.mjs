// Minimal mock of managed-agent-platform's control plane for tests.
// Implements exactly what the console under test needs; shapes follow the
// platform's wire (error envelope, keyset/bi/classic pages, SSE framing,
// request-id header) as documented in docs/plan/01_v1-console.md § Ground
// truth. Sessions carry a tiny state machine so e2e can exercise the HITL
// approval round trip and streamed replies.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import {
  agents,
  multiagentScenario,
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

// Deterministic controls for the captured #8 preview; no wall-clock animation
// race in E2E/fidelity, and the payloads stay byte-derived from the recording.
const previewFrames = readFileSync(
  new URL("../fixtures/recordings-8/preview-00.sse", import.meta.url),
  "utf8",
)
  .split(/\r?\n/)
  .filter((line) => line.startsWith("data: "))
  .map((line) => JSON.parse(line.slice(6)));
const previewDeltas = previewFrames.filter(
  (event) => event.type === "event_delta",
);

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

// internal/unknownkey.Least: of obj's keys outside allowed, the one a refusal
// names — the least in byte order, as Go compares strings (UTF-8 bytes, not
// UTF-16 units), so a body with several names the same one every time.
function leastUnknownKey(obj, allowed) {
  const permitted = new Set(allowed);
  let least;
  for (const key of Object.keys(obj)) {
    if (permitted.has(key)) continue;
    if (
      least === undefined ||
      Buffer.compare(Buffer.from(key), Buffer.from(least)) < 0
    )
      least = key;
  }
  return least;
}

// wire.go rejectUnknownKeys: the reference's strict decoder's sentence (#540).
const unknownField = (key) =>
  `Failed to parse request body: unknown field ${JSON.stringify(key)}`;

// roster.go parseRosterEntry: one roster entry's shape, as an entry naming an
// agent ({id, version}), the coordinator ({isSelf}) or a refusal.
function rosterEntry(entry, index, prefix) {
  const at = (reason) => ({
    refusal: `multiagent.agents[${index}]: ${reason}`,
  });
  // checkAgentID: by domain.WellFormedID, the refusal in the reference's
  // words (#540).
  const malformed = (id) =>
    wellFormedId(id, "agent")
      ? null
      : {
          refusal: `Agent has invalid configuration: subagent ${id} is not a valid agent ID`,
        };
  if (entry === null)
    return {
      refusal: `Failed to parse request: ${prefix}multiagent.agents[${index}]: must be a string or an object (got null)`,
    };
  if (typeof entry === "string")
    return entry === ""
      ? at("agent id must not be empty")
      : (malformed(entry) ?? { id: entry });
  if (typeof entry !== "object" || Array.isArray(entry))
    return at(
      'entry must be an agent id string, {"type":"agent","id",…} or {"type":"self"}',
    );
  if (entry.type !== "self" && entry.type !== "agent")
    return at('entry type must be "agent" or "self"');
  const unknown = leastUnknownKey(
    entry,
    entry.type === "self" ? ["type"] : ["type", "id", "version"],
  );
  if (unknown !== undefined) return { refusal: unknownField(unknown) };
  if (entry.type === "self") return { isSelf: true };
  const idRefusal = requiredStringRefusal(entry, "id");
  if (idRefusal) return at(idRefusal);
  const bad = malformed(entry.id);
  if (bad) return bad;
  // An explicit null version reads as omitted.
  const version = entry.version ?? undefined;
  if (version !== undefined && (!Number.isInteger(version) || version < 1))
    return at("version must be a positive integer");
  return { id: entry.id, version };
}

// roster.go resolveRoster: the roster's shape and every entry's first, then
// whether each member exists and is live, then each pinned version and its
// depth. self is the coordinator on update; prefix opens a path there
// ("agent.", agents.go agentUpdatePath) and is empty on create.
function rosterRefusal(raw, self, prefix) {
  if (typeof raw !== "object" || Array.isArray(raw))
    return "multiagent must be an object";
  const unknown = leastUnknownKey(raw, ["type", "agents"]);
  if (unknown !== undefined) return unknownField(unknown);
  if (raw.type !== "coordinator")
    return 'multiagent.type must be "coordinator"';
  // wire.go rawList: null reads as no entries, anything else not a list is
  // refused.
  if (raw.agents !== null && !Array.isArray(raw.agents))
    return "multiagent.agents must be an array";
  const entries = raw.agents ?? [];
  if (entries.length === 0 && raw.agents !== null)
    return `${prefix}multiagent.coordinator.agents: must contain at least 1 item`;
  if (entries.length === 0 || entries.length > 20)
    return "multiagent.agents must have between 1 and 20 entries";
  // The version this write produces: 1 on create, the next one on update.
  const selfVersion = (self?.version ?? 0) + 1;
  const members = [];
  const seen = new Set();
  let selfSeen = false;
  let typedSelfSeen = false;
  for (const [index, entry] of entries.entries()) {
    const parsed = rosterEntry(entry, index, prefix);
    if (parsed.refusal) return parsed.refusal;
    let id = parsed.id;
    const isSelf = parsed.isSelf || (self !== undefined && id === self.id);
    if (isSelf) {
      if (selfSeen)
        return parsed.isSelf && typedSelfSeen
          ? `${prefix}multiagent.agents.${index}: at most one {"type":"self"} entry is allowed`
          : `multiagent.agents[${index}]: at most one self entry`;
      selfSeen = true;
      typedSelfSeen = !!parsed.isSelf;
      if (
        parsed.version !== undefined &&
        parsed.version !== selfVersion &&
        parsed.version !== selfVersion - 1
      )
        return `multiagent.agents[${index}]: agent ${id} version ${parsed.version} is not this coordinator's current version; use {"type":"self"}`;
      id = self?.id ?? "__self";
    } else {
      members.push({ index, id, version: parsed.version });
    }
    if (seen.has(id))
      return `Agent has invalid configuration: subagent ${id} referenced multiple times`;
    seen.add(id);
  }
  for (const member of members) {
    const target = agentsStore.find((agent) => agent.id === member.id);
    if (!target)
      return `multiagent.agents[${member.index}]: agent ${member.id} not found`;
    if (target.archived_at)
      return `Agent has invalid configuration: subagent ${member.id} is archived`;
    member.version ??= target.version;
  }
  for (const member of members) {
    const snapshot = agentVersionsStore[member.id]?.find(
      (candidate) => candidate.version === member.version,
    );
    if (!snapshot)
      return `Agent has invalid configuration: subagent ${member.id} version ${member.version} not found`;
    if (snapshot.multiagent)
      return `Agent has invalid configuration: subagent ${member.id} has its own subagents; maximum depth is 1`;
  }
  return null;
}

function validateAgentBody(body, { requireCore, self }) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return "agent body must be an object";
  const unknownKey = leastUnknownKey(body, AGENT_KEYS);
  if (unknownKey !== undefined) return unknownField(unknownKey);
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
  // agents.go: the roster resolves once every other field has parsed.
  if (body.multiagent != null)
    return rosterRefusal(body.multiagent, self, requireCore ? "" : "agent.");
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
    return {
      conflict:
        "Concurrent modification detected. Please fetch the latest version and retry.",
    };
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

// ---- session create's resources (internal/api/sessionresources.go) -------

// wire.go requiredString: absent, null or "" is required, and any other value
// that is not a string must be one.
function requiredStringRefusal(obj, key) {
  const value = obj[key];
  if (value !== undefined && value !== null && typeof value !== "string")
    return `${key} must be a string`;
  return value ? null : `${key} is required`;
}

// toolset.Policies' enable resolution for read: a per-tool config's
// `enabled` over default_config's, which defaults to on. An entry whose
// policies do not resolve is skipped by the platform; the mock's agents carry
// none such.
function readToolUsable(agent) {
  return (agent.tools ?? []).some((tool) => {
    if (tool?.type !== "agent_toolset_20260401") return false;
    const read = (tool.configs ?? []).findLast(
      (config) => config.name === "read" && config.enabled != null,
    );
    return read?.enabled ?? tool.default_config?.enabled ?? true;
  });
}

// parseGitHubRepoURL: https://github.com/{owner}/{repo} and nothing else, the
// name a ".git" suffix leaves neither empty, "." nor "..".
function githubRepoName(url) {
  const name = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/([A-Za-z0-9_.-]+)$/
    .exec(url)?.[1]
    .replace(/\.git$/, "");
  return name && name !== "." && name !== ".." ? name : null;
}

// parseCheckout: absent or null is the default branch.
function checkoutRefusal(checkout) {
  if (checkout === undefined || checkout === null) return null;
  if (typeof checkout !== "object" || Array.isArray(checkout))
    return "checkout must be an object";
  if (requiredStringRefusal(checkout, "type"))
    return "checkout.type is required";
  const field =
    checkout.type === "branch"
      ? "name"
      : checkout.type === "commit"
        ? "sha"
        : null;
  if (!field) return 'checkout.type must be "branch" or "commit"';
  const unknown = leastUnknownKey(checkout, ["type", field]);
  if (unknown !== undefined) return unknownField(unknown);
  if (requiredStringRefusal(checkout, field))
    return `checkout.${field} is required for a ${checkout.type} checkout`;
  if (field === "sha" && !/^[0-9a-fA-F]{40}$/.test(checkout.sha))
    return "checkout.sha must be a full 40-character commit SHA";
  return null;
}

// parseSessionResourceInputs: each element's shape, in session create's
// words (#540), and the memory stores' own two rules. Nothing is looked up
// here. Not modelled: a file's id shape and mount path, a repository's mount
// path, and the rules between mounts.
function sessionResourceRefusal(resources) {
  if (resources === undefined || resources === null) return null;
  if (!Array.isArray(resources)) return "resources must be an array";
  const stores = new Set();
  for (const [index, resource] of resources.entries()) {
    if (!resource || typeof resource !== "object" || Array.isArray(resource))
      return "each resource must be an object";
    const typeRefusal = requiredStringRefusal(resource, "type");
    if (typeRefusal) return typeRefusal;
    if (resource.type === "github_repository") {
      const unknown = leastUnknownKey(resource, [
        "type",
        "url",
        "authorization_token",
        "mount_path",
        "checkout",
      ]);
      if (unknown !== undefined) return unknownField(unknown);
      const urlRefusal = requiredStringRefusal(resource, "url");
      if (urlRefusal) return urlRefusal;
      if (!githubRepoName(resource.url))
        return "Invalid `github_repository` resource: invalid github_repository url: must be https://github.com/{owner}/{repo} with no .git suffix";
      // An absent or empty token in the reference's words; a null or
      // non-string one in requiredString's.
      const token = resource.authorization_token;
      if (token === undefined || token === "")
        return `resources.${index}.github_repository.authorization_token: value is required`;
      const tokenRefusal = requiredStringRefusal(
        resource,
        "authorization_token",
      );
      if (tokenRefusal) return tokenRefusal;
      if (Buffer.byteLength(token) > 8192)
        return "authorization_token must be at most 8192 bytes";
      const checkout = checkoutRefusal(resource.checkout);
      if (checkout) return checkout;
      continue;
    }
    if (resource.type === "memory_store") {
      const unknown = leastUnknownKey(resource, [
        "type",
        "memory_store_id",
        "access",
        "instructions",
      ]);
      if (unknown !== undefined) return unknownField(unknown);
      const idRefusal = requiredStringRefusal(resource, "memory_store_id");
      if (idRefusal) return idRefusal;
      const id = resource.memory_store_id;
      // consoleapi.go consoleIDShape: the prefix and a token; the store
      // lookup answers every other id.
      if (!id.startsWith("memstore_") || id === "memstore_")
        return "memory_store_id must be a valid memory store id";
      const access = resource.access ?? "read_write";
      if (typeof access !== "string") return "access must be a string";
      if (access !== "read_only" && access !== "read_write")
        return `Failed to parse request: resources[${index}].access: ${JSON.stringify(access)} is not a valid value; expected one of read_only, read_write`;
      const instructions = resource.instructions ?? null;
      if (instructions !== null && typeof instructions !== "string")
        return "instructions must be a string";
      if (instructions !== null && [...instructions].length > 4096)
        return `resources.${index}.memory_store.instructions: must be at most 4096 characters`;
      if (stores.has(id))
        return `resources contains duplicate memory_store_id: ${id}`;
      stores.add(id);
      if (stores.size > 8)
        return "a session can attach at most 8 memory stores";
      continue;
    }
    if (resource.type !== "file")
      return `resource type ${JSON.stringify(resource.type)} is not supported`;
  }
  return null;
}

// deploymentparse.go parseDeploymentSchedule: a field that is not a string
// fails the decode as a whole. Not modelled: the cron grammar, the IANA zone,
// and an expression with no occurrence in the next year.
function scheduleRefusal(schedule) {
  if (schedule === undefined || schedule === null) return null;
  const keys = ["type", "expression", "timezone"];
  if (
    typeof schedule !== "object" ||
    Array.isArray(schedule) ||
    keys.some(
      (key) => schedule[key] != null && typeof schedule[key] !== "string",
    )
  )
    return "schedule must be an object";
  const unknown = leastUnknownKey(schedule, keys);
  if (unknown !== undefined) return unknownField(unknown);
  if (schedule.type == null) return "schedule.type is required";
  if (schedule.type !== "cron")
    return `schedule.type ${JSON.stringify(schedule.type)} is not supported; the only schedule type is "cron"`;
  if (!schedule.expression) return "schedule.expression is required";
  // An absent timezone in the reference's words (#540); a null or empty one
  // in the platform's.
  if (!schedule.timezone)
    return "timezone" in schedule
      ? "schedule.timezone is required"
      : "schedule.timezone: Field required";
  if ([...schedule.expression].length > 256)
    return "schedule.expression cannot exceed 256 characters";
  return null;
}

// sessions.go parseVaultIDs: absent or null is none, and every entry has to
// carry the vault prefix (a null entry decodes as "").
function vaultIdsRefusal(ids) {
  if (ids === undefined || ids === null) return null;
  if (
    !Array.isArray(ids) ||
    ids.some((id) => id !== null && typeof id !== "string")
  )
    return "vault_ids must be an array of vault ids";
  const bad = ids.map((id) => id ?? "").find((id) => !id.startsWith("vlt_"));
  return bad === undefined
    ? null
    : `vault_ids entry ${JSON.stringify(bad)} is not a vault id`;
}

// A deployment's resources[], in the mock's own words: not split by #190, and
// it still looks files and stores up, which the platform does not until a
// run. Judged where the platform parses resources (parseResourceInputs).
function deploymentResourceRefusal(resources) {
  if (resources === undefined || resources === null) return null;
  if (!Array.isArray(resources)) return "resources must be an array";
  for (const resource of resources) {
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
    if (!valid) return "invalid deployment resource";
  }
  return null;
}

// store.FileLiveSQL: a row whose expiry has passed has no content, so nothing
// may mount it, download it or copy it; its metadata still answers.
const liveFile = (fileId) =>
  filesStore.find(
    (file) =>
      file.id === fileId &&
      (file.expires_at == null || Date.parse(file.expires_at) > Date.now()),
  );

// sessionresources.go mountFileCopy (platform #578): every path that mounts a
// file — session create, resources add, a deployment's fire — mints the
// session's own copy, and the resource echoes the copy's id. A fresh id,
// scoped to the session, never downloadable, the source's filename, size, type
// and expiry, a created_at of its own. The default mount path still names the
// requested id, so callers resolve it before minting. A source missing or
// expired mints nothing (errFileGone), which each caller words its own way:
// session create in the reference's sentence, resources add in the platform's
// `file <id> not found` (both 404 not_found_error), and a deployment's fire as
// a failed run rather than a session (deploymentruns.go runDeployment).
function mintFileCopy(sessionId, fileId) {
  const source = liveFile(fileId);
  if (!source) return null;
  const copy = {
    id: `file_mock${String(fileCounter++).padStart(6, "0")}`,
    type: "file",
    filename: source.filename,
    mime_type: source.mime_type,
    size_bytes: source.size_bytes,
    downloadable: false,
    expires_at: source.expires_at,
    scope: { id: sessionId, type: "session" },
    created_at: now(),
  };
  filesStore.unshift(copy);
  return copy.id;
}

// memsync.Slug: lowercased, every run of anything but an ASCII letter or
// digit one hyphen, none at either end. A store whose name leaves nothing
// mounts under the slug of its id (snapshotMemoryStore).
const memorySlug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

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

/**
 * A thread's first status transition starts its stats and usage: null until
 * then. The platform fills both at that one marker (platform#674), as the
 * recordings do for children that are still running.
 */
function transitionThread(thread, status) {
  thread.status = status;
  thread.updated_at = now();
  if (thread.stats !== null) return;
  thread.stats = { active_seconds: 0, duration_seconds: 0, startup_seconds: 0 };
  thread.usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: {
      ephemeral_1h_input_tokens: 0,
      ephemeral_5m_input_tokens: 0,
    },
  };
}

function setStatus(state, status, stopReason, threadId) {
  if (threadId) {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (thread) transitionThread(thread, status);
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
  const primary = state.threads.find((thread) => !thread.parent_thread_id);
  if (primary) transitionThread(primary, status);
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

// domain.WellFormedID (#841): the prefix, then ASCII letters and digits other
// than I, O and l — how the platform tells a malformed id from an absent one
// on agent and thread paths, where the reference was recorded telling them
// apart. No id the mock serves reads as malformed here: schemas.test.ts holds
// every fixture id to this rule.
const wellFormedId = (id, prefix) =>
  typeof id === "string" &&
  id.startsWith(`${prefix}_`) &&
  /^[0-9A-HJ-NP-Za-km-z]+$/.test(id.slice(prefix.length + 1));

// events.go: a management credential's user.tool_result is the reference's
// 403, in its words, the index prefix included (internal/events inbound.go
// ErrEnvironmentCredentialRequired, #662). The console never sends one.
const toolResultRefusal = (index) =>
  `events[${index}]: \`user.tool_result\` may only be sent with environment credentials ` +
  "(the self-hosted runner's Session-Instance JWT); " +
  "an API key or Console session cannot post this event type";

function handleInbound(state, incoming) {
  const batchInterrupts = incoming.some(
    (candidate) => candidate?.type === "user.interrupt",
  );
  if (
    incoming.filter((candidate) => candidate?.type === "user.define_outcome")
      .length > 1
  )
    return { error: "only one outcome is supported at a time" };
  // internal/events inbound.go normalizeBatch: every event is read for its
  // shape, in order, before any is routed against the session's threads.
  for (const [index, raw] of incoming.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return { error: `events[${index}]: event must be a JSON object` };
    if (!("type" in raw))
      return { error: `events[${index}]: type is required` };
    if (typeof raw.type !== "string")
      return { error: `events[${index}]: type must be a string` };
    if (raw.type === "user.tool_result")
      return { error: toolResultRefusal(index), status: 403 };
    // Inbound types the platform takes and the mock does not model.
    if (["user.custom_tool_result", "system.message"].includes(raw.type))
      return { error: `unsupported inbound event type "${raw.type}"` };
    if (
      ![
        "user.message",
        "user.interrupt",
        "user.tool_confirmation",
        "user.define_outcome",
      ].includes(raw.type)
    )
      // Any other type, platform-emitted or unknown, in the reference's words
      // (normalizeOne, #540).
      return {
        error: `Failed to parse request: events[${index}].type: ${JSON.stringify(raw.type)} is not a valid value`,
      };
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
              )
            : true
      )
        return { error: "rubric must be valid text or a file" };
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
      // outcomes.go ValidateDefineOutcomes: a file rubric names a live row
      // (store.FileLiveSQL, so an expired one is absent) within the cap.
      if (rubric.type === "file") {
        const file = liveFile(rubric.file_id);
        if (!file) return { error: `rubric file ${rubric.file_id} not found` };
        if (file.size_bytes > 256 * 1024)
          return {
            error: `rubric file ${file.id} is ${file.size_bytes} bytes; the rubric cap is ${256 * 1024} bytes`,
          };
      }
    }
    // inbound.go readClaim: a session_thread_id is a string or null.
    const claim = raw.session_thread_id;
    if (claim !== undefined && claim !== null && typeof claim !== "string")
      return {
        error: `events[${index}]: session_thread_id must be a string or null`,
      };
    // inbound.go threadClaim: an interrupt's claim that is no thread id at all
    // is the reference's 400, read before any thread is looked up (#841). A
    // confirmation's claim decides nothing — it lands on its call's thread
    // below.
    if (
      raw.type === "user.interrupt" &&
      typeof claim === "string" &&
      !wellFormedId(claim, "sthr")
    )
      return { error: `Invalid session_thread_id: ${claim}` };
  }
  // route.go RouteInbound: a well-formed claim naming no thread of this
  // session is the reference's 404 (ThreadNotFoundError, #841); one naming an
  // archived thread, then a terminated one, is refused at its index.
  for (const [index, raw] of incoming.entries()) {
    const claim = raw.session_thread_id;
    if (raw.type !== "user.interrupt" || typeof claim !== "string") continue;
    const thread = state.threads.find((candidate) => candidate.id === claim);
    if (!thread) return { error: `Thread not found: ${claim}`, status: 404 };
    if (thread.archived_at)
      return { error: `events[${index}]: thread ${claim} is archived` };
    if (thread.status === "terminated")
      return { error: `events[${index}]: thread ${claim} is terminated` };
  }

  const posted = [];
  const definitions = [];
  for (const raw of incoming) {
    // route.go RouteInbound: a confirmation is written on the thread of the
    // call it answers, whatever thread it names (inbound.go answerClaim, #841).
    const threadId =
      raw.type === "user.tool_confirmation"
        ? state.events.find((event) => event.id === raw.tool_use_id)
            ?.session_thread_id
        : raw.session_thread_id;
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
    if (!threadId)
      for (const child of state.threads.filter(
        (thread) => thread.parent_thread_id && !thread.archived_at,
      )) {
        setStatus(state, "idle", { type: "end_turn" }, child.id);
      }
    setStatus(state, "idle", { type: "end_turn" }, threadId);
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
    const threadId = state.events.find(
      (event) => event.id === confirmation.tool_use_id,
    )?.session_thread_id;
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

// `details` is the object the platform nests inside `error` on the few
// refusals the reference was recorded carrying one (internal/api/errors.go
// withDetails).
function envelope(type, message, details) {
  return JSON.stringify({
    type: "error",
    request_id: `req_mock${requestCounter}`,
    error: details ? { type, message, details } : { type, message },
  });
}

// server.go errUnknownPath: a path no route matches takes the reference's
// words, one letter apart by where the path falls (#540).
const unknownPath = (pathname) =>
  pathname.startsWith("/v1/deployments/") || pathname.startsWith("/v1/dreams/")
    ? "Not Found"
    : "Not found";

// The organization gate both console namespaces share
// (internal/api/consoleapi.go consoleOrganization): `default` is served; a
// UUID, in any of the four spellings isUUID takes, is a foreign
// organization's 401, and anything else the 400 for a segment that is not a
// UUID (managed-agent-platform#820), both in the reference's words (#540).
// Answers and returns true when it refused. The segment is judged decoded, as
// the platform's PathValue hands it over; one that does not decode stays as
// sent and takes the 400 in the platform's own words, as invalid UTF-8 does
// there.
const HEX_UUID = "[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}";
const UUID = new RegExp(
  `^(?:[0-9a-fA-F]{32}|${HEX_UUID}|\\{${HEX_UUID}\\}|urn:uuid:${HEX_UUID})$`,
);
// consoleapi.go uuidInvalidCharacter: the uuid crate's refusal of the first
// character that is neither a hyphen nor a hex digit, at its 1-based position
// in the value as sent (a stripped `{` or `urn:uuid:` counted), or null.
function uuidInvalidCharacter(value) {
  let body = value;
  let offset = 0;
  if (value.length >= 2 && value.startsWith("{") && value.endsWith("}")) {
    body = value.slice(1, -1);
    offset = 1;
  } else if (value.startsWith("urn:uuid:")) {
    body = value.slice("urn:uuid:".length);
    offset = "urn:uuid:".length;
  }
  const index = body.search(/[^0-9a-fA-F-]/);
  if (index < 0) return null;
  const found = String.fromCodePoint(body.codePointAt(index));
  return `invalid character: expected an optional prefix of \`urn:uuid:\` followed by [0-9a-fA-F-], found \`${found}\` at ${index + offset + 1}`;
}
function refuseOrganization(res, org) {
  let decoded = true;
  try {
    org = decodeURIComponent(org);
  } catch {
    // Not a well-formed escape: judged as sent.
    decoded = false;
  }
  if (org === "default") return false;
  if (UUID.test(org)) {
    res.writeHead(401);
    res.end(
      envelope("authentication_error", "Unable to authenticate session.", {
        error_visibility: "user_facing",
      }),
    );
    return true;
  }
  const why = decoded ? uuidInvalidCharacter(org) : null;
  res.writeHead(400);
  res.end(
    envelope(
      "invalid_request_error",
      why
        ? `path.organization_uuid: Input should be a valid UUID, ${why}`
        : `${JSON.stringify(org)} is not an organization id`,
    ),
  );
  return true;
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
  // platform looks up as an environment key and, for one no environment
  // issued, answers with exactly this message (auth.go requireAPIKey, the
  // reference's words since #540). A minted key that was revoked, or a live
  // one on GET /v1/agents, /v1/skills or /v1/skills/{id}, is refused in the
  // reference's words instead (envauth.go answerEnvironmentKey, #840); the
  // mock keeps no issued key's secret, so every key is one no environment
  // issued here.
  return deny("x-api-key header is required");
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
  // page.go: a cursor the list did not mint.
  if (Number.isNaN(start)) return refuse(400, "invalid page cursor");
  const data = rows.slice(start, start + limit);
  const page = {
    data,
    next_page: start + limit < rows.length ? cursor(start + limit) : null,
  };
  if (bi)
    page.prev_page = start > 0 ? cursor(Math.max(0, start - limit)) : null;
  return page;
}

// `== null`: an unarchived memory store omits the key (fixtures.mjs).
const notArchived = (row) => row.archived_at == null;

// What route() answers for a GET it refuses in the platform's words for that
// resource, rather than the catch-all's.
const REFUSED = Symbol("refused");
const refuse = (status, message) => ({ [REFUSED]: { status, message } });
// wire.go checkAgentPathID and threads.go threadIDs: a path id that is no id
// of the resource at all is the reference's 400 (domain.WellFormedID, #841).
const invalidAgentId = () => refuse(400, "Invalid agent ID.");
const invalidThreadId = (id) => refuse(400, `Invalid thread ID: ${id}`);

function route(req, url) {
  const path = url.pathname;
  const includeArchived = url.searchParams.get("include_archived") === "true";

  if (req.method !== "GET") return null;

  if (path === "/v1/agents") {
    let rows = includeArchived ? agentsStore : agentsStore.filter(notArchived);
    const createdGte = url.searchParams.get("created_at[gte]");
    if (createdGte)
      rows = rows.filter(
        (r) => Date.parse(r.created_at) >= Date.parse(createdGte),
      );
    const createdLte = url.searchParams.get("created_at[lte]");
    if (createdLte)
      rows = rows.filter(
        (r) => Date.parse(r.created_at) <= Date.parse(createdLte),
      );
    return keysetPage(rows, url);
  }
  const agentMatch = path.match(/^\/v1\/agents\/([^/]+)$/);
  if (agentMatch) {
    if (!wellFormedId(agentMatch[1], "agent")) return invalidAgentId();
    const agent = agentsStore.find((a) => a.id === agentMatch[1]);
    const version = url.searchParams.get("version");
    // agents.go getAgent: the version parameter is read before the lookup.
    if (
      version &&
      (!/^[+]?\d+$/.test(version) ||
        BigInt(version) < 1n ||
        BigInt(version) > 9223372036854775807n)
    )
      return refuse(400, "version must be a positive integer");
    // agents.go getAgent, and getAgentVersion for a version, which misses an
    // absent agent and an absent version alike.
    const missing = refuse(
      404,
      version
        ? `agent ${agentMatch[1]} version ${BigInt(version)} not found`
        : `agent ${agentMatch[1]} not found`,
    );
    if (!agent) return missing;
    if (!version) return agent;
    // agents.go:getAgentVersion combines versioned config with parent metadata/state.
    const snapshot = agentVersionsStore[agent.id]?.find(
      (row) => row.version === Number(version),
    );
    return snapshot
      ? {
          ...snapshot,
          metadata: agent.metadata,
          created_at: agent.created_at,
          archived_at: agent.archived_at,
        }
      : missing;
  }
  const versionsMatch = path.match(/^\/v1\/agents\/([^/]+)\/versions$/);
  if (versionsMatch) {
    if (!wellFormedId(versionsMatch[1], "agent")) return invalidAgentId();
    // agents.go listAgentVersions.
    const versions = agentVersionsStore[versionsMatch[1]];
    return versions
      ? keysetPage(versions, url)
      : refuse(404, `agent ${versionsMatch[1]} not found`);
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
    return (
      environmentsStore.find((e) => e.id === envMatch[1]) ??
      // environments.go errEnvironmentNotFound (#540).
      refuse(404, `Environment ${envMatch[1]} not found.`)
    );

  if (path === "/v1/sessions") {
    let rows = [...store.values()].map((s) => s.session);
    if (!includeArchived) rows = rows.filter(notArchived);
    const statuses = url.searchParams.getAll("statuses[]");
    for (const s of url.searchParams.getAll("statuses")) statuses.push(s);
    if (statuses.length > 0)
      rows = rows.filter((r) => statuses.includes(r.status));
    const agentId = url.searchParams.get("agent_id");
    if (agentId) rows = rows.filter((r) => r.agent.id === agentId);
    const agentVersion = url.searchParams.get("agent_version");
    if (agentId && agentVersion)
      rows = rows.filter((row) => row.agent.version === Number(agentVersion));
    const deploymentId = url.searchParams.get("deployment_id");
    if (deploymentId)
      rows = rows.filter((row) => row.deployment_id === deploymentId);
    const createdGte = url.searchParams.get("created_at[gte]");
    if (createdGte)
      rows = rows.filter(
        (r) => Date.parse(r.created_at) >= Date.parse(createdGte),
      );
    const createdLte = url.searchParams.get("created_at[lte]");
    if (createdLte)
      rows = rows.filter(
        (r) => Date.parse(r.created_at) <= Date.parse(createdLte),
      );
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
  if (sessionMatch) {
    // sessions.go getSession, the id normalized as normalizeSessionID does:
    // the reference's words for this route (#540).
    const id = sessionMatch[1].replace(/^session_/, "sesn_");
    return store.get(id)?.session ?? refuse(404, `Session not found: ${id}`);
  }

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
      deploymentsStore.find((row) => row.id === deploymentMatch[1]) ??
      // deployments.go getDeployment.
      refuse(404, `deployment ${deploymentMatch[1]} not found`)
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
      // deploymentruns.go getDeploymentRun.
      refuse(404, `deployment run ${deploymentRunMatch[1]} not found`)
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
    return (
      dreamsStore.find((row) => row.id === dreamMatch[1]) ??
      // dreams.go getDream.
      refuse(404, `dream ${dreamMatch[1]} not found`)
    );

  if (path === "/v1/memory_stores") {
    let rows = includeArchived
      ? memoryStoresStore
      : memoryStoresStore.filter(notArchived);
    const createdGte = url.searchParams.get("created_at[gte]");
    const createdLte = url.searchParams.get("created_at[lte]");
    if (createdGte)
      rows = rows.filter(
        (row) => Date.parse(row.created_at) >= Date.parse(createdGte),
      );
    if (createdLte)
      rows = rows.filter(
        (row) => Date.parse(row.created_at) <= Date.parse(createdLte),
      );
    return keysetPage(rows, url);
  }
  const memoryStoreMatch = path.match(/^\/v1\/memory_stores\/([^/]+)$/);
  if (memoryStoreMatch)
    return (
      memoryStoresStore.find((row) => row.id === memoryStoreMatch[1]) ??
      // memorystores.go getMemoryStore: the reference's words (#540).
      refuse(404, `memory store not found: ${memoryStoreMatch[1]}`)
    );
  const memoriesMatch = path.match(/^\/v1\/memory_stores\/([^/]+)\/memories$/);
  if (memoriesMatch) {
    // memories.go checkMemoryStore.
    if (!memoryStoresStore.some((row) => row.id === memoriesMatch[1]))
      return refuse(404, `memory store ${memoriesMatch[1]} not found`);
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
    // memories.go getMemory: the store is read only on a miss, so an absent
    // store is named; the memory's 404 is the reference's words (#540).
    if (!memory)
      return memoryStoresStore.some((row) => row.id === memoryMatch[1])
        ? refuse(404, `memory \`${memoryMatch[2]}\` not found`)
        : refuse(404, `memory store ${memoryMatch[1]} not found`);
    return url.searchParams.get("view") === "basic"
      ? { ...memory, content: null }
      : memory;
  }
  const memoryVersionsMatch = path.match(
    /^\/v1\/memory_stores\/([^/]+)\/memory_versions$/,
  );
  if (memoryVersionsMatch) {
    // memoryversions.go listMemoryVersions, by checkMemoryStore.
    if (!memoryStoresStore.some((row) => row.id === memoryVersionsMatch[1]))
      return refuse(404, `memory store ${memoryVersionsMatch[1]} not found`);
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
    // memoryversions.go getMemoryVersion: the store is not read apart.
    if (!version)
      return refuse(404, `memory version ${versionMatch[2]} not found`);
    return url.searchParams.get("view") === "basic"
      ? { ...version, content: null }
      : version;
  }

  const threadsMatch = path.match(/^\/v1\/sessions\/([^/]+)\/threads$/);
  // The session ids normalized as normalizeSessionID does; a missing session
  // and a missing thread of it are each their own 404 (threads.go
  // sessionExists and loadThread, events.go sessionView).
  const sessionNotFound = (id) => refuse(404, `session ${id} not found`);
  const threadOf = (sessionId, threadId) => {
    const id = sessionId.replace(/^session_/, "sesn_");
    const state = store.get(id);
    if (!state) return { refused: sessionNotFound(id) };
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    return thread
      ? { state, thread }
      : { refused: refuse(404, `thread ${threadId} not found`) };
  };
  if (threadsMatch) {
    const id = threadsMatch[1].replace(/^session_/, "sesn_");
    const state = store.get(id);
    return state ? keysetPage(state.threads, url) : sessionNotFound(id);
  }
  const threadEventsMatch = path.match(
    /^\/v1\/sessions\/([^/]+)\/threads\/([^/]+)\/events$/,
  );
  if (threadEventsMatch) {
    if (!wellFormedId(threadEventsMatch[2], "sthr"))
      return invalidThreadId(threadEventsMatch[2]);
    const { state, thread, refused } = threadOf(
      threadEventsMatch[1],
      threadEventsMatch[2],
    );
    return refused ?? keysetPage(state.threadEvents[thread.id] ?? [], url);
  }
  const threadMatch = path.match(/^\/v1\/sessions\/([^/]+)\/threads\/([^/]+)$/);
  if (threadMatch) {
    if (!wellFormedId(threadMatch[2], "sthr"))
      return invalidThreadId(threadMatch[2]);
    const { thread, refused } = threadOf(threadMatch[1], threadMatch[2]);
    return refused ?? thread;
  }

  const eventsMatch = path.match(/^\/v1\/sessions\/([^/]+)\/events$/);
  if (eventsMatch) {
    const id = eventsMatch[1].replace(/^session_/, "sesn_");
    const state = store.get(id);
    if (!state) return sessionNotFound(id);
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
    return (
      vaultsStore.find((v) => v.id === vaultMatch[1]) ??
      // vaults.go getVault.
      refuse(404, `vault ${vaultMatch[1]} not found`)
    );
  const credsMatch = path.match(/^\/v1\/vaults\/([^/]+)\/credentials$/);
  if (credsMatch) {
    const creds = vaultCredsStore[credsMatch[1]];
    // vaultcredentials.go listVaultCredentials: a missing vault is its 404,
    // not an empty page.
    if (!creds) return refuse(404, `vault ${credsMatch[1]} not found`);
    return keysetPage(includeArchived ? creds : creds.filter(notArchived), url);
  }
  const credMatch = path.match(/^\/v1\/vaults\/([^/]+)\/credentials\/([^/]+)$/);
  if (credMatch)
    return (
      (vaultCredsStore[credMatch[1]] ?? []).find(
        (credential) => credential.id === credMatch[2],
      ) ??
      // vaultcredentials.go errCredentialNotFound, a wrong vault included
      // (#540).
      refuse(404, "Credential not found.")
    );

  if (path === "/v1/skills") {
    let rows = skillsStore;
    const source = url.searchParams.get("source");
    if (source) rows = rows.filter((s) => s.source.type === source);
    return keysetPage(rows, url);
  }
  // skills.go errSkillNotFound: the reference's words (#540), on the skill's
  // get and its versions list alike.
  const skillVersionsMatch = path.match(/^\/v1\/skills\/([^/]+)\/versions$/);
  if (skillVersionsMatch) {
    const versions = skillVersionsStore[skillVersionsMatch[1]];
    return versions
      ? keysetPage(versions, url)
      : refuse(404, `Skill not found: ${skillVersionsMatch[1]}`);
  }
  const skillMatch = path.match(/^\/v1\/skills\/([^/]+)$/);
  if (skillMatch)
    return (
      skillsStore.find((s) => s.id === skillMatch[1]) ??
      refuse(404, `Skill not found: ${skillMatch[1]}`)
    );

  if (path === "/v1/files") {
    // files.go:listFiles carries both dialects; the console uses the position
    // cursor so deleting its boundary row cannot truncate the walk.
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 1000);
    const position = (file) => file.created_at + "|" + file.id;
    let rows = [...filesStore].sort((a, b) =>
      position(b).localeCompare(position(a)),
    );
    const page = url.searchParams.get("page");
    const afterId = url.searchParams.get("after_id");
    if (page) {
      const after = Buffer.from(page, "base64").toString();
      rows = rows.filter((file) => position(file) < after);
    } else if (afterId) {
      const at = rows.findIndex((file) => file.id === afterId);
      rows = at === -1 ? [] : rows.slice(at + 1);
    }
    // A session's files list under its scope_id and nowhere else (#578): the
    // unfiltered list leaves out every scoped row, mount copies and harvested
    // outputs alike. An unknown scope_id matches nothing.
    const scopeId = url.searchParams.get("scope_id");
    rows = scopeId
      ? rows.filter((file) => file.scope?.id === scopeId)
      : rows.filter((file) => !file.scope);
    const data = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return {
      data,
      next_page: hasMore
        ? Buffer.from(position(data.at(-1))).toString("base64")
        : null,
      has_more: hasMore,
      first_id: data[0]?.id ?? null,
      last_id: data.at(-1)?.id ?? null,
    };
  }
  const fileMatch = path.match(/^\/v1\/files\/([^/]+)$/);
  if (fileMatch)
    return (
      filesStore.find((f) => f.id === fileMatch[1]) ??
      // files.go errFileNotFound: the reference's words (#540).
      refuse(404, `File \`${fileMatch[1]}\` not found.`)
    );

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

  if (req.method === "POST" && url.pathname === "/__live-preview") {
    const state = store.get("sesn_gatedbash00000000001");
    const step = url.searchParams.get("step");
    const send = (event) =>
      event.id
        ? broadcast(state, event)
        : broadcastRaw(state, "message", event);
    if (step === "setup") {
      cancelStreams(state);
      for (const subscriber of state.subscribers) subscriber.end();
      state.subscribers.clear();
      state.events = [];
      state.session.status = "idle";
      state.session.title = "Live response preview";
      state.streamOffline = false;
    } else if (step === "thinking") {
      setStatus(state, "running");
      send(previewFrames.find((event) => event.type === "user.message"));
      send(
        previewFrames.find((event) => event.event?.type === "agent.thinking"),
      );
    } else if (step === "text") {
      send(previewFrames.find((event) => event.type === "agent.thinking"));
      send(
        previewFrames.find((event) => event.event?.type === "agent.message"),
      );
      previewDeltas.slice(0, 40).forEach(send);
    } else if (step === "finish") {
      previewDeltas.slice(40).forEach(send);
      send(previewFrames.find((event) => event.type === "agent.message"));
      setStatus(state, "idle", { type: "end_turn" });
    } else if (step === "drop") {
      state.streamOffline = true;
      for (const subscriber of state.subscribers) subscriber.end();
      state.subscribers.clear();
    } else if (step === "resume") {
      state.streamOffline = false;
    } else {
      res.writeHead(400);
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Test hook: restore fixtures between e2e tests. No auth on purpose.
  if (req.method === "POST" && url.pathname === "/__multiagent") {
    const fixture = multiagentScenario(
      url.searchParams.get("running") === "true",
    );
    const state = store.get(fixture.session.id);
    Object.assign(state, fixture);
    res.setHeader("content-type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify({ id: fixture.session.id }));
    return;
  }
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

  // Test hook: a file's expiry passes, as the platform's own tests expire one
  // (filesexpiry_test.go expire). `/__reset` restores the fixtures.
  if (req.method === "POST" && url.pathname === "/__expire-file") {
    const file = filesStore.find((f) => f.id === url.searchParams.get("id"));
    if (file) file.expires_at = new Date(Date.now() - 1000).toISOString();
    res.setHeader("content-type", "application/json");
    res.writeHead(file ? 200 : 404);
    res.end(JSON.stringify({ ok: !!file }));
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
    res.end(envelope("not_found_error", unknownPath(url.pathname)));
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
    res.end(envelope("not_found_error", unknownPath(url.pathname)));
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
    res.end(envelope("not_found_error", unknownPath(url.pathname)));
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
    if (refuseOrganization(res, org)) return;
    // consoleapikeys.go consoleWorkspace: the reference's 404, words and
    // details included; it does not name the workspace.
    if (workspace !== "default") {
      res.writeHead(404);
      res.end(
        envelope("not_found_error", "Not found", {
          error_visibility: "user_facing",
        }),
      );
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
      // consoleapikeys.go apiKeyCreateName: taken as sent, nothing trimmed, and
      // bounded at the reference's recorded 500 with its recorded message. A
      // missing, non-string or empty name is refused in the reference's words
      // too (#540); a null one in the platform's own.
      const nameRefusal =
        body.name === undefined
          ? "name: Field required"
          : body.name === null
            ? "name is required"
            : typeof body.name !== "string"
              ? "name: Input should be a valid string"
              : body.name === ""
                ? "name: String should have at least 1 character"
                : null;
      if (nameRefusal) {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", nameRefusal));
        return;
      }
      const name = body.name;
      if ([...name].length > 500) {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            "name: String should have at most 500 characters",
          ),
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
        res.end(envelope("not_found_error", `API Key \`${keyId}\` not found.`));
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
            "Archived API keys cannot be updated.",
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
            "Expired API keys can only be deleted, not renamed or reactivated.",
          ),
        );
        return;
      }
      if (status !== null) row.status = status;
      // A rename is held to the create's rule, so it is stored as sent too.
      if (typeof body.name === "string") row.name = body.name;
      res.writeHead(200);
      res.end(JSON.stringify(render(row)));
      return;
    }

    res.writeHead(405);
    res.end(envelope("invalid_request_error", "Method Not Allowed"));
    return;
  }

  // ---- console API (internal/api/consoleapi.go), reached through the
  // console's own /api/oauth passthrough. `default` is the only organization
  // the platform answers for (refuseOrganization).
  const tokensMatch = url.pathname.match(
    /^\/api\/oauth\/organizations\/([^/]+)\/environments\/([^/]+)\/tokens$/,
  );
  const revokeMatch = url.pathname.match(
    /^\/api\/oauth\/organizations\/([^/]+)\/environments\/([^/]+)\/tokens\/([^/]+)\/revoke$/,
  );
  if (tokensMatch || revokeMatch) {
    res.setHeader("content-type", "application/json");
    const [, org, envId] = tokensMatch ?? revokeMatch;
    if (refuseOrganization(res, org)) return;
    const env = environmentsStore.find((e) => e.id === envId);
    if (!env) {
      res.writeHead(404);
      res.end(envelope("not_found_error", `Environment ${envId} not found.`));
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
      // Issued on any environment, a cloud or an archived one included, as the
      // reference issues (consoleapi.go createEnvironmentKey; #820).
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
        res.end(envelope("not_found_error", "Token not found"));
        return;
      }
      key.revoked_at ??= now();
      // Bodiless 204 — the shape `handleNoContent` answers with.
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(405);
    res.end(envelope("invalid_request_error", "Method Not Allowed"));
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
    // threads.go threadIDs: the thread id's shape before any lookup, and before the
    // preview's simulated outage, which stands in for a connection the
    // platform would only open for a well-formed id.
    if (threadStreamMatch && !wellFormedId(threadStreamMatch[2], "sthr")) {
      res.setHeader("content-type", "application/json");
      res.writeHead(400);
      res.end(
        envelope(
          "invalid_request_error",
          `Invalid thread ID: ${threadStreamMatch[2]}`,
        ),
      );
      return;
    }
    if (state?.streamOffline) {
      res.writeHead(503);
      res.end();
      return;
    }
    // events.go sessionView and threads.go loadThread: the session's 404,
    // then the thread's.
    if (!state) {
      res.setHeader("content-type", "application/json");
      res.writeHead(404);
      res.end(envelope("not_found_error", `session ${match[1]} not found`));
      return;
    }
    if (
      threadStreamMatch &&
      !state.threads.some((thread) => thread.id === threadStreamMatch[2])
    ) {
      res.setHeader("content-type", "application/json");
      res.writeHead(404);
      res.end(
        envelope("not_found_error", `thread ${threadStreamMatch[2]} not found`),
      );
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
    // threads.go threadIDs: the thread id's shape before any lookup.
    if (!wellFormedId(archiveThreadMatch[2], "sthr")) {
      res.writeHead(400);
      res.end(
        envelope(
          "invalid_request_error",
          `Invalid thread ID: ${archiveThreadMatch[2]}`,
        ),
      );
      return;
    }
    const state = store.get(archiveThreadMatch[1]);
    const thread = state?.threads.find(
      (candidate) => candidate.id === archiveThreadMatch[2],
    );
    // threads.go lockSession, then loadThread.
    if (!thread) {
      res.writeHead(404);
      res.end(
        envelope(
          "not_found_error",
          state
            ? `thread ${archiveThreadMatch[2]} not found`
            : `session ${archiveThreadMatch[1]} not found`,
        ),
      );
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
    // environments.go errEnvironmentNotFound, every environment lookup's 404.
    const notFound = (id) => {
      res.writeHead(404);
      res.end(envelope("not_found_error", `Environment ${id} not found.`));
    };
    // environments.go normalizeEnvConfig: a string tag it does not know in the
    // reference's words (#540); an absent or non-string type in its own.
    const configTypeRefusal = (kind) =>
      typeof kind === "string"
        ? `config: Input tag '${kind}' found using 'type' does not match any of the expected tags: 'cloud', 'self_hosted'`
        : 'config.type must be "cloud" or "self_hosted"';
    // environments.go environmentTypeName: a kind as the kind-change refusal
    // names it.
    const typeName = (kind) => (kind === "self_hosted" ? "BYOC" : "Cloud");
    if (req.method === "DELETE" && idMatch) {
      res.setHeader("content-type", "application/json");
      // page.go parseBoolParam, read before the lookup: strconv.ParseBool's
      // spellings, absent or empty being false.
      const forceParam = url.searchParams.get("force") ?? "";
      const force = ["1", "t", "T", "TRUE", "true", "True"].includes(
        forceParam,
      );
      if (
        !force &&
        !["", "0", "f", "F", "FALSE", "false", "False"].includes(forceParam)
      ) {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "force must be true or false"),
        );
        return;
      }
      const env = environmentsStore.find((e) => e.id === idMatch[1]);
      if (!env) {
        notFound(idMatch[1]);
        return;
      }
      // environments.go deleteEnvironment refuses a self_hosted environment
      // with undrained work in its queue (selfHostedQueueRefusal, the
      // reference's 409, lifted by force). Not modelled: the mock keeps no
      // work queue.
      //
      // environments.go environmentStillReferenced: any deployment holding the
      // environment, archived ones included, is the platform's own 400, forced
      // or not, naming up to five of them (archived first, then oldest) and
      // counting the sessions beside them. Sessions alone are the reference's
      // 409 in its sentence, every session counted, archived ones included,
      // with `x-should-retry: false` (#841); forced, the same 409 in the
      // platform's own words, since force deletes no session there.
      const sessions = [...store.values()].filter(
        (s) => s.session.environment_id === env.id,
      ).length;
      const holding = deploymentsStore
        .filter((d) => d.environment_id === env.id)
        .sort(
          (a, b) =>
            (a.archived_at == null) - (b.archived_at == null) ||
            Date.parse(a.created_at) - Date.parse(b.created_at) ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        );
      if (holding.length > 0) {
        const plural = (n, noun) => (n === 1 ? noun : `${noun}s`);
        const named = holding.slice(0, 5).map((d) => d.id);
        let list = named.join(", ");
        if (holding.length > named.length)
          list += ` and ${holding.length - named.length} more`;
        let blockers = `${holding.length} ${plural(holding.length, "deployment")} (${list})`;
        if (sessions > 0)
          blockers += ` and ${sessions} ${plural(sessions, "session")}`;
        const stuck = holding.filter((d) => d.archived_at).length;
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            stuck > 0
              ? `environment ${env.id} is referenced by ${blockers}, ${stuck} of them archived and so unmovable; it can no longer be deleted${env.archived_at ? "" : " — archive it instead"}`
              : `environment ${env.id} is referenced by ${blockers}; ${sessions > 0 ? "point each deployment at another environment and delete the sessions" : "point each at another environment"} and the delete will go through`,
          ),
        );
        return;
      }
      if (sessions > 0) {
        res.setHeader("x-should-retry", "false");
        res.writeHead(409);
        res.end(
          envelope(
            "invalid_request_error",
            force
              ? `environment ${env.id} still has sessions; delete them first`
              : `Environment has ${sessions} active sessions. Use force=true to delete anyway.`,
          ),
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
        notFound(archiveMatch[1]);
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
      const unknownKey = leastUnknownKey(body, allowed);
      if (unknownKey !== undefined) {
        res.writeHead(400);
        // environments.go rejectExtraEnvironmentKeys: pydantic's words.
        res.end(
          envelope(
            "invalid_request_error",
            `${unknownKey}: Extra inputs are not permitted`,
          ),
        );
        return;
      }
      if (body.metadata != null) {
        const create = url.pathname === "/v1/environments";
        if (
          typeof body.metadata !== "object" ||
          Array.isArray(body.metadata) ||
          Object.entries(body.metadata).some(
            ([key, value]) =>
              (typeof value !== "string" && !(value === null && !create)) ||
              (key === "" && !(!create && (value === "" || value === null))),
          )
        ) {
          res.writeHead(400);
          res.end(
            envelope("invalid_request_error", "invalid environment metadata"),
          );
          return;
        }
      }
      if (url.pathname === "/v1/environments") {
        if (typeof body.name !== "string" || !body.name) {
          res.writeHead(400);
          res.end(
            envelope(
              "invalid_request_error",
              // An absent name in the reference's words (#540).
              body.name === undefined
                ? "name: Field required"
                : "name is required",
            ),
          );
          return;
        }
        const kind = body.config?.type;
        if (kind !== "cloud" && kind !== "self_hosted") {
          res.writeHead(400);
          res.end(envelope("invalid_request_error", configTypeRefusal(kind)));
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
        notFound(idMatch[1]);
        return;
      }
      const kind = body.config?.type;
      if (kind && kind !== env.config.type) {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            kind === "cloud" || kind === "self_hosted"
              ? `Cannot change environment type from ${typeName(env.config.type)} to ${typeName(kind)}`
              : configTypeRefusal(kind),
          ),
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
      // environments.go uses patchMetadata(..., true): null and empty strings remove keys.
      if (body.metadata != null)
        for (const [key, value] of Object.entries(body.metadata)) {
          if (value === null || value === "") delete env.metadata[key];
          else
            Object.defineProperty(env.metadata, key, {
              value,
              enumerable: true,
              configurable: true,
              writable: true,
            });
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
      expires_at: null,
      created_at: now(),
    };
    filesStore.unshift(file);
    res.writeHead(200);
    res.end(JSON.stringify(file));
    return;
  }
  // files.go downloadFile on the management lane: a missing or expired file
  // is the platform's own 404, then a file that is not downloadable — an
  // upload, or a session's copy of one — the reference's 400, details and
  // header included (#540, #664, #842). The bytes stand in for an output's
  // content at its recorded size.
  const fileContentMatch = url.pathname.match(
    /^\/v1\/files\/([^/]+)\/content$/,
  );
  if (req.method === "GET" && fileContentMatch) {
    const id = fileContentMatch[1];
    const file = liveFile(id);
    if (!file || !file.downloadable) {
      res.setHeader("content-type", "application/json");
      if (file) res.setHeader("x-should-retry", "false");
      res.writeHead(file ? 400 : 404);
      res.end(
        file
          ? envelope(
              "invalid_request_error",
              `File \`${id}\` is not downloadable. Only files generated by a tool (for example, the code execution tool) can be downloaded.`,
              { error_code: "file_not_downloadable" },
            )
          : envelope("not_found_error", `file ${id} not found`),
      );
      return;
    }
    const bytes = Buffer.alloc(file.size_bytes);
    res.writeHead(200, {
      "content-type": file.mime_type,
      "content-length": bytes.length,
      "content-disposition": `attachment; filename=${JSON.stringify(file.filename)}`,
    });
    res.end(bytes);
    return;
  }
  const fileDeleteMatch = url.pathname.match(/^\/v1\/files\/([^/]+)$/);
  if (req.method === "DELETE" && fileDeleteMatch) {
    res.setHeader("content-type", "application/json");
    const file = filesStore.find((f) => f.id === fileDeleteMatch[1]);
    if (!file) {
      // files.go deleteFile: checkFileID's words, which a malformed id and
      // an absent one share.
      res.writeHead(404);
      res.end(
        envelope("not_found_error", `file ${fileDeleteMatch[1]} not found`),
      );
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
      // sessions.go requireNotRunning: each route's recorded sentence (#540).
      fail(
        400,
        archiving
          ? `Session ${session.id} cannot be archived while its status is "running". Only pending or idle sessions may be archived.`
          : "Cannot delete session while it is running. Send an interrupt event or wait for the session to complete.",
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
      filesStore = filesStore.filter(
        (file) =>
          file.scope?.type !== "session" || file.scope.id !== session.id,
      );
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
      // sessions.go updateSession: an unknown key is the strict decoder's
      // refusal; agent and vault_ids are fields the mock does not support.
      const unknownKey = leastUnknownKey(body, [
        "title",
        "metadata",
        "agent",
        "vault_ids",
      ]);
      if (unknownKey !== undefined) {
        fail(400, unknownField(unknownKey));
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
        // deployments.go loadDeployment.
        res.writeHead(404);
        res.end(
          envelope("not_found_error", `deployment ${actionMatch[1]} not found`),
        );
        return;
      }
      const action = actionMatch[2];
      if (deployment.archived_at && action !== "archive") {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            "Cannot modify archived deployment",
          ),
        );
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
      const run = {
        id: `drun_mock${String(deploymentRunCounter++).padStart(6, "0")}`,
        type: "deployment_run",
        deployment_id: deployment.id,
        trigger_context: { type: "manual" },
        session_id: null,
        error: null,
        agent: structuredClone(deployment.agent),
        created_at: timestamp,
      };
      // deploymentruns.go runDeployment: the fire creates its session as a
      // create would, and a classified refusal settles the run on its error
      // arm instead — no session made, still a 200, the run object being the
      // endpoint's only success shape. materializeResourceInputs walks the
      // resources in order, so the first one gone is the error: a memory
      // store missing or archived (snapshotMemoryStore, in runWording's
      // sentences), a file's source deleted or expired (errFileGone).
      let refusal = null;
      for (const resource of deployment.resources) {
        if (resource.type === "memory_store") {
          const item = memoryStoresStore.find(
            (candidate) => candidate.id === resource.memory_store_id,
          );
          if (!item)
            refusal = {
              type: "session_resource_not_found_error",
              message:
                "session creation rejected: a referenced resource was not found; check deployment configuration",
            };
          else if (item.archived_at)
            refusal = {
              type: "memory_store_archived_error",
              message:
                "session creation rejected: a referenced memory store is archived; check deployment resources",
            };
        } else if (resource.type === "file" && !liveFile(resource.file_id))
          refusal = {
            type: "file_not_found_error",
            message: `file ${resource.file_id} not found`,
          };
        if (refusal) break;
      }
      if (refusal) {
        run.error = refusal;
        deploymentRunsStore.unshift(run);
        res.writeHead(200);
        res.end(JSON.stringify(run));
        return;
      }
      const sessionId = `sesn_dep${String(sessionCounter++).padStart(6, "0")}`;
      const sessionResources = deployment.resources.map((resource) => {
        if (resource.type === "memory_store") {
          // snapshotMemoryStore: the store's name and description as they
          // stand at the fire.
          const item = memoryStoresStore.find(
            (candidate) => candidate.id === resource.memory_store_id,
          );
          return {
            type: "memory_store",
            memory_store_id: item.id,
            access: resource.access ?? "read_write",
            instructions: resource.instructions ?? null,
            description: item.description,
            name: item.name,
            mount_path: `/mnt/memory/${memorySlug(item.name) || memorySlug(item.id)}`,
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
        // The fire mints the session's own copy; the deployment keeps
        // naming the upload (mintFileCopy).
        return {
          id: `sesrsc_mock${String(resourceCounter++).padStart(4, "0")}`,
          type: "file",
          file_id: mintFileCopy(sessionId, resource.file_id),
          mount_path:
            resource.mount_path ?? `/mnt/session/uploads/${resource.file_id}`,
          created_at: timestamp,
          updated_at: timestamp,
        };
      });
      const session = {
        id: sessionId,
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
        id: `sthr_dep${String(threadCounter++).padStart(6, "0")}`,
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
      run.session_id = session.id;
      deploymentRunsStore.unshift(run);
      res.writeHead(200);
      res.end(JSON.stringify(run));
      return;
    }

    // deployments.go createDeployment and updateDeployment judge all the body
    // says before their transaction (unknown keys, create's required fields,
    // initial_events, create's vault_ids, resources, the bounds and the
    // schedule), then the row an update names, then the environment, the
    // vaults and the agent: a lookup never outranks a malformed body.
    const itemMatch = url.pathname.match(/^\/v1\/deployments\/([^/]+)$/);
    const fail = (status, message) => {
      res.writeHead(status);
      res.end(
        envelope(
          status === 404 ? "not_found_error" : "invalid_request_error",
          message,
        ),
      );
    };
    const unknownKey = leastUnknownKey(body, [
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
    if (unknownKey !== undefined) return fail(400, unknownField(unknownKey));
    const initialEvents = body.initial_events;
    const parseRefusal =
      // name, environment_id and agent, then an absent initial_events in the
      // reference's words (#540).
      (itemMatch
        ? null
        : (requiredStringRefusal(body, "name") ??
          requiredStringRefusal(body, "environment_id") ??
          (body.agent == null ? "agent is required" : null) ??
          ("initial_events" in body
            ? null
            : "initial_events: Field required"))) ??
      (initialEvents != null && !Array.isArray(initialEvents)
        ? "initial_events must be an array of events"
        : null) ??
      (itemMatch ? null : vaultIdsRefusal(body.vault_ids)) ??
      deploymentResourceRefusal(body.resources) ??
      // validateDeploymentBounds' floor; an update's comes once it merges.
      (!itemMatch && (initialEvents ?? []).length === 0
        ? "initial_events must contain at least 1 event"
        : null) ??
      scheduleRefusal(body.schedule);
    if (parseRefusal) return fail(400, parseRefusal);

    const existing = itemMatch
      ? deploymentsStore.find((candidate) => candidate.id === itemMatch[1])
      : null;
    // deployments.go loadDeployment.
    if (itemMatch && !existing)
      return fail(404, `deployment ${itemMatch[1]} not found`);
    if (existing?.archived_at)
      return fail(400, "Cannot modify archived deployment");
    // An update reads only the fields it sets, and refuses to clear the ones
    // that cannot be.
    let environmentId = existing?.environment_id;
    if (!existing || "environment_id" in body) {
      if (body.environment_id === null)
        return fail(400, "environment_id cannot be cleared");
      environmentId = body.environment_id;
      // deployments.go requireLiveEnvironment.
      const environment = environmentsStore.find(
        (candidate) => candidate.id === environmentId,
      );
      if (!environment)
        return fail(404, `Environment ${environmentId} not found.`);
      if (environment.archived_at)
        return fail(400, `environment ${environmentId} is archived`);
    }
    if (!existing || "vault_ids" in body) {
      const refusal = existing ? vaultIdsRefusal(body.vault_ids) : null;
      if (refusal) return fail(400, refusal);
      // sessions.go validateAttachedVaults: both refusals are 400s.
      for (const id of body.vault_ids ?? []) {
        const vault = vaultsStore.find((candidate) => candidate.id === id);
        if (!vault) return fail(400, `vault ${id} not found`);
        if (vault.archived_at) return fail(400, `vault ${id} is archived`);
      }
    }
    let agentRef = existing?.agent;
    if (!existing || "agent" in body) {
      if (body.agent === null) return fail(400, "agent cannot be cleared");
      // deploymentparse.go resolveDeploymentAgent: the version's floor, then
      // the agent's row and its archive state, then the pinned version.
      const agentId =
        typeof body.agent === "string" ? body.agent : body.agent?.id;
      const version =
        typeof body.agent === "object"
          ? (body.agent.version ?? undefined)
          : undefined;
      if (version !== undefined && (!Number.isInteger(version) || version < 1))
        return fail(400, "agent.version must be a positive integer");
      const agent = agentsStore.find((candidate) => candidate.id === agentId);
      if (!agent) return fail(404, `agent ${agentId} not found`);
      if (agent.archived_at) return fail(400, `agent ${agentId} is archived`);
      if (
        version !== undefined &&
        !agentVersionsStore[agentId]?.some(
          (candidate) => candidate.version === version,
        )
      )
        return fail(404, `agent ${agentId} version ${version} not found`);
      agentRef = {
        type: "agent",
        id: agentId,
        version: version ?? agent.version,
      };
    }
    if (existing && "initial_events" in body) {
      if (initialEvents === null)
        return fail(400, "initial_events cannot be cleared");
      if (initialEvents.length === 0)
        return fail(400, "initial_events must contain at least 1 event");
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
      existing.agent = agentRef;
      existing.environment_id = environmentId;
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
      agent: agentRef,
      environment_id: environmentId,
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
      const unknownKey = leastUnknownKey(body, allowed);
      if (unknownKey !== undefined) return fail(400, unknownField(unknownKey));
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
      return fail(405, "Method Not Allowed");
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
    const unknownKey = leastUnknownKey(body, allowed);
    if (unknownKey !== undefined) {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", unknownField(unknownKey)));
      return;
    }
    // sessions.go createSession judges the body before it looks anything up:
    // environment_id and agent present, then every resource's shape
    // (parseSessionResourceInputs). Inside the create it then reads the
    // environment, the agent, and last the stores and files
    // (materializeResourceInputs). initial_events, which the mock does not
    // model, stays an unknown key here.
    const bodyRefusal =
      requiredStringRefusal(body, "environment_id") ??
      (body.agent == null ? "agent: value is required" : null) ??
      sessionResourceRefusal(body.resources);
    if (bodyRefusal) {
      res.writeHead(400);
      res.end(envelope("invalid_request_error", bodyRefusal));
      return;
    }
    const lookupRefusal = (status, message) => {
      res.writeHead(status);
      res.end(
        envelope(
          status === 404 ? "not_found_error" : "invalid_request_error",
          message,
        ),
      );
    };
    // createSessionInTx, worded by requestWording where the reference was
    // recorded (#540).
    const env = environmentsStore.find((e) => e.id === body.environment_id);
    if (!env)
      return lookupRefusal(
        404,
        `Environment ${body.environment_id} not found.`,
      );
    if (env.archived_at)
      return lookupRefusal(400, `environment ${env.id} is archived`);
    // sessions.go resolveAgent: the union's shape, then the row. A pinned
    // version and the overrides are not modelled: the session carries the
    // agent's current spec.
    if (typeof body.agent !== "string") {
      if (typeof body.agent !== "object" || Array.isArray(body.agent))
        return lookupRefusal(
          400,
          "agent must be an agent id string or an agent reference object",
        );
      if (body.agent.type == null)
        return lookupRefusal(
          400,
          "Failed to parse request: agent.selector.type: Field required",
        );
      if (!["agent", "agent_with_overrides"].includes(body.agent.type))
        return lookupRefusal(
          400,
          `Failed to parse request: agent.selector.type: ${JSON.stringify(body.agent.type)} is not a valid value`,
        );
      if (!body.agent.id) return lookupRefusal(400, "agent.id is required");
    }
    const agentId = typeof body.agent === "string" ? body.agent : body.agent.id;
    const agent = agentsStore.find((a) => a.id === agentId);
    if (!agent) return lookupRefusal(404, `agent ${agentId} not found`);
    if (agent.archived_at)
      return lookupRefusal(
        400,
        `agent ${agentId} is archived and cannot be used to create a session`,
      );
    const resources = [];
    for (const resource of body.resources ?? []) {
      if (resource.type === "github_repository") {
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
          checkout: resource.checkout ?? null,
          created_at: now(),
          updated_at: now(),
        });
        continue;
      }
      if (resource.type === "memory_store") {
        // sessionresources.go snapshotMemoryStore, worded by sessions.go
        // requestWording in the reference's sentences (#540, #841).
        const item = memoryStoresStore.find(
          (candidate) => candidate.id === resource.memory_store_id,
        );
        if (!item || item.archived_at) {
          res.writeHead(item ? 400 : 404);
          res.end(
            envelope(
              item ? "invalid_request_error" : "not_found_error",
              item
                ? `Memory store ${item.id} is archived.`
                : `Memory store \`${resource.memory_store_id}\` not found.`,
            ),
          );
          return;
        }
        resources.push({
          type: "memory_store",
          memory_store_id: item.id,
          access: resource.access ?? "read_write",
          instructions: resource.instructions ?? null,
          description: item.description,
          name: item.name,
          mount_path: `/mnt/memory/${memorySlug(item.name) || memorySlug(item.id)}`,
        });
        continue;
      }
      if (!liveFile(resource.file_id)) {
        res.writeHead(404);
        // sessions.go requestWording: the reference's words (#540), an
        // expired source's too (fileMustExist).
        res.end(
          envelope(
            "not_found_error",
            `One or more files not found. Check that each \`file_id\` exists and is accessible: ${resource.file_id}`,
          ),
        );
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
    const sessionId = `sesn_mock${String(sessionCounter++).padStart(6, "0")}`;
    // Only once every resource has been judged and looked up, as the
    // platform mints inside the create's transaction (mintFileCopy).
    for (const resource of resources)
      if (resource.type === "file")
        resource.file_id = mintFileCopy(sessionId, resource.file_id);
    const session = {
      id: sessionId,
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
      // Never run, so null — the shape fixtures.mjs:neverRunThread documents.
      usage: null,
      stats: null,
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
        // memories.go errMemoryStoreArchived: the reference's words (#540).
        fail(
          400,
          "invalid_request_error",
          `cannot modify archived resource: memory store ${id}`,
        );
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
        // memorystores.go createMemoryStore: an absent or empty name in the
        // reference's words (#540).
        fail(
          400,
          "invalid_request_error",
          body.name === undefined
            ? "name: Field required"
            : body.name === ""
              ? "name: minimum string length is 1"
              : "name is required",
        );
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
        // No archived_at until archived: the recorded shape (fixtures.mjs).
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
      const occupant = memoriesStore.find(
        (memory) =>
          memory.memory_store_id === memoryCollection[1] &&
          memory.path === body.path,
      );
      if (occupant) {
        // memories.go errMemoryPathOccupied, its exact-path arm (#540).
        fail(
          409,
          "memory_path_conflict_error",
          `path \`${body.path}\` is already used by \`${occupant.id}\`; use update to modify it`,
        );
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
        // memories.go errStaleContent: the reference's words, naming neither
        // digest (#540).
        fail(
          409,
          "memory_precondition_failed_error",
          "precondition content_sha256 failed: content has changed",
        );
        return;
      }
      const occupant =
        path !== memory.path &&
        memoriesStore.find(
          (item) =>
            item.memory_store_id === memoryItem[1] &&
            item.id !== memory.id &&
            item.path === path,
        );
      if (occupant) {
        // memories.go errMemoryPathOccupied, its exact-path arm (#540).
        fail(
          409,
          "memory_path_conflict_error",
          `path \`${path}\` is already used by \`${occupant.id}\`; delete it first to rename-and-replace`,
        );
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
        // memories.go errStaleContent: the reference's words, naming neither
        // digest (#540).
        fail(
          409,
          "memory_precondition_failed_error",
          "precondition content_sha256 failed: content has changed",
        );
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
          `version is the current content of ${head.id}; write a new version first`,
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
    if (req.method === "POST" && vaultIdMatch) {
      res.setHeader("content-type", "application/json");
      const vault = vaultsStore.find((v) => v.id === vaultIdMatch[1]);
      if (!vault) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such vault"));
        return;
      }
      if (vault.archived_at) {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "vault is archived"));
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
      if (body.display_name !== undefined)
        vault.display_name = body.display_name;
      for (const [key, value] of Object.entries(body.metadata ?? {})) {
        if (value === null) delete vault.metadata[key];
        else vault.metadata[key] = value;
      }
      vault.updated_at = now();
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
        res.end(envelope("not_found_error", "Credential not found."));
        return;
      }
      cred.archived_at ??= now();
      res.writeHead(200);
      res.end(JSON.stringify(cred));
      return;
    }
    if (req.method === "POST" && credItemMatch) {
      res.setHeader("content-type", "application/json");
      const cred = (vaultCredsStore[credItemMatch[1]] ?? []).find(
        (candidate) => candidate.id === credItemMatch[2],
      );
      if (!cred) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "Credential not found."));
        return;
      }
      if (cred.archived_at) {
        res.writeHead(400);
        // vaultcredentials.go archivedCredentialRefusal: the vault first, in
        // the reference's words (#540); a credential archived on its own in
        // the platform's.
        const vault = vaultsStore.find((v) => v.id === credItemMatch[1]);
        res.end(
          envelope(
            "invalid_request_error",
            vault?.archived_at
              ? "Vault is archived."
              : "credential is archived",
          ),
        );
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
      if (body.auth && body.auth.type !== cred.auth.type) {
        res.writeHead(400);
        res.end(
          envelope(
            "invalid_request_error",
            "auth.type: does not match this credential's stored type",
          ),
        );
        return;
      }
      if (body.display_name !== undefined)
        cred.display_name = body.display_name;
      for (const [key, value] of Object.entries(body.metadata ?? {})) {
        if (value === null) delete cred.metadata[key];
        else cred.metadata[key] = value;
      }
      if (body.auth) {
        if (cred.auth.type === "mcp_oauth") {
          if (body.auth.expires_at !== undefined)
            cred.auth.expires_at = body.auth.expires_at;
          if (body.auth.refresh && cred.auth.refresh) {
            if (body.auth.refresh.scope !== undefined)
              cred.auth.refresh.scope = body.auth.refresh.scope;
            if (body.auth.refresh.token_endpoint_auth)
              cred.auth.refresh.token_endpoint_auth = {
                type: body.auth.refresh.token_endpoint_auth.type,
              };
          }
        } else if (cred.auth.type === "environment_variable") {
          if (body.auth.networking) cred.auth.networking = body.auth.networking;
          if (body.auth.injection_location)
            cred.auth.injection_location = {
              ...cred.auth.injection_location,
              ...body.auth.injection_location,
            };
        }
      }
      cred.updated_at = now();
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
        res.end(envelope("not_found_error", "Credential not found."));
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
      // sessionresources.go errResourceNotFound: the reference's words (#540).
      fail(404, `Resource not found: ${resourceId}`);
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
      // sessionresources.go addSessionResourceTx: requiredString first —
      // absent, null or "" is required, any other non-string must be a
      // string — then any type but "file" in the reference's words (#540).
      fail(
        400,
        body.type === undefined || body.type === null || body.type === ""
          ? "type is required"
          : typeof body.type !== "string"
            ? "type must be a string"
            : `Failed to parse request: type: ${JSON.stringify(body.type)} is not a valid value`,
      );
      return;
    }
    // sessionresources.go parseFileResource, before any mount path is
    // built: the keys, then the file id's presence and shape. The shape is
    // the mock's wellFormedId, which its own ids meet; the platform's
    // domain.ID Valid holds a token to lowercase Crockford base32.
    const unknown = leastUnknownKey(body, ["type", "file_id", "mount_path"]);
    const fileIdRefusal =
      unknown !== undefined
        ? unknownField(unknown)
        : (requiredStringRefusal(body, "file_id") ??
          (wellFormedId(body.file_id, "file")
            ? null
            : "file_id must be a valid file id"));
    if (fileIdRefusal) {
      fail(400, fileIdRefusal);
      return;
    }
    // requireReadTool: a file is added only for an agent whose
    // agent_toolset_20260401 leaves read enabled, in the reference's words
    // (console-141 #92). MCP and custom tools do not count.
    if (!readToolUsable(state.session.agent)) {
      fail(
        400,
        "Missing required tool: file resources require the read tool to be usable (enabled and not always_deny) on the session's `agent_toolset`",
      );
      return;
    }
    const mount = body.mount_path || `/mnt/session/uploads/${body.file_id}`;
    if (resources.some((item) => item.mount_path === mount)) {
      fail(400, "mount_path is already in use");
      return;
    }
    // addSessionResourceTx mints after the mount checks; a source missing or
    // expired is errFileGone, in the platform's own words (the add was never
    // recorded refusing one).
    const copy = mintFileCopy(state.session.id, body.file_id);
    if (!copy) {
      fail(404, `file ${body.file_id} not found`);
      return;
    }
    const added = {
      id: `sesrsc_mock${String(resourceCounter++).padStart(4, "0")}`,
      type: "file",
      file_id: copy,
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
    // skills.go errSkillNotFound and skillVersionNotFound, the reference's
    // words (#540): a version miss names the slot as addressed while its skill
    // exists, and is the skill's own 404 once it does not.
    const skillNotFound = (skillId) =>
      envelope("not_found_error", `Skill not found: ${skillId}`);
    const versionNotFound = (skillId, slot) =>
      skillsStore.some((s) => s.id === skillId)
        ? envelope(
            "not_found_error",
            `Skill version not found: ${skillId} version ${slot}`,
          )
        : skillNotFound(skillId);

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
        res.end(skillNotFound(versionsPostMatch[1]));
        return;
      }
      if (skill.source.type !== "custom") {
        res.writeHead(400);
        // skills.go createSkillVersion: an imported skill's id refused as the
        // wrong shape for a custom one, in the reference's words (#540).
        res.end(
          envelope(
            "invalid_request_error",
            `Invalid skill_id format: ${versionsPostMatch[1]}`,
          ),
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
          : versionNotFound(versionItemMatch[1], versionItemMatch[2]),
      );
      return;
    }
    if (req.method === "GET" && contentMatch) {
      const exists = (skillVersionsStore[contentMatch[1]] ?? []).some(
        (v) => v.id === contentMatch[2],
      );
      if (!exists) {
        res.writeHead(404, { "content-type": "application/json" });
        // skills.go downloadSkillVersion: every version miss is the skill's
        // 404 here, as the reference answers it (#540).
        res.end(skillNotFound(contentMatch[1]));
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
        res.end(versionNotFound(versionItemMatch[1], versionItemMatch[2]));
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
        res.end(skillNotFound(skillItemMatch[1]));
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
      // wire.go checkAgentPathID, before the lookup (#841).
      if (!wellFormedId(archiveMatch[1], "agent")) {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "Invalid agent ID."));
        return;
      }
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
    if (updateMatch && !wellFormedId(updateMatch[1], "agent")) {
      // agents.go updateAgent: the body's unknown keys, then the path id's
      // shape (checkAgentPathID, #841), then the lookup.
      const unknown =
        body && typeof body === "object" && !Array.isArray(body)
          ? leastUnknownKey(body, AGENT_KEYS)
          : undefined;
      res.writeHead(400);
      res.end(
        envelope(
          "invalid_request_error",
          unknown === undefined ? "Invalid agent ID." : unknownField(unknown),
        ),
      );
      return;
    }
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
        res.end(
          envelope("invalid_request_error", "Cannot modify archived agent"),
        );
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
    res.setHeader("content-type", "application/json");
    const refuse = (status, message) => {
      res.writeHead(status);
      res.end(
        envelope(
          status === 404 ? "not_found_error" : "invalid_request_error",
          message,
        ),
      );
    };
    // events.go sendSessionEvents reads the body before the session:
    // decodeObject (an empty body or null reads as {}), the unknown keys,
    // then wire.go rawList (null reads as []).
    const raw = (await readBody(req)).toString("utf8");
    let body;
    try {
      body = raw.trim() === "" ? {} : (JSON.parse(raw) ?? {});
    } catch {
      body = undefined;
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return refuse(400, "request body must be a JSON object");
    const unknownKey = leastUnknownKey(body, ["events"]);
    if (unknownKey !== undefined) return refuse(400, unknownField(unknownKey));
    if (body.events !== null && !Array.isArray(body.events))
      return refuse(400, "events must be an array");
    // Then the session, its id normalized as normalizeSessionID does.
    const id = postMatch[1].replace(/^session_/, "sesn_");
    const state = store.get(id);
    if (!state) return refuse(404, `session ${id} not found`);
    if (state.session.archived_at)
      return refuse(400, `session ${id} is archived and read-only`);
    // internal/events normalizeBatch's floor, in the reference's words (#540).
    if ((body.events ?? []).length === 0)
      return refuse(400, "events: must contain at least 1 item");
    const outcome = handleInbound(state, body.events);
    if (outcome.error) {
      // events.go: an interrupt naming no thread of the session is the 404 and
      // a management credential's user.tool_result the 403; every other
      // refusal of the batch a 400.
      const status = outcome.status ?? 400;
      res.writeHead(status);
      res.end(
        envelope(
          status === 404
            ? "not_found_error"
            : status === 403
              ? "permission_error"
              : "invalid_request_error",
          outcome.error,
        ),
      );
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ data: outcome.posted }));
    return;
  }

  res.setHeader("content-type", "application/json");
  const result = route(req, url);
  if (result?.[REFUSED]) {
    const { status, message } = result[REFUSED];
    res.writeHead(status);
    res.end(
      envelope(
        status === 404 ? "not_found_error" : "invalid_request_error",
        message,
      ),
    );
    return;
  }
  // Every resource route answers its own 404 above, so what is left is a
  // path no route matches: server.go errUnknownPath, the reference's words.
  if (result === null) {
    res.writeHead(404);
    res.end(envelope("not_found_error", unknownPath(url.pathname)));
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
