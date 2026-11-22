import { replaceEqualDeep } from "@tanstack/react-query";
import { Globe, Link2, Monitor, PanelsTopLeft, Terminal } from "lucide-react";
import type { PlaygroundModel } from "@/lib/platform/playground";
import type { PlaygroundDraft } from "./playground-editor";
import { isObject } from "./playground-snippet";

export type PlaygroundToolKind =
  "web_search" | "web_fetch" | "computer" | "browser" | "bash";

type ActionOption = { action: string; label: string; description: string };

export type PlaygroundToolPreset = {
  id: PlaygroundToolKind;
  label: string;
  icon: typeof Globe;
  help: string;
  definition: Record<string, unknown> & { name: string };
  options?: ActionOption[];
};

const coordinate = {
  type: "array",
  items: { type: "integer" },
  minItems: 2,
  maxItems: 2,
};
const text = { type: "string" };

// These are caller-defined Messages functions. Models request an action; only
// the operator supplies its result.
const bash: PlaygroundToolPreset = {
  id: "bash",
  label: "Bash",
  icon: Terminal,
  help: "The model requests shell commands. Enter the shell output to continue.",
  definition: {
    name: "bash",
    description:
      "Request a Bash command in the client’s shell or ask to restart its session. Wait for the client to return the result.",
    input_schema: {
      type: "object",
      properties: { command: text, restart: { type: "boolean" } },
    },
  },
};

const computer: PlaygroundToolPreset = {
  id: "computer",
  label: "Computer use",
  icon: Monitor,
  help: "The model requests screenshots, mouse actions, and keyboard input for a desktop. You supply the results.",
  options: [
    {
      action: "zoom",
      label: "Zoom",
      description: "Request a full-resolution crop of a screen region.",
    },
  ],
  definition: {
    name: "computer",
    description:
      "Request one desktop action from the client. Use pixels from the latest screenshot for coordinates. Wait for the client’s screenshot or action result.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "screenshot",
            "left_click",
            "right_click",
            "double_click",
            "mouse_move",
            "left_click_drag",
            "type",
            "key",
            "scroll",
            "zoom",
          ],
        },
        coordinate,
        start_coordinate: coordinate,
        text,
        scroll_direction: text,
        scroll_amount: { type: "integer" },
        region: {
          type: "array",
          items: { type: "integer" },
          minItems: 4,
          maxItems: 4,
        },
      },
      required: ["action"],
    },
  },
};

const browser: PlaygroundToolPreset = {
  id: "browser",
  label: "Browser use",
  icon: PanelsTopLeft,
  help: "The model requests actions in a browser you control. Enter the page content, a screenshot, or an action result to continue.",
  options: [
    {
      action: "javascript_exec",
      label: "JavaScript execution",
      description:
        "Allow the model to request a script for the client to evaluate.",
    },
    {
      action: "file_upload",
      label: "File upload",
      description: "Request an attachment to a file input.",
    },
    {
      action: "read_console",
      label: "Console reads",
      description: "Request entries from the browser console.",
    },
    {
      action: "read_network",
      label: "Network reads",
      description: "Request a list of the tab’s network requests.",
    },
  ],
  definition: {
    name: "browser",
    description:
      "Request one action in the client’s browser. Navigate with a URL, read a page, or use a reference from the latest page. Wait for the client’s result.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "list_tabs",
            "new_tab",
            "switch_tab",
            "close_tab",
            "navigate",
            "read_page",
            "get_page_text",
            "find",
            "left_click",
            "type",
            "key",
            "scroll",
            "screenshot",
          ],
        },
        url: text,
        tab_id: text,
        ref: text,
        coordinate,
        text,
        query: text,
        direction: text,
        paths: { type: "array", items: text },
      },
      required: ["action"],
    },
  },
};

const clientSearch: PlaygroundToolPreset = {
  id: "web_search",
  label: "Web search",
  icon: Globe,
  help: "The model requests a search query. Enter search results to continue.",
  definition: {
    name: "web_search",
    description:
      "Request a web search from the client. Use the sources it returns.",
    input_schema: {
      type: "object",
      properties: { query: text },
      required: ["query"],
    },
  },
};
const clientFetch: PlaygroundToolPreset = {
  id: "web_fetch",
  label: "Web fetch",
  icon: Link2,
  help: "The model requests a URL. Enter the page content to continue.",
  definition: {
    name: "web_fetch",
    description: "Ask the client to fetch a URL and return the page content.",
    input_schema: {
      type: "object",
      properties: { url: text },
      required: ["url"],
    },
  },
};
// api-docs.deepseek.com/guides/web_tools documents these declarations for
// deepseek-flash. Unidentified gateway aliases use ordinary Messages functions.
const webPresets = {
  client: [clientSearch, clientFetch],
  deepseek: [
    {
      ...clientSearch,
      help: "The model can search the web. The provider returns the search results in the response.",
      definition: { type: "deepseek_web_search", name: "deepseek_web_search" },
    },
    {
      ...clientFetch,
      help: "The provider reads a URL for the model and returns the page reference with its answer.",
      definition: { type: "deepseek_read_url", name: "deepseek_read_url" },
    },
  ],
};

function webToolsFor(alias: string): PlaygroundToolPreset[] {
  return alias === "deepseek-flash" ? webPresets.deepseek : webPresets.client;
}

export function availablePlaygroundTools(
  model?: PlaygroundModel,
): PlaygroundToolPreset[] {
  return model ? [...webToolsFor(model.id), computer, browser, bash] : [];
}

// Model changes in Form adapt only stock web tools. Full request and Code
// remain lossless editors, including for operator-defined or extended tools.
export function switchPlaygroundModel(
  draft: PlaygroundDraft,
  previous: string,
  next: string,
): PlaygroundDraft | string {
  const tools = draft.parameters?.tools;
  const before = webToolsFor(previous);
  const after = webToolsFor(next);
  if (before === after || !Array.isArray(tools)) return draft;
  const declarations = [...tools];
  const parameters = { ...draft.parameters };
  for (const [index, tool] of tools.entries()) {
    const source = before.find((preset) => matchesToolPreset(tool, preset));
    if (!source || !isObject(tool)) continue;
    const stock = source.definition;
    const pristine = replaceEqualDeep(stock, tool) === stock;
    if (!pristine) {
      if (stock.type)
        return `Edit or remove ${stock.name} before switching models. It has provider-specific settings.`;
      continue;
    }
    const target = after.find((preset) => preset.id === source.id)!.definition;
    if (
      tools.some(
        (existing) => isObject(existing) && existing.name === target.name,
      )
    ) {
      return `Rename or remove ${target.name} before switching models. A tool already uses that name.`;
    }
    declarations[index] = target;
    const choice = parameters.tool_choice;
    if (
      isObject(choice) &&
      choice.type === "tool" &&
      choice.name === stock.name
    ) {
      if (target.type) {
        const automatic: Record<string, unknown> = { ...choice, type: "auto" };
        delete automatic.name;
        parameters.tool_choice = automatic;
      } else parameters.tool_choice = { ...choice, name: target.name };
    }
  }
  return { ...draft, parameters: { ...parameters, tools: declarations } };
}

export function matchesToolPreset(tool: unknown, preset: PlaygroundToolPreset) {
  if (!isObject(tool) || tool.name !== preset.definition.name) return false;
  if (preset.definition.type) return tool.type === preset.definition.type;
  return (
    tool.type == null && tool.description === preset.definition.description
  );
}

export function presetActions(tool: unknown): string[] | undefined {
  if (!isObject(tool) || !isObject(tool.input_schema)) return;
  const fields = tool.input_schema.properties;
  if (!isObject(fields) || !isObject(fields.action)) return;
  const actions = fields.action.enum;
  if (
    Array.isArray(actions) &&
    actions.every((value) => typeof value === "string")
  )
    return actions;
}

export function withPresetAction(
  tool: Record<string, unknown>,
  option: ActionOption,
  checked: boolean,
) {
  const actions = presetActions(tool);
  const schema = tool.input_schema;
  if (
    !actions ||
    !isObject(schema) ||
    !isObject(schema.properties) ||
    !isObject(schema.properties.action)
  )
    return tool;
  const fields = { ...schema.properties };
  fields.action = {
    ...schema.properties.action,
    enum: checked
      ? [...new Set([...actions, option.action])]
      : actions.filter((action) => action !== option.action),
  };
  return { ...tool, input_schema: { ...schema, properties: fields } };
}
