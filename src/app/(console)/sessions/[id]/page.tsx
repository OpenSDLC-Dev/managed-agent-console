"use client";

import { Fragment, use, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DetailSection } from "@/components/console/detail";
import {
  ArchivedBadge,
  EmptyState,
  ErrorState,
  IdCode,
  StatusBadge,
  DetailSkeleton,
  ListSkeleton,
} from "@/components/console/bits";
import { EventRow, IdleBand } from "@/components/console/event-row";
import { ApprovalBanner } from "@/components/console/approval-banner";
import { Composer } from "@/components/console/composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/copy-text";
import { useSession } from "@/lib/platform/queries";
import { useSessionTrace } from "@/lib/session-trace/use-session-trace";
import { latestStatus } from "@/lib/session-trace/store";
import {
  ageLabel,
  idleGaps,
  modelSpanDurations,
  offsetLabel,
} from "@/lib/session-trace/timing";
import { useNow } from "@/lib/session-trace/use-now";
import type { Session, SessionEvent } from "@/lib/platform/types";

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

/**
 * The session's metadata as one chip row (plan 03 slice 1) — the reference
 * console's density, from fields the wire already serves. The reference's
 * duration chip is deliberately absent: the platform serves `stats` empty by
 * recorded divergence.
 */
function SessionChips({ session }: { session: Session }) {
  const chip = "flex items-center gap-1 font-normal";
  // Clock-driven re-render: without it the age label freezes while the
  // page sits open with no data changes (review finding, PR #26).
  const age = ageLabel(session.created_at, useNow());
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 pb-6"
      data-testid="session-chips"
    >
      <Badge variant="outline" className={chip}>
        <IdCode id={session.id} />
      </Badge>
      <Badge variant="outline" className={chip}>
        <Link href={`/agents/${session.agent.id}`} className="hover:underline">
          {session.agent.name} · v{session.agent.version}
        </Link>
      </Badge>
      <Badge variant="outline" className={chip}>
        <Link
          href={`/environments/${session.environment_id}`}
          className="hover:underline"
        >
          <IdCode id={session.environment_id} />
        </Link>
      </Badge>
      {session.resources.length > 0 && (
        <Badge
          variant="outline"
          className={chip}
          title={session.resources.map((r) => r.mount_path).join(", ")}
        >
          {session.resources.length} file
          {session.resources.length === 1 ? "" : "s"}
        </Badge>
      )}
      {session.vault_ids.map((vaultId) => (
        <Badge key={vaultId} variant="outline" className={chip}>
          <Link href={`/vaults/${vaultId}`} className="hover:underline">
            <IdCode id={vaultId} />
          </Link>
        </Badge>
      ))}
      <Badge variant="outline" className={cn(chip, "text-muted-foreground")}>
        {session.usage.input_tokens.toLocaleString()} in ·{" "}
        {session.usage.output_tokens.toLocaleString()} out ·{" "}
        {session.usage.cache_read_input_tokens.toLocaleString()} cache read
      </Badge>
      {age && (
        <Badge
          variant="outline"
          className={cn(chip, "text-muted-foreground")}
          title={session.created_at}
        >
          {age}
        </Badge>
      )}
    </div>
  );
}

/** Copies the persisted trace as JSON — pasting a trace into an issue. */
function CopyAllButton({ events }: { events: SessionEvent[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="ml-auto h-7 text-muted-foreground"
      disabled={events.length === 0}
      onClick={() => {
        void copyText(JSON.stringify(events, null, 2)).then((ok) => {
          if (!ok) return;
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy all"}
    </Button>
  );
}

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
  const durations = useMemo(
    () => modelSpanDurations(trace.events),
    [trace.events],
  );
  const gaps = useMemo(() => idleGaps(trace.events), [trace.events]);
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
      <SessionChips session={data} />

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
          <CopyAllButton events={trace.events} />
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
              <Fragment key={e.id}>
                <EventRow
                  event={e}
                  offset={offsetLabel(data.created_at, e.processed_at)}
                  durationMs={durations.get(e.id)}
                />
                {gaps.has(e.id) && <IdleBand ms={gaps.get(e.id)!} />}
              </Fragment>
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
