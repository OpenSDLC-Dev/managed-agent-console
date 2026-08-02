import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import EnvironmentDetailPage from "./page";
import type { Environment } from "@/lib/platform/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/environments/env_1",
  useSearchParams: () => new URLSearchParams(),
}));

const emptyPackages = {
  apt: [],
  cargo: [],
  gem: [],
  go: [],
  npm: [],
  pip: [],
};

const environment = (over?: Partial<Environment>): Environment => ({
  id: "env_1",
  type: "environment",
  name: "Prod sandbox",
  description: "Where the work happens",
  config: {
    type: "cloud",
    networking: {
      type: "limited",
      allowed_hosts: ["a.example.com", "b.example.com"],
      allow_mcp_servers: false,
      allow_package_managers: true,
    },
    packages: emptyPackages,
  },
  scope: "organization",
  metadata: { team: "core" },
  created_at: "2026-08-01T09:12:00Z",
  updated_at: "2026-08-01T10:00:00Z",
  archived_at: null,
  ...over,
});

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

function stubFetch(
  handler: (url: URL, init?: RequestInit) => Response | undefined,
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      const response = handler(url, init);
      if (!response) throw new Error(`unmatched fetch: ${url.pathname}`);
      return response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Pre-resolved params thenable: React's `use` reads .status/.value directly. */
function asParams(id: string): Promise<{ id: string }> {
  const value = { id };
  return {
    status: "fulfilled",
    value,
    then: (onFulfilled: (v: { id: string }) => void) => onFulfilled(value),
  } as unknown as Promise<{ id: string }>;
}

function renderPage(id = "env_1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <EnvironmentDetailPage params={asParams(id)} />
      </Suspense>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("EnvironmentDetailPage", () => {
  it("shows the detail skeleton while the environment loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderPage();
    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull(),
    );
  });

  it("surfaces the platform error envelope", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          error: { type: "not_found_error", message: "environment not found" },
        },
        404,
      ),
    );
    renderPage();
    expect(
      await screen.findByText("environment not found"),
    ).toBeInTheDocument();
  });

  it("renders a limited cloud environment with metadata", async () => {
    stubFetch(() => json(environment()));
    renderPage();

    expect(await screen.findByText("Prod sandbox")).toBeInTheDocument();
    expect(screen.getByText("Where the work happens")).toBeInTheDocument();
    expect(screen.getByText("cloud")).toBeInTheDocument();
    expect(
      screen.getByText("limited — a.example.com, b.example.com"),
    ).toBeInTheDocument();
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(pushSpy).toHaveBeenCalledWith("/environments/env_1/edit");
  });

  it("renders an unrestricted cloud environment", async () => {
    stubFetch(() =>
      json(
        environment({
          description: "",
          config: {
            type: "cloud",
            networking: { type: "unrestricted" },
            packages: emptyPackages,
          },
          metadata: {},
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText("unrestricted")).toBeInTheDocument();
    expect(screen.queryByText("Metadata")).toBeNull();
  });

  it("renders an archived self-hosted environment without edit or archive", async () => {
    stubFetch(() =>
      json(
        environment({
          config: { type: "self_hosted" },
          metadata: {},
          archived_at: "2026-08-02T00:00:00Z",
        }),
      ),
    );
    renderPage();

    expect(await screen.findByText("self_hosted")).toBeInTheDocument();
    expect(screen.getByText("archived")).toBeInTheDocument();
    expect(screen.queryByText("Networking")).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    // Delete stays available even on archived environments.
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("archives after dialog confirmation", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "POST")
        return json(environment({ archived_at: "2026-08-02T00:00:00Z" }));
      return json(environment());
    });
    renderPage();
    await screen.findByText("Prod sandbox");

    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive environment" }),
    );

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "POST",
      );
      expect(String(post?.[0])).toBe(
        "/api/platform/v1/environments/env_1/archive",
      );
    });
  });

  it("deletes after dialog confirmation and returns to the list", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "DELETE")
        return json({ id: "env_1", type: "environment" });
      return json(environment());
    });
    renderPage();
    await screen.findByText("Prod sandbox");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete environment" }),
    );

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "DELETE",
      );
      expect(String(del?.[0])).toBe("/api/platform/v1/environments/env_1");
    });
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/environments"));
  });
});
