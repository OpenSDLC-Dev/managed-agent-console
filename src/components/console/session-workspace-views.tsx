"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { EventTypeName } from "./event-type-name";
import { surfacePaths } from "@/lib/routes";
import { useState } from "react";
import {
  isToolCall,
  toolOutcome,
  type SessionTurn,
  type TranscriptEntry,
} from "@/lib/session-trace/turns";
import { durationLabel } from "@/lib/session-trace/timing";
import Link from "@/components/shell/workspace-navigation";
import { Input } from "@/components/ui/input";
import { Field, JsonBlock } from "./detail";
import { IdCode, StatusBadge, Time } from "./bits";
import { parseTools, TOOL_NAMES } from "@/lib/agent-config/toolset";
import { tokenAttr, tokenCount } from "@/lib/utils";
import { eventSearchText, summaryOf } from "@/lib/session-trace/summary";
import type {
  Session,
  SessionEvent,
  SessionUsage,
  SessionThread,
} from "@/lib/platform/types";

export function SessionOverview({
  session,
  status = session.status,
}: {
  session: Session;
  status?: string;
}) {
  return (
    <div
      className="space-y-4"
      data-testid="session-overview"
      data-status={status}
    >
      <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-y-2 text-sm">
        <Field label="Status">
          <StatusBadge status={status} />
        </Field>
        <Field label="Agent">
          <Link
            className="hover:underline"
            href={
              `${surfacePaths.agents}/${encodeURIComponent(session.agent.id)}` +
              "?version=" +
              session.agent.version
            }
          >
            {session.agent.name} · v{session.agent.version}
          </Link>
        </Field>
        <Field label="Environment">
          <Link
            href={`${surfacePaths.environments}/${encodeURIComponent(session.environment_id)}`}
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
                  href={`${surfacePaths.vaults}/${encodeURIComponent(id)}`}
                >
                  <IdCode id={id} />
                </Link>
              ))
            : "—"}
        </Field>
      </dl>
      <SessionUsageDetails usage={session.usage} />
      {/* sessions.go renders zero-only stats, and a thread's are zeros or null before its first transition. The raw response remains available below. */}
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
      eventSearchText(event).toLowerCase().includes(search.toLowerCase()),
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
        <NativeSelect
          aria-label="Event type"
          className="h-8 min-w-0 max-w-full rounded-md border bg-background px-2 text-xs"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">All event types</option>
          {types.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </NativeSelect>
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
                <code className="break-all">
                  <EventTypeName type={event.type} />
                </code>
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

function elapsed(start: string | null, end: string | null | undefined) {
  if (!start || !end) return undefined;
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

function callTimes(entry: TranscriptEntry) {
  const result = entry.replies.find((reply) =>
    reply.type.endsWith("tool_result"),
  );
  const confirmation = entry.replies.find(
    (reply) => reply.type === "user.tool_confirmation",
  );
  return {
    total: elapsed(entry.event.processed_at, result?.processed_at),
    wait: elapsed(entry.event.processed_at, confirmation?.processed_at),
  };
}

export function SessionToolIndex({
  agent,
  turns,
  onSelect,
}: {
  agent: Session["agent"] | SessionThread["agent"];
  turns: SessionTurn[];
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { toolset, others } = parseTools(agent.tools);
  const calls = new Map<string, TranscriptEntry[]>();
  for (const turn of turns) {
    for (const entry of turn.entries) {
      if (!isToolCall(entry.event) || !entry.event.name) continue;
      const group = calls.get(entry.event.name) ?? [];
      group.push(entry);
      calls.set(entry.event.name, group);
    }
  }
  const names = [...new Set([...(toolset ? TOOL_NAMES : []), ...calls.keys()])];
  return (
    <div className="space-y-3">
      <Input
        className="h-8"
        aria-label="Filter tools"
        placeholder="Filter tools"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_2rem_2.5rem_4rem] gap-2 border-b px-2 pb-2 text-xs text-muted-foreground">
        <span>Name</span>
        <span>Permission</span>
        <span>Calls</span>
        <span>Failed</span>
        <span title="Median call-to-result time, including approval and queue time">
          p50 elapsed
        </span>
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
            const entries = calls.get(name) ?? [];
            const count = entries.length;
            const failed = entries.filter(
              (entry) => toolOutcome(entry) === "Failed",
            ).length;
            const times = entries
              .flatMap((entry) => callTimes(entry).total ?? [])
              .sort((a, b) => a - b);
            const middle = Math.floor(times.length / 2);
            const median = times.length
              ? (times[middle] + times[Math.floor((times.length - 1) / 2)]) / 2
              : undefined;
            return (
              <li key={name}>
                <button
                  onClick={() => setSelected(name)}
                  aria-pressed={selected === name}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto_2rem_2.5rem_4rem] gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-secondary aria-pressed:bg-secondary"
                  data-tool-name={name}
                  data-permission={permission}
                  data-call-count={count}
                  data-failed-count={failed}
                  data-median-elapsed-ms={median}
                >
                  <code className="break-all">{name}</code>
                  <span>{permission}</span>
                  <span>{count}</span>
                  <span>{failed}</span>
                  <span>
                    {median === undefined ? "—" : durationLabel(median)}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Elapsed time runs from call to result and includes approval and queue
        time.
      </p>
      {selected && (
        <section className="space-y-2 border-t pt-3">
          <h3 className="text-sm font-medium">{selected}</h3>
          {(calls.get(selected) ?? []).map((entry) => {
            const event = entry.event;
            const { total, wait } = callTimes(entry);
            const state = toolOutcome(entry) ?? "Awaiting result";
            return (
              <button
                key={event.id}
                onClick={() => onSelect(event.id)}
                data-call-id={event.id}
                data-outcome={state}
                data-elapsed-ms={total}
                data-approval-wait-ms={wait}
                className="block w-full rounded-md border p-2 text-left text-xs hover:bg-secondary"
              >
                <span className="flex flex-wrap justify-between gap-2">
                  <Time iso={event.processed_at} />
                  <span>{state}</span>
                </span>
                <p className="truncate pt-1">{summaryOf(event)}</p>
                {total !== undefined && (
                  <span>Elapsed {durationLabel(total)} </span>
                )}
                {wait !== undefined && (
                  <span>· To processed confirmation {durationLabel(wait)}</span>
                )}
              </button>
            );
          })}
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

export function SessionUsageDetails({
  usage,
}: {
  usage: SessionUsage | undefined;
}) {
  return (
    <section className="space-y-2 border-t pt-3">
      <h2 className="text-sm font-medium">Usage</h2>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2 text-sm">
        <Field label="Input tokens">
          <span data-input-tokens={tokenAttr(usage?.input_tokens)}>
            {tokenCount(usage?.input_tokens)}
          </span>
        </Field>
        <Field label="Output tokens">
          <span data-output-tokens={tokenAttr(usage?.output_tokens)}>
            {tokenCount(usage?.output_tokens)}
          </span>
        </Field>
        <Field label="Cache read">
          <span
            data-cache-read-tokens={tokenAttr(usage?.cache_read_input_tokens)}
          >
            {tokenCount(usage?.cache_read_input_tokens)}
          </span>
        </Field>
        <Field label="Cache write (1h)">
          <span
            data-cache-write-1h-tokens={tokenAttr(
              usage?.cache_creation?.ephemeral_1h_input_tokens,
            )}
          >
            {tokenCount(usage?.cache_creation?.ephemeral_1h_input_tokens)}
          </span>
        </Field>
        <Field label="Cache write (5m)">
          <span
            data-cache-write-5m-tokens={tokenAttr(
              usage?.cache_creation?.ephemeral_5m_input_tokens,
            )}
          >
            {tokenCount(usage?.cache_creation?.ephemeral_5m_input_tokens)}
          </span>
        </Field>
      </dl>
    </section>
  );
}
