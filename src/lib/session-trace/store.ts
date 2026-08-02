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
