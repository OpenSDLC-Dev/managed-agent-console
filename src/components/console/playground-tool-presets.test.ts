import { expect, it } from "vitest";
import { newDraft } from "./playground-editor";
import {
  availablePlaygroundTools,
  switchPlaygroundModel,
} from "./playground-tool-presets";

const alias = "workspace-model";
const deepseek = "deepseek-flash";
const presets = (id: string) =>
  availablePlaygroundTools({ id, display_name: "Team model" });

it("converts both web presets on a model change, preserving the rest of the draft", () => {
  const clientTools = presets(alias)
    .slice(0, 2)
    .map(({ definition }) => definition);
  const providerTools = presets(deepseek)
    .slice(0, 2)
    .map(({ definition }) => definition);
  const custom = { name: "workspace_search", input_schema: { type: "object" } };
  const draft = {
    ...newDraft(),
    system: "Keep this instruction",
    parameters: {
      temperature: 0,
      tools: [custom, ...clientTools],
      tool_choice: {
        type: "tool",
        name: "web_fetch",
        disable_parallel_tool_use: true,
        extra: { kept: true },
      },
    },
  };
  const switched = switchPlaygroundModel(draft, alias, deepseek);
  expect(switched).toEqual({
    ...draft,
    parameters: {
      temperature: 0,
      tools: [custom, ...providerTools],
      tool_choice: {
        type: "auto",
        disable_parallel_tool_use: true,
        extra: { kept: true },
      },
    },
  });
  if (typeof switched === "string") throw new Error(switched);
  expect(switchPlaygroundModel(switched, deepseek, alias)).toEqual({
    ...draft,
    parameters: {
      temperature: 0,
      tools: [custom, ...clientTools],
      tool_choice: {
        type: "auto",
        disable_parallel_tool_use: true,
        extra: { kept: true },
      },
    },
  });
  expect(draft.parameters.tools).toEqual([custom, ...clientTools]);
});

it("preserves custom schemas and reports conflicts instead of losing a tool or its settings", () => {
  const client = presets(alias)[0].definition;
  const native = presets(deepseek)[0].definition;
  const custom = {
    ...client,
    input_schema: { type: "object", additionalProperties: true },
  };
  const reordered = {
    ...client,
    input_schema: Object.fromEntries(
      Object.entries(client.input_schema as object).reverse(),
    ),
  };
  const reorderedDraft = { ...newDraft(), parameters: { tools: [reordered] } };
  expect(switchPlaygroundModel(reorderedDraft, alias, deepseek)).toMatchObject({
    parameters: { tools: [native] },
  });
  const draft = { ...newDraft(), parameters: { tools: [custom] } };
  expect(switchPlaygroundModel(draft, alias, deepseek)).toEqual(draft);
  expect(
    switchPlaygroundModel(
      { ...draft, parameters: { tools: [native, custom] } },
      deepseek,
      alias,
    ),
  ).toMatch(/already uses that name/);
  expect(
    switchPlaygroundModel(
      { ...draft, parameters: { tools: [{ ...native, max_uses: 2 }] } },
      deepseek,
      alias,
    ),
  ).toMatch(/provider-specific settings/);
});
