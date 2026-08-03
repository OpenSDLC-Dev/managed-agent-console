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
import SessionsPage from "./page";
import type { Session } from "@/lib/platform/types";

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/sessions",
  useSearchParams: () => new URLSearchParams(),
}));

// Minimal harness for base-ui's portal Select (status-filter.test.tsx pattern).
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

const session = (over: Partial<Session> & { id: string }): Session => ({
  type: "session",
  agent: {
    type: "agent",
    id: "agt_1",
    version: 2,
    name: "Support bot",
    model: { id: "claude-sonnet-4-8" },
    system: "",
    description: "",
    tools: [],
    mcp_servers: [],
    skills: [],
    multiagent: null,
  },
  environment_id: "env_1",
  status: "running",
  title: "Nightly run",
  metadata: {},
  usage: {
    input_tokens: 1234,
    output_tokens: 567,
    cache_read_input_tokens: 89,
    cache_creation: {
      ephemeral_1h_input_tokens: 0,
      ephemeral_5m_input_tokens: 0,
    },
  },
  stats: { active_seconds: 0, duration_seconds: 0 },
  outcome_evaluations: [],
  resources: [],
  vault_ids: [],
  deployment_id: null,
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
      <SessionsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SessionsPage", () => {
  it("shows skeleton rows while the list loads", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = renderPage();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
  });

  it("surfaces the platform error envelope", async () => {
    stubFetch(() =>
      json(
        {
          type: "error",
          error: { type: "api_error", message: "sessions down" },
        },
        500,
      ),
    );
    renderPage();
    expect(await screen.findByText("sessions down")).toBeInTheDocument();
  });

  it("shows the empty state with a create CTA when there are no sessions", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    expect(await screen.findByText("No sessions yet")).toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole("button", { name: /Create session/ })[1],
    );
    expect(pushSpy).toHaveBeenCalledWith("/sessions/new");
  });

  it("renders session rows (title, status, agent, tokens) and navigates", async () => {
    stubFetch(() =>
      json({
        data: [
          session({ id: "sess_1" }),
          session({
            id: "sess_2",
            title: "",
            status: "idle",
            archived_at: "2026-07-01T00:00:00Z",
          }),
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText("Nightly run")).toBeInTheDocument();
    // Scope to the table — the mocked filter dropdown also renders status names.
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Untitled")).toBeInTheDocument();
    expect(table.getByText("running")).toBeInTheDocument();
    expect(table.getByText("idle")).toBeInTheDocument();
    expect(table.getByText("archived")).toBeInTheDocument();
    expect(table.getAllByText("Support bot · v2")).toHaveLength(2);
    expect(
      table.getAllByText(
        `${(1234).toLocaleString()} / ${(567).toLocaleString()}`,
      ),
    ).toHaveLength(2);

    await userEvent.click(screen.getByText("Nightly run"));
    expect(pushSpy).toHaveBeenCalledWith("/sessions/sess_1");
  });

  it("navigates to the create page from the header action", async () => {
    stubFetch(() => json({ data: [] }));
    renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: /Create session/ }),
    );
    expect(pushSpy).toHaveBeenCalledWith("/sessions/new");
  });

  it("filters by status and resets the page cursor", async () => {
    const fetchMock = stubFetch(() =>
      json({ data: [session({ id: "sess_1" })] }),
    );
    renderPage();
    await screen.findByText("Nightly run");

    // Status option buttons come from the mocked Select items.
    await userEvent.click(
      screen.getAllByRole("button", { name: "rescheduling" })[0],
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = new URL(
      String(fetchMock.mock.calls[1][0]),
      "http://console.test",
    );
    expect(url.searchParams.getAll("statuses")).toEqual(["rescheduling"]);
    expect(url.searchParams.get("page")).toBeNull();
  });

  it("pages both directions with the wire's prev/next cursors", async () => {
    const fetchMock = stubFetch(() =>
      json({
        data: [session({ id: "sess_1" })],
        next_page: "tok_next",
        prev_page: "tok_prev",
      }),
    );
    renderPage();
    await screen.findByText("Nightly run");

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    let url = new URL(
      String(fetchMock.mock.calls[1][0]),
      "http://console.test",
    );
    expect(url.searchParams.get("page")).toBe("tok_next");

    await userEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    url = new URL(String(fetchMock.mock.calls[2][0]), "http://console.test");
    expect(url.searchParams.get("page")).toBe("tok_prev");
  });
});
