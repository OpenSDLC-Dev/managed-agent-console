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
    // waits on it never finishes. The exemption is total, query string and
    // all; the route gates its own `?deep=1` depth instead, because that one
    // spends the management key. See deploy/k8s/README.md.
    expect(matches("/api/health")).toBe(false);
  });
});
