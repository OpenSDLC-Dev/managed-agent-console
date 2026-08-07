import { describe, expect, it } from "vitest";
import { applyFrame, applyPersisted, emptyTrace, latestStatus } from "./store";
import type { SessionEvent } from "@/lib/platform/types";

/**
 * Contract violations at the SSE/seed reconciliation seam (plan 04 slice 2,
 * decision 7). This is one of exactly two places adversarial input reaches the
 * console — a stream can drop, reorder, duplicate, or truncate anything, and a
 * reconnect replays history that may overlap what is already held.
 *
 * Every assertion here is that the store **degrades honestly**: it keeps what
 * it can justify and drops what it cannot, and never invents a value or
 * collapses two wire events into one. None of these are legitimate platform
 * output — the point is what happens when the wire is wrong anyway.
 */

const ev = (id: string, type: string, extra?: object): SessionEvent =>
  ({ id, type, processed_at: null, ...extra }) as SessionEvent;

describe("probe: the trace store under a violated wire contract", () => {
  it("drops seeded events with no id, the same as the frame path does", () => {
    // Both doors must treat identical input identically; before slice 2 the
    // seed path admitted them and the frame path did not.
    const malformed = [
      { type: "agent.message", processed_at: null },
      { id: 42, type: "agent.message" },
      { id: "sevt_ok", type: "agent.message", processed_at: null },
    ] as unknown as SessionEvent[];

    const seeded = applyPersisted(emptyTrace(), malformed);
    expect(seeded.events.map((e) => e.id)).toEqual(["sevt_ok"]);

    for (const bad of malformed.slice(0, 2)) {
      const state = emptyTrace();
      expect(applyFrame(state, bad)).toBe(state);
    }
  });

  it("never collapses two id-less events into one row", () => {
    // The failure this prevents: `seen` keys on id, so two undefined ids
    // dedup against each other and the trace silently shows one event where
    // the wire sent two.
    const state = applyPersisted(emptyTrace(), [
      { type: "agent.message", content: [{ type: "text", text: "first" }] },
      { type: "agent.message", content: [{ type: "text", text: "second" }] },
    ] as unknown as SessionEvent[]);
    expect(state.events).toHaveLength(0);
    expect(state.seen.size).toBe(0);
  });

  it("keeps a streaming preview that never persists, without blocking the log", () => {
    // A content_delta whose event never lands (turn interrupted, stream cut).
    // The preview must stay — it is what actually arrived — and must not stop
    // later events from appending.
    let state = applyFrame(emptyTrace(), {
      type: "event_delta",
      event_id: "sevt_orphan",
      delta: {
        type: "content_delta",
        index: 0,
        content: { type: "text", text: "half a sen" },
      },
    });
    state = applyPersisted(state, [ev("sevt_next", "session.status_idle")]);

    expect(state.previews.get("sevt_orphan")?.parts[0]).toBe("half a sen");
    expect(state.events.map((e) => e.id)).toEqual(["sevt_next"]);
    expect(latestStatus(state)).toBe("idle");
  });

  it("tolerates deltas arriving out of order and a start that never came", () => {
    // Index 1 before index 0: the store fills by index, so the gap is a hole
    // rather than a misordered concatenation.
    let state = emptyTrace();
    for (const [index, text] of [
      [1, "world"],
      [0, "hello "],
    ] as const) {
      state = applyFrame(state, {
        type: "event_delta",
        event_id: "sevt_p",
        delta: {
          type: "content_delta",
          index,
          content: { type: "text", text },
        },
      });
    }
    expect(state.previews.get("sevt_p")?.parts).toEqual(["hello ", "world"]);
  });

  it("survives a duplicated frame batch replayed after a reconnect", () => {
    // A reconnect reseeds history that overlaps the live tail, and the same
    // frame can arrive twice. Neither may duplicate a row.
    const batch = [ev("sevt_1", "user.message"), ev("sevt_2", "agent.message")];
    let state = applyPersisted(emptyTrace(), batch);
    state = applyPersisted(state, batch);
    state = applyFrame(state, batch[1]);
    expect(state.events.map((e) => e.id)).toEqual(["sevt_1", "sevt_2"]);
  });

  it("ignores a persisted event that would overwrite a settled one", () => {
    // Same id, different content: first write wins, so a corrupted replay
    // cannot rewrite history the operator already read.
    let state = applyPersisted(emptyTrace(), [
      ev("sevt_1", "agent.message", {
        content: [{ type: "text", text: "original" }],
      }),
    ]);
    state = applyPersisted(state, [
      ev("sevt_1", "agent.message", {
        content: [{ type: "text", text: "rewritten" }],
      }),
    ]);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].content?.[0].text).toBe("original");
  });

  it("does not let an unknown frame type mark the trace deleted", () => {
    // `session.deleted` terminates the trace; nothing adjacent may.
    const state = applyPersisted(emptyTrace(), [ev("sevt_1", "user.message")]);
    for (const type of [
      "session.delete",
      "session_deleted",
      "deleted",
      "SESSION.DELETED",
    ]) {
      expect(applyFrame(state, { type }).deleted).toBe(false);
    }
    expect(applyFrame(state, { type: "session.deleted" }).deleted).toBe(true);
  });
});
