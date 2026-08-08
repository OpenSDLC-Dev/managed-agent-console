import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SurfaceGuard } from "./surface-guard";

const navState = vi.hoisted(() => ({ pathname: "/skills" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
}));

/** Probe answering 404 for `unimplemented`, 200 for the rest. */
function renderGuard(pathname: string, unimplemented: string[]) {
  navState.pathname = pathname;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const absent = unimplemented.some((s) =>
        String(input).includes(`/v1/${s}?`),
      );
      return Promise.resolve(
        new Response(
          JSON.stringify(
            absent
              ? {
                  type: "error",
                  error: {
                    type: "not_found_error",
                    message: `no such endpoint: ${input}`,
                  },
                }
              : { data: [] },
          ),
          { status: absent ? 404 : 200 },
        ),
      );
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SurfaceGuard>
        <p>the page</p>
      </SurfaceGuard>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SurfaceGuard", () => {
  it("renders the page while availability is unknown", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    navState.pathname = "/skills";
    render(
      <QueryClientProvider client={client}>
        <SurfaceGuard>
          <p>the page</p>
        </SurfaceGuard>
      </QueryClientProvider>,
    );
    expect(screen.getByText("the page")).toBeInTheDocument();
  });

  it("renders the page when the deployment serves its surface", async () => {
    renderGuard("/skills", []);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(6));
    expect(screen.getByText("the page")).toBeInTheDocument();
  });

  // The list page guards itself on its own query; these are the routes that
  // had nothing (review finding, PR #60).
  for (const pathname of [
    "/skills",
    "/skills/skill_1",
    "/agents/agt_1/edit",
    "/sessions/new",
  ]) {
    it(`stands ${pathname} down when its surface is unimplemented`, async () => {
      const surface = pathname.split("/")[1];
      renderGuard(pathname, [surface]);
      const standIn = await screen.findByTestId("unavailable-surface");
      expect(standIn.getAttribute("data-surface")).toBe(surface);
      expect(screen.queryByText("the page")).toBeNull();
    });
  }

  it("leaves a route that belongs to no surface alone", async () => {
    renderGuard("/login", ["skills", "agents"]);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(6));
    expect(screen.getByText("the page")).toBeInTheDocument();
  });

  it("probe: keeps the page when the probe fails rather than 404s", async () => {
    navState.pathname = "/skills";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("console server unreachable"))),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <SurfaceGuard>
          <p>the page</p>
        </SurfaceGuard>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(6));
    expect(screen.getByText("the page")).toBeInTheDocument();
  });
});
