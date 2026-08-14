// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDENTITY_COOKIE,
  putSession,
  resetIdentityStoreForTests,
} from "@/lib/identity/session";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const request = (cookie?: string) =>
  new NextRequest(
    "http://localhost:3000/api/auth/session",
    cookie === undefined ? {} : { headers: { cookie } },
  );

const configureOidc = () => {
  vi.stubEnv("IDENTITY_MODE", "oidc");
  vi.stubEnv("IDENTITY_OIDC_ISSUER", "https://idp.example.com");
  vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", "console-client");
};

beforeEach(() => {
  vi.stubEnv("IDENTITY_MODE", undefined);
  vi.stubEnv("CONSOLE_PASSWORD", undefined);
  resetIdentityStoreForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/auth/session", () => {
  it("is absent on a deployment without identity", async () => {
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "not_found_error" },
    });
  });

  it("reports nobody signed in when the browser has no session", async () => {
    configureOidc();
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signed_in: false });
  });

  it("names the operator a provider identified", async () => {
    configureOidc();
    putSession("sid", {
      idToken: "header.payload.signature",
      expiresAt: Date.now() + 60_000,
      subject: "operator-1",
      email: "operator@example.test",
      name: "Stub Operator",
    });
    const response = await GET(request(`${IDENTITY_COOKIE}=sid`));
    expect(await response.json()).toEqual({
      signed_in: true,
      email: "operator@example.test",
      name: "Stub Operator",
    });
    // Per-browser state that changes on sign-in, sign-out and pod restart.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // The whole point of D2 is that the token never leaves the server. This route
  // is the only one that returns anything *about* a session, so it is where that
  // could quietly stop being true.
  it("probe: never serializes the ID token, the subject, or a role", async () => {
    configureOidc();
    putSession("sid", {
      idToken: "header.payload.signature",
      refreshToken: "refresh-me",
      expiresAt: Date.now() + 60_000,
      subject: "operator-1",
      email: "operator@example.test",
    });
    const body = await (await GET(request(`${IDENTITY_COOKIE}=sid`))).text();
    expect(body).not.toContain("header.payload.signature");
    expect(body).not.toContain("refresh-me");
    expect(body).not.toContain("operator-1");
    expect(body).not.toContain("role");
    expect(JSON.parse(body)).toEqual({
      signed_in: true,
      email: "operator@example.test",
    });
  });

  it("probe: an expired session is nobody, not a stale name", async () => {
    configureOidc();
    putSession("sid", {
      idToken: "header.payload.signature",
      expiresAt: Date.now() - 1,
      subject: "operator-1",
      email: "operator@example.test",
    });
    expect(await (await GET(request(`${IDENTITY_COOKIE}=sid`))).json()).toEqual(
      {
        signed_in: false,
      },
    );
  });

  // A console that cannot parse its identity configuration is already 503 at
  // /api/health. Here the shell should render no account block rather than 500.
  it("reads a broken identity configuration as no identity", async () => {
    vi.stubEnv("IDENTITY_MODE", "oidc");
    vi.stubEnv("IDENTITY_OIDC_ISSUER", undefined);
    vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", undefined);
    expect((await GET(request())).status).toBe(404);
  });
});
