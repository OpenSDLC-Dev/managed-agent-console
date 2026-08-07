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
  agentsHandler: (url: URL) => Response = () => json({ data: [] }),
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      // The agent-filter options query rides along on every mount.
      if (url.pathname === "/api/platform/v1/agents") return agentsHandler(url);
      const response = handler(url, init);
      if (!response) throw new Error(`unmatched fetch: ${url.pathname}`);
      return response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** URLs of the session-list fetches only, options traffic excluded. */
function sessionUrls(fetchMock: ReturnType<typeof stubFetch>): URL[] {
  return fetchMock.mock.calls
    .map((call) => new URL(String(call[0]), "http://console.test"))
    .filter((url) => url.pathname === "/api/platform/v1/sessions");
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
    await waitFor(() => expect(sessionUrls(fetchMock)).toHaveLength(2));
    const url = sessionUrls(fetchMock)[1];
    expect(url.searchParams.getAll("statuses")).toEqual(["rescheduling"]);
    expect(url.searchParams.get("page")).toBeNull();
  });

  it("filters by agent (archived included) and resets the page cursor", async () => {
    const fetchMock = stubFetch(
      () => json({ data: [session({ id: "sess_1" })] }),
      (url) => {
        expect(url.searchParams.get("include_archived")).toBe("true");
        expect(url.searchParams.get("limit")).toBe("100");
        return json({
          data: [
            {
              id: "agt_live",
              name: "Deep researcher",
              archived_at: null,
            },
            {
              id: "agt_old",
              name: "Retired agent",
              archived_at: "2026-08-01T00:00:00Z",
            },
          ],
        });
      },
    );
    renderPage();
    await screen.findByText("Nightly run");

    const option = await screen.findByRole("button", {
      name: /Retired agent/,
    });
    expect(within(option).getByText("archived")).toBeInTheDocument();
    await userEvent.click(option);
    await waitFor(() =>
      expect(
        sessionUrls(fetchMock).some(
          (url) => url.searchParams.get("agent_id") === "agt_old",
        ),
      ).toBe(true),
    );
  });

  it("surfaces an agent-options load failure with a retry", async () => {
    let failures = 0;
    const fetchMock = stubFetch(
      () => json({ data: [] }),
      () => {
        failures++;
        return failures === 1
          ? json(
              {
                type: "error",
                error: { type: "api_error", message: "agents down" },
              },
              500,
            )
          : json({
              data: [{ id: "agt_1", name: "Back online", archived_at: null }],
            });
      },
    );
    renderPage();

    expect(
      await screen.findByText(/agent options failed to load/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(
      await screen.findByRole("button", { name: "Back online" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("shows the truncation note when the agent options cap is hit", async () => {
    stubFetch(
      () => json({ data: [] }),
      () =>
        json({
          data: [{ id: "agt_1", name: "Repeating", archived_at: null }],
          next_page: "tok_more",
        }),
    );
    renderPage();
    expect(
      await screen.findByText("options truncated at 1000 agents"),
    ).toBeInTheDocument();
  });

  it("filters by created preset with a created_at[gte] bound", async () => {
    const fetchMock = stubFetch(() => json({ data: [] }));
    renderPage();
    await screen.findByText("No sessions yet");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Last 7 days" })[0],
    );
    await waitFor(() => {
      const bounded = sessionUrls(fetchMock).find((url) =>
        url.searchParams.get("created_at[gte]"),
      );
      expect(bounded).toBeDefined();
      const gte = Date.parse(bounded!.searchParams.get("created_at[gte]")!);
      expect(gte).toBeGreaterThan(Date.now() - 8 * 86_400_000);
      expect(gte).toBeLessThan(Date.now() - 6 * 86_400_000);
    });
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
    await waitFor(() => expect(sessionUrls(fetchMock)).toHaveLength(2));
    expect(sessionUrls(fetchMock)[1].searchParams.get("page")).toBe("tok_next");

    await userEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );
    await waitFor(() => expect(sessionUrls(fetchMock)).toHaveLength(3));
    expect(sessionUrls(fetchMock)[2].searchParams.get("page")).toBe("tok_prev");
  });

  it("probe: lists a session whose usage counters are missing or non-finite", async () => {
    // Same violated contract as the detail page's probes: the list read
    // `s.usage.input_tokens.toLocaleString()` unguarded, so one broken row
    // took the whole table down (plan 04 slice 2).
    stubFetch(() =>
      json({
        data: [
          session({
            id: "sess_1",
            title: "Broken usage",
            usage: undefined as unknown as Session["usage"],
          }),
          session({
            id: "sess_2",
            title: "Overflowed usage",
            usage: {
              ...session({ id: "x" }).usage,
              input_tokens: JSON.parse('{"n":1e400}').n as number,
            },
          }),
        ],
        next_page: null,
      }),
    );
    renderPage();

    // Both rows render, and neither prints a wrong number.
    expect(await screen.findByText("Broken usage")).toBeInTheDocument();
    expect(screen.getByText("Overflowed usage")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "— / —" })).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: `— / ${(567).toLocaleString()}` }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("∞");
  });
});
