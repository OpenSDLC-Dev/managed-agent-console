// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDiscoveryCacheForTests } from "@/lib/identity/discovery";
import {
  resetIdentityStoreForTests,
  takePending,
} from "@/lib/identity/session";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const ISSUER = "https://idp.example.com";
const fetchMock = vi.fn<typeof fetch>();

const discoveryDocument = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
};

const request = (query = "") =>
  new NextRequest(`http://localhost:3000/api/auth/login${query}`);

const configureOidc = () => {
  vi.stubEnv("IDENTITY_MODE", "oidc");
  vi.stubEnv("IDENTITY_OIDC_ISSUER", ISSUER);
  vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", "console-client");
};

const setCookie = (response: Response) =>
  response.headers.get("set-cookie") ?? "";

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify(discoveryDocument), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("CONSOLE_PASSWORD", undefined);
  vi.stubEnv("IDENTITY_MODE", undefined);
  resetDiscoveryCacheForTests();
  resetIdentityStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/auth/login", () => {
  it("redirects to the provider with a state, nonce and S256 challenge", async () => {
    configureOidc();
    const response = await GET(request());
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(`${ISSUER}/authorize`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("client_id")).toBe("console-client");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(location.searchParams.get("nonce")).toBeTruthy();
  });

  // Remembering `state` server-side is not enough: a third party could start a
  // flow, keep its `state`, and walk a victim through the callback so the
  // attacker's identity lands in the victim's console. Binding it to a cookie
  // is what makes the callback able to tell whose flow it is finishing.
  it("probe: binds the state to this browser with a cookie", async () => {
    configureOidc();
    const response = await GET(request());
    const state = new URL(
      response.headers.get("location") ?? "",
    ).searchParams.get("state");
    const cookie = setCookie(response);
    expect(cookie).toContain(`console_auth_state=${state}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    // Narrow path: nothing outside the callback ever reads it.
    expect(cookie).toContain("Path=/api/auth");
  });

  it("probe: never puts the verifier where the browser can see it", async () => {
    configureOidc();
    const response = await GET(request());
    const state = new URL(
      response.headers.get("location") ?? "",
    ).searchParams.get("state");
    const pending = takePending(state ?? "", Date.now());
    expect(pending?.verifier).toBeTruthy();
    const visible = `${response.headers.get("location")}${setCookie(response)}`;
    expect(visible).not.toContain(pending?.verifier ?? "impossible");
    // The nonce goes to the provider, but never the value the challenge was
    // derived from — that is the entire point of PKCE.
    expect(visible).toContain(pending?.nonce ?? "impossible");
  });

  it("remembers where to send the browser back to", async () => {
    configureOidc();
    const response = await GET(request("?return_to=/sessions"));
    const state = new URL(
      response.headers.get("location") ?? "",
    ).searchParams.get("state");
    expect(takePending(state ?? "", Date.now())?.returnTo).toBe("/sessions");
  });

  it("probe: refuses to remember an off-origin return path", async () => {
    configureOidc();
    const response = await GET(request("?return_to=https://evil.example"));
    const state = new URL(
      response.headers.get("location") ?? "",
    ).searchParams.get("state");
    expect(takePending(state ?? "", Date.now())?.returnTo).toBe("/agents");
  });

  // On a deployment without identity this surface does not exist, and that is
  // the same answer any unrouted path gets — not a 403, which would confirm
  // the route while refusing it.
  it("is absent when identity is not configured", async () => {
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "not_found_error" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the browser back to the login page when discovery fails", async () => {
    configureOidc();
    fetchMock.mockRejectedValue(new TypeError("connect ECONNREFUSED"));
    const response = await GET(request());
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("sso_error")).toBe("provider_unavailable");
  });

  it("probe: says nothing about the provider in that redirect", async () => {
    configureOidc();
    fetchMock.mockRejectedValue(
      new TypeError("connect ECONNREFUSED 10.0.0.7:8000"),
    );
    const response = await GET(request());
    const serialized = `${response.headers.get("location")}${await response.text()}`;
    expect(serialized).not.toContain("10.0.0.7");
    expect(serialized).not.toContain("idp.example.com");
  });
});
