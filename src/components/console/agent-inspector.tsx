"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Check,
  CircleX,
  Hand,
  Ellipsis,
  Wrench,
} from "lucide-react";
import { ResourceInspector } from "./resource-inspector";
import { ResourceActions } from "./resource-actions";
import { DetailSkeleton, ErrorState, ResourceStatus, Time } from "./bits";
import { Field, JsonBlock } from "./detail";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAgent, useArchiveAgent } from "@/lib/platform/queries";
import {
  parseTools,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from "@/lib/agent-config/toolset";
import type { Agent } from "@/lib/platform/types";

export function AgentActions({ agent }: { agent: Agent }) {
  const archive = useArchiveAgent(agent.id);
  return (
    <ResourceActions
      resource="agent"
      archived={!!agent.archived_at}
      onArchive={agent.archived_at ? undefined : () => archive.mutate()}
      archivePending={archive.isPending}
    />
  );
}

export function AgentInspector(
  props: Omit<ComponentProps<typeof ResourceInspector>, "kind" | "children">,
) {
  return (
    <ResourceInspector {...props} kind="agent">
      <AgentSummary key={props.id} id={props.id} />
    </ResourceInspector>
  );
}

function AgentSummary({ id }: { id: string }) {
  const query = useAgent(id);
  const [api, setApi] = useState(false);
  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending || !query.data) return <DetailSkeleton />;
  const agent = query.data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <Bot className="size-4 shrink-0" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="truncate font-medium" title={agent.name}>
            {agent.name}
          </h2>
          <Badge variant="secondary" data-version={agent.version}>
            V{agent.version}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          render={<Link href={"/agents/" + encodeURIComponent(id)} />}
        >
          Open <ArrowRight className="size-3.5" />
        </Button>
        <AgentActions agent={agent} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {api ? (
          <JsonBlock value={agent} />
        ) : (
          <div className="space-y-6">
            <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-y-2 text-sm">
              <Field label="Created">
                <Time iso={agent.created_at} />
              </Field>
              <Field label="Updated">
                <Time iso={agent.updated_at} />
              </Field>
              <Field label="State">
                <ResourceStatus archivedAt={agent.archived_at} />
              </Field>
              <Field label="Model">
                <span className="break-all text-xs">
                  {agent.model.id}
                  {agent.model.speed ? " · " + agent.model.speed : ""}
                </span>
              </Field>
            </dl>
            <section>
              <h3 className="mb-2 text-sm font-medium">Description</h3>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">
                {agent.description || "—"}
              </p>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium">System prompt</h3>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">
                {agent.system || "—"}
              </p>
            </section>
            <AgentTools tools={agent.tools} servers={agent.mcp_servers} />
            <section>
              <h3 className="mb-2 text-sm font-medium">Skills</h3>
              {agent.skills.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No skills configured.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border px-3">
                  {agent.skills.map((skill) => (
                    <li
                      key={skill.type + ":" + skill.skill_id}
                      className="flex flex-wrap items-center gap-2 py-2 text-sm"
                    >
                      {skill.type === "custom" ? (
                        <Link
                          href={"/skills/" + encodeURIComponent(skill.skill_id)}
                          className="break-all hover:underline"
                        >
                          {skill.skill_id}
                        </Link>
                      ) : (
                        <span>{skill.skill_id}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {skill.version}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium">Multiagent</h3>
              {!agent.multiagent ? (
                <p className="text-sm text-muted-foreground">
                  No subagents configured.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border px-3">
                  {agent.multiagent.agents.map((member) => (
                    <li
                      key={member.id + ":" + member.version}
                      className="flex flex-wrap gap-2 py-2 text-sm"
                      data-agent-id={member.id}
                      data-agent-version={member.version}
                    >
                      {member.id === id ? (
                        <span>This coordinator (self)</span>
                      ) : (
                        <Link
                          className="break-all hover:underline"
                          href={"/agents/" + encodeURIComponent(member.id)}
                        >
                          {member.id}
                        </Link>
                      )}
                      <span className="text-muted-foreground">
                        v{member.version}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {Object.keys(agent.metadata).length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Metadata
                </summary>
                <JsonBlock value={agent.metadata} />
              </details>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-1 pt-2">
        <Button
          size="sm"
          variant={api ? "ghost" : "secondary"}
          aria-pressed={!api}
          onClick={() => setApi(false)}
        >
          Rendered
        </Button>
        <Button
          size="sm"
          variant={api ? "secondary" : "ghost"}
          aria-pressed={api}
          onClick={() => setApi(true)}
        >
          API
        </Button>
      </div>
    </div>
  );
}

/** The editor's existing mapping mirrors toolset/definitions.go; read responses materialize defaults, not all eight configs. */
function AgentTools({
  tools,
  servers,
}: {
  tools: Agent["tools"];
  servers: Agent["mcp_servers"];
}) {
  const [open, setOpen] = useState(false);
  const { toolset, others } = parseTools(tools);
  const labels = new Set(
    toolset
      ? TOOL_NAMES.map((name) => permissionLabel(toolset.tools[name]))
      : [],
  );
  const summary = labels.size === 1 ? [...labels][0] : "Custom";
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Tools</h3>
      {toolset && (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center gap-3 p-3">
            <Wrench className="size-4" />
            <div className="text-sm">
              Built-in tools
              <div className="font-mono text-xs text-muted-foreground">
                agent_toolset_20260401
              </div>
            </div>
          </div>
          <button
            className="flex w-full items-center gap-2 border-t bg-muted/50 px-3 py-2 text-left text-sm"
            aria-expanded={open}
            data-tool-count={TOOL_NAMES.length}
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}{" "}
            Tool permissions{" "}
            <Badge variant="secondary">{TOOL_NAMES.length}</Badge>
            <span className="ml-auto" data-permission-summary={summary}>
              <PermissionLabel label={summary} />
            </span>
          </button>
          {open && (
            <ul className="divide-y">
              {TOOL_NAMES.map((name) => {
                const setting = toolset.tools[name];
                return (
                  <li
                    key={name}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3 text-xs"
                    data-tool-name={name}
                    data-tool-enabled={setting.enabled}
                    data-permission-policy={setting.policy}
                  >
                    <code className="w-20 shrink-0">{name}</code>
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      {TOOL_DESCRIPTIONS[name]}
                    </span>
                    <PermissionLabel label={permissionLabel(setting)} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {others.map((tool, index) => (
        <details key={index} className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">
            Tool configuration {index + 1}
          </summary>
          <JsonBlock value={tool} />
        </details>
      ))}
      {servers.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">MCP servers</summary>
          <JsonBlock value={servers} />
        </details>
      )}
      {!toolset && others.length === 0 && servers.length === 0 && (
        <p className="text-sm text-muted-foreground">No tools configured.</p>
      )}
    </section>
  );
}

function permissionLabel(setting: { enabled: boolean; policy: string }) {
  return !setting.enabled
    ? "Always deny"
    : setting.policy === "always_ask"
      ? "Always ask"
      : "Always allow";
}

function PermissionLabel({ label }: { label: string }) {
  const Icon =
    label === "Always deny"
      ? CircleX
      : label === "Always ask"
        ? Hand
        : label === "Always allow"
          ? Check
          : Ellipsis;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="size-3" />
      {label}
    </span>
  );
}
