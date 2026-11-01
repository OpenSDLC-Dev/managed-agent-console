import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PlatformError } from "./http";
import {
  SURFACES,
  isSurfaceVisible,
  isUnimplemented,
  surfaceOfPath,
  useSurfaces,
} from "./surfaces";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

/**
 * Fetch stub answering each probe by status, keyed on the surface name.
 *
 * Three prefixes, because two surfaces are not on the wire: management keys
 * live in the platform's off-wire console namespace (`/api/console/...`), and
 * the model gateway's admin API is a server of its own (`/api/gateway/...`).
 * Collapsing all three to a name here keeps every test below written in
 * surfaces rather than in URLs.
 */
function stubProbes(status: (surface: string) => number) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const { pathname } = new URL(input, "http://console");
      const surface = pathname.startsWith("/api/console/")
        ? "api-keys"
        : pathname.startsWith("/api/gateway/")
          ? pathname.replace("/api/gateway/admin/v1/", "")
          : pathname.replace("/api/platform/v1/", "");
      const code = status(surface);
      return Promise.resolve(
        new Response(
          JSON.stringify(
            code === 200
              ? { data: [] }
              : {
                  type: "error",
                  error: {
                    type:
                      code === 403
                        ? "permission_error"
                        : code === 404
                          ? "not_found_error"
                          : "api_error",
                    message:
                      code === 403
                        ? "this route requires the developer role"
                        : "Not found",
                  },
                },
          ),
          { status: code, headers: { "content-type": "application/json" } },
        ),
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** The envelope the platform's router catch-all actually answers with. */
const notFound = (status = 404) =>
  new PlatformError(status, {
    type: "error",
    error: { type: "not_found_error", message: "Not found" },
  });

describe("isUnimplemented", () => {
  it("is true for the platform's 404 from a collection route", () => {
    expect(isUnimplemented(notFound())).toBe(true);
  });

  it("is true for a 501, whatever the envelope says", () => {
    // The platform never sends one, but principle 3 names it and another
    // wire-compatible endpoint may.
    expect(isUnimplemented(new PlatformError(501, null))).toBe(true);
  });

  it("probe: leaves every other platform status an error", () => {
    for (const status of [400, 401, 403, 409, 413, 500, 502, 503]) {
      expect(isUnimplemented(notFound(status))).toBe(false);
    }
  });

  // A refusal is not feature absence, even when its entry point is hidden.
  it("probe: a permission_error never means an unimplemented surface", () => {
    const denied = new PlatformError(403, {
      type: "error",
      error: {
        type: "permission_error",
        message: "this route requires the admin role",
      },
    });
    expect(isUnimplemented(denied)).toBe(false);
  });

  it("probe: is false for a 404 that is not the platform's not_found_error", () => {
    // An intermediary's own 404 — an HTML page from a proxy — parses to no
    // envelope, so errorType falls back to api_error. Hiding a surface on
    // that would lose a feature to a misrouted request.
    expect(isUnimplemented(new PlatformError(404, null))).toBe(false);
    expect(
      isUnimplemented(
        new PlatformError(404, {
          type: "error",
          error: { type: "api_error", message: "bad gateway" },
        }),
      ),
    ).toBe(false);
  });

  it("probe: is false for anything that is not a PlatformError", () => {
    // A transport failure carries no status — reading it as "unimplemented"
    // would hide a working surface whenever the network hiccuped.
    expect(isUnimplemented(new Error("network down"))).toBe(false);
    expect(isUnimplemented({ status: 404 })).toBe(false);
    expect(isUnimplemented(undefined)).toBe(false);
    expect(isUnimplemented(null)).toBe(false);
  });
});

it("probe: visibility hides only confirmed absence and denied reads", () => {
  expect(isSurfaceVisible(undefined)).toBe(true);
  expect(isSurfaceVisible({ status: "available" })).toBe(true);
  expect(isSurfaceVisible({ status: "unknown" })).toBe(true);
  expect(isSurfaceVisible({ status: "unimplemented" })).toBe(false);
  expect(
    isSurfaceVisible({
      status: "denied",
      error: new PlatformError(403, {
        type: "error",
        error: {
          type: "permission_error",
          message: "this route requires the developer role",
        },
      }),
    }),
  ).toBe(false);
});

describe("surfaceOfPath", () => {
  it("names the surface a console path belongs to, list page or deeper", () => {
    expect(surfaceOfPath("/skills")).toBe("skills");
    expect(surfaceOfPath("/skills/skill_1")).toBe("skills");
    expect(surfaceOfPath("/agents/agt_1/edit")).toBe("agents");
    expect(surfaceOfPath("/vaults")).toBe("vaults");
    expect(surfaceOfPath("/memory-stores/memstore_1")).toBe("memory-stores");
  });

  it("probe: is undefined for a path that belongs to no surface", () => {
    // A false positive here would blank a page the guard has no business
    // touching — the login gate, or a route added later.
    expect(surfaceOfPath("/login")).toBeUndefined();
    expect(surfaceOfPath("/")).toBeUndefined();
    expect(surfaceOfPath("/agentsomething")).toBeUndefined();
    expect(surfaceOfPath("/settings/agents")).toBeUndefined();
  });
});

describe("useSurfaces", () => {
  it("probe: distinguishes denied reads, absence and uncertain failures", async () => {
    stubProbes(
      (surface) =>
        ({ skills: 403, files: 404, aliases: 501, vaults: 503 })[surface] ??
        200,
    );
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.skills).toMatchObject({
      status: "denied",
      error: {
        status: 403,
        errorType: "permission_error",
        message: "this route requires the developer role",
      },
    });
    expect(result.current?.files).toEqual({ status: "unimplemented" });
    expect(result.current?.models).toEqual({ status: "unimplemented" });
    expect(result.current?.vaults).toEqual({ status: "unknown" });
    expect(result.current?.agents).toEqual({ status: "available" });
  });

  it("probe: an intermediary's bare 403 remains unknown, not an account denial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>Forbidden</html>", { status: 403 }),
      ),
    );
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.skills).toEqual({ status: "unknown" });
  });

  it("is undefined until the probe answers", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    expect(result.current).toBeUndefined();
  });

  it("reports every surface available when the platform serves them all", async () => {
    stubProbes(() => 200);
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    for (const surface of Object.keys(SURFACES).filter(
      (s) => !["members", "service-accounts"].includes(s),
    )) {
      expect(result.current?.[surface as keyof typeof SURFACES]).toEqual({
        status: "available",
      });
    }
  });

  it("marks only the 404 surfaces unavailable", async () => {
    stubProbes((surface) =>
      surface === "skills" || surface === "files" ? 404 : 200,
    );
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toEqual({
      members: { status: "unimplemented" },
      "service-accounts": { status: "unimplemented" },
      agents: { status: "available" },
      sessions: { status: "available" },
      deployments: { status: "available" },
      "memory-stores": { status: "available" },
      dreams: { status: "available" },
      environments: { status: "available" },
      vaults: { status: "available" },
      skills: { status: "unimplemented" },
      files: { status: "unimplemented" },
      "api-keys": { status: "available" },
      models: { status: "available" },
      providers: { status: "available" },
      usage: { status: "available" },
    });
  });

  // The gateway BFF answers this exact envelope for every path while
  // MODEL_GATEWAY_BASE_URL is unset (src/app/api/gateway): the screens hide
  // rather than error on a deployment that runs no gateway.
  it("probe: hides the gateway surfaces when the console runs without a gateway", async () => {
    stubProbes((surface) =>
      ["providers", "aliases", "usage/requests"].includes(surface) ? 404 : 200,
    );
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.providers).toEqual({ status: "unimplemented" });
    expect(result.current?.models).toEqual({ status: "unimplemented" });
    expect(result.current?.usage).toEqual({ status: "unimplemented" });
    expect(result.current?.agents).toEqual({ status: "available" });
  });

  it("probe: keeps a surface available when its probe fails with a 5xx", async () => {
    // A struggling platform must degrade to "shown and erroring", never to
    // "silently missing" — that reads as the console losing a feature.
    stubProbes((surface) => (surface === "vaults" ? 500 : 200));
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.vaults).toEqual({ status: "unknown" });
  });

  it("probe: keeps a surface available when its probe never reaches the platform", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        String(input).includes("/v1/files")
          ? Promise.reject(new Error("console server unreachable"))
          : Promise.resolve(
              new Response(JSON.stringify({ data: [] }), { status: 200 }),
            ),
      ),
    );
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.files).toEqual({ status: "unknown" });
  });

  it("probes each collection once, through the BFF its namespace belongs to", async () => {
    stubProbes(() => 200);
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls).toHaveLength(
      Object.values(SURFACES).filter((e) => !("api" in e) || e.api !== "native")
        .length,
    );
    for (const entry of Object.values(SURFACES).filter(
      (e) => !("api" in e) || e.api !== "native",
    )) {
      // The wire surfaces ask for a page of one; the console namespace and the
      // gateway serve unpaged lists, so they are asked plainly — but for the
      // gateway's ledger, which pages, asked for one row.
      expect(calls).toContain(
        !("api" in entry)
          ? `/api/platform/${entry.path}?limit=1`
          : entry.api === "gateway"
            ? `/api/gateway/admin/v1/${entry.path}${"query" in entry ? "?limit=1" : ""}`
            : `/api/console/${entry.path}`,
      );
    }
  });
});

it("native-only administration stays hidden until its collection read succeeds", () => {
  expect(isSurfaceVisible(undefined, "members")).toBe(false);
  document.documentElement.dataset.consoleAuth = "platform";
  expect(isSurfaceVisible({ status: "unknown" }, "members")).toBe(false);
  expect(isSurfaceVisible({ status: "available" }, "members")).toBe(true);
  delete document.documentElement.dataset.consoleAuth;
  expect(isSurfaceVisible({ status: "available" }, "members")).toBe(false);
});
