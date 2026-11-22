import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SchemaTextarea } from "./schema-textarea";
import type { PlaygroundDraft } from "./playground-editor";
import { isObject } from "./playground-snippet";

function toolName(tool: unknown) {
  return isObject(tool) && typeof tool.name === "string" ? tool.name : "";
}

export function addCustomTool(draft: PlaygroundDraft): PlaygroundDraft {
  const tools: unknown[] = Array.isArray(draft.parameters?.tools)
    ? draft.parameters.tools
    : [];
  const names = new Set(tools.map(toolName));
  let name = "get_weather";
  for (let i = 2; names.has(name); i++) name = `get_weather_${i}`;
  const tool = {
    name,
    description: "Get the current weather in a given location",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The city and state, e.g. San Francisco, CA",
        },
        unit: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "The unit of temperature",
        },
      },
      required: ["location"],
    },
  };
  return {
    ...draft,
    toolSchemas: draft.toolSchemas && [undefined, ...draft.toolSchemas],
    parameters: { ...draft.parameters, tools: [tool, ...tools] },
  };
}

type ToolChoice = { type: string; name?: string };

function ChoiceMenu({
  choice,
  names,
  onChange,
}: {
  choice: unknown;
  names: string[];
  onChange: (next: ToolChoice) => void;
}) {
  const current =
    isObject(choice) && typeof choice.type === "string" ? choice.type : "auto";
  const forced =
    current === "tool" && isObject(choice) && typeof choice.name === "string"
      ? choice.name
      : "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={buttonVariants({ variant: "ghost", size: "xs" })}
      >
        {forced || current.charAt(0).toUpperCase() + current.slice(1)}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(type) => onChange({ type })}
        >
          <DropdownMenuLabel>Tool choice</DropdownMenuLabel>
          {["auto", "any", "none"].map((type) => (
            <DropdownMenuRadioItem
              key={type}
              value={type}
              className="capitalize"
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {names.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Force tool</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                aria-label="Force tool"
                value={forced}
                onValueChange={(name) => onChange({ type: "tool", name })}
              >
                {names.map((name) => (
                  <DropdownMenuRadioItem key={name} value={name}>
                    {name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlaygroundTools({
  draft,
  onChange,
  expanded,
  onExpand,
  onEditFullRequest,
}: {
  draft: PlaygroundDraft;
  onChange: (next: PlaygroundDraft) => void;
  expanded: number | null;
  onExpand: (index: number | null) => void;
  onEditFullRequest: (triggerId: string) => void;
}) {
  const tools: unknown[] = Array.isArray(draft.parameters?.tools)
    ? draft.parameters.tools
    : [];
  if (!tools.length) return null;
  const choice = draft.parameters?.tool_choice;
  function update(
    index: number,
    changes: Record<string, unknown>,
    toolSchemas = draft.toolSchemas,
  ) {
    const tool = tools[index];
    if (!isObject(tool)) return;
    const parameters = {
      ...draft.parameters,
      tools: tools.map((existing, i) =>
        i === index ? { ...tool, ...changes } : existing,
      ),
    };
    if (
      "name" in changes &&
      isObject(choice) &&
      choice.type === "tool" &&
      choice.name === tool.name
    ) {
      onChange({
        ...draft,
        toolSchemas,
        parameters: {
          ...parameters,
          tool_choice: { ...choice, name: changes.name },
        },
      });
    } else onChange({ ...draft, toolSchemas, parameters });
  }
  function setSchema(index: number, text: string) {
    const toolSchemas = [...(draft.toolSchemas ?? [])];
    let schema: unknown;
    try {
      schema = JSON.parse(text);
    } catch {
      toolSchemas[index] = { text, invalid: true };
      onChange({ ...draft, toolSchemas });
      return;
    }
    toolSchemas[index] = { text, invalid: false };
    update(index, { input_schema: schema }, toolSchemas);
  }
  function remove(index: number) {
    const parameters = { ...draft.parameters };
    const remaining = tools.filter((_, i) => index !== i);
    if (remaining.length) parameters.tools = remaining;
    else delete parameters.tools;
    if (
      !remaining.length ||
      (isObject(choice) &&
        choice.type === "tool" &&
        choice.name === toolName(tools[index]))
    )
      delete parameters.tool_choice;
    onExpand(
      expanded !== null && expanded > index
        ? expanded - 1
        : expanded === index
          ? null
          : expanded,
    );
    const toolSchemas = draft.toolSchemas?.slice();
    toolSchemas?.splice(index, 1);
    onChange({
      ...draft,
      toolSchemas,
      parameters,
    });
  }
  return (
    <section aria-labelledby="playground-tools" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id="playground-tools" className="text-sm font-medium">
          Tools
        </h3>
        <ChoiceMenu
          choice={choice}
          names={Array.from(new Set(tools.map(toolName).filter(Boolean)))}
          onChange={(next) => {
            const previous = isObject(choice) ? { ...choice } : {};
            delete previous.name;
            if (next.type === "none") delete previous.disable_parallel_tool_use;
            onChange({
              ...draft,
              parameters: {
                ...draft.parameters,
                tool_choice: { ...previous, ...next },
              },
            });
          }}
        />
      </div>
      {tools.map((tool, index) => {
        const name = toolName(tool) || `Tool ${index + 1}`;
        const open = expanded === index;
        const prefix = `playground-tool-${index}`;
        const edit = draft.toolSchemas?.[index];
        const custom =
          isObject(tool) && (tool.type == null || tool.type === "custom");
        return (
          <div key={index} className="overflow-hidden rounded-lg border">
            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1">
              <button
                id={`${prefix}-toggle`}
                type="button"
                aria-expanded={open}
                aria-controls={`${prefix}-fields`}
                onClick={() => onExpand(open ? null : index)}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronRight
                  className={open ? "size-3 rotate-90" : "size-3"}
                />
                <Wrench className="size-3.5 text-muted-foreground" />
                <span className="truncate">{name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  type="button"
                  aria-label={`${name} options`}
                  className={buttonVariants({
                    variant: "ghost",
                    size: "icon-xs",
                  })}
                >
                  <Ellipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 />
                    Remove tool
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div
              id={`${prefix}-fields`}
              hidden={!open}
              className="space-y-3 px-3 py-3"
            >
              {custom ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    The model calls this tool with arguments matching the
                    schema. Your code runs it and returns the result.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${prefix}-name`}>Name</Label>
                    <Input
                      id={`${prefix}-name`}
                      value={toolName(tool)}
                      onChange={(event) =>
                        update(index, { name: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${prefix}-description`}>Description</Label>
                    <textarea
                      id={`${prefix}-description`}
                      className="w-full resize-y rounded-lg bg-muted/70 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                      rows={2}
                      placeholder="What this tool does and when to use it"
                      value={
                        typeof tool.description === "string"
                          ? tool.description
                          : ""
                      }
                      onChange={(event) =>
                        update(index, { description: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${prefix}-schema`}>Input schema</Label>
                    <SchemaTextarea
                      id={`${prefix}-schema`}
                      value={
                        edit?.text ??
                        JSON.stringify(tool.input_schema, null, 2) ??
                        ""
                      }
                      onValueChange={(text) => setSchema(index, text)}
                      aria-invalid={edit?.invalid || undefined}
                      aria-describedby={`${prefix}-hint`}
                      rows={7}
                      spellCheck={false}
                      className="w-full resize-y rounded-lg border bg-muted/40 p-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive-surface"
                    />
                    <p
                      id={`${prefix}-hint`}
                      className={
                        edit?.invalid ? "text-xs text-destructive" : "sr-only"
                      }
                    >
                      {edit?.invalid
                        ? "Enter valid JSON for the input schema."
                        : "Tab inserts indentation. Press Escape then Tab to move focus out of the editor."}
                    </p>
                  </div>
                </>
              ) : (
                <Button
                  id={`${prefix}-edit`}
                  type="button"
                  size="sm"
                  variant="link"
                  onClick={() => onEditFullRequest(`${prefix}-edit`)}
                >
                  Edit full request
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
