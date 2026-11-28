"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/shell/workspace-navigation";
import { Button } from "@/components/ui/button";
import type { Session, SessionEvent } from "@/lib/platform/types";
import { groupSessionTurns } from "@/lib/session-trace/turns";
import { summaryOf, textOf } from "@/lib/session-trace/summary";
import type { useSessionTrace } from "@/lib/session-trace/use-session-trace";
import { ErrorState, ListSkeleton, Time } from "./bits";
import { TurnContents } from "./session-turn";

export function SessionTurnPreview({
  session,
  href,
  sessionTrace,
}: {
  session: Session;
  href: string;
  sessionTrace: ReturnType<typeof useSessionTrace>;
}) {
  const { trace, history, connection } = sessionTrace;
  const groups = useMemo(() => groupSessionTurns(trace.events), [trace.events]);
  const turns = groups.filter((turn) => turn.number !== null);
  // Null follows the newest turn. Reading an older one pins its event ID
  // while a new turn streams in or the session reconnects.
  const [selected, setSelected] = useState<string | null>(null);
  const current = turns.find((turn) => turn.id === selected) ?? turns.at(-1);
  const number = current?.number ?? 0;
  const detail = href + (href.includes("?") ? "&" : "?") + "inspector=events";
  function renderEvent(event: SessionEvent) {
    const actor = event.type.startsWith("user.")
      ? "User"
      : (event.agent_name ?? session.agent.name);
    return (
      <Link
        href={detail + "&event=" + encodeURIComponent(event.id)}
        data-event-id={event.id}
        className="block min-w-0 rounded-md px-2 py-1.5 hover:bg-secondary"
      >
        <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium">
            {event.type.startsWith("agent.") || event.type.startsWith("user.")
              ? actor
              : event.type}
          </span>
          {event.processed_at && <Time iso={event.processed_at} />}
        </span>
        <span className="block whitespace-pre-wrap break-words text-sm">
          {textOf(event.content) ||
            summaryOf(event) ||
            event.name ||
            event.type}
        </span>
      </Link>
    );
  }
  return (
    <section aria-label="Quickview transcript">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Transcript</h3>
        {history.ready && current && (
          <div className="flex items-center gap-1 text-xs">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous turn"
              disabled={number <= 1}
              onClick={() => setSelected(turns[number - 2].id)}
            >
              <ChevronLeft />
            </Button>
            <span
              data-current-turn={number}
              data-turn-count={turns.length}
              aria-live="polite"
            >
              Turn {number} of {turns.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next turn"
              disabled={number >= turns.length}
              onClick={() =>
                setSelected(
                  number + 1 === turns.length ? null : turns[number].id,
                )
              }
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
      {history.ready && connection === "reconnecting" && (
        <p role="status" className="text-xs text-muted-foreground">
          Reconnecting to session updates…
        </p>
      )}
      {history.error ? (
        <ErrorState error={history.error} />
      ) : !history.ready ? (
        <ListSkeleton />
      ) : current ? (
        <TurnContents
          turn={current}
          showHeading={false}
          renderEvent={renderEvent}
        />
      ) : groups[0] ? (
        <TurnContents turn={groups[0]} expand renderEvent={renderEvent} />
      ) : (
        <p className="py-2 text-sm text-muted-foreground">No events yet.</p>
      )}
      <Link
        className="text-xs text-muted-foreground hover:underline"
        href={detail}
      >
        View events
      </Link>
    </section>
  );
}
