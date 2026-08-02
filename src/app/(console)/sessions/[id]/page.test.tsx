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
import { Suspense, type ComponentProps } from "react";
import SessionDetailPage from "./page";
import type { Session, SessionEvent } from "@/lib/platform/types";
import type { PreviewState, TraceState } from "@/lib/session-trace/store";
import type { ConnectionState } from "@/lib/session-trace/use-session-trace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/sessions/sess_1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Inject trace states directly — the SSE loop is covered by its own tests.
const traceMock = vi.hoisted(() => ({
  value: undefined as unknown,
}));
vi.mock("@/lib/session-trace/use-session-trace", () => ({
  useSessionTrace: () => traceMock.value,
}));

function setTrace(
  connection: ConnectionState,
  events: SessionEvent[] = [],
  previews: PreviewState[] = [],
  deleted = false,
) {
  const trace: TraceState = {
    events,
    seen: new Set(events.map((e) => e.id)),
    previews: new Map(previews.map((p) => [p.id, p])),
    deleted,
  };
  traceMock.value = { trace, connection };
}

const ev = (id: string, type: string, extra?: object): SessionEvent =>
  ({
    id,
    type,
    processed_at: "2026-08-01T09:12:00Z",
    ...extra,
  }) as SessionEvent;

const session = (over?: Partial<Session>): Session => ({
  id: "sess_1",
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
  status: "idle",
  title: "Debug run",
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
  resources: [
    {
      id: "res_1",
      type: "file",
      file_id: "file_1",
      mount_path: "/mnt/data.csv",
      created_at: "2026-08-01T09:12:00Z",
      updated_at: "2026-08-01T09:12:00Z",
    },
  ],
  vault_ids: ["vlt_1"],
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

function stubFetch(over?: {
  session?: Session;
  onPost?: (url: URL, init: RequestInit) => Response | undefined;
}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      if (init?.method === "POST" && over?.onPost) {
        const handled = over.onPost(url, init);
        if (handled) return handled;
      }
      if (url.pathname === "/api/platform/v1/sessions/sess_1")
        return json(over?.session ?? session());
      throw new Error(`unmatched fetch: ${url.pathname}`);
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

function renderPage(id = "sess_1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <SessionDetailPage params={asParams(id)} />
      </Suspense>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SessionDetailPage", () => {
  it("shows the detail skeleton while the session loads", async () => {
    setTrace("connecting");
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
    setTrace("connecting");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            type: "error",
            error: { type: "not_found_error", message: "session not found" },
          },
          404,
        ),
      ),
    );
    renderPage();
    expect(await screen.findByText("session not found")).toBeInTheDocument();
  });

  it("shows the event-list skeleton while the stream connects", async () => {
    setTrace("connecting");
    stubFetch();
    renderPage();

    const badge = await screen.findByTestId("stream-state");
    expect(badge).toHaveTextContent("connecting…");
    expect(badge).toHaveAttribute("data-state", "connecting");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("renders the live trace: overview, events, and streaming preview", async () => {
    setTrace(
      "live",
      [
        ev("sevt_1", "user.message", {
          content: [{ type: "text", text: "Hello agent" }],
        }),
        ev("sevt_2", "agent.tool_use", {
          name: "bash",
          input: { command: "ls" },
        }),
        ev("sevt_3", "session.status_idle", {
          stop_reason: { type: "end_turn" },
        }),
        ev("sevt_4", "session.status_running"),
      ],
      [{ id: "sevt_p", type: "agent.message", parts: ["Str", "eaming"] }],
    );
    stubFetch();
    renderPage();

    expect(await screen.findByText("Debug run")).toBeInTheDocument();
    // Subtitle and the agent overview link both carry the agent · version.
    expect(screen.getAllByText("Support bot · v2")).toHaveLength(2);
    expect(
      screen.getByText(
        `${(1234).toLocaleString()} in · ${(567).toLocaleString()} out · ${(89).toLocaleString()} cache read`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("vlt_1")).toBeInTheDocument();
    expect(screen.getByText("/mnt/data.csv")).toBeInTheDocument();

    expect(screen.getByTestId("stream-state")).toHaveTextContent("live");
    expect(screen.getAllByTestId("event-row")).toHaveLength(4);
    expect(screen.getByText("Hello agent")).toBeInTheDocument();
    const preview = screen.getByTestId("preview-row");
    expect(within(preview).getByText(/Streaming/)).toBeInTheDocument();

    // The latest trace status (running) wins over the fetched session status.
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Interrupt/ }),
    ).toBeInTheDocument();
    // No pending approvals: the last idle stop was end_turn.
    expect(screen.queryByTestId("approval-banner")).toBeNull();
  });

  it("filters events by kind and hides previews outside message views", async () => {
    setTrace(
      "live",
      [
        ev("sevt_1", "user.message", {
          content: [{ type: "text", text: "Hello agent" }],
        }),
        ev("sevt_2", "agent.tool_use", {
          name: "bash",
          input: { command: "ls" },
        }),
        ev("sevt_4", "session.status_running"),
      ],
      [{ id: "sevt_p", type: "agent.message", parts: ["Streaming"] }],
    );
    stubFetch();
    renderPage();
    await screen.findByText("Debug run");

    expect(screen.getAllByTestId("event-row")).toHaveLength(3);
    expect(screen.getAllByTestId("preview-row")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getAllByTestId("event-row")).toHaveLength(1);
    expect(screen.queryByTestId("preview-row")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Messages" }));
    expect(screen.getAllByTestId("event-row")).toHaveLength(1);
    expect(screen.getByText("Hello agent")).toBeInTheDocument();
    expect(screen.getAllByTestId("preview-row")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Model spans" }));
    expect(screen.queryAllByTestId("event-row")).toHaveLength(0);
    expect(screen.getByText("No events")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByTestId("event-row")).toHaveLength(3);
  });

  it("shows the approval banner for unanswered requires_action tool calls and allows one", async () => {
    setTrace("live", [
      ev("tu_1", "agent.tool_use", {
        name: "bash",
        input: { command: "rm -rf /" },
        evaluated_permission: "ask",
      }),
      ev("sevt_2", "session.status_idle", {
        stop_reason: { type: "requires_action", event_ids: ["tu_1"] },
      }),
    ]);
    const posts: [URL, RequestInit][] = [];
    stubFetch({
      onPost: (url, init) => {
        posts.push([url, init]);
        return json({ data: [] });
      },
    });
    renderPage();

    const banner = await screen.findByTestId("approval-banner");
    expect(banner).toHaveTextContent("Waiting on 1 tool approval");

    await userEvent.click(
      within(banner).getByRole("button", { name: "Allow" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0][0].pathname).toBe(
      "/api/platform/v1/sessions/sess_1/events",
    );
    expect(JSON.parse(posts[0][1].body as string)).toEqual({
      events: [
        {
          type: "user.tool_confirmation",
          tool_use_id: "tu_1",
          result: "allow",
        },
      ],
    });
  });

  it("clears the banner once a confirmation event answers the tool call", async () => {
    setTrace("reconnecting", [
      ev("tu_1", "agent.tool_use", { name: "bash", input: {} }),
      ev("sevt_2", "session.status_idle", {
        stop_reason: { type: "requires_action", event_ids: ["tu_1"] },
      }),
      ev("sevt_3", "user.tool_confirmation", {
        tool_use_id: "tu_1",
        result: "allow",
      }),
    ]);
    stubFetch();
    renderPage();

    expect(await screen.findByText("Debug run")).toBeInTheDocument();
    expect(screen.queryByTestId("approval-banner")).toBeNull();
    expect(screen.getByTestId("stream-state")).toHaveTextContent(
      "reconnecting…",
    );
  });

  it("disables the composer on an archived session with a deleted stream", async () => {
    setTrace("closed", [], [], true);
    stubFetch({
      session: session({ archived_at: "2026-08-02T00:00:00Z", title: "" }),
    });
    renderPage();

    // Untitled sessions fall back to the id in the header.
    expect(
      await screen.findByRole("heading", { name: "sess_1" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("stream-state")).toHaveTextContent(
      "stream closed",
    );
    expect(screen.getByText("No events")).toBeInTheDocument();
    expect(screen.getByLabelText("Message to the session")).toBeDisabled();
    expect(screen.getByText("archived")).toBeInTheDocument();
  });
});
