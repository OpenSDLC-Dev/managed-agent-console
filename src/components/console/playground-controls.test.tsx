import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TEST_SESSION } from "@/../test/session-fixture";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import * as gateway from "@/lib/platform/playground";
import { Playground } from "./playground";
import { remapExpandedTools } from "./playground-tools";
import { availablePlaygroundTools } from "./playground-tool-presets";

const models = [
  {
    id: "general",
    display_name: "General",
    max_tokens: 8192,
    capabilities: { thinking: { supported: false } },
  },
  {
    id: "reason",
    display_name: "Reason",
    max_tokens: 0,
    capabilities: {
      thinking: {
        supported: true,
        types: { enabled: { supported: true }, adaptive: { supported: false } },
      },
    },
  },
];

async function setup(availableModels = models) {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue(availableModels);
  const run = vi.spyOn(gateway, "runPlayground").mockResolvedValue({
    raw: '{"content":[]}',
    rawLabel: "Response body",
    content: [],
    durationMs: 1,
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConsoleSessionContext.Provider
        value={
          { data: { ...TEST_SESSION, playground_access: true } } as ReturnType<
            typeof useConsoleSession
          >
        }
      >
        <Playground />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
  await screen.findByText("General", { exact: true });
  return { user, run };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("edits model-scoped settings in the drawer and sends exactly the displayed request", async () => {
  const { user, run } = await setup();
  const trigger = screen.getByRole("button", { name: "Model settings" });
  await user.click(trigger);
  const panel = within(await screen.findByRole("dialog", { name: "Model" }));
  expect(panel.getByRole("slider", { name: "Max tokens" })).toHaveAttribute(
    "max",
    "8192",
  );
  expect(panel.queryByRole("radiogroup", { name: "Thinking" })).toBeNull();
  await user.click(panel.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "Reason" }));
  expect(panel.getByRole("radio", { name: "Default" })).toBeChecked();
  expect(panel.queryByRole("radio", { name: "Adaptive" })).toBeNull();
  const tokens = panel.getByRole("spinbutton", { name: "Max tokens value" });
  fireEvent.change(tokens, { target: { value: "100000" } });
  const range = panel.getByRole("slider", { name: "Max tokens" });
  expect(range).toHaveAttribute("max", "100000");
  fireEvent.change(range, { target: { value: "256" } });
  expect(tokens).toHaveValue(256);
  expect(range).toHaveAttribute("max", "100000");
  expect(
    panel.getByRole("radio", { name: "Enabled" }),
  ).toHaveAccessibleDescription(/Max tokens to 1,025/);
  await user.click(panel.getByRole("radio", { name: "Enabled" }));
  expect(tokens).toHaveValue(1025);
  await user.click(panel.getByRole("button", { name: "Advanced" }));
  expect(panel.queryByRole("slider", { name: "Temperature" })).toBeNull();
  await user.click(panel.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "General" }));
  expect(panel.queryByRole("radiogroup", { name: "Thinking" })).toBeNull();
  await user.click(panel.getByRole("button", { name: "Use model default" }));
  await user.click(panel.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "Reason" }));
  expect(panel.getByRole("radio", { name: "Default" })).toBeChecked();
  const temperature = panel.getByRole("spinbutton", {
    name: "Temperature value",
  });
  fireEvent.change(panel.getByRole("slider", { name: "Temperature" }), {
    target: { value: "0.27" },
  });
  expect(temperature).toHaveValue(0.27);
  fireEvent.change(temperature, { target: { value: "0" } });
  await user.click(panel.getByRole("button", { name: "Add" }));
  await user.type(
    panel.getByRole("textbox", { name: "Stop sequence 1" }),
    "END\\n",
  );
  await user.click(panel.getByRole("button", { name: "Add" }));
  await user.click(
    panel.getAllByRole("button", { name: "Remove stop sequence" })[1],
  );
  await user.click(panel.getByRole("switch", { name: "Streaming" }));
  expect(
    panel.getByRole("link", { name: "View API reference" }),
  ).toHaveAttribute(
    "href",
    "https://platform.claude.com/docs/en/api/messages/create",
  );
  await user.click(panel.getByRole("button", { name: "Close settings" }));
  expect(trigger).toHaveFocus();
  await user.type(screen.getByLabelText("Prompt"), "Reply briefly");
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run.mock.calls[0][0]).toEqual({
    model: "reason",
    max_tokens: 1025,
    messages: [{ role: "user", content: "Reply briefly" }],
    temperature: 0,
    stop_sequences: ["END\n"],
    stream: false,
  });
});

it("keeps literal backslashes and line breaks distinct when editing stop sequences from Code", async () => {
  const { user, run } = await setup();
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const source = {
    model: "reason",
    max_tokens: 3000,
    messages: [{ role: "user", content: "hello" }],
    stop_sequences: ["literal\\n", "line\r\nbreak"],
    output_config: { effort: "high" },
    stream: true,
  };
  fireEvent.change(screen.getByRole("textbox", { name: /request code$/i }), {
    target: { value: JSON.stringify(source) },
  });
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Model settings" }));
  const panel = within(screen.getByRole("dialog", { name: "Model" }));
  await user.click(panel.getByRole("radio", { name: "Disabled" }));
  await user.click(panel.getByRole("button", { name: "Advanced" }));
  const literal = panel.getByRole("textbox", { name: "Stop sequence 1" });
  await user.type(literal, "X");
  await user.type(panel.getByRole("textbox", { name: "Stop sequence 2" }), "Y");
  await user.click(panel.getByRole("button", { name: "Add" }));
  await user.type(
    panel.getByRole("textbox", { name: "Stop sequence 3" }),
    "next",
  );
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run.mock.calls[0][0]).toEqual({
    ...source,
    thinking: { type: "disabled" },
    stop_sequences: ["literal\\nX", "line\r\nbreakY", "next"],
  });
});

it("shows the actual request values when the slider's initial range or advertised thinking modes differ", async () => {
  const { user, run } = await setup();
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const body = {
    model: "reason",
    max_tokens: 12000,
    temperature: 1.75,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: "Which settings?" }],
    stream: false,
  };
  fireEvent.change(screen.getByRole("textbox", { name: "JSON request code" }), {
    target: { value: JSON.stringify(body) },
  });
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Model settings" }));
  const panel = within(screen.getByRole("dialog", { name: "Model" }));
  await user.click(panel.getByRole("button", { name: "Use model default" }));
  expect(panel.getByRole("radio", { name: "Default" })).toBeChecked();
  await user.click(panel.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "General" }));
  expect(panel.getByRole("slider", { name: "Max tokens" })).toHaveValue(
    "12000",
  );
  await user.click(panel.getByRole("button", { name: "Advanced" }));
  const temperature = panel.getByRole("spinbutton", {
    name: "Temperature value",
  });
  const slider = panel.getByRole("slider", { name: "Temperature" });
  expect(slider).toHaveValue("1.75");
  fireEvent.change(temperature, { target: { value: "-0.25" } });
  expect(slider).toHaveValue("-0.25");
  await user.click(panel.getByRole("button", { name: "Close settings" }));
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run.mock.calls[0][0]).toEqual({
    model: "general",
    max_tokens: 12000,
    temperature: -0.25,
    messages: body.messages,
    stream: false,
  });
});

it("separates request and turn menus and round-trips edits to custom tools with a forced choice", async () => {
  const { user, run } = await setup();
  await user.type(screen.getByLabelText("Prompt"), "Weather");
  const add = screen.getByRole("button", { name: "Add" });
  await user.click(add);
  const menu = within(await screen.findByRole("menu"));
  expect(
    menu.getByRole("menuitem", { name: "System prompt Added" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(menu.getByRole("group", { name: "Tools" })).toBeVisible();
  expect(menu.queryByText("Add user message")).toBeNull();
  await user.click(menu.getByRole("menuitem", { name: "Custom tool" }));
  expect(screen.getByRole("button", { name: "get_weather" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const schema = screen.getByRole("textbox", { name: "Input schema" });
  expect(JSON.parse((schema as HTMLTextAreaElement).value).required).toEqual([
    "location",
  ]);
  await user.click(screen.getByRole("button", { name: "Auto" }));
  await user.click(await screen.findByRole("menuitem", { name: "Force tool" }));
  fireEvent.click(
    await screen.findByRole("menuitemradio", { name: "get_weather" }),
  );
  expect(screen.queryByRole("button", { name: "Auto" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "local_weather" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
    target: { value: "Local weather" },
  });
  fireEvent.change(schema, {
    target: { value: '{"type":"object","properties":{}}' },
  });
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const request = JSON.parse(
    (
      screen.getByRole("textbox", {
        name: /request code$/i,
      }) as HTMLTextAreaElement
    ).value,
  );
  expect(request.tool_choice).toEqual({ type: "tool", name: "local_weather" });
  expect(request.tools).toEqual([
    {
      name: "local_weather",
      description: "Local weather",
      input_schema: { type: "object", properties: {} },
    },
  ]);
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run.mock.calls[0][0]).toEqual(request);
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(
    screen.getByRole("button", { name: "local_weather options" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Remove tool" }),
  );
  expect(screen.queryByRole("heading", { name: "Tools" })).toBeNull();
  await user.click(screen.getByLabelText("Code", { exact: true }));
  const after = JSON.parse(
    (
      screen.getByRole("textbox", {
        name: /request code$/i,
      }) as HTMLTextAreaElement
    ).value,
  );
  expect(after).not.toHaveProperty("tools");
  expect(after).not.toHaveProperty("tool_choice");
});

it("clears the parallel-call constraint when switching tool choice to None", async () => {
  const { user, run } = await setup();
  await user.click(
    screen.getByRole("button", { name: "Call tools in parallel" }),
  );
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "JSON request code",
  });
  const request = JSON.parse(editor.value);
  request.tool_choice = { type: "auto", disable_parallel_tool_use: true };
  fireEvent.change(editor, { target: { value: JSON.stringify(request) } });
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Auto" }));
  await user.click(await screen.findByRole("menuitemradio", { name: "None" }));
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run.mock.calls[0][0]).toEqual({
    ...request,
    tool_choice: { type: "none" },
  });
});

it("keeps invalid custom JSON editable when the tool takes a preset's name and description", async () => {
  const { user } = await setup();
  const search = availablePlaygroundTools(models[0]).find(
    ({ id }) => id === "web_search",
  )!;
  await user.click(screen.getByRole("button", { name: "Add" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Custom tool" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: search.definition.name },
  });
  const schema = screen.getByRole("textbox", { name: "Input schema" });
  fireEvent.change(schema, { target: { value: "{" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
    target: { value: search.definition.description },
  });
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(schema).toBeVisible();
  expect(schema).toHaveFocus();
  fireEvent.change(schema, { target: { value: '{"type":"object"}' } });
  await user.click(screen.getByLabelText("Code", { exact: true }));
  expect(screen.getByRole("textbox", { name: /request code$/i })).toBeVisible();
});

it("retains a partially edited tool schema and reveals it before running or switching request views", async () => {
  const { user, run } = await setup();
  const add = screen.getByRole("button", { name: "Add" });
  await user.type(screen.getByLabelText("Prompt"), "Test");
  for (let i = 0; i < 2; i++) {
    await user.click(add);
    await user.click(
      await screen.findByRole("menuitem", { name: "Custom tool" }),
    );
  }
  const schema = screen.getByRole("textbox", { name: "Input schema" });
  fireEvent.change(schema, { target: { value: "{" } });
  await user.click(screen.getByRole("button", { name: "get_weather_2" }));
  await user.click(screen.getByRole("button", { name: "get_weather options" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Remove tool" }),
  );
  await user.click(screen.getByLabelText("Code", { exact: true }));
  const remaining = screen.getByRole("textbox", { name: "Input schema" });
  expect(remaining).toHaveFocus();
  expect(remaining).toHaveValue("{");
  expect(remaining).toHaveAttribute("aria-invalid", "true");
  await user.click(
    screen.getByRole("button", { name: "More request options" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Edit full request" }),
  );
  expect(screen.queryByRole("textbox", { name: "Request body" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run).not.toHaveBeenCalled();
  expect(remaining).toHaveFocus();
  fireEvent.change(remaining, { target: { value: '{"type":"object"}' } });
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run.mock.calls[0][0]).toMatchObject({
    tools: [
      expect.objectContaining({
        name: "get_weather_2",
        input_schema: { type: "object" },
      }),
    ],
  });
});

it("prepends and expands every new custom tool, keeping existing tool edits attached to their names", async () => {
  const { user, run } = await setup();
  await user.click(
    screen.getByRole("button", { name: "Stream tool arguments live" }),
  );
  await user.click(screen.getByRole("button", { name: "make_file" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Input schema" }), {
    target: { value: "{" },
  });
  const add = screen.getByRole("button", { name: "Add" });
  for (const name of ["get_weather", "get_weather_2"]) {
    await user.click(add);
    await user.click(
      await screen.findByRole("menuitem", { name: "Custom tool" }),
    );
    const region = within(screen.getByRole("region", { name: "Tools" }));
    expect(region.getByRole("textbox", { name: "Name" })).toHaveValue(name);
    const first = region.getByRole("button", { name });
    const existing = region.getByRole("button", { name: "make_file" });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(
      first.compareDocumentPosition(existing) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(existing).toHaveAttribute("aria-expanded", "false");
  }
  await user.click(screen.getByLabelText("Code", { exact: true }));
  const original = screen.getByRole("textbox", { name: "Input schema" });
  expect(original).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
    "make_file",
  );
  fireEvent.change(original, { target: { value: '{"type":"object"}' } });
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run.mock.calls[0][0]).toMatchObject({
    tools: [
      { name: "get_weather_2" },
      { name: "get_weather" },
      { name: "make_file", input_schema: { type: "object" } },
    ],
  });
});

it("preserves unique expanded cards when imported tools with duplicate names swap places", () => {
  const first = { name: "fetch", description: "A" };
  const second = { name: "fetch", description: "B" };
  const unique = { name: "other" };
  const original = [first, second, unique];
  expect(
    remapExpandedTools([0, 2], original, structuredClone(original)),
  ).toEqual([0, 2]);
  expect(remapExpandedTools([0, 2], original, [second, first, unique])).toEqual(
    [2],
  );
});

it("keeps expanded cards on their tools when Code removes or reorders declarations", async () => {
  const { user } = await setup();
  const add = screen.getByRole("button", { name: "Add" });
  for (const name of ["Browser use", "Computer use", "Bash"]) {
    await user.click(add);
    await user.click(await screen.findByRole("menuitem", { name }));
  }
  await user.click(screen.getByRole("button", { name: "computer" }));
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  for (const operation of ["remove", "reverse"]) {
    await user.click(screen.getByLabelText("Code", { exact: true }));
    const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "JSON request code",
    });
    const request = JSON.parse(editor.value);
    request.tools =
      operation === "remove" ? request.tools.slice(1) : request.tools.reverse();
    fireEvent.change(editor, { target: { value: JSON.stringify(request) } });
    await user.click(screen.getByLabelText("Form", { exact: true }));
    expect(screen.getByRole("button", { name: "computer" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "browser" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  }
});

it("preserves Form's thinking budget across templates and lets raw Code keep provider-specific values", async () => {
  // Model discovery can report a small shared limit for a thinking-capable alias.
  const { user, run } = await setup([
    models[0],
    { ...models[1], max_tokens: 512 },
  ]);
  const settings = screen.getByRole("button", { name: "Model settings" });
  await user.click(settings);
  let panel = within(screen.getByRole("dialog", { name: "Model" }));
  await user.click(panel.getByRole("combobox", { name: "Model" }));
  await user.click(await screen.findByRole("option", { name: "Reason" }));
  await user.click(panel.getByRole("radio", { name: "Enabled" }));
  const max = panel.getByRole("spinbutton", { name: "Max tokens value" });
  expect(max).toHaveValue(1025);
  fireEvent.change(max, { target: { value: "8" } });
  expect(max).toHaveAttribute("aria-invalid", "true");
  await user.click(panel.getByRole("button", { name: "Close settings" }));
  const go = screen.getByRole("button", { name: "Run prompt" });
  expect(go).toBeDisabled();
  for (const name of ["Stream tool arguments live", "Call tools in parallel"]) {
    await user.click(screen.getByRole("button", { name }));
    expect(go).toBeDisabled();
  }
  expect(go).toHaveAccessibleDescription(/at least 1,025/);
  expect(run).not.toHaveBeenCalled();
  await user.click(settings);
  panel = within(screen.getByRole("dialog", { name: "Model" }));
  await user.click(
    panel.getByRole("button", { name: "Set Max tokens to 1,025" }),
  );
  await user.click(panel.getByRole("button", { name: "Close settings" }));
  await user.click(go);
  expect(run.mock.calls[0][0]).toMatchObject({
    max_tokens: 1025,
    thinking: { type: "enabled", budget_tokens: 1024 },
  });
  await user.click(screen.getByLabelText("Code", { exact: true }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: /request code$/i,
  });
  const authored = { ...JSON.parse(editor.value), max_tokens: 15 };
  fireEvent.change(editor, { target: { value: JSON.stringify(authored) } });
  await user.click(screen.getByLabelText("Form", { exact: true }));
  await user.click(screen.getByRole("button", { name: "Run prompt" }));
  expect(run.mock.calls[1][0]).toEqual(authored);
});
