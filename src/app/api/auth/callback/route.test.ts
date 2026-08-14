// @vitest-environment node
import { NextRequest } from "next/server";
import { SignJWT, type JWK, exportJWK, generateKeyPair } from "jose";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { resetDiscoveryCacheForTests } from "@/lib/identity/discovery";
import { resetJwksCacheForTests } from "@/lib/identity/rp";
import {
  getSession,
  putPending,
  resetIdentityStoreForTests,
} from "@/lib/identity/session";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const ISSUER = "https://idp.example.com";
const CLIENT_ID = "console-client";
const STATE = "the-state-value";
const NONCE = "the-nonce-value";

let privateKey: CryptoKey;
let jwk: JWK;
let idToken: string;

const fetchMock = vi.fn<typeof fetch>();

/** Routes the three calls a callback makes: discovery, token exchange, JWKS. */
function route(overrides: { token?: () => Response } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes(".well-known")) {
      return json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
      });
    }
    if (url.endsWith("/token")) {
      return overrides.token ? overrides.token() : json({ id_token: idToken });
    }
    if (url.endsWith("/jwks")) return json({ keys: [jwk] });
    throw new Error(`unexpected fetch to ${url}`);
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const request = (query: string, cookie?: string) =>
  new NextRequest(
    `http://localhost:3000/api/auth/callback${query}`,
    cookie ? { headers: { cookie } } : undefined,
  );

/**
 * The shape the standalone server actually hands a route handler: the URL is
 * built from the address the process bound (`HOSTNAME=0.0.0.0`), while the host
 * the browser used survives only in the header — and that header is
 * client-supplied wherever an ingress does not overwrite it, so neither of the
 * two hosts visible here may appear in a `Location`.
 */
const asStandalone = (query: string, cookie: string, forwarded?: string) =>
  new NextRequest(`http://0.0.0.0:3300/api/auth/callback${query}`, {
    headers: {
      cookie,
      host: "console.example.com",
      ...(forwarded === undefined ? {} : { "x-forwarded-host": forwarded }),
    },
  });

const stateCookie = (value = STATE) => `console_auth_state=${value}`;

const pending = () =>
  putPending(STATE, {
    verifier: "the-verifier",
    nonce: NONCE,
    returnTo: "/sessions",
    redirectUri: "http://localhost:3000/api/auth/callback",
    createdAt: Date.now(),
  });

const sessionIdFrom = (response: Response) =>
  /console_identity=([^;]*)/.exec(
    response.headers.get("set-cookie") ?? "",
  )?.[1];

/**
 * Resolves the `Location` the way a browser does — against the URL it
 * requested. These redirects are relative references on purpose, so an
 * assertion that parses one as absolute is asserting the wrong thing.
 */
const locationFrom = (response: Response) =>
  new URL(response.headers.get("location") ?? "", "http://console.example.com");

const errorFrom = (response: Response) =>
  locationFrom(response).searchParams.get("sso_error");

// Generated once: key generation is the most expensive thing in this file, and
// ES256 is in the platform verifier's own algorithm allowlist
// (`internal/identity/config.go`), so nothing about what is proved changes.
beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  jwk = await exportJWK(pair.publicKey);
  jwk.alg = "ES256";
  jwk.kid = "test-key";
});

beforeEach(async () => {
  idToken = await new SignJWT({ nonce: NONCE, email: "operator@example.com" })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("1h")
    .setSubject("user-1")
    .sign(privateKey);

  fetchMock.mockReset();
  route();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("CONSOLE_PASSWORD", undefined);
  vi.stubEnv("IDENTITY_MODE", "oidc");
  vi.stubEnv("IDENTITY_OIDC_ISSUER", ISSUER);
  vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", CLIENT_ID);
  resetDiscoveryCacheForTests();
  resetJwksCacheForTests();
  resetIdentityStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/auth/callback", () => {
  it("completes a sign-in and lands on the remembered path", async () => {
    pending();
    const response = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    expect(response.status).toBe(302);
    expect(locationFrom(response).pathname).toBe("/sessions");
    const id = sessionIdFrom(response);
    expect(getSession(id, Date.now())).toMatchObject({
      subject: "user-1",
      email: "operator@example.com",
      idToken,
    });
  });

  // The bug this pins was found by signing in, not by reading: under the
  // standalone server this repo ships, a completed sign-in landed on
  // `http://0.0.0.0:3300/agents` — the address the process bound, and an origin
  // the session cookie, host-only for the real hostname, does not reach. The
  // operator arrives signed out on a host that does not resolve, which reads as
  // a broken console. The fix names no host at all: the browser resolves a
  // relative `Location` against the URL it really requested.
  it("names no host, so the browser lands where it already is", async () => {
    pending();
    const response = await GET(
      asStandalone(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    expect(response.headers.get("location")).toBe("/sessions");
    expect(sessionIdFrom(response)).toBeTruthy();
  });

  it("names no host on the way out of a failure either", async () => {
    const response = await GET(
      asStandalone("?error=access_denied", stateCookie()),
    );
    expect(response.headers.get("location")).toBe(
      "/login?sso_error=provider_refused",
    );
  });

  // `resolveRedirectUri` can survive a forged host because the provider refuses
  // a redirect URI it never registered. A `Location` is registered nowhere, so
  // the same trust here would be an open redirect wearing this deployment's
  // hostname — and the error arm is reachable without any credential at all.
  it.each([
    ["a completed sign-in", `?code=the-code&state=${STATE}`],
    ["the anonymous failure arm", "?error=access_denied"],
  ])("probe: a forged forwarded host cannot move %s", async (_what, query) => {
    pending();
    const response = await GET(
      asStandalone(query, stateCookie(), "evil.example"),
    );
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("/")).toBe(true);
    expect(location.startsWith("//")).toBe(false);
    expect(location).not.toContain("evil.example");
  });

  it("mints an httpOnly handle, and never the token itself", async () => {
    pending();
    const response = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    // The whole reason the store exists (plan 08 D2): the browser holds a
    // handle, not the credential.
    expect(cookie).not.toContain(idToken);
  });

  it("clears the single-use state cookie on the way out", async () => {
    pending();
    const response = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    expect(response.headers.get("set-cookie")).toContain(
      "console_auth_state=;",
    );
  });

  // Without the cookie half of the check, a third party could start a flow and
  // walk a victim through this URL to land the attacker's identity in the
  // victim's console — login CSRF, whose point is that nobody notices.
  it("probe: refuses a callback with no state cookie", async () => {
    pending();
    const response = await GET(request(`?code=the-code&state=${STATE}`));
    expect(errorFrom(response)).toBe("state_mismatch");
    expect(sessionIdFrom(response)).toBeUndefined();
  });

  it("probe: refuses a callback whose cookie names a different flow", async () => {
    pending();
    const response = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie("another-state")),
    );
    expect(errorFrom(response)).toBe("state_mismatch");
    expect(sessionIdFrom(response)).toBeUndefined();
  });

  it("probe: refuses a callback carrying no state at all", async () => {
    pending();
    const response = await GET(request("?code=the-code", stateCookie()));
    expect(errorFrom(response)).toBe("state_mismatch");
  });

  // The callback URL survives in history, in referrers, and in the provider's
  // logs. One authorization, one session.
  it("probe: refuses a replayed callback", async () => {
    pending();
    const first = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    expect(sessionIdFrom(first)).toBeTruthy();
    const second = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    expect(errorFrom(second)).toBe("state_mismatch");
    expect(sessionIdFrom(second)).toBeUndefined();
  });

  it("probe: refuses a token whose nonce is not the one this flow sent", async () => {
    putPending(STATE, {
      verifier: "the-verifier",
      nonce: "a-different-nonce",
      returnTo: "/agents",
      redirectUri: "http://localhost:3000/api/auth/callback",
      createdAt: Date.now(),
    });
    const response = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    expect(errorFrom(response)).toBe("session_failed");
    expect(sessionIdFrom(response)).toBeUndefined();
  });

  it("passes the provider's refusal through as one console-authored code", async () => {
    pending();
    route({
      token: () =>
        json({ error: "invalid_grant", error_description: "leak me" }, 400),
    });
    const response = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    expect(errorFrom(response)).toBe("session_failed");
  });

  it("reports the provider's own error response without reflecting it", async () => {
    const response = await GET(
      request(
        "?error=access_denied&error_description=user+said+no",
        stateCookie(),
      ),
    );
    expect(errorFrom(response)).toBe("provider_refused");
    const serialized = `${response.headers.get("location")}`;
    expect(serialized).not.toContain("user");
    expect(serialized).not.toContain("access_denied");
  });

  // Every failure past the state check answers with the same code. A browser at
  // the end of a redirect has no use for the difference, and the difference is
  // what an attacker probing this route would like to learn.
  it("probe: never reflects anything from the query string", async () => {
    pending();
    const response = await GET(
      request(
        `?code=%3Cscript%3Ealert(1)%3C/script%3E&state=${STATE}&foo=evil.example`,
        stateCookie(),
      ),
    );
    const serialized = `${response.headers.get("location")}${await response.text()}`;
    expect(serialized).not.toContain("script");
    expect(serialized).not.toContain("evil.example");
  });

  it("is absent when identity is not configured", async () => {
    vi.stubEnv("IDENTITY_MODE", undefined);
    const response = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps the session even when the provider issues a very long-lived token", async () => {
    idToken = await new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("30d")
      .setSubject("user-1")
      .sign(privateKey);
    route();
    pending();
    const response = await GET(
      request(`?code=the-code&state=${STATE}`, stateCookie()),
    );
    const session = getSession(sessionIdFrom(response), Date.now());
    expect(session?.expiresAt).toBeLessThanOrEqual(
      Date.now() + 24 * 60 * 60 * 1000 + 1000,
    );
  });
});
