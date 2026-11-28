import type { SessionEvent } from "../platform/types";

export type TranscriptEntry = { event: SessionEvent; replies: SessionEvent[] };
export type SessionTurn = {
  id: string;
  number: number | null;
  entries: TranscriptEntry[];
};

export function isToolCall(event: SessionEvent) {
  return [
    "agent.tool_use",
    "agent.mcp_tool_use",
    "agent.custom_tool_use",
  ].includes(event.type);
}

export function toolCallId(event: SessionEvent) {
  switch (event.type) {
    case "agent.tool_result":
    case "user.tool_result":
    case "user.tool_confirmation":
      return event.tool_use_id;
    case "agent.mcp_tool_result":
      return event.mcp_tool_use_id;
    case "user.custom_tool_result":
      return event.custom_tool_use_id;
  }
}

export function toolOutcome(entry: TranscriptEntry) {
  if (
    entry.replies.some(
      (e) => e.type === "user.tool_confirmation" && e.result === "deny",
    )
  )
    return "Denied";
  const result = entry.replies.find((e) => e.type.endsWith("tool_result"));
  if (result) return result.is_error === true ? "Failed" : "Completed";
  return undefined;
}

/** Log order owns turn boundaries. A tool may finish after the next user message. */
export function groupSessionTurns(events: SessionEvent[]): SessionTurn[] {
  const turns: SessionTurn[] = [];
  const calls = new Map<string, TranscriptEntry>();
  let current: SessionTurn | undefined;
  let count = 0;
  for (const event of events) {
    const parentId = toolCallId(event);
    const call = parentId && calls.get(parentId);
    if (call) {
      call.replies.push(event);
      continue;
    }
    const conversation =
      event.type.startsWith("agent.") || event.type.startsWith("user.");
    if (
      !current ||
      event.type === "user.message" ||
      (current.number === null && conversation)
    ) {
      current = {
        id: event.id,
        number: conversation ? ++count : null,
        entries: [],
      };
      turns.push(current);
    }
    const entry: TranscriptEntry = { event, replies: [] };
    if (isToolCall(event)) calls.set(event.id, entry);
    current.entries.push(entry);
  }
  return turns;
}
