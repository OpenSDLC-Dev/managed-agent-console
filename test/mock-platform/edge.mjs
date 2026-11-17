import { createServer, request } from "node:http";

// Same routing boundary as the deployed application edge. No credential is
// added: cookies, CSRF, bytes and streaming cancellation reach the backends.
const port = Number(process.env.MOCK_EDGE_PORT ?? 3100);
const platform = new URL(
  process.env.MOCK_PLATFORM_URL ??
    `http://127.0.0.1:${process.env.MOCK_PLATFORM_PORT ?? 18080}`,
);
const gateway = new URL(
  process.env.MOCK_GATEWAY_URL ??
    `http://127.0.0.1:${process.env.MOCK_GATEWAY_PORT ?? 18070}`,
);
const consoleOrigin = new URL(
  `http://127.0.0.1:${process.env.MOCK_CONSOLE_PORT ?? 3090}`,
);
for (const endpoint of [platform, gateway])
  if (
    endpoint.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
  )
    throw new Error("Test edge targets loopback HTTP only");
createServer((req, res) => {
  const path = new URL(req.url, "http://edge").pathname;
  const backend = path.startsWith("/admin/v1/")
    ? gateway
    : [
          "/api/auth/",
          "/api/console/",
          "/api/oauth/",
          "/api/organizations/",
          "/v1/",
        ].some((prefix) => path.startsWith(prefix))
      ? platform
      : consoleOrigin;
  const forward = request(
    {
      hostname: backend.hostname.replace(/^\[|\]$/g, ""),
      port: backend.port || 80,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (incoming) => {
      incoming.on("aborted", () => res.destroy());
      incoming.on("error", () => res.destroy());
      res.writeHead(incoming.statusCode, incoming.headers);
      res.flushHeaders();
      incoming.pipe(res);
    },
  );
  forward.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  res.on("close", () => forward.destroy());
  req.pipe(forward);
}).listen(port, "127.0.0.1", () =>
  console.log(`mock edge listening on http://127.0.0.1:${port}`),
);
