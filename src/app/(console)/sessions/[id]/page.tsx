"use client";

import { Fragment, Suspense, use, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, PanelRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useListFilters } from "@/lib/use-list-filters";
import { JsonBlock } from "@/components/console/detail";
import {
  SessionWorkspacePanel,
  SESSION_INSPECTORS,
  type SessionInspectorTab,
} from "@/components/console/session-workspace-panel";
import {
  SessionOverview,
  SessionEventIndex,
  SessionToolIndex,
} from "@/components/console/session-workspace-views";
import { eventSearchText } from "@/lib/session-trace/summary";
import { PageHeader } from "@/components/shell/page-header";
import { Breadcrumb } from "@/components/console/breadcrumb";
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
import {
  DebugRow,
  EventDetailPanel,
  IdleBand,
  TranscriptCard,
} from "@/components/console/event-row";
import {
  ApprovalBanner,
  useToolApprovals,
} from "@/components/console/approval-banner";
import { Composer } from "@/components/console/composer";
import { SessionActions } from "@/components/console/session-actions";
import { SessionResources } from "@/components/console/session-resources";
import { SessionThreads } from "@/components/console/session-threads";
import { SessionOutcomes } from "@/components/console/session-outcomes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, tokenAttr, tokenCount } from "@/lib/utils";
import { copyText } from "@/lib/copy-text";
import { useSession, useSessionThreads } from "@/lib/platform/queries";
import { PlatformError } from "@/lib/platform/http";
import { useSessionTrace } from "@/lib/session-trace/use-session-trace";
import {
  latestStatus,
  latestThreadStatus,
  pendingToolUses,
} from "@/lib/session-trace/store";
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
      "agent.mcp_tool_use",
      "agent.mcp_tool_result",
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
      "session.status_rescheduled",
      "session.status_terminated",
      "session.thread_status_running",
      "session.thread_status_idle",
      "session.thread_status_rescheduled",
      "session.thread_status_terminated",
      "session.error",
      "session.updated",
    ],
  },
  {
    key: "spans",
    label: "Model spans",
    types: ["span.model_request_start", "span.model_request_end"],
  },
  {
    key: "outcomes",
    label: "Outcomes",
    types: [
      "user.define_outcome",
      "span.outcome_evaluation_start",
      "span.outcome_evaluation_ongoing",
      "span.outcome_evaluation_end",
    ],
  },
];

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
      className="flex flex-wrap items-center gap-1.5 pb-3"
      data-testid="session-chips"
    >
      <Badge variant="outline" className={chip}>
        <IdCode id={session.id} />
      </Badge>
      <Badge variant="outline" className={chip}>
        <Link
          href={`/agents/${session.agent.id}?version=${session.agent.version}`}
          className="hover:underline"
        >
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
          data-resource-count={session.resources.length}
        >
          {session.resources.length} resource
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
      <Badge
        variant="outline"
        className={cn(chip, "text-muted-foreground")}
        data-testid="usage-chip"
        data-input-tokens={tokenAttr(session.usage?.input_tokens)}
        data-output-tokens={tokenAttr(session.usage?.output_tokens)}
        data-cache-read-tokens={tokenAttr(
          session.usage?.cache_read_input_tokens,
        )}
      >
        {tokenCount(session.usage?.input_tokens)} in ·{" "}
        {tokenCount(session.usage?.output_tokens)} out ·{" "}
        {tokenCount(session.usage?.cache_read_input_tokens)} cache read
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
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <SessionWorkspace key={id} id={id} />
    </Suspense>
  );
}

function SessionWorkspace({ id }: { id: string }) {
  const approvals = useToolApprovals(id);
  const threads = useSessionThreads(id, 15_000);
  const threadsAvailable = !(
    threads.error instanceof PlatformError &&
    [404, 501].includes(threads.error.status)
  );
  const filters = useListFilters();
  const requestedInspector = filters.params.get("inspector");
  const inspectorValue =
    requestedInspector === "thread" && !threadsAvailable
      ? null
      : requestedInspector;
  const inspector: SessionInspectorTab | "closed" =
    inspectorValue === "closed"
      ? "closed"
      : (SESSION_INSPECTORS.find(([key]) => key === inspectorValue)?.[0] ??
        "session");
  const selectedId = filters.params.get("event");
  const setSelectedId = (
    value: string | null | ((current: string | null) => string | null),
  ) => {
    const event = typeof value === "function" ? value(selectedId) : value;
    filters.update({ event, ...(event ? { inspector: "events" } : {}) });
  };
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState<"transcript" | "debug">("transcript");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const session = useSession(id, 15_000);
  const { trace, connection } = useSessionTrace(
    id,
    selectedThreadId ?? undefined,
  );

  const selectedThread = threads.data?.data.find(
    (thread) => thread.id === selectedThreadId,
  );

  const status = selectedThread
    ? selectedThread.archived_at || selectedThread.status === "terminated"
      ? selectedThread.status
      : (latestThreadStatus(trace) ?? selectedThread.status)
    : (latestStatus(trace) ?? session.data?.status);
  const running = status === "running";

  const pending = useMemo(
    () => pendingToolUses(trace.events, selectedThreadId === null),
    [selectedThreadId, trace.events],
  );
  const durations = useMemo(
    () => modelSpanDurations(trace.events),
    [trace.events],
  );
  const gaps = useMemo(() => idleGaps(trace.events), [trace.events]);
  const visible = useMemo(() => {
    const types = FILTERS.find((f) => f.key === filter)?.types;
    // A paired span start folds into its end row's duration; an unpaired one
    // (request still running, or its end never persisted) stays visible —
    // it is the only record that model work began (review finding, PR #28).
    const pairedStarts = new Set(
      trace.events
        .filter((e) => e.type === "span.model_request_end")
        .map((e) => e.model_request_start_id),
    );
    const events = trace.events.filter(
      (e) => e.type !== "span.model_request_start" || !pairedStarts.has(e.id),
    );
    return events.filter(
      (e) =>
        (!types || types.includes(e.type)) &&
        (!search ||
          eventSearchText(e).toLowerCase().includes(search.toLowerCase())),
    );
  }, [filter, search, trace.events]);
  const selected = selectedId
    ? trace.events.find((e) => e.id === selectedId)
    : undefined;
  // Streaming previews are agent messages — visible under All and Messages.
  const visiblePreviews =
    filter === "all" || filter === "messages"
      ? [...trace.previews.values()].filter((preview) =>
          preview.parts.join("").toLowerCase().includes(search.toLowerCase()),
        )
      : [];

  if (session.error) return <ErrorState error={session.error} />;
  if (session.isPending || !session.data) {
    return <DetailSkeleton />;
  }
  const data = session.data;
  // Older wire-compatible deployments can serve sessions without Outcomes.
  // Presence of the projection is the side-effect-free capability signal: the
  // shared events endpoint has no narrower route that can be probed safely.
  const outcomesSupported = Array.isArray(data.outcome_evaluations);
  const outcomeEvaluations = outcomesSupported ? data.outcome_evaluations : [];

  return (
    <div className="flex h-[calc(100dvh-48px)] min-h-[480px] min-w-0 flex-col">
      <Breadcrumb
        parent={{ href: "/sessions", label: "Sessions" }}
        current={data.title || data.id}
      />
      <PageHeader
        title={data.title || data.id}
        className="flex-wrap pb-2"
        actions={
          <span className="flex items-center gap-2">
            {status && (
              <span data-testid="session-effective-status" data-status={status}>
                <StatusBadge status={status} />
              </span>
            )}
            <ArchivedBadge archivedAt={data.archived_at} />
            <SessionActions session={data} />
          </span>
        }
      />
      <SessionChips session={data} />
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b pb-3">
        <Input
          aria-label="Find in transcript"
          placeholder="Find in transcript"
          className="h-8 w-56 max-w-full"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-label="Open session inspector"
          aria-expanded={inspector !== "closed"}
          onClick={() =>
            filters.update({
              inspector: inspector === "closed" ? null : "closed",
            })
          }
        >
          <PanelRight /> Inspector
        </Button>
      </div>
      <div className="relative flex min-h-0 flex-1 gap-3 pt-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!data.archived_at && !trace.deleted && (
              <ApprovalBanner
                pending={pending.filter(
                  (tool) =>
                    tab === "debug" ||
                    !visible.some((event) => event.id === tool.id),
                )}
                approvals={approvals}
                threadId={selectedThreadId ?? undefined}
              />
            )}

            <DetailSection title="Events">
              {/* Derived trace state, machine-readable (see CLAUDE.md): which tab
            and filter are active, and how much of the log they leave visible.
            e2e reads these instead of the rendered strings.

            Both values are read off the *active* tab, not off state alone.
            Debug renders `trace.events` whole and hides the filter chips, so
            the retained `filter` applies to nothing there — reporting it (or
            the transcript's count) would have the attribute contradict the
            rendered surface, the one failure this convention exists to
            prevent. `data-filter` is therefore absent in Debug, on the same
            rule as `tokenAttr`: say nothing rather than something untrue. */}
              <div
                className="flex flex-wrap items-center gap-1.5 pb-3"
                data-testid="events-toolbar"
                data-tab={tab}
                data-filter={tab === "transcript" ? filter : undefined}
                data-visible-events={
                  tab === "debug"
                    ? trace.events.length
                    : visible.length + visiblePreviews.length
                }
                data-total-events={trace.events.length}
              >
                <div className="flex items-center rounded-lg border p-0.5">
                  {(
                    [
                      ["transcript", "Transcript"],
                      ["debug", "Debug"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={tab === key}
                      onClick={() => setTab(key)}
                      className={cn(
                        "h-6 rounded-md px-2.5 text-[13px]",
                        tab === key
                          ? "bg-secondary font-medium"
                          : "text-muted-foreground hover:bg-secondary/50",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {tab === "transcript" &&
                  FILTERS.map(({ key, label }) => (
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
                    connection === "live" &&
                      "text-emerald-700 dark:text-emerald-400",
                    connection === "reconnecting" &&
                      "text-amber-700 dark:text-amber-300",
                  )}
                >
                  {CONNECTION_LABEL[connection]}
                </Badge>
                <CopyAllButton events={trace.events} />
              </div>
              {tab === "debug" ? (
                trace.events.length === 0 ? (
                  connection === "connecting" ? (
                    <ListSkeleton rows={4} />
                  ) : (
                    <EmptyState title="No events" />
                  )
                ) : (
                  <div>
                    {trace.events.map((e) => (
                      <DebugRow key={e.id} event={e} />
                    ))}
                  </div>
                )
              ) : visible.length === 0 && visiblePreviews.length === 0 ? (
                connection === "connecting" ? (
                  <ListSkeleton rows={4} />
                ) : (
                  <EmptyState title="No events" />
                )
              ) : (
                <div className="mx-auto w-full min-w-0 max-w-[720px]">
                  <div>
                    {visible.map((e) => (
                      <Fragment key={e.id}>
                        <TranscriptCard
                          event={e}
                          offset={offsetLabel(data.created_at, e.processed_at)}
                          durationMs={durations.get(e.id)}
                          selected={e.id === selectedId}
                          actor={selectedThread?.agent.name ?? data.agent.name}
                          approval={
                            !data.archived_at &&
                            !trace.deleted &&
                            pending.some((tool) => tool.id === e.id) ? (
                              <ApprovalBanner
                                inline
                                pending={[e]}
                                approvals={approvals}
                                threadId={selectedThreadId ?? undefined}
                              />
                            ) : undefined
                          }
                          onSelect={() =>
                            setSelectedId((current) =>
                              current === e.id ? null : e.id,
                            )
                          }
                        />
                        {gaps.has(e.id) && <IdleBand ms={gaps.get(e.id)!} />}
                      </Fragment>
                    ))}
                    {visiblePreviews.map((preview) => (
                      <div
                        key={preview.id}
                        data-testid="preview-row"
                        className="flex flex-wrap gap-3 border-b py-2.5 last:border-b-0"
                      >
                        <div className="text-[12px] text-muted-foreground">
                          …
                        </div>
                        <div className="min-w-0">
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
                </div>
              )}
            </DetailSection>
          </div>

          <div className="mx-auto w-full max-w-[720px]">
            <Composer
              sessionId={id}
              running={running}
              disabled={!!data.archived_at || trace.deleted}
              threadId={
                selectedThread?.parent_thread_id ? selectedThread.id : undefined
              }
              threadName={selectedThread?.agent.name}
            />
          </div>
        </div>
        {inspector !== "closed" && (
          <SessionWorkspacePanel
            tab={inspector}
            threadsAvailable={threadsAvailable}
            onTab={(value) =>
              filters.update({ inspector: value === "session" ? null : value })
            }
            onClose={() => filters.update({ inspector: "closed" })}
          >
            {inspector === "session" && (
              <div className="space-y-5">
                <SessionOverview session={data} />{" "}
                {!selectedThreadId && outcomesSupported && (
                  <SessionOutcomes
                    sessionId={id}
                    outcomes={outcomeEvaluations}
                    disabled={!!data.archived_at || trace.deleted}
                  />
                )}
              </div>
            )}
            {inspector === "resources" && <SessionResources session={data} />}
            {inspector === "thread" && (
              <>
                <SessionThreads
                  compact
                  sessionId={id}
                  threads={threads.data?.data ?? []}
                  error={threads.error}
                  loading={threads.isPending}
                  selectedId={selectedThreadId}
                  onSelect={(threadId) => {
                    setSelectedThreadId(threadId);
                    setSelectedId(null);
                  }}
                />
                {selectedThread && <JsonBlock value={selectedThread} />}
              </>
            )}
            {inspector === "tools" && (
              <SessionToolIndex
                agent={selectedThread?.agent ?? data.agent}
                events={trace.events}
                onSelect={setSelectedId}
              />
            )}
            {inspector === "events" && (
              <div className="space-y-4">
                <SessionEventIndex
                  events={trace.events}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
                {selected && (
                  <EventDetailPanel
                    event={selected}
                    approvalPending={pending.some(
                      (tool) => tool.id === selected.id,
                    )}
                    offset={offsetLabel(data.created_at, selected.processed_at)}
                    durationMs={durations.get(selected.id)}
                    onClose={() => setSelectedId(null)}
                  />
                )}
                {selectedId && !selected && (
                  <p className="text-sm text-muted-foreground">
                    No loaded event matches this ID.
                  </p>
                )}
              </div>
            )}
          </SessionWorkspacePanel>
        )}
      </div>
    </div>
  );
}
