"use client";

import { useId } from "react";
import { Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
export type MCPBindings = (number | null)[];
export type SchemaDrafts = Record<number, string>;

/** Match wire.go: accept any non-null JSON input_schema, not just objects. */
export function schemaDraftError(drafts: SchemaDrafts): string | null {
  for (const [index, value] of Object.entries(drafts)) {
    try {
      if (JSON.parse(value) === null)
        return `Tool ${Number(index) + 1}: input schema must not be null.`;
    } catch {
      return `Tool ${Number(index) + 1}: input schema must be valid JSON.`;
    }
  }
  return null;
}

export function toolsWithSchemaDrafts(
  tools: unknown[],
  drafts: SchemaDrafts,
): unknown[] {
  return tools.map((tool, index) =>
    drafts[index] === undefined
      ? tool
      : {
          ...object(tool),
          input_schema: JSON.parse(drafts[index]),
        },
  );
}

function ConfigFields({
  value,
  label,
  onChange,
}: {
  value: unknown;
  label: string;
  onChange: (value: ObjectValue) => void;
}) {
  const config = object(value);
  const change = (key: string, value: unknown) => {
    const next = { ...config };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={
          typeof config.enabled === "boolean"
            ? String(config.enabled)
            : "inherit"
        }
        onValueChange={(value) =>
          change("enabled", value === "inherit" ? undefined : value === "true")
        }
      >
        <SelectTrigger aria-label={`${label} enabled`} className="h-8 w-44">
          <SelectValue>
            {typeof config.enabled === "boolean"
              ? config.enabled
                ? "Enabled"
                : "Disabled"
              : "Default enabled"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="inherit">Default enabled</SelectItem>
          <SelectItem value="true">Enabled</SelectItem>
          <SelectItem value="false">Disabled</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={text(object(config.permission_policy).type) || "inherit"}
        onValueChange={(value) =>
          change(
            "permission_policy",
            value === "inherit" ? undefined : { type: value },
          )
        }
      >
        <SelectTrigger
          aria-label={`${label} permission policy`}
          className="h-8 w-40"
        >
          <SelectValue>
            {text(object(config.permission_policy).type) === "always_allow"
              ? "Always allow"
              : text(object(config.permission_policy).type) === "always_ask"
                ? "Always ask"
                : "Default policy"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="inherit">Default policy</SelectItem>
          <SelectItem value="always_allow">Always allow</SelectItem>
          <SelectItem value="always_ask">Always ask</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Wire source: platform internal/api/wire.go:399-568 and internal/toolset/materialize.go. */
export function AdditionalToolsEditor({
  tools,
  servers,
  schemaDrafts,
  bindings: initialBindings,
  onChange: commitChange,
}: {
  tools: unknown[];
  servers: unknown[];
  schemaDrafts: SchemaDrafts;
  bindings?: MCPBindings;
  onChange: (
    tools: unknown[],
    servers: unknown[],
    drafts: SchemaDrafts,
    bindings: MCPBindings,
  ) => void;
}) {
  const prefix = useId();
  // Retain identity while typing a name that temporarily equals another server's.
  // These editor-only bindings never enter the wire config; Raw re-parsing resets them.
  const bindings =
    initialBindings ??
    tools.map((value) => {
      const tool = object(value);
      const index =
        tool.type === "mcp_toolset"
          ? servers.findIndex(
              (server) => object(server).name === tool.mcp_server_name,
            )
          : -1;
      return index < 0 ? null : index;
    });
  const onChange = (
    nextTools: unknown[],
    nextServers: unknown[],
    drafts: SchemaDrafts,
    nextBindings = bindings,
  ) => commitChange(nextTools, nextServers, drafts, nextBindings);
  const changeTool = (index: number, patch: ObjectValue) =>
    onChange(
      tools.map((value, i) =>
        i === index ? { ...object(value), ...patch } : value,
      ),
      servers,
      schemaDrafts,
    );
  const removeTools = (
    remove: (value: unknown, index: number) => boolean,
    nextServers = servers,
    removedServer?: number,
  ) => {
    const next: unknown[] = [],
      drafts: SchemaDrafts = {};
    const nextBindings: MCPBindings = [];
    tools.forEach((value, index) => {
      if (remove(value, index)) return;
      if (schemaDrafts[index] !== undefined)
        drafts[next.length] = schemaDrafts[index];
      next.push(value);
      const binding = bindings[index];
      nextBindings.push(
        binding == null
          ? null
          : removedServer === undefined
            ? binding
            : binding === removedServer
              ? null
              : binding > removedServer
                ? binding - 1
                : binding,
      );
    });
    onChange(next, nextServers, drafts, nextBindings);
  };
  const uniqueName = (base: string, names: string[]) => {
    let name = base,
      suffix = 2;
    while (names.includes(name)) name = `${base}_${suffix++}`;
    return name;
  };

  return (
    <div className="space-y-3 pt-4">
      {tools.map((value, index) => {
        const tool = object(value);
        if (tool.type !== "custom") return null;
        const name = text(tool.name) || `Tool ${index + 1}`;
        const error =
          schemaDrafts[index] === undefined
            ? null
            : schemaDraftError({ [index]: schemaDrafts[index] });
        return (
          <div
            key={index}
            className="overflow-hidden rounded-lg border"
            data-tool-type="custom"
          >
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="rounded-lg border p-1.5 shadow-sm">
                  <Wrench className="size-4" />
                </span>
                <div className="min-w-0 break-all text-sm font-medium">
                  {name}
                  <span className="block font-mono text-[13px] font-normal text-muted-foreground">
                    custom
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove tool ${name}`}
                onClick={() => removeTools((_, i) => i === index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <details className="group">
              <summary className="cursor-pointer border-t px-3 py-3 text-sm group-open:bg-secondary/60">
                Definition
              </summary>
              <div className="space-y-3 border-t p-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${prefix}-tool-${index}-name`}>Name</Label>
                  <Input
                    id={`${prefix}-tool-${index}-name`}
                    value={text(tool.name)}
                    onChange={(e) =>
                      changeTool(index, { name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${prefix}-tool-${index}-description`}>
                    Description
                  </Label>
                  <Input
                    id={`${prefix}-tool-${index}-description`}
                    value={text(tool.description)}
                    onChange={(e) =>
                      changeTool(index, { description: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${prefix}-tool-${index}-schema`}>
                    Input schema
                  </Label>
                  <textarea
                    id={`${prefix}-tool-${index}-schema`}
                    rows={7}
                    spellCheck={false}
                    value={
                      schemaDrafts[index] ??
                      JSON.stringify(tool.input_schema, null, 2) ??
                      ""
                    }
                    onChange={(e) =>
                      onChange(tools, servers, {
                        ...schemaDrafts,
                        [index]: e.target.value,
                      })
                    }
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                      error ? `${prefix}-schema-error-${index}` : undefined
                    }
                    className="w-full rounded-lg border bg-transparent p-2.5 font-mono text-[13px] outline-none focus-visible:border-ring aria-invalid:border-destructive-surface"
                  />
                  {error && (
                    <p
                      id={`${prefix}-schema-error-${index}`}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {error}
                    </p>
                  )}
                </div>
              </div>
            </details>
          </div>
        );
      })}
      {servers.map((value, serverIndex) => {
        const server = object(value);
        if (server.type !== "url")
          return (
            <p key={serverIndex} className="text-sm text-muted-foreground">
              Unrecognized server entry — edit in Raw.
            </p>
          );
        const name = text(server.name);
        const toolsets = tools
          .map((value, index) => ({ value: object(value), index }))
          .filter(
            ({ value, index }) =>
              value.type === "mcp_toolset" && bindings[index] === serverIndex,
          );
        return (
          <div
            key={serverIndex}
            className="space-y-3 rounded-lg border p-3"
            data-tool-type="mcp"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 break-all text-sm font-medium">
                {name || "MCP server"}{" "}
                <span className="font-normal text-muted-foreground">MCP</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove MCP server ${name}`}
                onClick={() =>
                  removeTools(
                    (_, index) => bindings[index] === serverIndex,
                    servers.filter((_, i) => i !== serverIndex),
                    serverIndex,
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-server-${serverIndex}-name`}>
                Server name
              </Label>
              <Input
                id={`${prefix}-server-${serverIndex}-name`}
                value={name}
                onChange={(e) => {
                  const updated = e.target.value;
                  onChange(
                    tools.map((value, index) =>
                      bindings[index] === serverIndex
                        ? { ...object(value), mcp_server_name: updated }
                        : value,
                    ),
                    servers.map((value, i) =>
                      i === serverIndex ? { ...server, name: updated } : value,
                    ),
                    schemaDrafts,
                  );
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-server-${serverIndex}-url`}>
                Server URL
              </Label>
              <Input
                id={`${prefix}-server-${serverIndex}-url`}
                value={text(server.url)}
                onChange={(e) =>
                  onChange(
                    tools,
                    servers.map((value, i) =>
                      i === serverIndex
                        ? { ...server, url: e.target.value }
                        : value,
                    ),
                    schemaDrafts,
                  )
                }
              />
            </div>
            {toolsets.map(({ value: toolset, index }) => {
              const configs = Array.isArray(toolset.configs)
                ? toolset.configs
                : [];
              return (
                <details key={index}>
                  <summary className="cursor-pointer text-[13px] text-muted-foreground">
                    Tool permissions
                  </summary>
                  <div className="space-y-3 pt-3">
                    <ConfigFields
                      label={`${name} default`}
                      value={toolset.default_config}
                      onChange={(value) =>
                        changeTool(index, { default_config: value })
                      }
                    />
                    {configs.map((value, configIndex) => (
                      <div
                        key={configIndex}
                        className="space-y-2 border-t pt-3"
                      >
                        <div className="flex gap-2">
                          <Input
                            aria-label={`${name} override ${configIndex + 1} name`}
                            value={text(object(value).name)}
                            placeholder="Tool name"
                            onChange={(e) =>
                              changeTool(index, {
                                configs: configs.map((value, i) =>
                                  i === configIndex
                                    ? { ...object(value), name: e.target.value }
                                    : value,
                                ),
                              })
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${name} override ${configIndex + 1}`}
                            onClick={() =>
                              changeTool(index, {
                                configs: configs.filter(
                                  (_, i) => i !== configIndex,
                                ),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <ConfigFields
                          label={`${name} override ${configIndex + 1}`}
                          value={value}
                          onChange={(value) =>
                            changeTool(index, {
                              configs: configs.map((existing, i) =>
                                i === configIndex ? value : existing,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        changeTool(index, {
                          configs: [...configs, { name: "" }],
                        })
                      }
                    >
                      Add tool override
                    </Button>
                  </div>
                </details>
              );
            })}
          </div>
        );
      })}
      {tools.some((value) => {
        const tool = object(value);
        return (
          tool.type !== "custom" &&
          (tool.type !== "mcp_toolset" ||
            !servers.some(
              (server) => object(server).name === tool.mcp_server_name,
            ))
        );
      }) && (
        <p className="text-sm text-muted-foreground">
          Other tool entries are preserved — edit them in Raw.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const name = uniqueName(
              "mcp_server",
              servers.map((value) => text(object(value).name)),
            );
            onChange(
              [...tools, { type: "mcp_toolset", mcp_server_name: name }],
              [...servers, { type: "url", name, url: "" }],
              schemaDrafts,
              [...bindings, servers.length],
            );
          }}
        >
          <Plus className="size-4" />
          Add MCP server
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange(
              [
                ...tools,
                {
                  type: "custom",
                  name: uniqueName(
                    "new_tool",
                    tools.map((value) => text(object(value).name)),
                  ),
                  description: "",
                  input_schema: { type: "object", properties: {} },
                },
              ],
              servers,
              schemaDrafts,
              [...bindings, null],
            )
          }
        >
          <Plus className="size-4" />
          Add custom tool
        </Button>
      </div>
    </div>
  );
}
