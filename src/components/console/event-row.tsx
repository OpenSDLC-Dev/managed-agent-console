import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContentBlock, SessionEvent } from "@/lib/platform/types";
import { Time, WARNING_BOX } from "@/components/console/bits";
import { durationLabel } from "@/lib/session-trace/timing";

function textOf(content: ContentBlock[] | null | undefined): string {
  if (!content) return "";
  return content
    .map((block) =>
      block.type === "text" ? (block.text ?? "") : `[${block.type}]`,
    )
    .join("");
}

function TypeBadge({ type }: { type: string }) {
  const domain = type.split(".")[0];
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 font-mono text-[11px] font-normal",
        domain === "agent" && "bg-secondary",
        domain === "session" && "text-muted-foreground",
        domain === "span" && "border-dashed text-muted-foreground",
      )}
    >
      {type}
    </Badge>
  );
}

function Body({ event }: { event: SessionEvent }) {
  switch (event.type) {
    case "user.message":
    case "agent.message":
      return <p className="whitespace-pre-wrap">{textOf(event.content)}</p>;
    case "agent.thinking":
      return (
        <p className="whitespace-pre-wrap italic text-muted-foreground">
          {textOf(event.content)}
        </p>
      );
    case "agent.tool_use":
    case "agent.custom_tool_use":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px]">{event.name}</span>
          {event.evaluated_permission === "ask" && (
            <Badge className={WARNING_BOX} variant="outline">
              needs approval
            </Badge>
          )}
          <details className="w-full">
            <summary className="cursor-pointer text-[13px] text-muted-foreground">
              input
            </summary>
            <pre className="mt-1 overflow-x-auto rounded-md border bg-card p-2 font-mono text-[12px]">
              {JSON.stringify(event.input, null, 2)}
            </pre>
          </details>
        </div>
      );
    case "agent.tool_result":
    case "user.tool_result":
    case "user.custom_tool_result":
      return (
        <div>
          {event.is_error && (
            <Badge variant="outline" className="mb-1 text-destructive">
              error
            </Badge>
          )}
          <p className="line-clamp-3 whitespace-pre-wrap text-[13px]">
            {textOf(event.content as ContentBlock[] | null)}
          </p>
        </div>
      );
    case "user.tool_confirmation":
      return (
        <p className="text-[13px]">
          {event.result === "allow" ? "Approved" : "Denied"}{" "}
          <span className="font-mono text-muted-foreground">
            {event.tool_use_id}
          </span>
          {event.deny_message ? ` — ${event.deny_message}` : ""}
        </p>
      );
    case "session.status_idle":
      return (
        <p className="text-[13px] text-muted-foreground">
          stopped: {event.stop_reason?.type ?? "unknown"}
          {event.stop_reason?.event_ids
            ? ` (${event.stop_reason.event_ids.length} pending tool call${event.stop_reason.event_ids.length === 1 ? "" : "s"})`
            : ""}
        </p>
      );
    case "span.model_request_end": {
      const usage = event.model_usage;
      // Upstream JSON is not runtime-validated; a missing counter must not
      // abort the whole event list.
      if (
        !usage ||
        [
          usage.input_tokens,
          usage.output_tokens,
          usage.cache_read_input_tokens,
        ].some((n) => typeof n !== "number")
      ) {
        return null;
      }
      return (
        <p className="text-[13px] text-muted-foreground">
          {usage.input_tokens.toLocaleString()} in ·{" "}
          {usage.output_tokens.toLocaleString()} out ·{" "}
          {usage.cache_read_input_tokens.toLocaleString()} cache read
        </p>
      );
    }
    case "session.error":
      return (
        <p className="text-[13px] text-destructive">
          {event.error?.message ?? "error"}
          {event.error?.retry_status
            ? ` (${event.error.retry_status.type})`
            : ""}
        </p>
      );
    default:
      return <UnknownBody event={event} />;
  }
}

/**
 * Honest fallback for event types this console has no dedicated rendering
 * for (plan 03 decision 2) — the payload as a truncated JSON preview, never
 * a silent blank row.
 */
const ENVELOPE_KEYS = new Set(["id", "type", "processed_at"]);

function UnknownBody({ event }: { event: SessionEvent }) {
  const payload = Object.fromEntries(
    Object.entries(event).filter(([key]) => !ENVELOPE_KEYS.has(key)),
  );
  if (Object.keys(payload).length === 0) return null;
  return (
    <p
      className="line-clamp-2 break-all font-mono text-[12px] text-muted-foreground"
      data-testid="unknown-event-payload"
    >
      {JSON.stringify(payload)}
    </p>
  );
}

export function EventRow({
  event,
  offset,
  durationMs,
}: {
  event: SessionEvent;
  /** Clock position since session creation, e.g. "0:09". */
  offset?: string | null;
  /** Paired span duration in ms (span.model_request_end rows). */
  durationMs?: number;
}) {
  return (
    <div
      className="flex gap-3 border-b py-2.5 last:border-b-0"
      data-testid="event-row"
      data-event-type={event.type}
    >
      <div className="w-36 shrink-0 text-[12px] text-muted-foreground">
        <Time iso={event.processed_at} />
      </div>
      <div className="w-52 shrink-0">
        <TypeBadge type={event.type} />
      </div>
      <div className="min-w-0 flex-1">
        <Body event={event} />
      </div>
      {(offset || durationMs !== undefined) && (
        <div className="shrink-0 self-start text-right text-[12px] tabular-nums text-muted-foreground">
          {durationMs !== undefined && (
            <span title="model request duration">
              {durationLabel(durationMs)}
            </span>
          )}
          {durationMs !== undefined && offset && " · "}
          {offset && <span title="since session creation">{offset}</span>}
        </div>
      )}
    </div>
  );
}

/** Full-width divider making a real idle interval visible in the story. */
export function IdleBand({ ms }: { ms: number }) {
  return (
    <div
      className="flex items-center justify-center gap-2 border-b py-1.5 text-[12px] text-muted-foreground last:border-b-0"
      data-testid="idle-band"
    >
      Session idle · {durationLabel(ms)}
    </div>
  );
}
