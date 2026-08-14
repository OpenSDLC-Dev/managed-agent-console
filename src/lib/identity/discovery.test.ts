// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type OidcConfig } from "./config";
import {
  DiscoveryError,
  discover,
  resetDiscoveryCacheForTests,
} from "./discovery";

vi.mock("server-only", () => ({}));

const ISSUER = "https://idp.example.com";

const config: OidcConfig = {
  issuer: ISSUER,
  clientId: "console-client",
  scopes: ["openid"],
};

const document = (overrides: Record<string, unknown> = {}) => ({
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  ...overrides,
});

const fetchMock = vi.fn<typeof fetch>();

// A fresh Response per call: a body stream is single-use, so a shared one would
// make the second fetch in the cache test fail for a reason that is not the
// code's.
const answer = (body: unknown, status = 200) =>
  fetchMock.mockImplementation(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  resetDiscoveryCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Runs discover and asserts it refused, returning the defect. */
const refusal = async (): Promise<DiscoveryError> => {
  try {
    await discover(config);
  } catch (error) {
    if (error instanceof DiscoveryError) return error;
    throw error;
  }
  throw new Error("expected discovery to be refused, but it succeeded");
};

describe("discover", () => {
  it("reads the three endpoints from the provider's own document", async () => {
    answer(document({ end_session_endpoint: `${ISSUER}/logout` }));
    const metadata = await discover(config);
    expect(metadata).toMatchObject({
      issuer: ISSUER,
      authorizationEndpoint: `${ISSUER}/authorize`,
      tokenEndpoint: `${ISSUER}/token`,
      jwksUri: `${ISSUER}/jwks`,
      endSessionEndpoint: `${ISSUER}/logout`,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${ISSUER}/.well-known/openid-configuration`,
    );
  });

  it("does not double the slash on an issuer with a trailing one", async () => {
    answer(document());
    await discover({ ...config, issuer: ISSUER });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${ISSUER}/.well-known/openid-configuration`,
    );
  });

  it("reads the token endpoint's auth methods when the provider states them", async () => {
    answer(
      document({
        token_endpoint_auth_methods_supported: ["client_secret_post", 7, null],
      }),
    );
    const metadata = await discover(config);
    // Non-strings are dropped rather than trusted into a later comparison.
    expect(metadata.tokenEndpointAuthMethods).toEqual(["client_secret_post"]);
  });

  it("reports an empty list when the provider says nothing", async () => {
    answer(document());
    expect((await discover(config)).tokenEndpointAuthMethods).toEqual([]);
  });

  it("caches, so a page load is not a discovery round trip", async () => {
    answer(document());
    await discover(config, 1000);
    await discover(config, 1000 + 9 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await discover(config, 1000 + 11 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // OIDC Discovery §4.3. `iss` is compared as an exact string everywhere
  // downstream — including by the platform's own verifier — so a document
  // naming a different issuer describes a provider whose tokens this deployment
  // will reject on every request, and failing here says why once.
  it("probe: refuses a document that names a different issuer", async () => {
    answer(document({ issuer: "https://evil.example" }));
    expect((await refusal()).message).toMatch(/different issuer/);
  });

  it.each([
    ["a missing endpoint", { authorization_endpoint: undefined }],
    ["a relative endpoint", { token_endpoint: "/token" }],
    [
      "a plain-http endpoint",
      { token_endpoint: "http://idp.example.com/token" },
    ],
    [
      "credentials in an endpoint",
      { jwks_uri: "https://user:pw@idp.example.com/jwks" },
    ],
    ["a non-http scheme", { jwks_uri: "ftp://idp.example.com/jwks" }],
  ])("probe: refuses %s", async (_why, overrides) => {
    answer(document(overrides));
    await expect(discover(config)).rejects.toBeInstanceOf(DiscoveryError);
  });

  it("accepts http endpoints on a loopback host, as a local provider serves", async () => {
    const local = "http://localhost:8000";
    answer({
      issuer: local,
      authorization_endpoint: `${local}/authorize`,
      token_endpoint: `${local}/token`,
      jwks_uri: `${local}/jwks`,
    });
    await expect(discover({ ...config, issuer: local })).resolves.toMatchObject(
      {
        issuer: local,
      },
    );
  });

  it.each([
    ["a non-JSON body", "<html>not json</html>"],
    ["an array", [1, 2, 3]],
  ])("refuses %s", async (_why, body) => {
    answer(body);
    await expect(discover(config)).rejects.toBeInstanceOf(DiscoveryError);
  });

  it("refuses a non-OK response, and names the status", async () => {
    answer({}, 503);
    expect((await refusal()).message).toMatch(/answered 503/);
  });

  it("reports an unreachable provider without quoting the cause", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("connect ECONNREFUSED 10.0.0.7:8000"),
    );
    const error = await refusal();
    expect(error.message).toBe("the identity provider could not be reached");
    expect(error.message).not.toContain("10.0.0.7");
  });

  // A provider that streams without end would otherwise cost the pod rather
  // than the request. The document is operator-configured, which makes this
  // depth rather than the first line of defence — but the first line is a
  // human remembering, and this one is not.
  it("probe: bounds a document that never ends", async () => {
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(chunk);
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(discover(config)).rejects.toBeInstanceOf(DiscoveryError);
  });
});
