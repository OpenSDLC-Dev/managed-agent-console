// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSession,
  putSession,
  resetIdentityStoreForTests,
} from "@/lib/identity/session";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const request = (
  cookie?: string,
  url = "http://localhost:3000/api/auth/logout",
) =>
  new NextRequest(url, {
    method: "POST",
    ...(cookie ? { headers: { cookie } } : {}),
  });

beforeEach(() => {
  resetIdentityStoreForTests();
});

describe("POST /api/auth/logout", () => {
  it("destroys the session and clears the handle", async () => {
    putSession("sid", {
      idToken: "id-token",
      expiresAt: Date.now() + 60_000,
      subject: "user-1",
    });
    const response = await POST(request("console_identity=sid"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    // The token is destroyed here, not merely unreferenced by the browser.
    expect(getSession("sid", Date.now())).toBeUndefined();
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("console_identity=;");
    expect(cookie).toContain("Max-Age=0");
  });

  it("is a no-op for a caller with no session", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
  });

  it("leaves another operator's session alone", async () => {
    putSession("other", {
      idToken: "id-token",
      expiresAt: Date.now() + 60_000,
      subject: "user-2",
    });
    await POST(request("console_identity=sid"));
    expect(getSession("other", Date.now())).toBeDefined();
  });

  it("marks the cleared cookie Secure behind a TLS-terminating proxy", async () => {
    const response = await POST(
      new NextRequest("http://10.0.0.7:3000/api/auth/logout", {
        method: "POST",
        headers: { "x-forwarded-proto": "https" },
      }),
    );
    expect(response.headers.get("set-cookie")).toMatch(/secure/i);
  });
});
