import type { SessionEvent } from "../platform/types";

export type TranscriptEntry = {
  event: SessionEvent;
  replies: SessionEvent[];
  interrupted?: boolean;
};
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
  if (entry.interrupted) return "Interrupted";
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
export function groupSessionTurns(
  events: SessionEvent[],
  childThread = false,
): SessionTurn[] {
  const turns: SessionTurn[] = [];
  const calls = new Map<string, TranscriptEntry>();
  let current: SessionTurn | undefined;
  let count = 0;
  let awaitingWake = false;
  // Platform writes the synthetic results immediately before the interrupt
  // or terminal transition, sometimes with interrupted outcome spans between.
  let interruptResults: TranscriptEntry[] = [];
  for (const event of events) {
    const parentId = toolCallId(event);
    const call = parentId && calls.get(parentId);
    const content = event.content;
    if (
      call &&
      event.is_error &&
      Array.isArray(content) &&
      content.length === 1 &&
      content[0].type === "text" &&
      content[0].text ===
        "Tool execution was interrupted before completion. Please retry."
    ) {
      interruptResults.push(call);
    } else if (
      event.type === "user.interrupt" ||
      event.type === "session.thread_status_terminated" ||
      event.type === "session.status_terminated"
    ) {
      for (const entry of interruptResults) entry.interrupted = true;
      interruptResults = [];
    } else if (!(
      event.type === "span.outcome_evaluation_end" &&
      event.result === "interrupted"
    )) {
      interruptResults = [];
    }
    if (call) {
      call.replies.push(event);
      continue;
    }
    const conversation =
      event.type.startsWith("agent.") || event.type.startsWith("user.");
    if (
      event.type ===
      (childThread ? "session.thread_status_idle" : "session.status_idle")
    ) {
      awaitingWake =
        !event.stop_reason || event.stop_reason.type === "end_turn";
    }
    const inScope = childThread || !event.session_thread_id;
    const wake =
      awaitingWake && inScope && event.type === "agent.thread_message_received";
    if (
      !current ||
      event.type === "user.message" ||
      wake ||
      (current.number === null && conversation)
    ) {
      current = {
        id: event.id,
        number: conversation ? ++count : null,
        entries: [],
      };
      turns.push(current);
    }
    if (conversation && inScope) awaitingWake = false;
    const entry: TranscriptEntry = { event, replies: [] };
    if (isToolCall(event)) calls.set(event.id, entry);
    current.entries.push(entry);
  }
  return turns;
}
