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
import * as gateway from "@/lib/platform/playground";
import { TEST_SESSION } from "@/../test/session-fixture";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import { Playground } from "./playground";
import { availablePlaygroundTools } from "./playground-tool-presets";
import {
  PlaygroundTemplates,
  type PlaygroundTemplate,
} from "./playground-templates";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const model = { id: "workspace-alias", display_name: "Workspace alias" };
const clientCards = ["Stream tool arguments live", "Call tools in parallel"];
const firstPage = [
  "Deep research",
  "Operate a computer",
  "Analyze a log with bash",
  "Explain an article",
  ...clientCards,
];

function titles() {
  return within(screen.getByRole("list"))
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"));
}

it("keeps portable drafts available while the model selector is empty and opens the full catalogue once a model is selected", () => {
  const view = render(<PlaygroundTemplates onSelect={vi.fn()} />);
  expect(titles()).toEqual(clientCards);
  expect(
    screen.queryByRole("navigation", { name: "Template pages" }),
  ).toBeNull();
  view.rerender(<PlaygroundTemplates model={model} onSelect={vi.fn()} />);
  expect(titles()).toEqual(firstPage);
  expect(screen.getByRole("button", { name: "More" })).toBeVisible();
});

it.each([
  ["deepseek-flash", true],
  ["workspace-alias", false],
] as const)(
  "shows where %s receives the web results and inserts the corresponding tools",
  async (alias, native) => {
    const user = userEvent.setup();
    const onSelect = vi.fn<(template: PlaygroundTemplate) => void>();
    render(
      <PlaygroundTemplates
        model={{ id: alias, display_name: "My model" }}
        onSelect={onSelect}
      />,
    );
    expect(titles()).toEqual(firstPage);
    for (const [title, name, deepseekName] of [
      ["Deep research", "web_search", "deepseek_web_search"],
      ["Explain an article", "web_fetch", "deepseek_read_url"],
    ]) {
      const card = screen.getByRole("button", { name: title });
      expect(card).toHaveAccessibleDescription(native ? /provider/ : /client/);
      await user.click(card);
      const template = onSelect.mock.lastCall![0];
      expect(template.tools).toHaveLength(1);
      if (native) {
        expect(template.tools[0]).toEqual({
          name: deepseekName,
          type: deepseekName,
        });
      } else {
        expect(template.tools[0]).toMatchObject({
          name,
          input_schema: { type: "object" },
        });
        expect(template.tools[0]).not.toHaveProperty("type");
        expect(template.system).toContain("wait for its result");
      }
    }
  },
);

it("pages through seven templates, replaces the previous tools in Code and never sends the draft", async () => {
  vi.spyOn(gateway, "playgroundModels").mockResolvedValue([model]);
  const run = vi
    .spyOn(gateway, "runPlayground")
    .mockRejectedValue(new Error("Unexpected Run"));
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
        <Playground requestedAlias={model.id} />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
  await screen.findByText(model.display_name, { exact: true });
  expect(titles()).toEqual(firstPage);
  await user.click(screen.getByRole("radio", { name: "Code" }));
  await user.selectOptions(screen.getByLabelText("Code language"), "JSON");
  const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "JSON request code",
  });
  fireEvent.change(editor, {
    target: {
      value: JSON.stringify({
        model: model.id,
        max_tokens: 512,
        messages: [],
        temperature: 0.5,
        tools: [{ name: "previous_tool", input_schema: { type: "object" } }],
        tool_choice: { type: "tool", name: "previous_tool" },
      }),
    },
  });
  const presets = availablePlaygroundTools(model);
  for (const [title, id] of [
    ["Deep research", "web_search"],
    ["Operate a computer", "computer"],
    ["Analyze a log with bash", "bash"],
    ["Explain an article", "web_fetch"],
    ["Navigate a website", "browser"],
  ]) {
    if (title === "Navigate a website") {
      const more = screen.getByRole("button", { name: "More" });
      more.focus();
      await user.keyboard("{Enter}");
      expect(more).toHaveFocus();
      expect(more).toHaveAccessibleName("Previous");
      expect(titles()).toEqual(["Navigate a website"]);
      expect(screen.getByRole("list")).toHaveAttribute(
        "data-template-page",
        "2",
      );
    }
    const card = screen.getByRole("button", { name: title });
    await user.click(card);
    expect(card).toHaveFocus();
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "Code" })).toBeChecked();
    const body = JSON.parse(editor.value);
    const definition = presets.find((preset) => preset.id === id)!.definition;
    expect(body).toMatchObject({
      model: model.id,
      max_tokens: 512,
      temperature: 0.5,
      system: expect.any(String),
      messages: [{ role: "user", content: expect.any(String) }],
    });
    expect(body.tools).toEqual([definition]);
    expect(body).not.toHaveProperty("tool_choice");
  }
  await user.click(screen.getByRole("button", { name: "Previous" }));
  expect(screen.getByRole("list")).toHaveAttribute("data-template-page", "1");
  await user.click(screen.getByRole("button", { name: "More" }));
  expect(
    screen.getByRole("button", { name: "Navigate a website" }),
  ).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "New" }));
  expect(screen.getByRole("list")).toHaveAttribute("data-template-page", "1");
  expect(screen.getByRole("radio", { name: "Form" })).toBeChecked();
  expect(screen.getByLabelText("Prompt")).toHaveValue("");
  expect(run).not.toHaveBeenCalled();
});
