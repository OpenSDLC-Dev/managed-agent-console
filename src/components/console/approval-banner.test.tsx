import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApprovalBanner } from "./approval-banner";
import type { SessionEvent } from "@/lib/platform/types";

const toolUse = (id: string, extra?: object): SessionEvent =>
  ({
    id,
    type: "agent.tool_use",
    processed_at: null,
    name: "Bash",
    input: { command: "rm -rf /tmp/scratch" },
    evaluated_permission: "ask",
    ...extra,
  }) as SessionEvent;

function renderBanner(pending: SessionEvent[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <ApprovalBanner pending={pending} sessionId="ses_1" />
    </QueryClientProvider>,
  );
}

const okEvents = () =>
  new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const sentEvents = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/platform/v1/sessions/ses_1/events");
  expect(init.method).toBe("POST");
  return (JSON.parse(init.body as string) as { events: unknown[] }).events;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ApprovalBanner", () => {
  it("renders nothing when no approvals are pending", () => {
    const { container } = renderBanner([]);
    expect(container.innerHTML).toBe("");
  });

  it("lists each pending tool with its name and input", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderBanner([
      toolUse("sevt_t1"),
      toolUse("sevt_t2", { name: "WebFetch", input: { url: "https://x" } }),
    ]);
    expect(screen.getByText("Waiting on 2 tool approvals")).toBeDefined();
    expect(screen.getByText("Bash")).toBeDefined();
    expect(
      screen.getByText(JSON.stringify({ command: "rm -rf /tmp/scratch" })),
    ).toBeDefined();
    expect(screen.getByText("WebFetch")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Allow" })).toHaveLength(2);
  });

  it("uses the singular headline for one pending approval", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderBanner([toolUse("sevt_t1")]);
    expect(screen.getByText("Waiting on 1 tool approval")).toBeDefined();
  });

  it("allow sends a user.tool_confirmation for that tool_use id", async () => {
    const fetchMock = vi.fn(async () => okEvents());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderBanner([toolUse("sevt_t1")]);

    await user.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentEvents(fetchMock)).toEqual([
      {
        type: "user.tool_confirmation",
        tool_use_id: "sevt_t1",
        result: "allow",
      },
    ]);
  });

  it("deny with a reason includes deny_message", async () => {
    const fetchMock = vi.fn(async () => okEvents());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderBanner([toolUse("sevt_t1")]);

    await user.click(screen.getByRole("button", { name: "Deny…" }));
    await user.type(screen.getByLabelText("Deny reason"), "too destructive");
    await user.click(screen.getByRole("button", { name: "Deny" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentEvents(fetchMock)).toEqual([
      {
        type: "user.tool_confirmation",
        tool_use_id: "sevt_t1",
        result: "deny",
        deny_message: "too destructive",
      },
    ]);
  });

  it("deny with an empty reason omits deny_message", async () => {
    const fetchMock = vi.fn(async () => okEvents());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderBanner([toolUse("sevt_t1")]);

    await user.click(screen.getByRole("button", { name: "Deny…" }));
    await user.click(screen.getByRole("button", { name: "Deny" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentEvents(fetchMock)).toEqual([
      {
        type: "user.tool_confirmation",
        tool_use_id: "sevt_t1",
        result: "deny",
      },
    ]);
  });

  it("cancel backs out of the deny flow without sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderBanner([toolUse("sevt_t1")]);

    await user.click(screen.getByRole("button", { name: "Deny…" }));
    expect(screen.getByLabelText("Deny reason")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Deny reason")).toBeNull();
    expect(screen.getByRole("button", { name: "Allow" })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the platform error message on a failed confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "tool_use already resolved",
              },
            }),
            { status: 409, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const user = userEvent.setup();
    renderBanner([toolUse("sevt_t1")]);

    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByText("tool_use already resolved")).toBeDefined();
  });

  it("falls back to a generic label when the failure is not an Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject("wire dropped")),
    );
    const user = userEvent.setup();
    renderBanner([toolUse("sevt_t1")]);

    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(await screen.findByText("failed")).toBeDefined();
  });
});
