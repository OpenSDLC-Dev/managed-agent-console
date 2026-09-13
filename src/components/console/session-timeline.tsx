"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Download, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionEvent, SessionThread } from "@/lib/platform/types";
import { modelSpanDurations } from "@/lib/session-trace/timing";
import { cn } from "@/lib/utils";

export function SessionTimeline({
  events,
  scopeId,
  selectedId,
  onSelect,
  children,
  actions,
  threads = [],
  selectedThreadId = null,
  onSelectThread,
}: {
  events: SessionEvent[];
  scopeId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  children: ReactNode;
  actions: ReactNode;
  threads?: SessionThread[];
  selectedThreadId?: string | null;
  onSelectThread?: (id: string | null) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const timed = useMemo(() => {
    const durations = modelSpanDurations(events);
    return events.flatMap((event) => {
      const at = event.processed_at ? Date.parse(event.processed_at) : NaN;
      if (!Number.isFinite(at)) return [];
      const duration = durations.get(event.id) ?? 0;
      return [{ event, at, start: at - duration, duration }];
    });
  }, [events]);
  const start = timed.reduce(
    (min, item) => Math.min(min, item.start),
    Infinity,
  );
  const end = timed.reduce((max, item) => Math.max(max, item.at), -Infinity);
  const range = Math.max(1, end - start);
  // The track is at least 400px wide, so a 1% marker remains a 4px target.
  // Pack overlapping rendered intervals into lanes; timestamps stay unchanged.
  const tracks = useMemo(() => {
    const primary = threads.find((thread) => thread.parent_thread_id === null);
    const calls = new Map(
      events.map((event) => [event.id, event.session_thread_id]),
    );
    const addressed = (event: SessionEvent) =>
      event.session_thread_id ??
      calls.get(event.tool_use_id ?? event.mcp_tool_use_id ?? "") ??
      primary?.id;
    const threadIds = new Set(threads.map((thread) => thread.id));
    const grouped = new Map<string, typeof timed>();
    if (threads.length)
      for (const item of timed) {
        const id = addressed(item.event);
        const key = id && threadIds.has(id) ? id : "unassigned";
        const group = grouped.get(key);
        if (group) group.push(item);
        else grouped.set(key, [item]);
      }
    const rows: {
      id: string;
      label: string | null;
      selected: boolean;
      items: typeof timed;
    }[] = threads.length
      ? threads.map((thread) => ({
          id: thread.id,
          label: thread.agent.name,
          selected:
            selectedThreadId === thread.id ||
            (!selectedThreadId && !thread.parent_thread_id),
          items: grouped.get(thread.id) ?? [],
        }))
      : [{ id: scopeId, label: null, selected: false, items: timed }];
    const unassigned = grouped.get("unassigned") ?? [];
    if (unassigned.length)
      rows.push({
        id: "unassigned",
        label: "Other threads",
        selected: false,
        items: unassigned,
      });
    return rows.map((row) => {
      const laneEnds: number[] = [];
      const markers = [...row.items]
        .sort((a, b) => a.start - b.start)
        .map((item) => {
          const left = Math.min(0.99, (item.start - start) / range);
          const width = Math.max(0.01, item.duration / range);
          let lane = laneEnds.findIndex((last) => last <= left);
          if (lane === -1) lane = laneEnds.length;
          laneEnds[lane] = left + width;
          return { ...item, left, width, lane };
        });
      return { ...row, markers, height: Math.max(1, laneEnds.length) * 28 + 4 };
    });
  }, [events, timed, threads, selectedThreadId, scopeId, start, range]);

  return (
    <div className="shrink-0 space-y-2 border-b pb-3">
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom out"
            disabled={zoom === 1 || !timed.length}
            onClick={() => setZoom(zoom / 2)}
          >
            <Minus />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Reset timeline zoom"
            data-zoom={zoom}
            disabled={!timed.length}
            onClick={() => setZoom(1)}
          >
            {zoom.toFixed(2)}×
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom in"
            disabled={zoom === 8 || !timed.length}
            onClick={() => setZoom(zoom * 2)}
          >
            <Plus />
          </Button>
          {actions}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Download events"
            disabled={!events.length}
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(events, null, 2)], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `${scopeId}-events.json`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 0);
            }}
          >
            <Download />
          </Button>
        </div>
      </div>
      <div
        className="max-h-32 min-w-0 overflow-auto rounded-md border bg-muted"
        role="group"
        aria-label="Event timeline"
        data-timed-events={timed.length}
      >
        {timed.length || threads.length ? (
          <div
            style={{ width: `${zoom * 100}%` }}
            data-start-ms={Number.isFinite(start) ? start : undefined}
            data-end-ms={Number.isFinite(end) ? end : undefined}
          >
            {tracks.map((row) => (
              <div
                key={row.id}
                className={cn(
                  "flex border-b last:border-0",
                  row.selected && "bg-secondary/70",
                )}
                data-timeline-thread-id={row.id}
                data-selected={row.selected}
              >
                {row.label && (
                  <button
                    type="button"
                    className="sticky left-0 z-30 w-36 shrink-0 truncate border-r bg-muted px-2 text-left text-xs hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`View thread ${row.label}`}
                    aria-pressed={row.selected}
                    disabled={row.id === "unassigned"}
                    onClick={() => onSelectThread?.(row.id)}
                  >
                    {row.label}
                  </button>
                )}
                <div
                  className="relative min-w-[400px] flex-1"
                  style={{ height: row.height }}
                >
                  {row.markers.map(({ event, duration, left, width, lane }) => (
                    <button
                      key={event.id}
                      type="button"
                      className={cn(
                        "absolute h-6 rounded-sm opacity-75 hover:opacity-100 focus:z-20 focus:outline-2 focus:outline-ring",
                        event.type.startsWith("span.model_request")
                          ? "bg-blue-500"
                          : event.type.startsWith("user.")
                            ? "bg-pink-400"
                            : "bg-muted-foreground",
                        selectedId === event.id &&
                          "z-10 outline-2 outline-ring",
                      )}
                      style={{
                        left: `${left * 100}%`,
                        width: `${width * 100}%`,
                        top: lane * 28 + 4,
                      }}
                      data-event-id={event.id}
                      data-duration-ms={duration}
                      aria-label={`${event.type} at ${event.processed_at}`}
                      aria-pressed={selectedId === event.id}
                      title={`${event.type} · ${event.processed_at}`}
                      onClick={() => onSelect(event.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-1.5 text-xs text-muted-foreground">
            No timestamped events yet.
          </p>
        )}
      </div>
    </div>
  );
}
