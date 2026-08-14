// Minimal mock of managed-agent-platform's control plane for tests.
// Implements exactly what the console under test needs; shapes follow the
// platform's wire (error envelope, keyset/bi/classic pages, SSE framing,
// request-id header) as documented in docs/plan/01_v1-console.md § Ground
// truth. Sessions carry a tiny state machine so e2e can exercise the HITL
// approval round trip and streamed replies.
import { createServer } from "node:http";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import {
  agents,
  agentVersions,
  environments,
  environmentKeys,
  files,
  sessions as sessionFixtures,
  sessionEvents as eventFixtures,
  skills,
  skillVersions,
  vaultCredentials,
  vaults,
} from "./fixtures.mjs";

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
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

// ---- mutable session store (reset via POST /__reset) ---------------------

/** @type {Map<string, {session: any, events: any[], subscribers: Set<any>}>} */
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
  for (const state of store.values()) {
    for (const timer of state.timers ?? []) clearTimeout(timer);
    for (const res of state.subscribers) res.end();
  }
  store.clear();
  for (const fixture of sessionFixtures) {
    store.set(fixture.id, {
      session: structuredClone(fixture),
      events: structuredClone(eventFixtures[fixture.id] ?? []),
      subscribers: new Set(),
      timers: new Set(),
    });
  }
  apiKeysStore = structuredClone(API_KEYS_SEED);
  apiKeyCounter = 1;
  agentsStore = structuredClone(agents);
  agentVersionsStore = structuredClone(agentVersions);
  environmentsStore = structuredClone(environments);
  filesStore = structuredClone(files);
  vaultsStore = structuredClone(vaults);
  vaultCredsStore = structuredClone(vaultCredentials);
  skillsStore = structuredClone(skills);
  skillVersionsStore = structuredClone(skillVersions);
  agentCounter = 1;
  environmentCounter = 1;
  fileCounter = 1;
  sessionCounter = 1;
  resourceCounter = 1;
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

function validateAgentBody(body, { requireCore }) {
  for (const key of Object.keys(body)) {
    if (!AGENT_KEYS.has(key)) return `unknown field "${key}"`;
  }
  if (body.multiagent != null) return "multiagent is not supported yet";
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
  agent.updated_at = now();
  agentVersionsStore[agent.id] = [
    { ...structuredClone(agent) },
    ...(agentVersionsStore[agent.id] ?? []),
  ];
  return { agent };
}

function frame(res, name, payload) {
  res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(state, event) {
  state.events.push(event);
  for (const res of state.subscribers) frame(res, event.type, event);
}

function broadcastRaw(state, name, payload) {
  for (const res of state.subscribers) frame(res, name, payload);
}

function appendEvent(state, type, fields = {}) {
  const event = { id: nextEventId(), type, processed_at: now(), ...fields };
  broadcast(state, event);
  return event;
}

function setStatus(state, status, stopReason) {
  state.session.status = status;
  appendEvent(
    state,
    status === "running" ? "session.status_running" : "session.status_idle",
    status === "running" ? {} : { stop_reason: stopReason },
  );
}

/** Unanswered ask-gated tool_use events (mirrors requires_action bookkeeping). */
function pendingAsks(state) {
  const answered = new Set(
    state.events
      .filter((e) => e.type === "user.tool_confirmation")
      .map((e) => e.tool_use_id),
  );
  const lastIdle = [...state.events]
    .reverse()
    .find((e) => e.type === "session.status_idle");
  const ids = lastIdle?.stop_reason?.event_ids ?? [];
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
function streamReply(state, text) {
  const id = nextEventId();
  broadcastRaw(state, "event_start", {
    type: "event_start",
    event: { id, type: "agent.message" },
  });
  const pieces = [text.slice(0, 8), text.slice(8, 16), text.slice(16)].filter(
    Boolean,
  );
  // Spaced enough that e2e can interact (e.g. click Interrupt) mid-stream.
  let delay = 250;
  for (const piece of pieces) {
    schedule(state, delay, () => {
      broadcastRaw(state, "event_delta", {
        type: "event_delta",
        event_id: id,
        delta: {
          type: "content_delta",
          index: 0,
          content: { type: "text", text: piece },
        },
      });
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
    broadcast(state, event);
    setStatus(state, "idle", { type: "end_turn" });
  });
}

function handleInbound(state, incoming) {
  const posted = [];
  for (const raw of incoming) {
    const event = { id: nextEventId(), type: raw.type, processed_at: now() };
    switch (raw.type) {
      case "user.message":
        event.content = raw.content;
        broadcast(state, event);
        break;
      case "user.interrupt":
        event.session_thread_id = null;
        broadcast(state, event);
        break;
      case "user.tool_confirmation":
        event.tool_use_id = raw.tool_use_id;
        event.result = raw.result;
        event.deny_message = raw.deny_message ?? null;
        event.session_thread_id = null;
        broadcast(state, event);
        break;
      default:
        return { error: `unsupported inbound event type "${raw.type}"` };
    }
    posted.push({ ...event });
  }

  // React to the batch after appending it, mirroring the platform's
  // interrupt → confirmation → message precedence.
  const hasInterrupt = incoming.some((e) => e.type === "user.interrupt");
  const confirmations = incoming.filter(
    (e) => e.type === "user.tool_confirmation",
  );
  const messages = incoming.filter((e) => e.type === "user.message");

  if (hasInterrupt) {
    cancelStreams(state);
    for (const id of pendingAsks(state)) {
      appendEvent(state, "agent.tool_result", {
        tool_use_id: id,
        content: [{ type: "text", text: "Interrupted by the user." }],
        is_error: true,
        session_thread_id: null,
      });
    }
    setStatus(state, "idle", { type: "end_turn" });
  }

  for (const confirmation of confirmations) {
    const denied = confirmation.result === "deny";
    appendEvent(state, "agent.tool_result", {
      tool_use_id: confirmation.tool_use_id,
      content: [
        {
          type: "text",
          text: denied
            ? (confirmation.deny_message ?? "The user declined this tool call.")
            : "total 0\n-rw-r--r-- lockfile",
        },
      ],
      is_error: denied,
      session_thread_id: null,
    });
    const remaining = pendingAsks(state);
    if (remaining.length > 0) {
      setStatus(state, "idle", {
        type: "requires_action",
        event_ids: remaining,
      });
    } else {
      setStatus(state, "running", undefined);
      streamReply(
        state,
        denied ? "Understood — skipping that step." : "Dependencies installed.",
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
    if (source) rows = rows.filter((s) => s.source === source);
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
  if (unimplemented.some((s) => url.pathname.startsWith(`/v1/${s}`))) {
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
  if (req.method === "GET" && streamMatch) {
    const state = store.get(streamMatch[1]);
    if (!state) {
      res.setHeader("content-type", "application/json");
      res.writeHead(404);
      res.end(envelope("not_found_error", "no such session"));
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
    state.subscribers.add(res);
    const ping = setInterval(() => frame(res, "ping", { type: "ping" }), 15000);
    req.on("close", () => {
      clearInterval(ping);
      state.subscribers.delete(res);
    });
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

  // File upload (multipart) — minimal parse: filename + rough size.
  if (req.method === "POST" && url.pathname === "/v1/files") {
    res.setHeader("content-type", "application/json");
    const body = await readBody(req);
    const filename =
      /filename="([^"]+)"/.exec(body)?.[1] ?? `upload-${fileCounter}`;
    const mime =
      /Content-Type:\s*([^\r\n]+)/i.exec(body)?.[1] ??
      "application/octet-stream";
    const file = {
      id: `file_mock${String(fileCounter++).padStart(6, "0")}`,
      type: "file",
      filename,
      mime_type: mime.trim(),
      size_bytes: body.length,
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
      agent: {
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
      },
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
    store.set(session.id, {
      session,
      events: [],
      subscribers: new Set(),
      timers: new Set(),
    });
    res.writeHead(200);
    res.end(JSON.stringify(session));
    return;
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

  // Skill writes: multipart upload, versions, deletes, zip download.
  if (url.pathname.startsWith("/v1/skills")) {
    const versionsPostMatch = url.pathname.match(
      /^\/v1\/skills\/([^/]+)\/versions$/,
    );
    const versionItemMatch = url.pathname.match(
      /^\/v1\/skills\/([^/]+)\/versions\/(\d+)$/,
    );
    const contentMatch = url.pathname.match(
      /^\/v1\/skills\/([^/]+)\/versions\/(\d+)\/content$/,
    );
    const skillItemMatch = url.pathname.match(/^\/v1\/skills\/([^/]+)$/);

    const mintVersion = (skillId, name) => {
      const version = `17549000000${String(skillVersionCounter++).padStart(5, "0")}`;
      const entry = {
        id: `skillver_mock${String(skillVersionCounter).padStart(4, "0")}`,
        type: "skill_version",
        skill_id: skillId,
        version,
        name,
        description: "Uploaded via console",
        directory: name,
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
        /name="display_title"\r?\n\r?\n([^\r\n]+)/.exec(head)?.[1] ??
        `skill-${skillCounter}`;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const skill = {
        id: `skill_mock${String(skillCounter++).padStart(6, "0")}`,
        type: "skill",
        display_title: title,
        latest_version: "",
        source: "custom",
        created_at: now(),
        updated_at: now(),
      };
      const version = mintVersion(skill.id, slug);
      skill.latest_version = version.version;
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
      if (skill.source !== "custom") {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "anthropic skills are read-only"),
        );
        return;
      }
      await readBody(req);
      const version = mintVersion(skill.id, skill.display_title);
      skill.latest_version = version.version;
      skill.updated_at = now();
      res.writeHead(200);
      res.end(JSON.stringify(version));
      return;
    }
    if (req.method === "GET" && contentMatch) {
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
      const entry = versions.find((v) => v.version === versionItemMatch[2]);
      if (!entry) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such version"));
        return;
      }
      skillVersionsStore[versionItemMatch[1]] = versions.filter(
        (v) => v.version !== entry.version,
      );
      const skill = skillsStore.find((s) => s.id === versionItemMatch[1]);
      if (skill) {
        skill.latest_version =
          skillVersionsStore[versionItemMatch[1]][0]?.version ?? "";
      }
      res.writeHead(200);
      res.end(
        JSON.stringify({ id: entry.version, type: "skill_version_deleted" }),
      );
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
      if (skill.source !== "custom") {
        res.writeHead(400);
        res.end(
          envelope("invalid_request_error", "anthropic skills are read-only"),
        );
        return;
      }
      if ((skillVersionsStore[skill.id] ?? []).length > 0) {
        res.writeHead(400);
        res.end(envelope("invalid_request_error", "skill still has versions"));
        return;
      }
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
      const problem = validateAgentBody(body, {
        requireCore: url.pathname === "/v1/agents",
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
      const agent = agentsStore.find((a) => a.id === updateMatch[1]);
      if (!agent) {
        res.writeHead(404);
        res.end(envelope("not_found_error", "no such agent"));
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
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`mock platform listening on http://127.0.0.1:${PORT}`);
  });
}

export { API_KEY, resetStore, server };
