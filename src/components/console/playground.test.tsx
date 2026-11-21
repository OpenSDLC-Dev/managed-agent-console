import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TEST_SESSION } from "@/../test/session-fixture";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import * as gateway from "@/lib/platform/playground";
import { Playground } from "./playground";

const reply: gateway.PlaygroundReply = {
  raw: '{"content":[{"type":"text","text":"OK"}]}',
  rawLabel: "Response body",
  inputTokens: 10,
  outputTokens: 1,
  durationMs: 425,
};

function renderPlayground(
  access = true,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  return render(
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={
          {
            data: { ...TEST_SESSION, playground_access: access },
          } as ReturnType<typeof useConsoleSession>
        }
      >
        <Playground />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps Form and Code on the same Messages request, runs it and restores it from this visit's history", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
    { id: "fast", display_name: "Fast" },
  ]);
  const run = vi
    .spyOn(gateway, "runPlayground")
    .mockImplementation(async (_req, _id, _signal, append) => {
      append("OK");
      return reply;
    });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  const user = userEvent.setup();
  const client = new QueryClient();
  renderPlayground(true, client);
  await screen.findByText("Demo", { exact: true });
  await user.click(screen.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "Fast" }));
  await user.click(screen.getByRole("button", { name: "Model settings" }));
  await user.clear(screen.getByLabelText("Max tokens"));
  await user.type(screen.getByLabelText("Max tokens"), "42");
  await user.keyboard("{Escape}");
  await user.type(screen.getByLabelText("System", { exact: true }), "Be brief");
  await user.type(screen.getByLabelText("Prompt"), "First turn");
  await user.click(
    screen.getByRole("button", { name: "Add assistant message" }),
  );
  await user.type(screen.getByLabelText("assistant message 2"), " ");
  await user.click(screen.getByRole("button", { name: "Add user message" }));
  await user.type(screen.getByLabelText("user message 3"), "Next turn");
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const request = JSON.parse(
    screen.getByLabelText("Request code").textContent!,
  );
  expect(request).toEqual({
    model: "fast",
    max_tokens: 42,
    system: "Be brief",
    messages: [
      { role: "user", content: "First turn" },
      { role: "assistant", content: " " },
      { role: "user", content: "Next turn" },
    ],
    stream: true,
  });
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(await screen.findByText("OK", { exact: true })).toBeVisible();
  await user.click(screen.getByLabelText("Raw", { exact: true }));
  expect(screen.getByLabelText("Response body")).toHaveTextContent(reply.raw);
  await user.click(screen.getByLabelText("Rendered", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Add to messages" }));
  expect(screen.getByLabelText("assistant message 4")).toHaveValue("OK");
  expect(screen.getByLabelText("user message 5")).toHaveValue("");
  expect(screen.getByText("Press Run")).toBeVisible();
  expect(run).toHaveBeenCalledWith(
    request,
    TEST_SESSION.id,
    expect.any(AbortSignal),
    expect.any(Function),
  );
  await user.click(screen.getByRole("button", { name: "New" }));
  expect(screen.getByLabelText("Prompt")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "History" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "First turn",
    }),
  );
  expect(screen.getByLabelText("user message 3")).toHaveValue("Next turn");
  expect(screen.getByText("OK", { exact: true })).toBeVisible();
  await act(async () => {
    client.setQueryData(
      ["playground-models", TEST_SESSION.id],
      [{ id: "demo", display_name: "Demo" }],
    );
  });
  expect(await screen.findByText("fast (unavailable)")).toBeVisible();
  expect(screen.getByRole("button", { name: "Run prompt" })).toBeDisabled();
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(screen.getByLabelText("Request code")).toHaveTextContent(
    '"model": "fast"',
  );
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(screen.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "Demo" }));
  expect(screen.getByRole("button", { name: "Run prompt" })).toBeEnabled();
});

it("pages through templates and fills a draft without calling the model", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
  ]);
  const run = vi.spyOn(gateway, "runPlayground");
  const user = userEvent.setup();
  renderPlayground();
  await user.click(screen.getByRole("button", { name: "More" }));
  expect(
    screen.queryByRole("button", { name: /Extract structured data/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Previous" }));
  await user.click(
    screen.getByRole("button", { name: /Extract structured data/ }),
  );
  expect(
    (screen.getByLabelText("Prompt") as HTMLTextAreaElement).value,
  ).toContain("JSON");
  await user.click(
    screen.getByRole("button", { name: "Remove system prompt" }),
  );
  expect(screen.queryByLabelText("System", { exact: true })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Add" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "System prompt" }),
  );
  expect(screen.getByLabelText("System", { exact: true })).toBeVisible();
  expect(run).not.toHaveBeenCalled();
});

it("stops immediately and ignores a cancelled stream while the next run is open", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
  ]);
  const requests: {
    signal: AbortSignal;
    append: (part: string) => void;
    finish: () => void;
  }[] = [];
  vi.spyOn(gateway, "runPlayground").mockImplementation(
    (_body, _id, signal, append) =>
      new Promise<gateway.PlaygroundReply>((resolve) =>
        requests.push({ signal, append, finish: () => resolve(reply) }),
      ),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  const user = userEvent.setup();
  renderPlayground();
  await screen.findByText("Demo", { exact: true });
  await user.type(screen.getByLabelText("Prompt"), "Hello");
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(requests[0].signal.aborted).toBe(true);
  expect(document.querySelector("[data-run-status]")).toHaveAttribute(
    "data-run-status",
    "stopped",
  );
  expect(requests).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  requests[0].append("stale response");
  requests[0].finish();
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(requests[1].signal.aborted).toBe(true);
  expect(screen.queryByText("stale response")).toBeNull();
  requests[1].finish();
});
