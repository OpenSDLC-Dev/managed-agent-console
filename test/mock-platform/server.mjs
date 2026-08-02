// Minimal mock of managed-agent-platform's control plane for tests.
// Implements exactly what the console under test needs; shapes follow the
// platform's wire (error envelope, keyset/bi/classic pages, SSE framing,
// request-id header) as documented in docs/plan/01_v1-console.md § Ground
// truth. Sessions carry a tiny state machine so e2e can exercise the HITL
// approval round trip and streamed replies.
import { createServer } from "node:http";
import {
  agents,
  agentVersions,
  environments,
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

function resetStore() {
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
  agentsStore = structuredClone(agents);
  agentVersionsStore = structuredClone(agentVersions);
  environmentsStore = structuredClone(environments);
  filesStore = structuredClone(files);
  agentCounter = 1;
  environmentCounter = 1;
  fileCounter = 1;
  sessionCounter = 1;
  resourceCounter = 1;
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
    return keysetPage(
      includeArchived ? agentsStore : agentsStore.filter(notArchived),
      url,
    );
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
      includeArchived ? vaults : vaults.filter(notArchived),
      url,
    );
  }
  const vaultMatch = path.match(/^\/v1\/vaults\/([^/]+)$/);
  if (vaultMatch) return vaults.find((v) => v.id === vaultMatch[1]) ?? null;
  const credsMatch = path.match(/^\/v1\/vaults\/([^/]+)\/credentials$/);
  if (credsMatch) {
    const creds = vaultCredentials[credsMatch[1]];
    if (!creds) return null; // missing vault → 404, not an empty page
    return keysetPage(includeArchived ? creds : creds.filter(notArchived), url);
  }

  if (path === "/v1/skills") {
    let rows = skills;
    const source = url.searchParams.get("source");
    if (source) rows = rows.filter((s) => s.source === source);
    return keysetPage(rows, url);
  }
  const skillVersionsMatch = path.match(/^\/v1\/skills\/([^/]+)\/versions$/);
  if (skillVersionsMatch) {
    const versions = skillVersions[skillVersionsMatch[1]];
    return versions ? keysetPage(versions, url) : null;
  }
  const skillMatch = path.match(/^\/v1\/skills\/([^/]+)$/);
  if (skillMatch) return skills.find((s) => s.id === skillMatch[1]) ?? null;

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

  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    res.setHeader("content-type", "application/json");
    res.writeHead(401);
    res.end(
      envelope(
        "authentication_error",
        key ? "invalid x-api-key" : "missing x-api-key header",
      ),
    );
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock platform listening on http://127.0.0.1:${PORT}`);
});
