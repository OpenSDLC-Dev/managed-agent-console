import { describe, expect, it } from "vitest";
import { applyFrame, applyPersisted, emptyTrace, latestStatus } from "./store";
import type { SessionEvent } from "@/lib/platform/types";

const ev = (id: string, type: string): SessionEvent =>
  ({ id, type, processed_at: null }) as SessionEvent;

describe("trace store edge frames", () => {
  it("passes ping and error frames through unchanged", () => {
    const state = emptyTrace();
    expect(applyFrame(state, { type: "ping" })).toBe(state);
    expect(applyFrame(state, { type: "error" })).toBe(state);
  });

  it("ignores unknown frames that are not persisted events", () => {
    const state = emptyTrace();
    expect(applyFrame(state, { type: "mystery", id: 42 })).toBe(state);
    expect(applyFrame(state, {})).toBe(state);
  });

  it("replaces multiple previews in a single persisted batch", () => {
    let state = emptyTrace();
    state = applyFrame(state, {
      type: "event_start",
      event: { id: "sevt_a", type: "agent.message" },
    });
    state = applyFrame(state, {
      type: "event_start",
      event: { id: "sevt_b", type: "agent.message" },
    });
    state = applyPersisted(state, [
      ev("sevt_a", "agent.message"),
      ev("sevt_b", "agent.message"),
    ]);
    expect(state.previews.size).toBe(0);
    expect(state.events.map((e) => e.id)).toEqual(["sevt_a", "sevt_b"]);
  });

  it("defaults a delta's index to 0 and its text to empty", () => {
    let state = emptyTrace();
    state = applyFrame(state, {
      type: "event_delta",
      event_id: "sevt_1",
      delta: { type: "content_delta", content: { type: "text" } },
    });
    expect(state.previews.get("sevt_1")?.parts[0]).toBe("");
  });

  it("ignores non-content deltas", () => {
    const state = emptyTrace();
    expect(
      applyFrame(state, {
        type: "event_delta",
        event_id: "sevt_1",
        delta: { type: "usage_delta", index: 0, content: { type: "text" } },
      }),
    ).toBe(state);
  });

  it("ignores an event_start for an already-tracked id", () => {
    let state = emptyTrace();
    state = applyPersisted(state, [ev("sevt_1", "agent.message")]);
    expect(
      applyFrame(state, {
        type: "event_start",
        event: { id: "sevt_1", type: "agent.message" },
      }),
    ).toBe(state);

    state = applyFrame(state, {
      type: "event_start",
      event: { id: "sevt_2", type: "agent.message" },
    });
    expect(
      applyFrame(state, {
        type: "event_start",
        event: { id: "sevt_2", type: "agent.message" },
      }),
    ).toBe(state);
  });
});

describe("latestStatus", () => {
  it("maps a latest running status event", () => {
    let state = emptyTrace();
    state = applyPersisted(state, [
      ev("sevt_1", "session.status_idle"),
      ev("sevt_2", "session.status_running"),
    ]);
    expect(latestStatus(state)).toBe("running");
  });

  it("maps rescheduled and terminated status events", () => {
    let state = emptyTrace();
    state = applyPersisted(state, [ev("sevt_1", "session.status_rescheduled")]);
    expect(latestStatus(state)).toBe("rescheduling");

    state = applyPersisted(state, [ev("sevt_2", "session.status_terminated")]);
    expect(latestStatus(state)).toBe("terminated");
  });

  it("returns undefined when no status event exists", () => {
    let state = emptyTrace();
    expect(latestStatus(state)).toBeUndefined();
    state = applyPersisted(state, [ev("sevt_1", "user.message")]);
    expect(latestStatus(state)).toBeUndefined();
  });
});
