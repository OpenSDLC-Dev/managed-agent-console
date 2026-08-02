import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlatformError,
  platformDelete,
  platformGet,
  platformPost,
  platformPostForm,
  type ErrorEnvelope,
} from "./http";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const envelope: ErrorEnvelope = {
  type: "error",
  request_id: "req_abc",
  error: { type: "not_found_error", message: "agent not found" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlatformError", () => {
  it("uses the envelope's message, type, and request id", () => {
    const error = new PlatformError(404, envelope);
    expect(error.message).toBe("agent not found");
    expect(error.errorType).toBe("not_found_error");
    expect(error.requestId).toBe("req_abc");
    expect(error.status).toBe(404);
  });

  it("falls back to HTTP status defaults without an envelope", () => {
    const error = new PlatformError(502, null);
    expect(error.message).toBe("HTTP 502");
    expect(error.errorType).toBe("api_error");
    expect(error.requestId).toBeUndefined();
  });
});

describe("platformGet", () => {
  it("fetches the BFF path without a query when no params are set", async () => {
    const fetchMock = vi.fn(async () => json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(platformGet("v1/agents")).resolves.toEqual({ data: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/platform/v1/agents");
  });

  it("serializes scalars and arrays and skips undefined params", async () => {
    const fetchMock = vi.fn(async () => json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await platformGet("v1/sessions", {
      limit: 1000,
      order: "asc",
      page: undefined,
      active: true,
      "event_types[]": ["user.message", "agent.message"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/platform/v1/sessions?limit=1000&order=asc&active=true" +
        "&event_types%5B%5D=user.message&event_types%5B%5D=agent.message",
    );
  });

  it("throws a PlatformError carrying the error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(envelope, 404)),
    );
    await expect(platformGet("v1/agents/missing")).rejects.toMatchObject({
      status: 404,
      errorType: "not_found_error",
      message: "agent not found",
      requestId: "req_abc",
    });
  });

  it("throws a bare PlatformError when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad gateway", { status: 502 })),
    );
    const rejection = expect(platformGet("v1/agents")).rejects;
    await rejection.toBeInstanceOf(PlatformError);
  });
});

describe("platformPost", () => {
  it("posts a JSON body and returns the parsed response", async () => {
    const fetchMock = vi.fn(async () => json({ id: "agent_1" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      platformPost("v1/agents", { name: "helper" }),
    ).resolves.toEqual({ id: "agent_1" });
    expect(fetchMock).toHaveBeenCalledWith("/api/platform/v1/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "helper" }),
    });
  });

  it("throws a PlatformError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(envelope, 400)),
    );
    await expect(platformPost("v1/agents", {})).rejects.toMatchObject({
      status: 400,
      errorType: "not_found_error",
    });
  });

  it("tolerates a non-JSON error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    await expect(platformPost("v1/agents", {})).rejects.toMatchObject({
      status: 500,
      errorType: "api_error",
      message: "HTTP 500",
    });
  });
});

describe("platformPostForm", () => {
  it("posts the FormData without forcing a content type", async () => {
    const fetchMock = vi.fn(async () => json({ id: "file_1" }));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.set("file", new Blob(["x"]), "notes.txt");
    await expect(platformPostForm("v1/files", form)).resolves.toEqual({
      id: "file_1",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/platform/v1/files", {
      method: "POST",
      body: form,
    });
  });

  it("throws a PlatformError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(envelope, 413)),
    );
    await expect(
      platformPostForm("v1/files", new FormData()),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("tolerates a non-JSON error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("too large", { status: 413 })),
    );
    await expect(
      platformPostForm("v1/files", new FormData()),
    ).rejects.toMatchObject({ status: 413, errorType: "api_error" });
  });
});

describe("platformDelete", () => {
  it("issues a DELETE and returns the parsed response", async () => {
    const fetchMock = vi.fn(async () => json({ id: "agent_1", deleted: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(platformDelete("v1/agents/agent_1")).resolves.toEqual({
      id: "agent_1",
      deleted: true,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/platform/v1/agents/agent_1", {
      method: "DELETE",
    });
  });

  it("throws a PlatformError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(envelope, 404)),
    );
    await expect(platformDelete("v1/agents/missing")).rejects.toMatchObject({
      status: 404,
      requestId: "req_abc",
    });
  });

  it("tolerates a non-JSON error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 502 })),
    );
    await expect(platformDelete("v1/agents/a")).rejects.toMatchObject({
      status: 502,
      errorType: "api_error",
      message: "HTTP 502",
    });
  });
});
