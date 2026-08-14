// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const loginRequest = (
  body: string,
  url = "http://localhost:3000/api/login",
  headers: Record<string, string> = {},
) =>
  new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

const cookieValue = (setCookie: string) =>
  decodeURIComponent(
    new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(setCookie)?.[1] ?? "",
  );

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/login", () => {
  it("reports the gate disabled when CONSOLE_PASSWORD is unset", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", undefined);
    const response = await POST(
      loginRequest(JSON.stringify({ password: "anything" })),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, gate: false });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a wrong password with the wire error envelope", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const response = await POST(
      loginRequest(JSON.stringify({ password: "wrong" })),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      type: "error",
      error: { type: "authentication_error", message: "wrong password" },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a malformed (non-JSON) body", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const response = await POST(loginRequest("not json"));
    expect(response.status).toBe(401);
  });

  it("rejects a body without a password field", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const response = await POST(loginRequest(JSON.stringify({})));
    expect(response.status).toBe(401);
  });

  it("sets a valid session cookie for the right password", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const response = await POST(
      loginRequest(JSON.stringify({ password: "hunter2" })),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, gate: true });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(await isValidSession(cookieValue(setCookie), "hunter2")).toBe(true);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain(`Max-Age=${60 * 60 * 24 * 30}`);
    expect(setCookie).not.toMatch(/secure/i);
  });

  it("marks the cookie Secure on https deployments", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const response = await POST(
      loginRequest(
        JSON.stringify({ password: "hunter2" }),
        "https://console.example/api/login",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/secure/i);
  });

  // Every deployment in deploy/ terminates TLS at a load balancer and forwards
  // plain http to the pod, so the request's own protocol says http and the
  // cookie would be minted without Secure — sendable over a downgrade.
  it("marks the cookie Secure behind a TLS-terminating load balancer", async () => {
    vi.stubEnv("CONSOLE_PASSWORD", "hunter2");
    const response = await POST(
      loginRequest(
        JSON.stringify({ password: "hunter2" }),
        "http://10.0.0.7:3000/api/login",
        { "x-forwarded-proto": "https" },
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/secure/i);
  });
});
