"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Download, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionEvent } from "@/lib/platform/types";
import { modelSpanDurations } from "@/lib/session-trace/timing";
import { cn } from "@/lib/utils";

export function SessionTimeline({
  events,
  scopeId,
  selectedId,
  onSelect,
  children,
  actions,
}: {
  events: SessionEvent[];
  scopeId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  children: ReactNode;
  actions: ReactNode;
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
  const laneEnds: number[] = [];
  const markers = [...timed]
    .sort((a, b) => a.start - b.start)
    .map((item) => {
      const left = Math.min(0.99, (item.start - start) / range);
      const width = Math.max(0.01, item.duration / range);
      let lane = laneEnds.findIndex((last) => last <= left);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = left + width;
      return { ...item, left, width, lane };
    });

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
        {timed.length ? (
          <div
            className="relative min-w-[400px]"
            style={{
              width: `${zoom * 100}%`,
              height: laneEnds.length * 28 + 4,
            }}
            data-start-ms={start}
            data-end-ms={end}
          >
            {markers.map(({ event, duration, left, width, lane }) => (
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
                  selectedId === event.id && "z-10 outline-2 outline-ring",
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
        ) : (
          <p className="px-3 py-1.5 text-xs text-muted-foreground">
            No timestamped events yet.
          </p>
        )}
      </div>
    </div>
  );
}
