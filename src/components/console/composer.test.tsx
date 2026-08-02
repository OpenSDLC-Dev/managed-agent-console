import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Composer } from "./composer";

function renderComposer(props?: { running?: boolean; disabled?: boolean }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <Composer
        sessionId="ses_1"
        running={props?.running ?? false}
        disabled={props?.disabled}
      />
    </QueryClientProvider>,
  );
}

const okEvents = () =>
  new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const textarea = () => screen.getByLabelText("Message to the session");

const sentEvents = (fetchMock: ReturnType<typeof vi.fn>, call = 0) => {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  expect(url).toBe("/api/platform/v1/sessions/ses_1/events");
  expect(init.method).toBe("POST");
  return (JSON.parse(init.body as string) as { events: unknown[] }).events;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Composer", () => {
  it("sends a user.message batch and clears the textarea on success", async () => {
    const fetchMock = vi.fn(async () => okEvents());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderComposer();

    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
    await user.type(textarea(), "hello agent");
    await user.click(screen.getByRole("button", { name: /Send/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentEvents(fetchMock)).toEqual([
      {
        type: "user.message",
        content: [{ type: "text", text: "hello agent" }],
      },
    ]);
    await waitFor(() => expect(textarea()).toHaveValue(""));
  });

  it("Enter sends when idle; Shift+Enter and empty Enter do not", async () => {
    const fetchMock = vi.fn(async () => okEvents());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderComposer();

    // Enter on empty text hits the trim guard.
    await user.click(textarea());
    await user.keyboard("{Enter}");
    expect(fetchMock).not.toHaveBeenCalled();

    // Shift+Enter is a newline, not a send.
    await user.type(textarea(), "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(textarea()).toHaveValue("line one\n");

    await user.keyboard("{Enter}");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentEvents(fetchMock)).toEqual([
      {
        type: "user.message",
        content: [{ type: "text", text: "line one\n" }],
      },
    ]);
  });

  it("Enter is inert while the session is running", async () => {
    const fetchMock = vi.fn(async () => okEvents());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderComposer({ running: true });

    expect(
      screen.getByPlaceholderText(
        "Session is running — send will queue, or interrupt & redirect.",
      ),
    ).toBeDefined();
    await user.type(textarea(), "queued");
    await user.keyboard("{Enter}");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a bare user.interrupt while running", async () => {
    const fetchMock = vi.fn(async () => okEvents());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderComposer({ running: true });

    await user.click(screen.getByRole("button", { name: /Interrupt$/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentEvents(fetchMock)).toEqual([{ type: "user.interrupt" }]);
  });

  it("interrupt & send batches the interrupt with the new message and clears text", async () => {
    const fetchMock = vi.fn(async () => okEvents());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderComposer({ running: true });

    // The redirect button only appears once there is text.
    expect(
      screen.queryByRole("button", { name: "Interrupt & send" }),
    ).toBeNull();
    await user.type(textarea(), "do this instead");
    await user.click(screen.getByRole("button", { name: "Interrupt & send" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentEvents(fetchMock)).toEqual([
      { type: "user.interrupt" },
      {
        type: "user.message",
        content: [{ type: "text", text: "do this instead" }],
      },
    ]);
    await waitFor(() => expect(textarea()).toHaveValue(""));
  });

  it("hides both interrupt controls when the session is idle", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderComposer({ running: false });
    expect(
      screen.getByPlaceholderText("Send a message to this session…"),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Interrupt/ })).toBeNull();
  });

  it("shows the platform error and keeps the text for retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "session closed",
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const user = userEvent.setup();
    renderComposer();

    await user.type(textarea(), "hello");
    await user.click(screen.getByRole("button", { name: /Send/ }));

    expect(await screen.findByText("session closed")).toBeDefined();
    expect(textarea()).toHaveValue("hello");
  });

  it("the disabled prop disables the textarea and all buttons", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderComposer({ running: true, disabled: true });
    expect(textarea()).toBeDisabled();
    expect(screen.getByRole("button", { name: /Interrupt$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
  });
});
