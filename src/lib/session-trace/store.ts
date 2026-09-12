import type { SessionEvent } from "@/lib/platform/types";

/**
 * Pure event-log state for a session trace. Feeds from two sources — the
 * seeded history (GET …/events) and live SSE frames — and reconciles them:
 *
 * - persisted events upsert by id (reseeding after a reconnect just dedups);
 * - `event_start` opens a streaming preview under its pre-allocated id;
 * - `event_delta` (`content_delta`) appends text at (event_id, index);
 * - the persisted event later REPLACES its preview (same id, platform
 *   guarantee: the buffered event lands under the preview's id);
 * - `session.deleted` terminates the trace.
 *
 * Kept framework-free so it can be tested without React.
 */

export interface PreviewState {
  id: string;
  type: string;
  /** Text per content index, appended in arrival order. */
  parts: string[];
}

export interface TraceState {
  /** Persisted events in arrival order (log order — the wire appends). */
  events: SessionEvent[];
  /** ids present in `events`, for dedup. */
  seen: Set<string>;
  /** Streaming previews not yet persisted, by event id. */
  previews: Map<string, PreviewState>;
  deleted: boolean;
}

export function emptyTrace(): TraceState {
  return { events: [], seen: new Set(), previews: new Map(), deleted: false };
}

export function applyPersisted(
  state: TraceState,
  incoming: SessionEvent[],
): TraceState {
  let changed = false;
  const events = [...state.events];
  const seen = new Set(state.seen);
  let previews = state.previews;
  for (const event of incoming) {
    // Same guard the frame path applies (see `applyFrame`'s default arm): an
    // event with no id cannot be keyed, deduped, or opened in the detail
    // panel, and two of them would collapse into one row — silently rendering
    // one event where the wire sent two. The seed path had no such guard, so
    // identical input behaved differently depending on which door it arrived
    // through (plan 04 slice 2).
    if (typeof event?.id !== "string" || typeof event.type !== "string")
      continue;
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    events.push(event);
    if (previews.has(event.id)) {
      if (previews === state.previews) previews = new Map(state.previews);
      previews.delete(event.id);
    }
    changed = true;
  }
  return changed ? { ...state, events, seen, previews } : state;
}

interface EventStartFrame {
  type: "event_start";
  event: { id: string; type: string };
}

interface EventDeltaFrame {
  type: "event_delta";
  event_id: string;
  delta: {
    type: string;
    index: number;
    content: { type: string; text?: string };
  };
}

export function applyFrame(state: TraceState, data: unknown): TraceState {
  const frame = data as { type?: string };
  switch (frame.type) {
    case "event_start": {
      const { event } = frame as unknown as EventStartFrame;
      if (state.seen.has(event.id) || state.previews.has(event.id))
        return state;
      const previews = new Map(state.previews);
      previews.set(event.id, { id: event.id, type: event.type, parts: [] });
      return { ...state, previews };
    }
    case "event_delta": {
      const { event_id, delta } = frame as unknown as EventDeltaFrame;
      if (delta?.type !== "content_delta") return state;
      // A delta can arrive before its start after a reconnect — open lazily.
      if (state.seen.has(event_id)) return state;
      const previews = new Map(state.previews);
      const preview = previews.get(event_id) ?? {
        id: event_id,
        type: "agent.message",
        parts: [],
      };
      const parts = [...preview.parts];
      const index = delta.index ?? 0;
      parts[index] = (parts[index] ?? "") + (delta.content?.text ?? "");
      previews.set(event_id, { ...preview, parts });
      return { ...state, previews };
    }
    case "session.deleted":
      return { ...state, deleted: true };
    case "ping":
    case "error":
      return state;
    default: {
      // Any persisted event type arrives as a frame whose payload IS the event.
      const event = data as SessionEvent;
      if (typeof event.id === "string" && typeof event.type === "string") {
        return applyPersisted(state, [event]);
      }
      return state;
    }
  }
}

/** The latest session status implied by the log, if any status event exists. */
export function latestStatus(state: TraceState): string | undefined {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const type = state.events[i].type;
    if (type === "session.status_running") return "running";
    if (type === "session.status_idle") return "idle";
    if (type === "session.status_rescheduled") return "rescheduling";
    if (type === "session.status_terminated") return "terminated";
  }
  return undefined;
}

/** The newest status on a thread-specific event view. */
export function latestThreadStatus(state: TraceState): string | undefined {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const type = state.events[i].type;
    if (type === "session.thread_status_running") return "running";
    if (type === "session.thread_status_idle") return "idle";
    if (type === "session.thread_status_rescheduled") return "rescheduling";
    if (type === "session.thread_status_terminated") return "terminated";
  }
  return undefined;
}

/** Ask-gated platform/MCP calls on the newest idle boundary of each visible thread.
 * Platform internal/events/toolflow.go: ValidateToolConfirmations excludes custom
 * calls and already answered calls; requires_action can also request custom results.
 */
export function pendingToolUses(
  events: SessionEvent[],
  aggregateThreads = false,
): SessionEvent[] {
  const lifecycle = (event: SessionEvent) =>
    [
      "session.status_running",
      "session.status_idle",
      "session.status_rescheduled",
      "session.status_terminated",
      "session.thread_status_running",
      "session.thread_status_idle",
      "session.thread_status_rescheduled",
      "session.thread_status_terminated",
    ].includes(event.type);
  const boundaries = aggregateThreads
    ? [
        ...new Map(
          events
            .filter(lifecycle)
            .map((event) => [event.session_thread_id ?? "session", event]),
        ).values(),
      ]
    : [[...events].reverse().find(lifecycle)].filter(
        (event): event is SessionEvent => event !== undefined,
      );
  const pendingIds = new Set(
    boundaries.flatMap((event) =>
      (event.type === "session.status_idle" ||
        event.type === "session.thread_status_idle") &&
      event.stop_reason?.type === "requires_action"
        ? (event.stop_reason.event_ids ?? [])
        : [],
    ),
  );
  if (pendingIds.size === 0) return [];
  const answered = new Set(
    events.flatMap((event) => {
      if (
        [
          "user.tool_confirmation",
          "agent.tool_result",
          "user.tool_result",
        ].includes(event.type)
      )
        return [event.tool_use_id];
      if (event.type === "agent.mcp_tool_result")
        return [event.mcp_tool_use_id];
      return [];
    }),
  );
  return events.filter(
    (event) =>
      (event.type === "agent.tool_use" ||
        event.type === "agent.mcp_tool_use") &&
      event.evaluated_permission === "ask" &&
      pendingIds.has(event.id) &&
      !answered.has(event.id),
  );
}
