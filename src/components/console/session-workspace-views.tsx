"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Field, JsonBlock } from "./detail";
import { IdCode, StatusBadge, Time } from "./bits";
import { parseTools, TOOL_NAMES } from "@/lib/agent-config/toolset";
import { summaryOf } from "@/lib/session-trace/summary";
import type {
  Session,
  SessionEvent,
  SessionThread,
} from "@/lib/platform/types";

export function SessionOverview({ session }: { session: Session }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-y-2 text-sm">
        <Field label="Status">
          <StatusBadge status={session.status} />
        </Field>
        <Field label="Agent">
          <Link
            className="hover:underline"
            href={
              "/agents/" +
              encodeURIComponent(session.agent.id) +
              "?version=" +
              session.agent.version
            }
          >
            {session.agent.name} · v{session.agent.version}
          </Link>
        </Field>
        <Field label="Environment">
          <Link
            href={"/environments/" + encodeURIComponent(session.environment_id)}
          >
            <IdCode id={session.environment_id} />
          </Link>
        </Field>
        <Field label="Created">
          <Time iso={session.created_at} />
        </Field>
        <Field label="Updated">
          <Time iso={session.updated_at} />
        </Field>
        <Field label="Resources">
          <span data-resource-count={session.resources.length}>
            {session.resources.length}
          </span>
        </Field>
        <Field label="Vaults">
          {session.vault_ids.length
            ? session.vault_ids.map((id) => (
                <Link
                  className="block hover:underline"
                  key={id}
                  href={"/vaults/" + encodeURIComponent(id)}
                >
                  <IdCode id={id} />
                </Link>
              ))
            : "—"}
        </Field>
      </dl>
      {/* sessions.go and threads.go render zero-only stats. The raw response remains available below. */}
      <details>
        <summary className="cursor-pointer text-sm">
          Session API response
        </summary>
        <JsonBlock value={session} />
      </details>
    </div>
  );
}

export function SessionEventIndex({
  events,
  selectedId,
  onSelect,
}: {
  events: SessionEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const types = [...new Set(events.map((event) => event.type))];
  const visible = events.filter(
    (event) =>
      (!type || event.type === type) &&
      (event.type + " " + event.id + " " + summaryOf(event))
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-8 min-w-0 flex-1 basis-40"
          aria-label="Filter events"
          placeholder="Filter events"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Event type"
          className="h-8 min-w-0 max-w-full rounded-md border bg-background px-2 text-xs"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">All event types</option>
          {types.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      <ol className="max-h-64 overflow-y-auto divide-y">
        {visible.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              data-testid="inspector-event-row"
              data-event-id={event.id}
              aria-pressed={selectedId === event.id}
              onClick={() => onSelect(event.id)}
              className="w-full space-y-1 rounded-md px-2 py-2 text-left text-xs hover:bg-secondary aria-pressed:bg-secondary"
            >
              <div className="flex flex-wrap justify-between gap-1">
                <code className="break-all">{event.type}</code>
                <Time iso={event.processed_at} />
              </div>
              <p className="truncate text-muted-foreground">
                {summaryOf(event)}
              </p>
            </button>
          </li>
        ))}
      </ol>
      {!visible.length && (
        <p className="text-sm text-muted-foreground">No matching events.</p>
      )}
    </div>
  );
}

export function SessionToolIndex({
  agent,
  events,
  onSelect,
}: {
  agent: Session["agent"] | SessionThread["agent"];
  events: SessionEvent[];
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { toolset, others } = parseTools(agent.tools);
  const calls = events.filter((event) =>
    ["agent.tool_use", "agent.mcp_tool_use", "agent.custom_tool_use"].includes(
      event.type,
    ),
  );
  const names = [
    ...new Set([
      ...(toolset ? TOOL_NAMES : []),
      ...calls.flatMap((event) =>
        typeof event.name === "string" ? [event.name] : [],
      ),
    ]),
  ];
  return (
    <div className="space-y-3">
      <Input
        className="h-8"
        aria-label="Filter tools"
        placeholder="Filter tools"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_80px_48px] gap-2 border-b px-2 pb-2 text-xs text-muted-foreground">
        <span>Name</span>
        <span>Permission</span>
        <span>Calls</span>
      </div>
      <ul>
        {names
          .filter((name) => name.toLowerCase().includes(search.toLowerCase()))
          .map((name) => {
            const setting = toolset?.tools[name as (typeof TOOL_NAMES)[number]];
            const permission = setting
              ? !setting.enabled
                ? "Deny"
                : setting.policy === "always_ask"
                  ? "Ask"
                  : "Allow"
              : "—";
            const count = calls.filter((event) => event.name === name).length;
            return (
              <li key={name}>
                <button
                  onClick={() => setSelected(name)}
                  aria-pressed={selected === name}
                  className="grid w-full grid-cols-[minmax(0,1fr)_80px_48px] gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-secondary aria-pressed:bg-secondary"
                  data-tool-name={name}
                  data-permission={permission}
                  data-call-count={count}
                >
                  <code className="break-all">{name}</code>
                  <span>{permission}</span>
                  <span>{count}</span>
                </button>
              </li>
            );
          })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Calls in the loaded trace.
      </p>
      {selected && (
        <section className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-medium">{selected}</h3>
          {calls
            .filter((event) => event.name === selected)
            .map((event) => (
              <button
                key={event.id}
                onClick={() => onSelect(event.id)}
                className="block w-full rounded-md border p-2 text-left text-xs hover:bg-secondary"
              >
                <Time iso={event.processed_at} />
                <p className="truncate pt-1">{summaryOf(event)}</p>
              </button>
            ))}
        </section>
      )}
      {others.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            Additional tool configuration
          </summary>
          <JsonBlock value={others} />
        </details>
      )}
      {agent.mcp_servers.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">MCP servers</summary>
          <JsonBlock value={agent.mcp_servers} />
        </details>
      )}
    </div>
  );
}
