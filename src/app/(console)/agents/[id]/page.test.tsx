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
import AgentDetailPage from "./page";
import type { Agent } from "@/lib/platform/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/agents/agt_1",
  useSearchParams: () => new URLSearchParams(),
}));

const agent = (over?: Partial<Agent>): Agent => ({
  id: "agt_1",
  type: "agent",
  name: "Support bot",
  version: 3,
  model: { id: "claude-sonnet-4-8", speed: "fast" },
  system: "Be nice.",
  description: "Answers tickets",
  tools: [{ type: "toolset" }],
  mcp_servers: [{ type: "url", url: "https://mcp.example.com" }],
  skills: [{ type: "custom", skill_id: "skl_1", version: "latest" }],
  multiagent: null,
  metadata: {},
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

function renderPage(id = "agt_1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <AgentDetailPage params={asParams(id)} />
      </Suspense>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AgentDetailPage", () => {
  it("shows the detail skeleton while the agent loads", async () => {
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
          error: { type: "not_found_error", message: "agent not found" },
        },
        404,
      ),
    );
    renderPage();
    expect(await screen.findByText("agent not found")).toBeInTheDocument();
  });

  it("renders the overview, config sections, and version history", async () => {
    stubFetch((url) => {
      if (url.pathname === "/api/platform/v1/agents/agt_1/versions")
        return json({
          data: [
            agent(),
            agent({ version: 2, updated_at: "2026-07-20T08:00:00Z" }),
          ],
        });
      if (url.pathname === "/api/platform/v1/agents/agt_1")
        return json(agent());
      return undefined;
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Support bot" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Answers tickets")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-4-8 · fast")).toBeInTheDocument();
    // "v3" appears in the overview and again as a version-history row.
    expect(screen.getAllByText("v3")).toHaveLength(2);
    expect(screen.getByText("System prompt")).toBeInTheDocument();
    expect(screen.getByText("Be nice.")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("MCP servers")).toBeInTheDocument();
    // Version history rows.
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("navigates to the edit page", async () => {
    stubFetch((url) =>
      url.pathname.endsWith("/versions") ? json({ data: [] }) : json(agent()),
    );
    renderPage();
    await screen.findByRole("heading", { name: "Support bot" });

    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(pushSpy).toHaveBeenCalledWith("/agents/agt_1/edit");
  });

  it("archives the agent after dialog confirmation", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "POST")
        return json(agent({ archived_at: "2026-08-02T00:00:00Z" }));
      if (url.pathname.endsWith("/versions")) return json({ data: [] });
      return json(agent());
    });
    renderPage();
    await screen.findByRole("heading", { name: "Support bot" });

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive agent" }),
    );

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "POST",
      );
      expect(String(post?.[0])).toBe("/api/platform/v1/agents/agt_1/archive");
    });
    // The mutation writes the archived agent back into the cache.
    expect(await screen.findByText("archived")).toBeInTheDocument();
  });

  it("hides edit/archive and the optional sections on an archived bare agent", async () => {
    stubFetch((url) =>
      url.pathname.endsWith("/versions")
        ? json({ data: [] })
        : json(
            agent({
              system: "",
              description: "",
              model: { id: "claude-sonnet-4-8" },
              skills: [],
              mcp_servers: [],
              archived_at: "2026-08-02T00:00:00Z",
            }),
          ),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Support bot" }),
    ).toBeInTheDocument();
    expect(screen.getByText("archived")).toBeInTheDocument();
    // No speed suffix when the model ref omits it.
    expect(screen.getByText("claude-sonnet-4-8")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByText("System prompt")).toBeNull();
    expect(screen.queryByText("Skills")).toBeNull();
    expect(screen.queryByText("MCP servers")).toBeNull();
    expect(screen.getByText("No versions")).toBeInTheDocument();
  });

  it("shows the versions error without dropping the rest of the page", async () => {
    stubFetch((url) =>
      url.pathname.endsWith("/versions")
        ? json(
            {
              type: "error",
              error: { type: "api_error", message: "versions down" },
            },
            500,
          )
        : json(agent()),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Support bot" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("versions down")).toBeInTheDocument();
  });
});
