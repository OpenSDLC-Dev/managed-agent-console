"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSection, Field, FieldList } from "@/components/console/detail";
import {
  ArchivedBadge,
  EmptyState,
  ErrorState,
  IdCode,
  StatusBadge,
} from "@/components/console/bits";
import { EventRow } from "@/components/console/event-row";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSession, useSessionEvents } from "@/lib/platform/queries";
import type { SessionEvent } from "@/lib/platform/types";

const FILTERS: { key: string; label: string; types?: string[] }[] = [
  { key: "all", label: "All" },
  {
    key: "messages",
    label: "Messages",
    types: ["user.message", "agent.message", "agent.thinking"],
  },
  {
    key: "tools",
    label: "Tools",
    types: [
      "agent.tool_use",
      "agent.tool_result",
      "agent.custom_tool_use",
      "user.tool_result",
      "user.custom_tool_result",
      "user.tool_confirmation",
    ],
  },
  {
    key: "status",
    label: "Status",
    types: [
      "session.status_running",
      "session.status_idle",
      "session.error",
      "session.updated",
    ],
  },
  {
    key: "spans",
    label: "Model spans",
    types: ["span.model_request_start", "span.model_request_end"],
  },
];

/** The tool calls still blocking the latest requires_action stop, if any. */
function pendingToolUses(events: SessionEvent[]): SessionEvent[] {
  const lastIdle = [...events]
    .reverse()
    .find((e) => e.type === "session.status_idle");
  const ids = lastIdle?.stop_reason?.event_ids;
  if (!ids || lastIdle?.stop_reason?.type !== "requires_action") return [];
  return events.filter((e) => ids.includes(e.id));
}

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [filter, setFilter] = useState("all");
  const session = useSession(id, 15_000);
  const running = session.data?.status === "running";
  const events = useSessionEvents(id, {
    running: !!running,
    types: FILTERS.find((f) => f.key === filter)?.types,
  });

  const pending = useMemo(
    () => (filter === "all" ? pendingToolUses(events.data ?? []) : []),
    [filter, events.data],
  );

  if (session.error) return <ErrorState error={session.error} />;
  if (session.isPending || !session.data) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  const data = session.data;

  return (
    <div>
      <PageHeader
        title={data.title || data.id}
        subtitle={`${data.agent.name} · v${data.agent.version}`}
        actions={
          <span className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            <ArchivedBadge archivedAt={data.archived_at} />
          </span>
        }
      />
      <DetailSection title="Overview">
        <FieldList>
          <Field label="ID">
            <IdCode id={data.id} />
          </Field>
          <Field label="Agent">
            <Link href={`/agents/${data.agent.id}`} className="hover:underline">
              {data.agent.name} · v{data.agent.version}
            </Link>
          </Field>
          <Field label="Environment">
            <Link
              href={`/environments/${data.environment_id}`}
              className="hover:underline"
            >
              <IdCode id={data.environment_id} />
            </Link>
          </Field>
          <Field label="Tokens">
            {data.usage.input_tokens.toLocaleString()} in ·{" "}
            {data.usage.output_tokens.toLocaleString()} out ·{" "}
            {data.usage.cache_read_input_tokens.toLocaleString()} cache read
          </Field>
          {data.vault_ids.length > 0 && (
            <Field label="Vaults">{data.vault_ids.join(", ")}</Field>
          )}
          {data.resources.length > 0 && (
            <Field label="Resources">
              {data.resources.map((r) => r.mount_path).join(", ")}
            </Field>
          )}
        </FieldList>
      </DetailSection>

      {pending.length > 0 && (
        <div
          data-testid="approval-banner"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm font-medium text-amber-900">
            Waiting on {pending.length} tool approval
            {pending.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1">
            {pending.map((event) => (
              <li key={event.id} className="text-[13px] text-amber-900">
                <span className="font-mono">{event.name}</span>{" "}
                <span className="text-amber-700">
                  {JSON.stringify(event.input)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-amber-700">
            Approve / deny controls arrive with slice 3.
          </p>
        </div>
      )}

      <DetailSection title="Events">
        <div className="flex items-center gap-1.5 pb-3">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "h-7 rounded-full border px-3 text-[13px]",
                filter === key
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {label}
            </button>
          ))}
          {running && (
            <Badge
              variant="outline"
              className="ml-2 font-normal text-emerald-700"
            >
              polling every 3s
            </Badge>
          )}
        </div>
        {events.error ? (
          <ErrorState error={events.error} />
        ) : (events.data ?? []).length === 0 ? (
          <EmptyState title="No events" />
        ) : (
          <div>
            {events.data!.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </DetailSection>
    </div>
  );
}
