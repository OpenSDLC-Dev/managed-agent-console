import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AgentsPage from "./page";
import type { Agent } from "@/lib/platform/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/agents",
  useSearchParams: () => new URLSearchParams(),
}));

// base-ui's portal Select is not reliably drivable in jsdom — replace the
// vendored primitives with a minimal harness (same pattern as
// status-filter.test.tsx).
vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  interface CtxShape {
    value: string;
    onValueChange: (value: string) => void;
  }
  const Ctx = React.createContext<CtxShape>({
    value: "",
    onValueChange: () => {},
  });
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: CtxShape & { children?: React.ReactNode }) =>
      React.createElement(
        Ctx.Provider,
        { value: { value, onValueChange } },
        children,
      ),
    SelectTrigger: (props: {
      children?: React.ReactNode;
      "aria-label"?: string;
    }) =>
      React.createElement(
        "button",
        { type: "button", "aria-label": props["aria-label"] },
        props.children,
      ),
    SelectValue: () => {
      const ctx = React.useContext(Ctx);
      return React.createElement(
        "span",
        { "data-testid": "select-value" },
        ctx.value,
      );
    },
    SelectContent: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(
        "button",
        { type: "button", onClick: () => ctx.onValueChange(value) },
        children,
      );
    },
  };
});

const agent = (over: Partial<Agent> & { id: string; name: string }): Agent => ({
  type: "agent",
  version: 3,
  model: { id: "claude-sonnet-4-8" },
  system: "",
  description: "",
  tools: [],
  mcp_servers: [],
  skills: [],
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AgentsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AgentsPage", () => {
  it("shows skeleton rows while the list loads", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = renderPage();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("surfaces the platform error envelope", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          request_id: "req_a1",
          error: { type: "api_error", message: "agents backend down" },
        },
        500,
      ),
    );
    renderPage();
    expect(await screen.findByText("agents backend down")).toBeInTheDocument();
    expect(screen.getByText(/req_a1/)).toBeInTheDocument();
  });

  it("shows the empty state with a create CTA when there are no agents", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    expect(await screen.findByText("No agents yet")).toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole("button", { name: /Create agent/ })[1],
    );
    expect(pushSpy).toHaveBeenCalledWith("/agents/new");
  });

  it("renders agent rows and navigates on row click", async () => {
    const fetchMock = stubFetch(() =>
      json({
        data: [
          agent({ id: "agt_1", name: "Support bot" }),
          agent({
            id: "agt_2",
            name: "Old bot",
            archived_at: "2026-07-01T00:00:00Z",
          }),
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText("Support bot")).toBeInTheDocument();
    expect(screen.getByText("Old bot")).toBeInTheDocument();
    expect(screen.getByText("archived")).toBeInTheDocument();
    expect(screen.getAllByText("claude-sonnet-4-8")).toHaveLength(2);
    expect(screen.getAllByText("v3")).toHaveLength(2);

    const url = new URL(
      String(fetchMock.mock.calls[0][0]),
      "http://console.test",
    );
    expect(url.pathname).toBe("/api/platform/v1/agents");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("include_archived")).toBeNull();

    await userEvent.click(screen.getByText("Support bot"));
    expect(pushSpy).toHaveBeenCalledWith("/agents/agt_1");
  });

  it("navigates to the create page from the header action", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /Create agent/ }));
    expect(pushSpy).toHaveBeenCalledWith("/agents/new");
  });

  it("refetches with include_archived when the filter flips to All", async () => {
    const fetchMock = stubFetch(() =>
      json({ data: [agent({ id: "agt_1", name: "Support bot" })] }),
    );
    renderPage();
    await screen.findByText("Support bot");

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = new URL(
      String(fetchMock.mock.calls[1][0]),
      "http://console.test",
    );
    expect(url.searchParams.get("include_archived")).toBe("true");
  });

  it("pages forward with the cursor and back through the stack", async () => {
    const fetchMock = stubFetch((url) =>
      url.searchParams.get("page") === "cur_2"
        ? json({ data: [agent({ id: "agt_9", name: "Second page bot" })] })
        : json({
            data: [agent({ id: "agt_1", name: "Support bot" })],
            next_page: "cur_2",
          }),
    );
    renderPage();
    await screen.findByText("Support bot");
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Second page bot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );
    await waitFor(() => {
      const last = new URL(
        String(fetchMock.mock.calls.at(-1)?.[0]),
        "http://console.test",
      );
      expect(last.searchParams.get("page")).toBeNull();
    });
  });
});
