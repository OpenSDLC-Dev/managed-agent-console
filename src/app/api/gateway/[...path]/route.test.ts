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
import { DELETE, GET, POST } from "./route";

vi.mock("server-only", () => ({}));

type ProxyInit = RequestInit & { duplex?: "half" };

const ctx = (path: string) => ({
  params: Promise.resolve({ path: path.split("/") }),
});

const fetchMock = vi.fn<typeof fetch>();

const upstreamCall = (index = 0): [string, ProxyInit] => {
  const [url, init] = fetchMock.mock.calls[index];
  return [String(url), (init ?? {}) as ProxyInit];
};

const HANDLERS = { GET, POST, DELETE } as const;

function call(method: keyof typeof HANDLERS, path: string, cookie?: string) {
  return HANDLERS[method](
    new NextRequest(`http://localhost:3000/api/gateway/${path}`, {
      method,
      headers: cookie ? { cookie } : undefined,
    }),
    ctx(path),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PLATFORM_BASE_URL", "http://platform.local");
  vi.stubEnv("PLATFORM_API_KEY", "sk-bootstrap");
  vi.stubEnv("MODEL_GATEWAY_BASE_URL", "http://gateway.local:8090/");
  vi.stubEnv("IDENTITY_MODE", undefined);
  resetIdentityStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("model gateway BFF", () => {
  it("forwards to the gateway, not the control plane, with the query", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/gateway/admin/v1/usage/requests?limit=50&before=9",
      ),
      ctx("admin/v1/usage/requests"),
    );
    expect(response.status).toBe(200);
    const [url, init] = upstreamCall();
    expect(url).toBe(
      "http://gateway.local:8090/admin/v1/usage/requests?limit=50&before=9",
    );
    expect(new Headers(init.headers).get("x-api-key")).toBe("sk-bootstrap");
  });

  it.each([
    ["GET", "admin/v1/profiles"],
    ["POST", "admin/v1/providers"],
    ["DELETE", "admin/v1/providers/gwprov_abc"],
    ["POST", "admin/v1/providers/gwprov_abc/credentials"],
    ["DELETE", "admin/v1/providers/gwprov_abc/credentials/gwcred_1"],
    ["POST", "admin/v1/deployments/gwdep_1"],
    ["GET", "admin/v1/aliases/Qwen/Qwen3-Coder"],
    ["DELETE", "admin/v1/aliases/*"],
    ["GET", "admin/v1/key_policies"],
    ["POST", "admin/v1/key_policies/apikey_01abc"],
    ["GET", "admin/v1/usage/daily"],
  ] as const)("forwards %s %s", async (method, path) => {
    const response = await call(method, path);
    expect(response.status).toBe(200);
    expect(upstreamCall()[0]).toBe(`http://gateway.local:8090/${path}`);
    expect(upstreamCall()[1].method).toBe(method);
  });

  it.each([
    { method: "GET", path: "v1/agents", why: "the control plane's surface" },
    { method: "GET", path: "admin/v2/providers", why: "another admin version" },
    {
      method: "GET",
      path: "admin/v1/profiles/deepseek",
      why: "an unused route",
    },
    {
      method: "DELETE",
      path: "admin/v1/providers",
      why: "a collection delete",
    },
    { method: "POST", path: "admin/v1/usage/daily", why: "a ledger write" },
    {
      method: "POST",
      path: "admin/v1/key_policies",
      why: "a collection write",
    },
    {
      method: "GET",
      path: "admin/v1/providers/gwprov_1/credentials/x/y",
      why: "a deeper path",
    },
  ] as const)(
    "probe: refuses $method $path ($why) without forwarding",
    async ({ method, path }) => {
      const response = await call(method, path);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { type: "invalid_request_error" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a dot segment", ["admin", "v1", "aliases", ".."]],
    ["a decoded query", ["admin", "v1", "aliases", "a?b=c"]],
    ["a decoded fragment", ["admin", "v1", "aliases", "a#b"]],
    ["a percent", ["admin", "v1", "aliases", "%2e%2e"]],
    ["a backslash", ["admin", "v1", "providers", "a\\b"]],
  ])(
    "probe: refuses a model name carrying %s without forwarding",
    async (_, path) => {
      const response = await GET(
        new NextRequest("http://localhost:3000/api/gateway/x"),
        { params: Promise.resolve({ path }) },
      );
      expect(response.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("probe: answers not_found_error for every path while the gateway is unset", async () => {
    vi.stubEnv("MODEL_GATEWAY_BASE_URL", "");
    for (const path of ["admin/v1/aliases", "admin/v1/providers", "nope"]) {
      const response = await call("GET", path);
      expect(response.status).toBe(404);
      // The surface probe reads exactly this type as "not implemented".
      expect(await response.json()).toMatchObject({
        type: "error",
        error: { type: "not_found_error" },
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the gateway's variable when it does not answer", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const response = await call("GET", "admin/v1/aliases");
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: {
        message: "model gateway unreachable — check MODEL_GATEWAY_BASE_URL",
      },
    });
  });
});

describe("identity mode", () => {
  beforeEach(() => {
    vi.stubEnv("IDENTITY_MODE", "oidc");
    vi.stubEnv("IDENTITY_OIDC_ISSUER", "https://idp.example.com");
    vi.stubEnv("IDENTITY_OIDC_CLIENT_ID", "console-client");
    putSession("sid", {
      idToken: "id-token",
      expiresAt: Date.now() + 60_000,
      subject: "user-1",
    });
  });

  it("sends the operator's token and never the management key", async () => {
    await call("GET", "admin/v1/aliases", `${IDENTITY_COOKIE}=sid`);
    const headers = new Headers(upstreamCall()[1].headers);
    expect(headers.get("authorization")).toBe("Bearer id-token");
    expect(headers.get("x-api-key")).toBeNull();
  });

  it("probe: a gateway 401 reaches the browser but leaves the session alive", async () => {
    // What a gateway running without IDENTITY_* answers an operator token.
    fetchMock.mockResolvedValue(
      new Response(
        '{"type":"error","error":{"type":"authentication_error","message":"x"}}',
        { status: 401 },
      ),
    );
    const response = await call(
      "GET",
      "admin/v1/aliases",
      `${IDENTITY_COOKIE}=sid`,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get(SIGNED_OUT_HEADER)).toBeNull();
    expect(getSession("sid", Date.now())).toBeDefined();
  });

  it("refuses a browser without a session, as the control-plane proxy does", async () => {
    const response = await call("GET", "admin/v1/aliases");
    expect(response.status).toBe(401);
    expect(response.headers.get(SIGNED_OUT_HEADER)).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
