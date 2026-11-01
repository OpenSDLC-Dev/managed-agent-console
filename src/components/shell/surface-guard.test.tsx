import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Members } from "@/components/console/members";
import { ServiceAccounts } from "@/components/console/service-accounts";
import { SurfaceGuard } from "./surface-guard";
import { SURFACES } from "@/lib/platform/surfaces";

const LEGACY_SURFACES = Object.values(SURFACES).filter(
  (entry) => !("api" in entry) || entry.api !== "native",
);

const navState = vi.hoisted(() => ({ pathname: "/skills" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
}));

/** Probe answering 404 for `unimplemented`, 200 for the rest. */
function renderGuard(pathname: string, unimplemented: string[], status = 404) {
  navState.pathname = pathname;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const absent = unimplemented.some((s) =>
        ["members", "service-accounts"].includes(s)
          ? new URL(String(input), "http://console").pathname ===
            `/api/console/organizations/default/${s === "members" ? "members" : "service_accounts"}`
          : String(input).includes(`/v1/${s}?`),
      );
      return Promise.resolve(
        new Response(
          JSON.stringify(
            absent
              ? {
                  type: "error",
                  error: {
                    type:
                      status === 403 ? "permission_error" : "not_found_error",
                    message:
                      status === 403
                        ? "this route requires the developer role"
                        : "Not found",
                  },
                }
              : { data: [] },
          ),
          { status: absent ? status : 200 },
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
  delete document.documentElement.dataset.consoleAuth;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SurfaceGuard", () => {
  for (const pathname of [
    "/skills",
    "/skills/skill_1",
    "/agents/agent_1/edit",
    "/sessions/new",
  ]) {
    it(`probe: explains a denied collection read at ${pathname}, not absence`, async () => {
      renderGuard(pathname, [pathname.split("/")[1]], 403);
      const state = await screen.findByTestId("error-state");
      expect(state).toHaveAttribute("data-error-status", "403");
      expect(state).toHaveAttribute("data-denied", "true");
      expect(state).toHaveTextContent("this route requires the developer role");
      expect(screen.queryByTestId("unavailable-surface")).toBeNull();
      expect(screen.queryByText("the page")).toBeNull();
    });
  }

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
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(LEGACY_SURFACES.length),
    );
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
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(LEGACY_SURFACES.length),
    );
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
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(LEGACY_SURFACES.length),
    );
    expect(screen.getByText("the page")).toBeInTheDocument();
  });
});

it.each([
  ["members", 403],
  ["members", 404],
  ["service-accounts", 403],
  ["service-accounts", 404],
] as const)(
  "probe: native direct route /%s replaces children for collection status %i",
  async (surface, status) => {
    document.documentElement.dataset.consoleAuth = "platform";
    renderGuard(`/${surface}`, [surface], status);
    if (status === 403) {
      const state = await screen.findByTestId("error-state");
      expect(state).toHaveAttribute("data-error-status", "403");
      expect(state).toHaveAttribute("data-denied", "true");
      expect(screen.queryByTestId("unavailable-surface")).toBeNull();
    } else {
      expect(await screen.findByTestId("unavailable-surface")).toHaveAttribute(
        "data-surface",
        surface,
      );
      expect(screen.queryByTestId("error-state")).toBeNull();
    }
    expect(screen.queryByText("the page")).toBeNull();
  },
);

it.each(["members", "service-accounts"] as const)(
  "probe: native /%s mounts real actions only after admission settles",
  async (surface) => {
    document.documentElement.dataset.consoleAuth = "platform";
    navState.pathname = `/${surface}`;
    let settle!: () => void;
    const pending = new Promise<void>((r) => {
      settle = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input === "/api/auth/config")
          return Response.json({ mode: "password", native_login: true });
        if (input === "/api/auth/session")
          return Response.json({
            signed_in: true,
            id: "user_admin",
            role: "admin",
            csrf_token: "test-csrf",
          });
        await pending;
        return Response.json({ data: [], next_page: null, has_more: false });
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <SurfaceGuard>
          {surface === "members" ? <Members /> : <ServiceAccounts />}
        </SurfaceGuard>
      </QueryClientProvider>,
    );
    await act(async () => {});
    expect
      .soft(
        screen.queryByRole("button", {
          name: /Create (local member|service account)/,
        }),
      )
      .toBeNull();
    expect
      .soft(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      )
      .toEqual([["surfaces"]]);
    await act(async () => {
      settle();
    });
    expect(
      await screen.findByRole("button", {
        name:
          surface === "members"
            ? "Create local member"
            : "Create service account",
      }),
    ).toBeEnabled();
    client.clear();
  },
);
it.each([403, 404, 503] as const)(
  "probe: native pending admission then %i never mounts a private action",
  async (status) => {
    document.documentElement.dataset.consoleAuth = "platform";
    navState.pathname = "/service-accounts";
    let settle!: () => void;
    const pending = new Promise<void>((r) => {
      settle = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await pending;
        return Response.json(
          {
            error: {
              type:
                status === 403
                  ? "permission_error"
                  : status === 404
                    ? "not_found_error"
                    : "api_error",
              message: "admission unavailable",
            },
          },
          { status },
        );
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <SurfaceGuard>
          <ServiceAccounts />
        </SurfaceGuard>
      </QueryClientProvider>,
    );
    expect
      .soft(screen.queryByRole("button", { name: "Create service account" }))
      .toBeNull();
    await act(async () => {
      settle();
    });
    await waitFor(() =>
      expect(client.getQueryData(["surfaces"])).toBeDefined(),
    );
    expect(
      screen.queryByRole("button", { name: "Create service account" }),
    ).toBeNull();
    if (status === 404)
      expect(
        await screen.findByTestId("unavailable-surface"),
      ).toBeInTheDocument();
    else {
      expect(await screen.findByTestId("error-state")).toBeInTheDocument();
      expect(screen.queryByTestId("unavailable-surface")).toBeNull();
    }
    client.clear();
  },
);
