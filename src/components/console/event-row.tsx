import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContentBlock, SessionEvent } from "@/lib/platform/types";
import { Time } from "@/components/console/bits";

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
            <Badge className="bg-amber-100 text-amber-800" variant="outline">
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
    case "span.model_request_end":
      return event.model_usage ? (
        <p className="text-[13px] text-muted-foreground">
          {event.model_usage.input_tokens.toLocaleString()} in ·{" "}
          {event.model_usage.output_tokens.toLocaleString()} out ·{" "}
          {event.model_usage.cache_read_input_tokens.toLocaleString()} cache
          read
        </p>
      ) : null;
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
      return null;
  }
}

export function EventRow({ event }: { event: SessionEvent }) {
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
    </div>
  );
}
