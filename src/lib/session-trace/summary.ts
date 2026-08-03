import type { ContentBlock, SessionEvent } from "@/lib/platform/types";

/**
 * One-line transcript summaries (plan 03 slice 3): the compact row text for
 * each event type. Pure and framework-free; the detail panel carries the
 * full content.
 */

export function textOf(content: ContentBlock[] | null | undefined): string {
  if (!content) return "";
  return content
    .map((block) =>
      block.type === "text" ? (block.text ?? "") : `[${block.type}]`,
    )
    .join("");
}

const ENVELOPE_KEYS = new Set(["id", "type", "processed_at"]);

/** The event minus its envelope — what the fallback rendering shows. */
export function payloadOf(event: SessionEvent): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(event).filter(([key]) => !ENVELOPE_KEYS.has(key)),
  );
}

function firstLine(text: string): string {
  const line = text.split("\n", 1)[0];
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

export function tokensLine(event: SessionEvent): string | null {
  const usage = event.model_usage;
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
  return `${usage.input_tokens.toLocaleString()} in · ${usage.output_tokens.toLocaleString()} out · ${usage.cache_read_input_tokens.toLocaleString()} cache read`;
}

const KNOWN_EVENT_TYPES = new Set([
  "user.message",
  "agent.message",
  "agent.thinking",
  "agent.tool_use",
  "agent.custom_tool_use",
  "agent.tool_result",
  "user.tool_result",
  "user.custom_tool_result",
  "user.tool_confirmation",
  "session.status_running",
  "session.status_idle",
  "span.model_request_start",
  "span.model_request_end",
  "session.error",
]);

/** False for types with no dedicated rendering — they get the JSON fallback. */
export function isKnownEventType(type: string): boolean {
  return KNOWN_EVENT_TYPES.has(type);
}

/** One line of transcript text; empty string when the badge says it all. */
export function summaryOf(event: SessionEvent): string {
  switch (event.type) {
    case "user.message":
    case "agent.message":
    case "agent.thinking":
      return firstLine(textOf(event.content));
    case "agent.tool_use":
    case "agent.custom_tool_use":
      return firstLine(
        `${event.name ?? ""} ${event.input === undefined ? "" : JSON.stringify(event.input)}`.trim(),
      );
    case "agent.tool_result":
    case "user.tool_result":
    case "user.custom_tool_result":
      return firstLine(
        textOf(event.content as ContentBlock[] | null | undefined),
      );
    case "user.tool_confirmation": {
      // Only assert a verdict the event actually carries.
      const verdict =
        event.result === "allow"
          ? "Approved"
          : event.result === "deny"
            ? "Denied"
            : "Answered";
      return `${verdict} ${event.tool_use_id ?? ""}${
        event.deny_message ? ` — ${event.deny_message}` : ""
      }`;
    }
    case "session.status_running":
      return "";
    case "session.status_idle": {
      const ids = event.stop_reason?.event_ids;
      const pending = ids
        ? ` (${ids.length} pending tool call${ids.length === 1 ? "" : "s"})`
        : "";
      return `stopped: ${event.stop_reason?.type ?? "unknown"}${pending}`;
    }
    // Only unpaired starts reach the transcript (the request is still
    // running, or its end never persisted) — say that much and no more.
    case "span.model_request_start":
      return "model request started";
    case "span.model_request_end":
      return tokensLine(event) ?? "";
    case "session.error":
      return `${event.error?.message ?? "error"}${
        event.error?.retry_status ? ` (${event.error.retry_status.type})` : ""
      }`;
    default: {
      const payload = payloadOf(event);
      return Object.keys(payload).length === 0
        ? ""
        : firstLine(JSON.stringify(payload));
    }
  }
}
