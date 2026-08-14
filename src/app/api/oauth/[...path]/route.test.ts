// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PLATFORM_BASE_URL", "http://platform.local");
  vi.stubEnv("PLATFORM_API_KEY", "sk-mgmt-test");
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
