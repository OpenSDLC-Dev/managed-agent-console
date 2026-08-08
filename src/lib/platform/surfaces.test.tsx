import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PlatformError } from "./http";
import { SURFACES, isUnimplemented, useSurfaces } from "./surfaces";

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

/** Fetch stub answering each `/api/platform/v1/<surface>` probe by status. */
function stubProbes(status: (surface: string) => number) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const surface = new URL(input, "http://console").pathname.replace(
        "/api/platform/v1/",
        "",
      );
      const code = status(surface);
      return Promise.resolve(
        new Response(
          JSON.stringify(
            code === 200
              ? { data: [] }
              : {
                  type: "error",
                  error: {
                    type: "not_found_error",
                    message: `no such endpoint: /v1/${surface}`,
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

describe("isUnimplemented", () => {
  it("is true for a 404 from a collection route", () => {
    expect(isUnimplemented(new PlatformError(404, null))).toBe(true);
  });

  it("probe: leaves every other platform status an error", () => {
    for (const status of [400, 401, 409, 413, 500, 502, 503]) {
      expect(isUnimplemented(new PlatformError(status, null))).toBe(false);
    }
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

describe("useSurfaces", () => {
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
    for (const surface of Object.keys(SURFACES)) {
      expect(result.current?.[surface as keyof typeof SURFACES]).toBe(true);
    }
  });

  it("marks only the 404 surfaces unavailable", async () => {
    stubProbes((surface) =>
      surface === "skills" || surface === "files" ? 404 : 200,
    );
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toEqual({
      agents: true,
      sessions: true,
      environments: true,
      vaults: true,
      skills: false,
      files: false,
    });
  });

  it("probe: keeps a surface available when its probe fails with a 5xx", async () => {
    // A struggling platform must degrade to "shown and erroring", never to
    // "silently missing" — that reads as the console losing a feature.
    stubProbes((surface) => (surface === "vaults" ? 500 : 200));
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.vaults).toBe(true);
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
    expect(result.current?.files).toBe(true);
  });

  it("probes each collection once, with limit=1", async () => {
    stubProbes(() => 200);
    const { result } = renderHook(() => useSurfaces(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toBeDefined());
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls).toHaveLength(Object.keys(SURFACES).length);
    for (const path of Object.values(SURFACES)) {
      expect(calls).toContain(`/api/platform/${path}?limit=1`);
    }
  });
});
