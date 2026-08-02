import { describe, expect, it } from "vitest";
import { applyFrame, applyPersisted, emptyTrace, latestStatus } from "./store";
import type { SessionEvent } from "@/lib/platform/types";

const ev = (id: string, type: string, extra?: object): SessionEvent =>
  ({ id, type, processed_at: null, ...extra }) as SessionEvent;

describe("trace store", () => {
  it("dedups persisted events across reseeds (reconnect overlap)", () => {
    let state = emptyTrace();
    state = applyPersisted(state, [ev("sevt_1", "user.message")]);
    state = applyPersisted(state, [
      ev("sevt_1", "user.message"),
      ev("sevt_2", "agent.message"),
    ]);
    expect(state.events.map((e) => e.id)).toEqual(["sevt_1", "sevt_2"]);
  });

  it("appends content deltas by (event_id, index) and replaces the preview with the persisted event", () => {
    let state = emptyTrace();
    state = applyFrame(state, {
      type: "event_start",
      event: { id: "sevt_p", type: "agent.message" },
    });
    state = applyFrame(state, {
      type: "event_delta",
      event_id: "sevt_p",
      delta: {
        type: "content_delta",
        index: 0,
        content: { type: "text", text: "Hel" },
      },
    });
    state = applyFrame(state, {
      type: "event_delta",
      event_id: "sevt_p",
      delta: {
        type: "content_delta",
        index: 0,
        content: { type: "text", text: "lo" },
      },
    });
    expect(state.previews.get("sevt_p")?.parts[0]).toBe("Hello");

    state = applyFrame(
      state,
      ev("sevt_p", "agent.message", {
        content: [{ type: "text", text: "Hello" }],
      }),
    );
    expect(state.previews.has("sevt_p")).toBe(false);
    expect(state.events.at(-1)?.id).toBe("sevt_p");
  });

  it("opens a preview lazily when a delta arrives without its start", () => {
    let state = emptyTrace();
    state = applyFrame(state, {
      type: "event_delta",
      event_id: "sevt_x",
      delta: {
        type: "content_delta",
        index: 0,
        content: { type: "text", text: "hi" },
      },
    });
    expect(state.previews.get("sevt_x")?.parts[0]).toBe("hi");
  });

  it("ignores deltas for already-persisted events", () => {
    let state = emptyTrace();
    state = applyPersisted(state, [ev("sevt_1", "agent.message")]);
    const next = applyFrame(state, {
      type: "event_delta",
      event_id: "sevt_1",
      delta: {
        type: "content_delta",
        index: 0,
        content: { type: "text", text: "x" },
      },
    });
    expect(next).toBe(state);
  });

  it("marks the trace deleted on session.deleted and derives status", () => {
    let state = emptyTrace();
    state = applyPersisted(state, [
      ev("sevt_1", "session.status_running"),
      ev("sevt_2", "session.status_idle", {
        stop_reason: { type: "end_turn" },
      }),
    ]);
    expect(latestStatus(state)).toBe("idle");
    state = applyFrame(state, { type: "session.deleted" });
    expect(state.deleted).toBe(true);
  });
});
