// Minimal mock of managed-agent-platform's control plane for tests.
// Implements exactly what the console under test needs; shapes follow the
// platform's wire (error envelope, keyset page, request-id header) as
// documented in docs/plan/01_v1-console.md § Ground truth.
import { createServer } from "node:http";

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
  if (req.method === "GET" && url.pathname === "/v1/agents") {
    res.writeHead(200);
    res.end(JSON.stringify({ data: [], next_page: null }));
    return;
  }

  res.writeHead(404);
  res.end(envelope("not_found_error", `no such endpoint: ${url.pathname}`));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock platform listening on http://127.0.0.1:${PORT}`);
});
