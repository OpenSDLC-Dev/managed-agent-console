import { randomBytes } from "node:crypto";

// Model-free presentation fixture. The native browser tier verifies the real
// platform RP, password hashes, session storage and origin validation.
// Wire: internal/api/login.go and internal/login/session.go.
export const MOCK_ACCOUNT = {
  signed_in: true,
  id: "user_mockadmin01",
  role: "admin",
  role_source: "manual",
  email: "operator@example.com",
  name: "Test Operator",
  login_name: "operator",
};
const sessions = new Map();
const cookieName = "map_mock_session";
export function resetSessions() {
  sessions.clear();
}
export function expireSessions() {
  sessions.clear();
}
const origin = (req) => `http://${req.headers.host}`;
const mode = (req) =>
  origin(req) === process.env.MOCK_OIDC_ORIGIN ? "oidc" : "password";
const sessionFor = (req) =>
  sessions.get(
    String(req.headers.cookie ?? "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1),
  );
function reply(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}
function deny(res, status, message, signedOut = false) {
  if (signedOut) res.setHeader("x-platform-signed-out", "1");
  reply(res, status, {
    type: "error",
    error: {
      type: status === 401 ? "authentication_error" : "permission_error",
      message,
    },
  });
  return false;
}
function issue(req, res) {
  const token = randomBytes(24).toString("base64url");
  const session = {
    ...MOCK_ACCOUNT,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    csrf_token: randomBytes(24).toString("base64url"),
  };
  sessions.set(token, session);
  res.setHeader(
    "set-cookie",
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax`,
  );
  return session;
}
export function authenticateBrowser(req, res) {
  // Match loginauth.go's privateCookiePath before checking credentials. The
  // gateway has a separate path grammar: model aliases may contain slashes.
  const path = req.url.split("?")[0];
  if (path.startsWith("/api/")) {
    try {
      if (
        path
          .slice(1)
          .split("/")
          .some((part) => {
            const value = decodeURIComponent(part);
            return (
              !value || value === "." || value === ".." || value.includes("/")
            );
          })
      )
        return deny(res, 401, "a browser session cookie is required");
    } catch {
      return deny(res, 401, "a browser session cookie is required");
    }
  }
  if (
    req.headers["x-api-key"] !== undefined ||
    req.headers.authorization !== undefined
  )
    return deny(res, 401, "a browser session cookie is required");
  const session = sessionFor(req);
  if (!session)
    return deny(res, 401, "invalid or expired browser session", true);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    (req.headers.origin !== origin(req) ||
      req.headers["x-csrf-token"] !== session.csrf_token)
  )
    return deny(res, 403, "invalid browser origin or CSRF token");
  return session;
}
export async function nativeAuthRoute(req, res, url, readBody) {
  if (!url.pathname.startsWith("/api/auth/")) return false;
  if (url.pathname === "/api/auth/config" && req.method === "GET") {
    reply(res, 200, { mode: mode(req), native_login: true });
    return true;
  }
  if (url.pathname === "/api/auth/login") {
    // Fidelity's OIDC offer is only a presentation fixture; the real native
    // tier follows the actual platform RP and external test IdP.
    if (req.method === "GET" && mode(req) === "oidc") {
      issue(req, res);
      res.writeHead(303, { location: "/" });
      res.end();
      return true;
    }
    if (req.method === "POST" && mode(req) === "password") {
      if (req.headers.origin !== origin(req)) {
        deny(res, 403, "invalid browser origin");
        return true;
      }
      if (
        req.headers["x-api-key"] !== undefined ||
        req.headers.authorization !== undefined
      ) {
        deny(res, 401, "login requires the configured login credential");
        return true;
      }
      let body;
      try {
        body = JSON.parse((await readBody(req)).toString());
      } catch {
        reply(res, 400, {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "invalid JSON body",
          },
        });
        return true;
      }
      if (body.login_name !== "operator" || body.password !== "test-password") {
        deny(res, 401, "invalid login name or password");
        return true;
      }
      const session = issue(req, res);
      reply(res, 200, session);
      return true;
    }
    reply(res, 405, {
      type: "error",
      error: { type: "invalid_request_error", message: "method not allowed" },
    });
    return true;
  }
  if (url.pathname === "/api/auth/session" && req.method === "GET") {
    const session = authenticateBrowser(req, res);
    if (session) reply(res, 200, { ...session, platform_version: "dev-mock" });
    return true;
  }
  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const session = authenticateBrowser(req, res);
    if (session) {
      for (const [token, entry] of sessions)
        if (entry === session) sessions.delete(token);
      res.setHeader(
        "set-cookie",
        `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      );
      reply(res, 200, { ok: true });
    }
    return true;
  }
  reply(res, 404, {
    type: "error",
    error: {
      type: "not_found_error",
      message: `no such path: ${url.pathname}`,
    },
  });
  return true;
}
