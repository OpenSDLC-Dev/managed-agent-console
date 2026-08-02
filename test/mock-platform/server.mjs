// Minimal mock of managed-agent-platform's control plane for tests.
// Implements exactly what the console under test needs; shapes follow the
// platform's wire (error envelope, keyset/bi/classic pages, request-id
// header) as documented in docs/plan/01_v1-console.md § Ground truth.
import { createServer } from "node:http";
import {
  agents,
  agentVersions,
  environments,
  files,
  sessions,
  sessionEvents,
  skills,
  skillVersions,
  vaultCredentials,
  vaults,
} from "./fixtures.mjs";

const API_KEY = process.env.MOCK_PLATFORM_KEY ?? "test-key";
const PORT = Number(process.env.MOCK_PLATFORM_PORT ?? 18080);

let requestCounter = 0;

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
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
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
    let rows = includeArchived ? sessions : sessions.filter(notArchived);
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
  if (sessionMatch)
    return sessions.find((s) => s.id === sessionMatch[1]) ?? null;

  const eventsMatch = path.match(/^\/v1\/sessions\/([^/]+)\/events$/);
  if (eventsMatch) {
    let rows = sessionEvents[eventsMatch[1]];
    if (!rows) return null;
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

const server = createServer((req, res) => {
  requestCounter += 1;
  res.setHeader("request-id", `req_mock${requestCounter}`);
  res.setHeader("content-type", "application/json");

  const key = req.headers["x-api-key"];
  if (!key) {
    res.writeHead(401);
    res.end(envelope("authentication_error", "missing x-api-key header"));
    return;
  }
  if (key !== API_KEY) {
    res.writeHead(401);
    res.end(envelope("authentication_error", "invalid x-api-key"));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
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
