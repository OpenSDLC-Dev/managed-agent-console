// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, sessionTokenFor } from "@/lib/auth";
import { config, proxy } from "./proxy";

const request = (url: string, cookie?: string) =>
  new NextRequest(url, cookie ? { headers: { cookie } } : undefined);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("console gate proxy", () => {
  it("passes everything through when no password is configured", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", undefined);
    const response = await proxy(request("http://localhost:3000/agents"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("passes through requests carrying a valid session cookie", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const token = await sessionTokenFor("hunter2");
    const response = await proxy(
      request("http://localhost:3000/agents", `${SESSION_COOKIE}=${token}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects page requests without a session to /login, dropping the query", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const response = await proxy(
      request("http://localhost:3000/agents?after_id=agent_1"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("rejects cookies minted under a previous password", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "new-password");
    const staleToken = await sessionTokenFor("old-password");
    const response = await proxy(
      request(
        "http://localhost:3000/sessions",
        `${SESSION_COOKIE}=${staleToken}`,
      ),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("returns the wire error envelope for unauthenticated API requests", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const response = await proxy(
      request("http://localhost:3000/api/platform/v1/agents"),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      type: "error",
      error: {
        type: "authentication_error",
        message: "console login required",
      },
    });
  });
});

describe("matcher exemptions", () => {
  // The matcher pattern is a plain regex-in-a-path segment; anchoring it
  // reproduces what Next matches the pathname against.
  const matches = (pathname: string) =>
    new RegExp(`^${config.matcher[0]}$`).test(pathname);

  it("covers app pages and API routes", () => {
    expect(matches("/")).toBe(true);
    expect(matches("/agents")).toBe(true);
    expect(matches("/sessions/sess_1")).toBe(true);
    expect(matches("/api/platform/v1/agents")).toBe(true);
  });

  it("exempts the login page, the login endpoint, and static assets", () => {
    expect(matches("/login")).toBe(false);
    expect(matches("/api/login")).toBe(false);
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
    expect(matches("/_next/image")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });

  it("exempts the health endpoint, which no probe can authenticate to", () => {
    // A gated /api/health answers 401, which a readiness probe reads as an
    // unhealthy container — the pod never becomes ready and the rollout that
    // waits on it never finishes. The matcher sees a pathname and no query
    // string, so the exemption covers `?deep=1` too — which is why the route
    // gates that depth itself, it being the one that spends the management
    // key. See docs/deploy-gcp.md.
    expect(matches("/api/health")).toBe(false);
  });

  // The one deliberate namespace exemption. Nobody can hold a session before
  // signing in, so a gated `/api/auth/login` would redirect the browser to
  // `/login` and a gated `/api/auth/callback` would drop the provider's
  // redirect on the password form — the sign-in could never complete on any
  // deployment that also sets CONSOLE_PASSWORD, which is local development,
  // the gated e2e specs and the fidelity run (plan 08 D3's third row).
  it("exempts the whole /api/auth/ namespace", () => {
    expect(matches("/api/auth/login")).toBe(false);
    expect(matches("/api/auth/callback")).toBe(false);
    expect(matches("/api/auth/logout")).toBe(false);
  });

  it("probe: keeps that exemption to paths under /api/auth/", () => {
    // The trailing slash is load-bearing. Without it this would exempt every
    // path merely starting with `api/auth`, and a route added later — an
    // `/api/authorize`, an `/api/auth-debug` — would be born outside the gate,
    // silently, on the deployment where the gate is the only thing in front of
    // a management key.
    expect(matches("/api/authorize")).toBe(true);
    expect(matches("/api/auth-debug")).toBe(true);
    expect(matches("/api/auth")).toBe(true);
  });

  it("exempts those three routes and not their prefixes", () => {
    // Each exemption is a route, not a namespace. Unanchored, `api/health`
    // would exempt anything merely starting with it, so a route added later
    // under a similar name would be born outside the gate — on the one
    // deployment where the gate is all that stands in front of a management
    // key (deploy/k8s/).
    expect(matches("/api/health-details")).toBe(true);
    expect(matches("/api/healthz")).toBe(true);
    expect(matches("/api/logins")).toBe(true);
    expect(matches("/login-as")).toBe(true);
    // …while the prefixes stay prefixes: static assets do have paths under them.
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
  });
});
