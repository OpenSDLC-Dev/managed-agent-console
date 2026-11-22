import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { TEST_SESSION } from "@/../test/session-fixture";
import PlaygroundPage from "@/app/(console)/playground/page";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import * as gateway from "@/lib/platform/playground";
import { Playground } from "./playground";

const reply: gateway.PlaygroundReply = {
  raw: '{"content":[{"type":"text","text":"OK"}]}',
  rawLabel: "Response body",
  content: [{ type: "text", text: "OK" }],
  inputTokens: 10,
  outputTokens: 1,
  durationMs: 425,
};

function renderPlayground({
  access = true,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
  page = <Playground />,
}: {
  access?: boolean;
  client?: QueryClient;
  page?: ReactElement;
} = {}) {
  return render(page, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <ConsoleSessionContext.Provider
          value={
            {
              data: { ...TEST_SESSION, playground_access: access },
            } as ReturnType<typeof useConsoleSession>
          }
        >
          {children}
        </ConsoleSessionContext.Provider>
      </QueryClientProvider>
    ),
  });
}

function linkedPage(model?: string | string[]) {
  return PlaygroundPage({ searchParams: Promise.resolve({ model }) });
}

function codeEditor() {
  return screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: /request code$/i,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preselects the linked chat alias, respects manual changes, and keeps the draft across subsequent links", async () => {
  const pending = Promise.withResolvers<gateway.PlaygroundModel[]>();
  vi.spyOn(gateway, "playgroundModels").mockReturnValue(pending.promise);
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue(reply);
  const models = [
    { id: "general", display_name: "General" },
    { id: "ops/flash+v4", display_name: "Flash" },
    { id: "manual", display_name: "Manual" },
    { id: "another", display_name: "Another" },
  ];
  const client = new QueryClient();
  const user = userEvent.setup();
  const view = renderPlayground({
    client,
    page: await linkedPage(["ops/flash+v4", "another"]),
  });
  const select = screen.getByRole("combobox", { name: "Model" });
  expect(select).toHaveAttribute("data-model", "");
  expect(screen.getByRole("button", { name: "Run prompt" })).toBeDisabled();
  await act(async () => pending.resolve(models));
  expect(await screen.findByText("Flash", { exact: true })).toBeVisible();
  expect(select).toHaveAttribute("data-model", "ops/flash+v4");
  await user.type(screen.getByLabelText("Prompt"), "Keep this draft");
  await user.click(select);
  await user.click(await screen.findByRole("option", { name: "Manual" }));
  await act(async () => {
    client.setQueryData(
      ["playground-models", TEST_SESSION.id],
      [...models].reverse(),
    );
  });
  expect(select).toHaveAttribute("data-model", "manual");
  view.rerender(await linkedPage("general"));
  expect(select).toHaveAttribute("data-model", "general");
  view.rerender(await linkedPage());
  expect(select).toHaveAttribute("data-model", "another");
  expect(screen.getByLabelText("Prompt")).toHaveValue("Keep this draft");
  await user.click(screen.getByRole("button", { name: "New" }));
  await act(async () => {
    client.setQueryData(["playground-models", TEST_SESSION.id], [models[0]]);
  });
  await user.click(
    screen.getByRole("button", { name: "Stream tool arguments live" }),
  );
  expect(select).toHaveAttribute("data-model", "another");
  expect(screen.getByRole("button", { name: "Run prompt" })).toBeDisabled();
  expect(run).not.toHaveBeenCalled();
});

it("rejects a linked display name or unknown upstream ID and lets the user choose a real alias", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "ops/flash", display_name: "deepseek-v4-flash" },
  ]);
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue(reply);
  const user = userEvent.setup();
  renderPlayground({ page: await linkedPage("deepseek-v4-flash") });
  const warning = await screen.findByText(/The linked model is unavailable/);
  const select = screen.getByRole("combobox", { name: "Model" });
  expect(select).toHaveTextContent("Select a model");
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(codeEditor().value).toContain('"model": ""');
  expect(screen.getByRole("button", { name: "Run prompt" })).toBeDisabled();
  await user.keyboard("{Control>}{Enter}{/Control}");
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(screen.getByRole("combobox", { name: "Model" }));
  await user.click(
    await screen.findByRole("option", { name: "deepseek-v4-flash" }),
  );
  expect(screen.getByRole("combobox", { name: "Model" })).toHaveAttribute(
    "data-model",
    "ops/flash",
  );
  expect(warning).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run prompt" })).toBeEnabled();
  expect(run).not.toHaveBeenCalled();
});

it("keeps the Platform error and disables a previously available link when the model list fails or the alias disappears", async () => {
  const models = vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "other", display_name: "Other" },
    { id: "linked", display_name: "Linked alias" },
  ]);
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue(reply);
  const client = new QueryClient();
  const queryKey = ["playground-models", TEST_SESSION.id];
  renderPlayground({ client, page: await linkedPage("linked") });
  await screen.findByText("Linked alias", { exact: true });
  const button = screen.getByRole("button", { name: "Run prompt" });
  expect(button).toBeEnabled();
  models.mockRejectedValueOnce(new Error("Session expired"));
  await act(() => client.invalidateQueries({ queryKey }));
  expect(await screen.findByText("Session expired")).toBeVisible();
  expect(button).toBeDisabled();
  expect(screen.queryByText(/The linked model is unavailable/)).toBeNull();
  await act(async () => {
    client.setQueryData(queryKey, [{ id: "other", display_name: "Other" }]);
  });
  expect(
    await screen.findByText(/The linked model is unavailable/),
  ).toBeVisible();
  expect(button).toBeDisabled();
  await act(async () => {
    client.setQueryData(queryKey, []);
  });
  expect(
    await screen.findByText("No chat models are configured."),
  ).toBeVisible();
  expect(screen.queryByText(/The linked model is unavailable/)).toBeNull();
  expect(run).not.toHaveBeenCalled();
});

it("needs Playground admission even when the URL names a model", async () => {
  const models = vi.spyOn(gateway, "playgroundModels").mockResolvedValue([]);
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue(reply);
  renderPlayground({ access: false, page: await linkedPage("linked") });
  expect(
    screen.getByText(/Ask an administrator to enable Playground access/),
  ).toBeVisible();
  expect(screen.queryByRole("combobox", { name: "Model" })).toBeNull();
  expect(models).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
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
  renderPlayground({ client });
  await screen.findByText("Demo", { exact: true });
  await user.click(screen.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "Fast" }));
  await user.click(screen.getByRole("button", { name: "Model settings" }));
  await user.clear(screen.getByLabelText("Max tokens value"));
  await user.type(screen.getByLabelText("Max tokens value"), "42");
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
  const request = JSON.parse(codeEditor().value);
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
    expect.any(Function),
  );
  await user.click(screen.getByRole("button", { name: "New" }));
  expect(screen.getByLabelText("Prompt")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "History" }));
  await user.click(
    within(screen.getByRole("region", { name: "History" })).getByRole(
      "button",
      {
        name: /First turn/,
      },
    ),
  );
  expect(screen.getByLabelText("user message 3")).toHaveValue("Next turn");
  expect(screen.getByText("OK", { exact: true })).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "History" })).getByRole(
      "button",
      { name: /First turn/ },
    ),
  ).toHaveAttribute("aria-current", "true");
  await user.click(screen.getByRole("button", { name: "Close history" }));
  await act(async () => {
    client.setQueryData(
      ["playground-models", TEST_SESSION.id],
      [{ id: "demo", display_name: "Demo" }],
    );
  });
  expect(await screen.findByText("fast (unavailable)")).toBeVisible();
  expect(screen.getByRole("button", { name: "Run prompt" })).toBeDisabled();
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(codeEditor().value).toContain('"model": "fast"');
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(screen.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "Demo" }));
  expect(screen.getByRole("button", { name: "Run prompt" })).toBeEnabled();
});

it("continues a final assistant prefill in the same message", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
  ]);
  vi.spyOn(gateway, "runPlayground").mockImplementation(
    async (_req, _id, _signal, append) => {
      append("ground");
      return { ...reply, content: [{ type: "text", text: "ground" }] };
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  const user = userEvent.setup();
  renderPlayground();
  await screen.findByText("Demo", { exact: true });
  await user.type(screen.getByLabelText("Prompt"), "Complete the word");
  await user.click(
    screen.getByRole("button", { name: "Add assistant message" }),
  );
  await user.type(screen.getByLabelText("assistant message 2"), "Play");
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  await user.click(
    await screen.findByRole("button", { name: "Add to messages" }),
  );
  expect(screen.getByLabelText("assistant message 2")).toHaveValue(
    "Playground",
  );
  expect(screen.getByLabelText("user message 3")).toHaveValue("");
});

it("runs edits from cURL and JSON in the selected streaming mode and carries the same fields back into Form", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
    { id: "fast", display_name: "Fast" },
  ]);
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue(reply);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const user = userEvent.setup();
  renderPlayground();
  await screen.findByText("Demo", { exact: true });
  await user.type(screen.getByLabelText("Prompt"), "First draft");
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(codeEditor()).toHaveAccessibleName("cURL request code");
  const curl = codeEditor().value.replace("First draft", "Edited in cURL");
  fireEvent.change(codeEditor(), { target: { value: curl } });
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  await user.click(
    screen.getByRole("button", { name: "Code snippet settings" }),
  );
  const streaming = await screen.findByRole("menuitemcheckbox", {
    name: "Streaming",
  });
  expect(streaming).toHaveAttribute("aria-checked", "true");
  await user.click(streaming);
  await user.keyboard("{Escape}");
  const body = {
    ...JSON.parse(codeEditor().value),
    model: "fast",
    max_tokens: 32,
    temperature: 0.2,
    system: "",
  };
  expect(body.messages).toEqual([{ role: "user", content: "Edited in cURL" }]);
  expect(body.stream).toBe(false);
  fireEvent.change(codeEditor(), { target: { value: JSON.stringify(body) } });
  await user.click(screen.getByLabelText("Form", { exact: true }));
  expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent(
    "Fast",
  );
  expect(screen.getByLabelText("Prompt")).toHaveValue("Edited in cURL");
  await user.type(screen.getByLabelText("Prompt"), " and Form");
  await user.click(screen.getByLabelText("Code", { exact: true }));
  const expected = {
    ...body,
    messages: [{ role: "user", content: "Edited in cURL and Form" }],
  };
  expect(JSON.parse(codeEditor().value)).toEqual(expected);
  expect(run).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run).toHaveBeenCalledExactlyOnceWith(
    expected,
    TEST_SESSION.id,
    expect.any(AbortSignal),
    expect.any(Function),
    expect.any(Function),
  );
});

it("keeps invalid code in place on Run, language and Form changes until the user repairs or discards it", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
  ]);
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue(reply);
  const user = userEvent.setup();
  renderPlayground();
  await screen.findByText("Demo", { exact: true });
  await user.type(screen.getByLabelText("Prompt"), "Keep this");
  await user.click(screen.getByLabelText("Code", { exact: true }));
  const original = codeEditor().value;
  const edited = original.replace("$ANTHROPIC_BASE_URL", "edited-host");
  fireEvent.change(codeEditor(), { target: { value: edited } });
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Keep the generated cURL command",
  );
  expect(codeEditor()).toHaveFocus();
  expect(codeEditor()).toHaveAttribute("aria-invalid", "true");
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  await user.click(screen.getByLabelText("Form", { exact: true }));
  expect(screen.getByLabelText("Code language")).toHaveValue("cURL");
  expect(codeEditor()).toHaveValue(edited);
  await user.click(
    screen.getByRole("button", { name: "Discard invalid edits" }),
  );
  expect(codeEditor()).toHaveValue(original);
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const json = codeEditor().value;
  fireEvent.change(codeEditor(), { target: { value: "{" } });
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(screen.getByRole("alert")).toHaveTextContent("valid JSON");
  expect(codeEditor()).toHaveValue("{");
  fireEvent.change(codeEditor(), {
    target: { value: json.replace("Keep this", "Repaired") },
  });
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByLabelText("Form", { exact: true }));
  expect(screen.getByLabelText("Prompt")).toHaveValue("Repaired");
  expect(run).not.toHaveBeenCalled();
});

it("edits the full request inside Form with read-only routing headers and returns valid edits through Back", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
  ]);
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue(reply);
  const user = userEvent.setup();
  renderPlayground();
  await screen.findByText("Demo", { exact: true });
  await user.type(screen.getByLabelText("Prompt"), "Initial");
  await user.click(
    screen.getByRole("button", { name: "More request options" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Edit full request" }),
  );
  expect(screen.getByRole("radio", { name: "Form" })).toBeChecked();
  expect(screen.getByRole("heading", { name: "Headers" })).toBeVisible();
  expect(screen.getByText("x-workspace-id")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Body" })).toBeVisible();
  const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "Request body",
  });
  const body = JSON.parse(editor.value);
  expect(body.messages[0].content).toBe("Initial");
  fireEvent.change(editor, {
    target: { value: JSON.stringify({ ...body, messages: [[]] }) },
  });
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(editor).toHaveAttribute("aria-invalid", "true");
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run).not.toHaveBeenCalled();
  fireEvent.change(editor, {
    target: {
      value: JSON.stringify({
        ...body,
        messages: [{ role: "user", content: "From full request" }],
        stream: false,
      }),
    },
  });
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByLabelText("Prompt")).toHaveValue("From full request");
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(codeEditor().value).toContain('"stream": false');
  expect(run).not.toHaveBeenCalled();
});

it("keeps message roles and edits when removing and restoring System, then runs the displayed draft with Command+Enter", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
  ]);
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue(reply);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const user = userEvent.setup();
  renderPlayground();
  await screen.findByText("Demo", { exact: true });
  await user.type(screen.getByLabelText("System", { exact: true }), "First");
  await user.type(screen.getByLabelText("Prompt"), "A question");
  const more = screen.getByRole("button", { name: "More message options" });
  await user.click(more);
  const menu = await screen.findByRole("menu");
  await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(more).toHaveFocus());
  await user.keyboard("{ArrowDown}");
  await user.click(
    await screen.findByRole("menuitem", { name: "Add user message" }),
  );
  await user.type(screen.getByLabelText("user message 2"), "A clarification");
  await user.click(
    screen.getByRole("button", { name: "Remove system prompt" }),
  );
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const withoutSystem = JSON.parse(codeEditor().value);
  expect(withoutSystem).not.toHaveProperty("system");
  expect(withoutSystem.messages).toEqual([
    { role: "user", content: "A question" },
    { role: "user", content: "A clarification" },
  ]);
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Add" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "System prompt" }),
  );
  const system = screen.getByLabelText("System", { exact: true });
  expect(system).toHaveValue("");
  await user.type(system, "Revised instruction");
  expect(run).not.toHaveBeenCalled();
  await user.keyboard("{Meta>}{Enter}{/Meta}");
  expect(run).toHaveBeenCalledExactlyOnceWith(
    { ...withoutSystem, system: "Revised instruction" },
    TEST_SESSION.id,
    expect.any(AbortSignal),
    expect.any(Function),
    expect.any(Function),
  );
});

it("preserves nested Messages blocks through Form, Code, the sent body, a tool-only reply and history", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
  ]);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const tool = {
    type: "tool_use",
    id: "tool_b",
    name: "lookup",
    input: { places: ["Lyon", "Paris"] },
  };
  const result = {
    ...reply,
    content: [tool],
    raw: JSON.stringify({ content: [tool] }),
  };
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue(result);
  const user = userEvent.setup();
  renderPlayground();
  await screen.findByText("Demo", { exact: true });
  await user.click(
    screen.getByRole("button", { name: "More request options" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Edit full request" }),
  );
  const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "Request body",
  });
  const cache = { type: "ephemeral", ttl: "5m" };
  const body = {
    ...JSON.parse(editor.value),
    system: [{ type: "text", text: "Instructions", cache_control: cache }],
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Ask", cache_control: cache }],
        extension: { keep: true },
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Reasoning", signature: "signed" },
          {
            type: "tool_use",
            id: "tool_a",
            name: "lookup",
            input: { places: ["Xi'an"] },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool_a",
            content: [{ type: "text", text: "Found" }],
          },
        ],
      },
    ],
    tools: [
      {
        name: "lookup",
        input_schema: {
          type: "object",
          properties: { places: { type: "array" } },
        },
      },
    ],
  };
  fireEvent.change(editor, { target: { value: JSON.stringify(body) } });
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(
    screen.getByRole("button", { name: "More request options" }),
  ).toHaveFocus();
  const system = screen.getByLabelText("System", { exact: true });
  await user.type(system, " updated");
  expect(system).toHaveFocus();
  expect(system).toHaveValue("Instructions updated");
  await user.type(screen.getByLabelText("Prompt"), " again");
  expect(screen.getByLabelText("assistant message 2")).toHaveAttribute(
    "readonly",
  );
  expect(
    JSON.parse(
      screen.getByLabelText<HTMLTextAreaElement>("user message 3").value,
    ),
  ).toEqual(body.messages[2].content);
  await user.click(
    screen.getByRole("button", {
      name: "Edit content blocks for assistant message 2",
    }),
  );
  body.system[0].text = "Instructions updated";
  body.messages[0].content[0].text = "Ask again";
  await user.click(screen.getByRole("button", { name: "Back" }));
  const editAssistant = screen.getByRole("button", {
    name: "Edit content blocks for assistant message 2",
  });
  expect(editAssistant).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(
    JSON.parse(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Request body" })
        .value,
    ),
  ).toEqual(body);
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(codeEditor().value).toContain('"signature": "signed"');
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  expect(JSON.parse(codeEditor().value)).toEqual(body);
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run).toHaveBeenCalledExactlyOnceWith(
    body,
    TEST_SESSION.id,
    expect.any(AbortSignal),
    expect.any(Function),
    expect.any(Function),
  );
  await user.click(
    await screen.findByRole("button", { name: "View content blocks in Raw" }),
  );
  expect(screen.getByLabelText("Response body")).toHaveTextContent(result.raw);
  await user.click(screen.getByRole("button", { name: "Add to messages" }));
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(JSON.parse(codeEditor().value)).toEqual({
    ...body,
    messages: [...body.messages, { role: "assistant", content: [tool] }],
  });
  await user.click(screen.getByRole("button", { name: "History" }));
  await user.click(
    within(screen.getByRole("region", { name: "History" })).getByRole(
      "button",
      { name: /Ask again/ },
    ),
  );
  await user.click(screen.getByRole("button", { name: "Close history" }));
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(JSON.parse(codeEditor().value)).toEqual(body);
});

it("loads supported tool templates into Form and Code without changing the model or sending a request", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
    { id: "my-flash", display_name: "My flash" },
  ]);
  const run = vi.spyOn(gateway, "runPlayground");
  const user = userEvent.setup();
  renderPlayground({ page: await linkedPage("my-flash") });
  await screen.findByText("My flash", { exact: true });
  const history = screen.getByRole("button", { name: "History" });
  await user.click(history);
  expect(screen.getByRole("region", { name: "History" })).toBeVisible();
  await user.click(screen.getByLabelText("Prompt"));
  expect(screen.queryByRole("region", { name: "History" })).toBeNull();
  expect(screen.getByLabelText("Prompt")).toHaveFocus();
  await user.click(history);
  await user.keyboard("{Escape}");
  expect(history).toHaveFocus();
  const streaming = screen.getByRole("button", {
    name: "Stream tool arguments live",
  });
  const parallel = screen.getByRole("button", {
    name: "Call tools in parallel",
  });
  expect(within(screen.getByRole("list")).getAllByRole("button")).toEqual([
    streaming,
    parallel,
  ]);
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  fireEvent.change(codeEditor(), {
    target: {
      value: JSON.stringify({
        model: "my-flash",
        messages: [],
        max_tokens: 648,
        temperature: 0.4,
        stream: false,
        tools: [{ name: "old_tool", input_schema: { type: "object" } }],
        tool_choice: { type: "tool", name: "old_tool" },
      }),
    },
  });
  await user.click(parallel);
  expect(screen.getByRole("radio", { name: "Code" })).toBeChecked();
  expect(screen.getByLabelText("Code language")).toHaveValue("JSON");
  const firstPreset = JSON.parse(codeEditor().value);
  expect(firstPreset).toMatchObject({
    model: "my-flash",
    max_tokens: 648,
    temperature: 0.4,
    stream: false,
  });
  expect(firstPreset).not.toHaveProperty("tool_choice");
  await user.click(streaming);
  expect(streaming).toHaveFocus();
  expect(streaming).toHaveAttribute("aria-pressed", "true");
  expect(parallel).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("radio", { name: "Code" })).toBeChecked();
  expect(JSON.parse(codeEditor().value).model).toBe("my-flash");
  await user.click(screen.getByLabelText("Form", { exact: true }));
  expect(screen.getByLabelText<HTMLTextAreaElement>("Prompt").value).toContain(
    "poem.txt",
  );
  await user.click(screen.getByRole("button", { name: "make_file" }));
  expect(
    JSON.parse(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Input schema" })
        .value,
    ),
  ).toMatchObject({
    properties: { lines_of_text: { type: "array", items: { type: "string" } } },
  });
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const filePreset = JSON.parse(codeEditor().value);
  expect(filePreset).toMatchObject({
    model: "my-flash",
    max_tokens: 648,
    temperature: 0.4,
    stream: true,
    system: expect.stringContaining("make_file"),
    tools: [
      {
        name: "make_file",
        input_schema: {
          type: "object",
          properties: {
            filename: { type: "string" },
            lines_of_text: { type: "array", items: { type: "string" } },
          },
          required: ["filename", "lines_of_text"],
        },
      },
    ],
  });
  expect(filePreset.tools[0]).not.toHaveProperty("eager_input_streaming");
  await user.click(parallel);
  expect(parallel).toHaveFocus();
  expect(parallel).toHaveAttribute("aria-pressed", "true");
  expect(streaming).toHaveAttribute("aria-pressed", "false");
  const body = JSON.parse(codeEditor().value);
  expect(body).toMatchObject({
    model: "my-flash",
    messages: [{ role: "user", content: expect.stringContaining("Tokyo") }],
    system: expect.stringContaining("one turn"),
    tools: [
      {
        name: "get_weather",
        input_schema: {
          type: "object",
          properties: { location: { type: "string" } },
          required: ["location"],
        },
      },
      {
        name: "get_time",
        input_schema: {
          type: "object",
          properties: { timezone: { type: "string" } },
          required: ["timezone"],
        },
      },
    ],
  });
  body.tools[0].description = "Use metric units";
  fireEvent.change(codeEditor(), { target: { value: JSON.stringify(body) } });
  expect(
    screen.queryByRole("button", { name: "Call tools in parallel" }),
  ).toBeNull();
  expect(screen.getByRole("heading", { name: "Press Run" })).toBeVisible();
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(screen.getByRole("button", { name: "get_weather" }));
  expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
    "Use metric units",
  );
  expect(screen.getByRole("button", { name: "get_time" })).toBeVisible();
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(JSON.parse(codeEditor().value)).toEqual(body);
  await user.click(screen.getByLabelText("Form", { exact: true }));
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

it("returns from a replaced full request to Form and starts New from Code in Form", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "my-flash", display_name: "My flash" },
  ]);
  const user = userEvent.setup();
  renderPlayground({ page: await linkedPage("my-flash") });
  await screen.findByText("My flash", { exact: true });
  await user.click(
    screen.getByRole("button", { name: "More request options" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Edit full request" }),
  );
  expect(screen.getByRole("textbox", { name: "Request body" })).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Call tools in parallel" }),
  );
  expect(screen.getByRole("radio", { name: "Form" })).toBeChecked();
  expect(screen.queryByRole("textbox", { name: "Request body" })).toBeNull();
  expect(screen.getByRole("combobox", { name: "Model" })).toHaveAttribute(
    "data-model",
    "my-flash",
  );
  expect(screen.getByRole("button", { name: "get_weather" })).toBeVisible();
  await user.click(screen.getByRole("radio", { name: "Code" }));
  await user.click(screen.getByRole("button", { name: "New" }));
  expect(screen.getByRole("radio", { name: "Form" })).toBeChecked();
  expect(screen.getByLabelText("Prompt")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Call tools in parallel" }),
  ).toHaveAttribute("aria-pressed", "false");
});

it("shows actual tool argument frames in Rendered and Raw before a parallel tool response completes", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "deepseek-flash", display_name: "DeepSeek Flash" },
  ]);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  let writer!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      writer = controller;
    },
  });
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/session")
      return Response.json({ ...TEST_SESSION, csrf_token: "fixture" });
    expect(url).toBe("/api/organizations/default/proxy/v1/messages?beta=true");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "deepseek-flash",
      stream: true,
      tools: [{ name: "get_weather" }, { name: "get_time" }],
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  function frame(type: string, payload: Record<string, unknown> = {}) {
    writer.enqueue(
      new TextEncoder().encode(
        `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`,
      ),
    );
  }
  function delta(index: number, fragment: string) {
    frame("content_block_delta", {
      index,
      delta: { type: "input_json_delta", partial_json: fragment },
    });
  }
  const user = userEvent.setup();
  renderPlayground();
  await screen.findByText("DeepSeek Flash", { exact: true });
  await user.click(
    screen.getByRole("button", { name: "Call tools in parallel" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  const add = screen.getByRole("button", { name: "Add to messages" });
  expect(add).toBeDisabled();
  await act(async () => {
    frame("message_start", { message: { type: "message", content: [] } });
    for (const [index, name] of [
      "get_weather",
      "get_time",
      "get_weather",
    ].entries()) {
      frame("content_block_start", {
        index,
        content_block: {
          type: "tool_use",
          name,
          id: `tool_${index}`,
          input: {},
        },
      });
    }
  });
  expect(
    screen.queryByRole("region", { name: "Streaming tool input" }),
  ).toBeNull();
  await act(async () => delta(0, '{"location":"'));
  const weather = await screen.findByLabelText(
    "Input for get_weather, block 1",
  );
  expect(weather.textContent).toBe('{"location":"');
  await user.click(screen.getByLabelText("Raw", { exact: true }));
  expect(weather).toBeVisible();
  const longLocation = "x".repeat(5000);
  await act(async () => {
    delta(1, '{"timezone":"Asia/');
    delta(2, JSON.stringify({ location: longLocation }));
    delta(0, 'Paris"}');
  });
  expect(weather.textContent).toBe('{"location":"Paris"}');
  expect(screen.getByLabelText("Input for get_time, block 2").textContent).toBe(
    '{"timezone":"Asia/',
  );
  const clipped = screen.getByLabelText(
    "Input for get_weather, block 3",
  ).textContent;
  expect(clipped).toMatch(/^…x+/);
  expect(clipped?.length).toBeLessThan(longLocation.length);
  expect(add).toBeDisabled();
  await act(async () => {
    delta(1, 'Tokyo"}');
    for (const index of [0, 1, 2]) frame("content_block_stop", { index });
    frame("message_stop");
    writer.close();
  });
  const raw = await screen.findByLabelText("Response body");
  expect(JSON.parse(raw.textContent!).content).toMatchObject([
    { name: "get_weather", input: { location: "Paris" } },
    { name: "get_time", input: { timezone: "Asia/Tokyo" } },
    { name: "get_weather", input: { location: longLocation } },
  ]);
  expect(add).toBeEnabled();
  expect(
    screen.queryByRole("region", { name: "Streaming tool input" }),
  ).toBeNull();
});

it("clears tool previews on Stop, a new run and principal change, and ignores late events", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([
    { id: "demo", display_name: "Demo" },
  ]);
  const requests: {
    signal: AbortSignal;
    append: (part: string) => void;
    tool: (fragment: string) => void;
    finish: () => void;
  }[] = [];
  vi.spyOn(gateway, "runPlayground").mockImplementation(
    (_body, _id, signal, append, onToolInput) =>
      new Promise<gateway.PlaygroundReply>((resolve) =>
        requests.push({
          signal,
          append,
          tool: (fragment) =>
            onToolInput?.({ index: 0, name: "example", fragment }),
          finish: () => resolve(reply),
        }),
      ),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  const user = userEvent.setup();
  const forPrincipal = (id: string) => (
    <ConsoleSessionContext.Provider
      value={
        {
          data: { ...TEST_SESSION, playground_access: true, id },
        } as ReturnType<typeof useConsoleSession>
      }
    >
      <Playground />
    </ConsoleSessionContext.Provider>
  );
  const view = renderPlayground({ page: forPrincipal(TEST_SESSION.id) });
  await screen.findByText("Demo", { exact: true });
  await user.type(screen.getByLabelText("Prompt"), "Hello");
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  act(() => requests[0].tool("first fragment"));
  expect(screen.getByText("first fragment")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(screen.queryByText("first fragment")).toBeNull();
  expect(requests[0].signal.aborted).toBe(true);
  expect(document.querySelector("[data-run-status]")).toHaveAttribute(
    "data-run-status",
    "stopped",
  );
  expect(requests).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  await act(async () => {
    requests[0].append("stale response");
    requests[0].tool("old tool");
    requests[0].finish();
    requests[1].tool("next fragment");
  });
  expect(screen.queryByText("stale response")).toBeNull();
  expect(screen.queryByText("old tool")).toBeNull();
  expect(screen.getByLabelText("Input for example, block 1").textContent).toBe(
    "next fragment",
  );
  view.rerender(forPrincipal("another-account"));
  expect(requests[1].signal.aborted).toBe(true);
  await act(async () => {
    requests[1].tool("previous account");
    requests[1].finish();
  });
  expect(screen.queryByText("next fragment")).toBeNull();
  expect(screen.queryByText("previous account")).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Start with a template" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Prompt")).toHaveValue("");
});
