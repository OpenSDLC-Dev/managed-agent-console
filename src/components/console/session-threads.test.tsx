import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionThreads } from "./session-threads";
import { PlatformError } from "@/lib/platform/http";
import type { SessionThread } from "@/lib/platform/types";

const usage = {
  input_tokens: 12,
  output_tokens: 3,
  cache_read_input_tokens: 0,
  cache_creation: {
    ephemeral_1h_input_tokens: 0,
    ephemeral_5m_input_tokens: 0,
  },
};

const thread = (
  id: string,
  parent_thread_id: string | null,
): SessionThread => ({
  id,
  type: "session_thread",
  session_id: "sess_1",
  parent_thread_id,
  agent: {
    id: `agent_${id}`,
    type: "agent",
    version: 2,
    name: parent_thread_id ? "Worker" : "Coordinator",
    description: "",
    model: { id: "claude-sonnet-4-8" },
    system: "",
    tools: [],
    mcp_servers: [],
    skills: [],
  },
  status: "idle",
  usage,
  stats: { active_seconds: 1, duration_seconds: 4, startup_seconds: 1 },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:04Z",
  archived_at: null,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("selects a child thread and archives an idle child", async () => {
  const fetchMock = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >(
    async () =>
      new Response(JSON.stringify(thread("sthr_child", "sthr_primary")), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onSelect = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <SessionThreads
        sessionId="sess_1"
        threads={[
          thread("sthr_primary", null),
          thread("sthr_child", "sthr_primary"),
        ]}
        error={null}
        loading={false}
        selectedId={null}
        onSelect={onSelect}
      />
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole("button", { name: "Child thread Worker" }));
  expect(onSelect).toHaveBeenCalledWith("sthr_child");

  await user.click(
    screen.getByRole("button", { name: "Archive thread Worker" }),
  );
  await user.click(screen.getByRole("button", { name: "Archive thread" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toBe(
    "/api/platform/v1/sessions/sess_1/threads/sthr_child/archive",
  );
  expect(init?.method).toBe("POST");
});

it.each([404, 501])("hides the optional surface on HTTP %s", (status) => {
  vi.stubGlobal("fetch", vi.fn());
  const client = new QueryClient();
  const { container } = render(
    <QueryClientProvider client={client}>
      <SessionThreads
        sessionId="sess_1"
        threads={[]}
        error={
          new PlatformError(status, {
            type: "error",
            error: { type: "invalid_request_error", message: "unsupported" },
          })
        }
        loading={false}
        selectedId={null}
        onSelect={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(container).toBeEmptyDOMElement();
});
