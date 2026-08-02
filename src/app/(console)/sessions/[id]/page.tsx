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
  DetailSkeleton,
  ListSkeleton,
} from "@/components/console/bits";
import { EventRow } from "@/components/console/event-row";
import { ApprovalBanner } from "@/components/console/approval-banner";
import { Composer } from "@/components/console/composer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/platform/queries";
import { useSessionTrace } from "@/lib/session-trace/use-session-trace";
import { latestStatus } from "@/lib/session-trace/store";
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
  const answered = new Set(
    events
      .filter((e) => e.type === "user.tool_confirmation")
      .map((e) => e.tool_use_id),
  );
  return events.filter((e) => ids.includes(e.id) && !answered.has(e.id));
}

const CONNECTION_LABEL = {
  connecting: "connecting…",
  live: "live",
  reconnecting: "reconnecting…",
  closed: "stream closed",
} as const;

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [filter, setFilter] = useState("all");
  const session = useSession(id, 15_000);
  const { trace, connection } = useSessionTrace(id);

  const status = latestStatus(trace) ?? session.data?.status;
  const running = status === "running";

  const pending = useMemo(() => pendingToolUses(trace.events), [trace.events]);
  const visible = useMemo(() => {
    const types = FILTERS.find((f) => f.key === filter)?.types;
    return types
      ? trace.events.filter((e) => types.includes(e.type))
      : trace.events;
  }, [filter, trace.events]);
  // Streaming previews are agent messages — visible under All and Messages.
  const visiblePreviews =
    filter === "all" || filter === "messages"
      ? [...trace.previews.values()]
      : [];

  if (session.error) return <ErrorState error={session.error} />;
  if (session.isPending || !session.data) {
    return <DetailSkeleton />;
  }
  const data = session.data;

  return (
    <div>
      <PageHeader
        title={data.title || data.id}
        subtitle={`${data.agent.name} · v${data.agent.version}`}
        actions={
          <span className="flex items-center gap-2">
            {status && <StatusBadge status={status} />}
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

      <ApprovalBanner pending={pending} sessionId={id} />

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
          <Badge
            data-testid="stream-state"
            data-state={connection}
            variant="outline"
            className={cn(
              "ml-2 font-normal",
              connection === "live" && "text-emerald-700 dark:text-emerald-400",
              connection === "reconnecting" &&
                "text-amber-700 dark:text-amber-300",
            )}
          >
            {CONNECTION_LABEL[connection]}
          </Badge>
        </div>
        {visible.length === 0 && visiblePreviews.length === 0 ? (
          connection === "connecting" ? (
            <ListSkeleton rows={4} />
          ) : (
            <EmptyState title="No events" />
          )
        ) : (
          <div>
            {visible.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
            {visiblePreviews.map((preview) => (
              <div
                key={preview.id}
                data-testid="preview-row"
                className="flex gap-3 border-b py-2.5 last:border-b-0"
              >
                <div className="w-36 shrink-0 text-[12px] text-muted-foreground">
                  …
                </div>
                <div className="w-52 shrink-0">
                  <Badge
                    variant="outline"
                    className="animate-pulse font-mono text-[11px] font-normal"
                  >
                    {preview.type}
                  </Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap">
                    {preview.parts.join("")}
                    <span className="animate-pulse">▍</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <Composer
        sessionId={id}
        running={running}
        disabled={!!data.archived_at || trace.deleted}
      />
    </div>
  );
}
