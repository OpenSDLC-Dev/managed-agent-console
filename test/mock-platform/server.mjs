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
}
resetStore();

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
      includeArchived ? agents : agents.filter(notArchived),
      url,
    );
  }
  const agentMatch = path.match(/^\/v1\/agents\/([^/]+)$/);
  if (agentMatch) return agents.find((a) => a.id === agentMatch[1]) ?? null;
  const versionsMatch = path.match(/^\/v1\/agents\/([^/]+)\/versions$/);
  if (versionsMatch) {
    const versions = agentVersions[versionsMatch[1]];
    return versions ? keysetPage(versions, url) : null;
  }

  if (path === "/v1/environments") {
    return keysetPage(
      includeArchived ? environments : environments.filter(notArchived),
      url,
    );
  }
  const envMatch = path.match(/^\/v1\/environments\/([^/]+)$/);
  if (envMatch) return environments.find((e) => e.id === envMatch[1]) ?? null;

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
    let rows = files;
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
  if (fileMatch) return files.find((f) => f.id === fileMatch[1]) ?? null;

  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
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
