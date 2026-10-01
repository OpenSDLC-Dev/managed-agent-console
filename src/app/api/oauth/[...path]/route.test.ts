// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDENTITY_COOKIE,
  getSession,
  putSession,
  resetIdentityStoreForTests,
} from "@/lib/identity/session";
import { SIGNED_OUT_HEADER } from "@/lib/identity/signed-out";
import { GET, POST } from "./route";

vi.mock("server-only", () => ({}));

type ProxyInit = RequestInit & { duplex?: "half" };

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

const fetchMock = vi.fn<typeof fetch>();

const upstreamCall = (index = 0): [string, ProxyInit] => {
  const [url, init] = fetchMock.mock.calls[index];
  return [String(url), (init ?? {}) as ProxyInit];
};

const TOKENS = "organizations/default/environments/env_byoc1/tokens";
const REVOKE = `${TOKENS}/envkey_1/revoke`;

// An organization this console does not manage, spelled as the platform's
// foreign-organization branch reads one: a UUID (managed-agent-platform#820).
const FOREIGN_ORG = "8d3f6c2e-4b1a-4f6e-9c7d-2a5b8e1f0c3d";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PLATFORM_BASE_URL", "http://platform.local");
  vi.stubEnv("PLATFORM_API_KEY", "sk-mgmt-test");
  vi.stubEnv("IDENTITY_MODE", undefined);
  resetIdentityStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("console-API BFF passthrough", () => {
  it("forwards the listing under the reference's own path", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/oauth/${TOKENS}?limit=100`),
      ctx(...TOKENS.split("/")),
    );
    expect(response.status).toBe(200);
    const [url] = upstreamCall();
    expect(url).toBe(`http://platform.local/api/oauth/${TOKENS}?limit=100`);
  });

  it("injects the management key and never forwards a browser-supplied one", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await POST(
      new NextRequest(`http://localhost:3000/api/oauth/${TOKENS}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "browser-supplied-key",
          authorization: "Bearer nope",
          cookie: "console_session=abc",
        },
        body: JSON.stringify({ name: "prod" }),
      }),
      ctx(...TOKENS.split("/")),
    );
    const [, init] = upstreamCall();
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("sk-mgmt-test");
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
  });

  it("forwards the revoke path", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await POST(
      new NextRequest(`http://localhost:3000/api/oauth/${REVOKE}`, {
        method: "POST",
      }),
      ctx(...REVOKE.split("/")),
    );
    expect(response.status).toBe(204);
    const [url] = upstreamCall();
    expect(url).toBe(`http://platform.local/api/oauth/${REVOKE}`);
  });

  it("passes the credential route's no-store header back to the browser", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: "sk-map-env01-x" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }),
    );
    const response = await POST(
      new NextRequest(`http://localhost:3000/api/oauth/${TOKENS}`, {
        method: "POST",
      }),
      ctx(...TOKENS.split("/")),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // The gate is the whole point of this route existing separately: a
  // passthrough that forwards anything lends a management credential to
  // arbitrary upstream paths.
  it.each([
    [
      "a path outside the allowlist",
      "GET",
      ["organizations", "default", "environments"],
    ],
    [
      "another console surface",
      "GET",
      ["organizations", "default", "api_keys"],
    ],
    ["a deeper path under tokens", "GET", [...TOKENS.split("/"), "envkey_1"]],
    ["DELETE on the collection", "DELETE", TOKENS.split("/")],
    ["GET on revoke", "GET", REVOKE.split("/")],
    [
      "traversal spelled as a segment",
      "GET",
      ["organizations", "default", "environments", "..", "v1", "agents"],
    ],
    // The shape-matching traversals. Next hands the catch-all decoded, so
    // `%2e%2e` arrives as `..` in a slot the old `[^/]+` accepted — and the
    // URL `fetch` then builds resolves it away, sending the credential to a
    // path this gate never approved (PR #86 review, P1).
    [
      "a dot-dot organization, which the shape would otherwise admit",
      "GET",
      ["organizations", "..", "environments", "env_byoc1", "tokens"],
    ],
    [
      "a dot-dot environment",
      "GET",
      ["organizations", "default", "environments", "..", "tokens"],
    ],
    [
      "a dot-dot token id on revoke",
      "POST",
      [
        "organizations",
        "default",
        "environments",
        "env_byoc1",
        "tokens",
        "..",
        "revoke",
      ],
    ],
    [
      "a single-dot segment",
      "GET",
      ["organizations", ".", "environments", "env_byoc1", "tokens"],
    ],
    // Double-encoded input survives Next's one decoding pass as a literal
    // `%2e%2e`, which the URL standard still resolves as `..`.
    [
      "a double-encoded traversal",
      "GET",
      ["organizations", "%2e%2e", "environments", "env_byoc1", "tokens"],
    ],
    [
      "an empty segment",
      "GET",
      ["organizations", "", "environments", "env_byoc1", "tokens"],
    ],
    // The organization is pinned to the one this console manages. The platform
    // answers a foreign UUID with a 401 (managed-agent-platform#820), which
    // `forward` would read as the operator's own token refused.
    [
      "a foreign organization UUID on the listing",
      "GET",
      ["organizations", FOREIGN_ORG, "environments", "env_byoc1", "tokens"],
    ],
    [
      "a foreign organization UUID on issuance",
      "POST",
      ["organizations", FOREIGN_ORG, "environments", "env_byoc1", "tokens"],
    ],
    [
      "a foreign organization UUID on revoke",
      "POST",
      [
        "organizations",
        FOREIGN_ORG,
        "environments",
        "env_byoc1",
        "tokens",
        "envkey_1",
        "revoke",
      ],
    ],
    [
      "an organization other than default",
      "GET",
      ["organizations", "acme", "environments", "env_byoc1", "tokens"],
    ],
  ])(
    "refuses %s without contacting the platform",
    async (_label, method, path) => {
      const handler = method === "GET" ? GET : POST;
      const response = await handler(
        new NextRequest(`http://localhost:3000/api/oauth/${path.join("/")}`, {
          method: method === "GET" ? "GET" : method,
        }),
        ctx(...path),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        type: "error",
        error: { type: "invalid_request_error" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("returns the api_error envelope when the key is missing", async () => {
    vi.stubEnv("PLATFORM_API_KEY", undefined);
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/oauth/${TOKENS}`),
      ctx(...TOKENS.split("/")),
    );
    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the platform is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/oauth/${TOKENS}`),
      ctx(...TOKENS.split("/")),
    );
    expect(response.status).toBe(502);
  });
});

// The sign-out a cross-site link could otherwise cause. The identity cookie is
// `SameSite=Lax`, so a top-level navigation from another site carries it, and
// `forward` ends the session on any upstream 401. The platform answers a
// foreign organization UUID with exactly that 401 (managed-agent-platform#820),
// so a link naming one would sign an operator out — unless this route refuses
// it first, without touching the session.
describe("identity mode", () => {
  const configureOidc = () => {
    vi.stubEnv("IDENTITY_MODE", "oidc");
    vi.stubEnv("IDENTITY_OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", "console-client");
  };

  const signIn = () =>
    putSession("sid", {
      idToken: "id-token",
      expiresAt: Date.now() + 60_000,
      subject: "user-1",
    });

  const asOperator = (path: string[], method = "GET") =>
    (method === "GET" ? GET : POST)(
      new NextRequest(`http://localhost:3000/api/oauth/${path.join("/")}`, {
        method,
        headers: { cookie: `${IDENTITY_COOKIE}=sid` },
      }),
      ctx(...path),
    );

  it("probe: a foreign organization is refused without ending the operator's session", async () => {
    configureOidc();
    signIn();
    // What the platform would answer, were the request forwarded.
    fetchMock.mockResolvedValue(
      new Response('{"type":"error"}', { status: 401 }),
    );

    for (const [path, method] of [
      [
        ["organizations", FOREIGN_ORG, "environments", "env_byoc1", "tokens"],
        "GET",
      ],
      [
        [
          "organizations",
          FOREIGN_ORG,
          "environments",
          "env_byoc1",
          "tokens",
          "envkey_1",
          "revoke",
        ],
        "POST",
      ],
    ] as const) {
      const refused = await asOperator([...path], method);
      expect(refused.status).toBe(404);
      expect(refused.headers.get(SIGNED_OUT_HEADER)).toBeNull();
      expect(refused.headers.get("set-cookie")).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSession("sid", Date.now())).toBeDefined();

    // The operator's own requests are still served on the same session.
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect((await asOperator(TOKENS.split("/"))).status).toBe(200);
    const [url, init] = upstreamCall();
    expect(url).toBe(`http://platform.local/api/oauth/${TOKENS}`);
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer id-token",
    );
  });
});
