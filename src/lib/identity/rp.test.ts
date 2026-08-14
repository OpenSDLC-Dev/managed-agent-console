// @vitest-environment node
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
import { type OidcConfig } from "./config";
import { type ProviderMetadata } from "./discovery";
import {
  RelyingPartyError,
  authorizationUrl,
  exchangeCode,
  resetJwksCacheForTests,
  resolveRedirectUri,
  safeReturnTo,
  verifyIdToken,
} from "./rp";

vi.mock("server-only", () => ({}));

const ISSUER = "https://idp.example.com";
const CLIENT_ID = "console-client";

const config: OidcConfig = {
  issuer: ISSUER,
  clientId: CLIENT_ID,
  scopes: ["openid", "profile", "email"],
};

const metadata: ProviderMetadata = {
  issuer: ISSUER,
  authorizationEndpoint: `${ISSUER}/authorize`,
  tokenEndpoint: `${ISSUER}/token`,
  jwksUri: `${ISSUER}/jwks`,
  tokenEndpointAuthMethods: [],
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  resetJwksCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeReturnTo", () => {
  it("keeps a same-origin path, query and all", () => {
    expect(safeReturnTo("/sessions?status=running")).toBe(
      "/sessions?status=running",
    );
  });

  it.each([undefined, null, ""])("defaults for %s", (raw) => {
    expect(safeReturnTo(raw)).toBe("/agents");
  });

  // The value arrives in a query string on a route an attacker can hand
  // somebody a link to, and it decides where this console sends a browser that
  // has just been asked to trust it. An open redirect here wears the
  // deployment's own hostname, which is exactly what a phishing page wants.
  it.each([
    ["an absolute URL", "https://evil.example/"],
    ["a protocol-relative URL", "//evil.example/"],
    ["the backslash spelling of one", "/\\evil.example/"],
    ["a scheme with no host", "javascript:alert(1)"],
    ["a bare path with no leading slash", "agents"],
  ])("probe: refuses %s", (_why, raw) => {
    expect(safeReturnTo(raw)).toBe("/agents");
  });

  it("probe: refuses a value that would split the Location header", () => {
    expect(safeReturnTo("/agents\r\nSet-Cookie: console_session=stolen")).toBe(
      "/agents",
    );
    expect(safeReturnTo("/agents\nX-Injected: 1")).toBe("/agents");
  });
});

describe("resolveRedirectUri", () => {
  const request = (headers: Record<string, string>, url: string) => ({
    headers: new Headers(headers),
    nextUrl: new URL(url),
  });

  it("prefers the configured value", () => {
    expect(
      resolveRedirectUri(request({}, "http://10.0.0.7:3000/api/auth/login"), {
        ...config,
        redirectUrl: "https://console.example/api/auth/callback",
      }),
    ).toBe("https://console.example/api/auth/callback");
  });

  it("derives https behind a TLS-terminating load balancer", () => {
    expect(
      resolveRedirectUri(
        request(
          {
            host: "10.0.0.7:3000",
            "x-forwarded-proto": "https",
            "x-forwarded-host": "console.example",
          },
          "http://10.0.0.7:3000/api/auth/login",
        ),
        config,
      ),
    ).toBe("https://console.example/api/auth/callback");
  });

  it("falls back to the request's own host", () => {
    expect(
      resolveRedirectUri(
        request(
          { host: "localhost:3000" },
          "http://localhost:3000/api/auth/login",
        ),
        config,
      ),
    ).toBe("http://localhost:3000/api/auth/callback");
  });
});

describe("authorizationUrl", () => {
  it("carries every parameter the flow needs, with S256", () => {
    const url = new URL(
      authorizationUrl(metadata, config, {
        state: "the-state",
        nonce: "the-nonce",
        codeChallenge: "the-challenge",
        redirectUri: "https://console.example/api/auth/callback",
      }),
    );
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: "https://console.example/api/auth/callback",
      scope: "openid profile email",
      state: "the-state",
      nonce: "the-nonce",
      code_challenge: "the-challenge",
      code_challenge_method: "S256",
    });
  });

  // `plain` is legal in RFC 7636 and worthless: a challenge equal to the
  // verifier protects against nothing an interceptor cannot already do.
  it("probe: never downgrades the challenge method", () => {
    const url = authorizationUrl(metadata, config, {
      state: "s",
      nonce: "n",
      codeChallenge: "c",
      redirectUri: "https://console.example/api/auth/callback",
    });
    expect(url).not.toContain("plain");
  });
});

describe("exchangeCode", () => {
  const params = {
    code: "the-code",
    verifier: "the-verifier",
    redirectUri: "https://console.example/api/auth/callback",
  };

  const respond = (body: unknown, status = 200) =>
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );

  it("posts the code with its verifier", async () => {
    respond({ id_token: "the-id-token", refresh_token: "the-refresh" });
    const tokens = await exchangeCode(metadata, config, params);
    expect(tokens).toEqual({
      idToken: "the-id-token",
      refreshToken: "the-refresh",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${ISSUER}/token`);
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual(
      {
        grant_type: "authorization_code",
        code: "the-code",
        redirect_uri: params.redirectUri,
        code_verifier: "the-verifier",
        client_id: CLIENT_ID,
      },
    );
  });

  it("omits a refresh token the provider did not issue", async () => {
    respond({ id_token: "the-id-token" });
    expect(await exchangeCode(metadata, config, params)).toEqual({
      idToken: "the-id-token",
    });
  });

  it("uses Basic auth by default, as OIDC specifies", async () => {
    respond({ id_token: "t" });
    await exchangeCode(metadata, { ...config, clientSecret: "s3cret" }, params);
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${btoa(`${CLIENT_ID}:s3cret`)}`,
    );
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("s3cret");
  });

  // RFC 6749 §2.3.1 says form-urlencoded, which is not `encodeURIComponent`:
  // a space is `+`, not `%20`. A provider decoding the other spelling sees a
  // different secret and refuses every exchange with an opaque 401 (found in
  // review, PR #94).
  it("probe: form-urlencodes each half of the Basic credential", async () => {
    respond({ id_token: "t" });
    await exchangeCode(
      metadata,
      { ...config, clientId: "client id", clientSecret: "a b+c/d=e" },
      params,
    );
    const header = new Headers(fetchMock.mock.calls[0][1]?.headers).get(
      "authorization",
    );
    const [id, secret] = atob(
      String(header).slice("Basic ".length).trim(),
    ).split(":");
    expect(id).toBe("client+id");
    expect(secret).toBe("a+b%2Bc%2Fd%3De");
    // And the round trip a conforming provider performs recovers the originals.
    expect(new URLSearchParams(`v=${id}`).get("v")).toBe("client id");
    expect(new URLSearchParams(`v=${secret}`).get("v")).toBe("a b+c/d=e");
  });

  it("uses the body when that is the only method the provider advertises", async () => {
    respond({ id_token: "t" });
    await exchangeCode(
      { ...metadata, tokenEndpointAuthMethods: ["client_secret_post"] },
      { ...config, clientSecret: "s3cret" },
      params,
    );
    expect(
      new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization"),
    ).toBeNull();
    expect(
      Object.fromEntries(
        new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body)),
      ),
    ).toMatchObject({ client_secret: "s3cret" });
  });

  it("sends no client credential at all for a public client", async () => {
    respond({ id_token: "t" });
    await exchangeCode(metadata, config, params);
    expect(
      new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization"),
    ).toBeNull();
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain(
      "client_secret",
    );
  });

  it("quotes the provider's error code and nothing else", async () => {
    respond(
      {
        error: "invalid_grant",
        error_description: "code was issued to https://evil.example",
      },
      400,
    );
    await expect(exchangeCode(metadata, config, params)).rejects.toThrow(
      /invalid_grant/,
    );
    await expect(exchangeCode(metadata, config, params)).rejects.not.toThrow(
      /evil.example/,
    );
  });

  it("refuses a provider error code that is not a code", async () => {
    respond({ error: "<script>alert(1)</script>" }, 400);
    await expect(exchangeCode(metadata, config, params)).rejects.toThrow(/400/);
    await expect(exchangeCode(metadata, config, params)).rejects.not.toThrow(
      /script/,
    );
  });

  it("says what is wrong when the provider returns no id_token", async () => {
    respond({ access_token: "an-access-token" });
    await expect(exchangeCode(metadata, config, params)).rejects.toThrow(
      /no id_token/,
    );
  });

  it("survives a non-JSON body", async () => {
    fetchMock.mockImplementation(
      async () => new Response("<html>gateway error</html>", { status: 502 }),
    );
    await expect(exchangeCode(metadata, config, params)).rejects.toBeInstanceOf(
      RelyingPartyError,
    );
  });
});

describe("verifyIdToken", () => {
  let privateKey: CryptoKey;
  let jwk: JWK;

  // Generated once, and ES256 rather than RS256: key generation is the most
  // expensive thing in this file, per-test RSA keygen was slow enough to time
  // out under a loaded machine, and P-256 is in the platform verifier's own
  // algorithm allowlist (`internal/identity/config.go`) so nothing about what
  // is being proved changes.
  beforeAll(async () => {
    const pair = await generateKeyPair("ES256", { extractable: true });
    privateKey = pair.privateKey;
    jwk = await exportJWK(pair.publicKey);
    jwk.alg = "ES256";
    jwk.kid = "test-key";
  });

  beforeEach(() => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
  });

  const sign = (
    claims: Record<string, unknown>,
    overrides: { issuer?: string; audience?: string | string[] } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience(overrides.audience ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("1h")
      .setSubject("user-1")
      .sign(privateKey);

  it("verifies a well-formed token and reads the operator out of it", async () => {
    const token = await sign({
      nonce: "the-nonce",
      email: "operator@example.com",
      name: "An Operator",
    });
    const identity = await verifyIdToken(metadata, config, token, "the-nonce");
    expect(identity).toMatchObject({
      subject: "user-1",
      email: "operator@example.com",
      name: "An Operator",
    });
    expect(identity.expiresAt).toBeGreaterThan(Date.now());
  });

  // The nonce is the only thing tying this token to the authorization request
  // this browser started. Without the check, a token captured from any other
  // flow for the same client would complete a sign-in here.
  it("probe: refuses a token whose nonce is not the one we sent", async () => {
    const token = await sign({ nonce: "someone-elses-nonce" });
    await expect(
      verifyIdToken(metadata, config, token, "the-nonce"),
    ).rejects.toThrow(/replayed a nonce/);
  });

  it("probe: refuses a token carrying no nonce at all", async () => {
    const token = await sign({});
    await expect(
      verifyIdToken(metadata, config, token, "the-nonce"),
    ).rejects.toThrow(/replayed a nonce/);
  });

  it("probe: refuses a token minted for a different audience", async () => {
    const token = await sign(
      { nonce: "the-nonce" },
      { audience: "another-client" },
    );
    await expect(
      verifyIdToken(metadata, config, token, "the-nonce"),
    ).rejects.toThrow(/failed verification/);
  });

  it("probe: refuses a token from a different issuer", async () => {
    const token = await sign(
      { nonce: "the-nonce" },
      { issuer: "https://evil.example" },
    );
    await expect(
      verifyIdToken(metadata, config, token, "the-nonce"),
    ).rejects.toThrow(/failed verification/);
  });

  it("probe: refuses a token signed by a key the provider does not publish", async () => {
    const other = await generateKeyPair("ES256", { extractable: true });
    const token = await new SignJWT({ nonce: "the-nonce" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("1h")
      .setSubject("user-1")
      .sign(other.privateKey);
    await expect(
      verifyIdToken(metadata, config, token, "the-nonce"),
    ).rejects.toThrow(/failed verification/);
  });

  // jose enforces `exp` only when it is present. Without `requiredClaims` a
  // token carrying none would verify, `expiresAt` would be 0, and the operator
  // would land on a session that had already expired — a sign-in that silently
  // does nothing (found in review, PR #94).
  it("probe: refuses a token with no exp claim", async () => {
    const token = await new SignJWT({ nonce: "the-nonce" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setSubject("user-1")
      .sign(privateKey);
    await expect(
      verifyIdToken(metadata, config, token, "the-nonce"),
    ).rejects.toThrow(/failed verification/);
  });

  it("probe: refuses an expired token", async () => {
    const token = await new SignJWT({ nonce: "the-nonce" })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .setSubject("user-1")
      .sign(privateKey);
    await expect(
      verifyIdToken(metadata, config, token, "the-nonce"),
    ).rejects.toThrow(/failed verification/);
  });

  // `azp` is only meaningful when `aud` has more than one value; jose has
  // already required our client id to be among them.
  it("probe: refuses a multi-audience token authorized for another client", async () => {
    const token = await new SignJWT({
      nonce: "the-nonce",
      azp: "another-client",
    })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience([CLIENT_ID, "another-client"])
      .setIssuedAt()
      .setExpirationTime("1h")
      .setSubject("user-1")
      .sign(privateKey);
    await expect(
      verifyIdToken(metadata, config, token, "the-nonce"),
    ).rejects.toThrow(/different client/);
  });

  it("accepts a multi-audience token whose azp is us", async () => {
    const token = await new SignJWT({ nonce: "the-nonce", azp: CLIENT_ID })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience([CLIENT_ID, "another-client"])
      .setIssuedAt()
      .setExpirationTime("1h")
      .setSubject("user-1")
      .sign(privateKey);
    await expect(
      verifyIdToken(metadata, config, token, "the-nonce"),
    ).resolves.toMatchObject({ subject: "user-1" });
  });

  // jose's own messages quote header and claim values off a token this console
  // is about to refuse — which lands in a log, and possibly in a response.
  it("probe: never quotes the token in its refusal", async () => {
    const token = await sign({ nonce: "a-secret-nonce-value" });
    try {
      await verifyIdToken(metadata, config, token, "the-nonce");
      expect.unreachable("this token must be refused");
    } catch (error) {
      const serialized = `${(error as Error).message}${(error as Error).stack ?? ""}`;
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain("a-secret-nonce-value");
    }
  });
});
