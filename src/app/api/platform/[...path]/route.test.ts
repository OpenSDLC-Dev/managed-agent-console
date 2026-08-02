// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH, POST, PUT } from "./route";

vi.mock("server-only", () => ({}));

type ProxyInit = RequestInit & { duplex?: "half" };

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

const fetchMock = vi.fn<typeof fetch>();

const upstreamCall = (index = 0): [string, ProxyInit] => {
  const [url, init] = fetchMock.mock.calls[index];
  return [String(url), (init ?? {}) as ProxyInit];
};

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

describe("platform BFF proxy", () => {
  it("exports one handler for every method", () => {
    expect(POST).toBe(GET);
    expect(DELETE).toBe(GET);
    expect(PUT).toBe(GET);
    expect(PATCH).toBe(GET);
  });

  it("rejects paths outside /v1 without contacting the platform", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/platform/admin/keys"),
      ctx("admin", "keys"),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: 'unsupported proxy path "/admin/keys"',
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the api_error envelope when PLATFORM_BASE_URL is missing", async () => {
    vi.stubEnv("PLATFORM_BASE_URL", undefined);
    const response = await GET(
      new NextRequest("http://localhost:3000/api/platform/v1/agents"),
      ctx("v1", "agents"),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      type: "error",
      error: { type: "api_error", message: "PLATFORM_BASE_URL is not set" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the api_error envelope when PLATFORM_API_KEY is missing", async () => {
    vi.stubEnv("PLATFORM_API_KEY", undefined);
    const response = await GET(
      new NextRequest("http://localhost:3000/api/platform/v1/agents"),
      ctx("v1", "agents"),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      type: "error",
      error: { type: "api_error", message: "PLATFORM_API_KEY is not set" },
    });
  });

  it("falls back to a generic message when misconfiguration throws a non-Error", async () => {
    vi.resetModules();
    const cause: unknown = "boom";
    vi.doMock("@/lib/env", () => ({
      platformBaseUrl: () => {
        throw cause;
      },
      platformApiKey: () => "sk-mgmt-test",
    }));
    const { GET: get } = await import("./route");
    const response = await get(
      new NextRequest("http://localhost:3000/api/platform/v1/agents"),
      ctx("v1", "agents"),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      type: "error",
      error: { type: "api_error", message: "console misconfigured" },
    });
    vi.doUnmock("@/lib/env");
    vi.resetModules();
  });

  it("forwards only allowlisted headers, injects the key, and passes the query through", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [], has_more: false }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "request-id": "req_123",
          "x-upstream-internal": "secret",
        },
      }),
    );
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/platform/v1/agents?limit=5&after_id=agent_1",
        {
          headers: {
            accept: "application/json",
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "managed-agents-2025-11-06",
            "last-event-id": "sevt_9",
            "x-api-key": "browser-supplied-key",
            authorization: "Bearer stolen",
            "x-forwarded-for": "203.0.113.9",
          },
        },
      ),
      ctx("v1", "agents"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = upstreamCall();
    expect(url).toBe(
      "http://platform.local/v1/agents?limit=5&after_id=agent_1",
    );
    expect(init.method).toBe("GET");
    const headers = init.headers as Headers;
    expect(headers.get("x-api-key")).toBe("sk-mgmt-test");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(headers.get("anthropic-beta")).toBe("managed-agents-2025-11-06");
    expect(headers.get("last-event-id")).toBe("sevt_9");
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBeNull();
    expect(init.body).toBeUndefined();
    expect("duplex" in init).toBe(false);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("request-id")).toBe("req_123");
    expect(response.headers.get("x-upstream-internal")).toBeNull();
    expect(await response.json()).toEqual({ data: [], has_more: false });
  });

  it("trims trailing slashes off the configured base URL", async () => {
    vi.stubEnv("PLATFORM_BASE_URL", "http://platform.local///");
    fetchMock.mockResolvedValue(new Response("{}"));
    await GET(
      new NextRequest("http://localhost:3000/api/platform/v1/agents"),
      ctx("v1", "agents"),
    );
    const [url] = upstreamCall();
    expect(url).toBe("http://platform.local/v1/agents");
  });

  it("streams a POST body upstream with half duplex", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "agent_1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    const body = JSON.stringify({ name: "deploy-bot" });
    const response = await POST(
      new NextRequest("http://localhost:3000/api/platform/v1/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      ctx("v1", "agents"),
    );

    const [, init] = upstreamCall();
    expect(init.method).toBe("POST");
    expect(init.duplex).toBe("half");
    expect(await new Response(init.body).text()).toBe(body);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "agent_1" });
  });

  it("passes DELETE through and preserves a bodyless 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/platform/v1/agents/agent_1", {
        method: "DELETE",
      }),
      ctx("v1", "agents", "agent_1"),
    );
    const [url, init] = upstreamCall();
    expect(url).toBe("http://platform.local/v1/agents/agent_1");
    expect(init.method).toBe("DELETE");
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it("streams an SSE response body through untouched", async () => {
    const encoder = new TextEncoder();
    const frames = [
      "event: event_start\ndata: {}\n\n",
      "event: event_delta\ndata: {}\n\n",
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
        },
      }),
    );
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/platform/v1/sessions/sess_1/events?stream=true",
      ),
      ctx("v1", "sessions", "sess_1", "events"),
    );
    const [url] = upstreamCall();
    expect(url).toBe(
      "http://platform.local/v1/sessions/sess_1/events?stream=true",
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe(frames.join(""));
  });

  it("passes upstream error statuses through with their envelope", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "error",
          error: { type: "not_found_error", message: "agent not found" },
        }),
        {
          status: 404,
          headers: {
            "content-type": "application/json",
            "request-id": "req_404",
          },
        },
      ),
    );
    const response = await GET(
      new NextRequest("http://localhost:3000/api/platform/v1/agents/agent_x"),
      ctx("v1", "agents", "agent_x"),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("request-id")).toBe("req_404");
    expect(await response.json()).toEqual({
      type: "error",
      error: { type: "not_found_error", message: "agent not found" },
    });
  });

  it("maps an unreachable platform to a 502 api_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const response = await GET(
      new NextRequest("http://localhost:3000/api/platform/v1/agents"),
      ctx("v1", "agents"),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      type: "error",
      error: {
        type: "api_error",
        message: "platform unreachable — check PLATFORM_BASE_URL",
      },
    });
  });
});
