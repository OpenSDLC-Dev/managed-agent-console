import { Fragment, type ReactNode } from "react";
import type { SessionEvent } from "@/lib/platform/types";
import { toolOutcome, type SessionTurn } from "@/lib/session-trace/turns";

/** Share tool/result nesting and event links across the drawer and workspace. */
export function TurnContents({
  turn,
  visible,
  expand = false,
  selectedId,
  renderEvent,
  showHeading = true,
}: {
  turn: SessionTurn;
  visible?: ReadonlySet<string>;
  expand?: boolean;
  showHeading?: boolean;
  selectedId?: string | null;
  renderEvent: (event: SessionEvent) => ReactNode;
}) {
  const show = (event: SessionEvent) => !visible || visible.has(event.id);
  const activity: SessionEvent[] = [];
  const body = turn.entries.map((entry) => {
    const { event } = entry;
    const replies = entry.replies.filter(show);
    if (!show(event) && !replies.length) return null;
    if (event.type.startsWith("span.") || event.type.startsWith("session.")) {
      activity.push(event);
      return null;
    }
    if (!replies.length)
      return <Fragment key={event.id}>{renderEvent(event)}</Fragment>;
    const outcome = toolOutcome(entry);
    return (
      <div
        key={event.id}
        className="my-1 rounded-lg border-l-2 border-border pl-2"
        data-tool-call={event.id}
        data-tool-outcome={outcome}
      >
        {show(event) ? (
          renderEvent(event)
        ) : (
          <p className="text-xs text-muted-foreground">
            {event.name ?? "Tool call"}
          </p>
        )}
        <details
          open={expand || replies.some((e) => e.id === selectedId) || undefined}
        >
          <summary className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary">
            {outcome ?? "Tool updates"} · {replies.length}{" "}
            {replies.length === 1 ? "event" : "events"}
          </summary>
          {replies.map((reply) => (
            <Fragment key={reply.id}>{renderEvent(reply)}</Fragment>
          ))}
        </details>
      </div>
    );
  });
  if (!body.some(Boolean) && !activity.length) return null;
  return (
    <section
      aria-label={turn.number ? "Turn " + turn.number : "Session activity"}
      data-turn-id={turn.id}
      data-turn-number={turn.number}
      className="min-w-0 space-y-1 border-b border-border/60 py-3 last:border-0"
    >
      {showHeading && turn.number && (
        <h3 className="text-xs font-medium text-muted-foreground">
          Turn {turn.number}
        </h3>
      )}
      {body}
      {activity.length > 0 && (
        <details
          open={
            expand || activity.some((e) => e.id === selectedId) || undefined
          }
        >
          <summary className="cursor-pointer rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">
            Session events ({activity.length})
          </summary>
          {activity.map((event) => (
            <Fragment key={event.id}>{renderEvent(event)}</Fragment>
          ))}
        </details>
      )}
    </section>
  );
}
