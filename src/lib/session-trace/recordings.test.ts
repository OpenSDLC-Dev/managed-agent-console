// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@/lib/platform/types";
import { parseSseStream } from "./sse";
import { applyFrame, applyPersisted, emptyTrace, latestStatus } from "./store";

function replay(name: string) {
  const bytes = readFileSync(`test/fixtures/recordings-8/${name}.sse`);
  let offset = 0;
  return parseSseStream(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 97, bytes.length);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
      },
    }),
  );
}

describe("recordings #8 raw SSE", () => {
  it("replaces all 500 text deltas and start-only thinking with their final domain IDs", async () => {
    let trace = emptyTrace();
    let deltas = 0;
    let thinking = false;
    for await (const frame of replay("preview-00")) {
      expect(frame.event).toBe("message");
      const data = JSON.parse(frame.data);
      if (data.type === "event_delta") deltas++;
      if (data.type === "agent.thinking") {
        expect(trace.previews.get(data.id)?.parts).toEqual([]);
        thinking = true;
      }
      if (data.type === "agent.message") {
        expect(trace.previews.get(data.id)?.parts.join("")).toBe(
          data.content[0].text,
        );
        expect(data.content[0].text).toHaveLength(4799);
        expect(data.content[0].text).toMatch(/PREVIEW_400$/);
      }
      trace = applyFrame(trace, data);
    }
    expect(thinking).toBe(true);
    expect(deltas).toBe(500);
    expect(trace.previews.size).toBe(0);
    expect(
      trace.events.filter((event) => event.type === "agent.message"),
    ).toHaveLength(1);
    expect(latestStatus(trace)).toBe("idle");
    // A reconnect/reload history overlap cannot duplicate the final response.
    expect(applyPersisted(trace, trace.events)).toBe(trace);
  });

  it("keeps overlapping parent and selected-child streams independent", async () => {
    const traces = [];
    for (const name of ["ui-02", "ui-03"]) {
      let trace = emptyTrace();
      for await (const frame of replay(name))
        trace = applyFrame(trace, JSON.parse(frame.data));
      traces.push(trace);
    }
    const [parent, child] = traces;
    expect(
      child.events
        .filter((event) => parent.seen.has(event.id))
        .map((event) => event.id),
    ).toEqual([
      "sevt_01SqvLtdrKrCob9CSaiy91kK",
      "sevt_01JTDfwLa1NKjFrpv4PnPabA",
    ]);
    const confirmation = (events: SessionEvent[]) =>
      events.find((event) => event.type === "user.tool_confirmation")!;
    expect(confirmation(parent.events).id).toBe(
      "sevt_019ApCFYy7MFYG4eXYWmq3nC",
    );
    expect(confirmation(child.events).id).toBe("sevt_01Wg9eJBYUDVXeawNt7hzMSz");
    expect(confirmation(parent.events).tool_use_id).toBe(
      confirmation(child.events).tool_use_id,
    );
    expect(child.previews.size).toBe(0);
  });

  it("accepts the ephemeral archive frame without inventing reload history", async () => {
    let live = emptyTrace();
    for await (const frame of replay("archive-00"))
      live = applyFrame(live, JSON.parse(frame.data));
    expect(latestStatus(live)).toBe("terminated");
    expect(live.events.map((event) => event.id)).toEqual([
      "sevt_01U6AArx1ZTmeTozYn75uzkk",
    ]);
    // archive's post-termination GET contains zero events (COVERAGE.md Q4).
    const reload = applyPersisted(emptyTrace(), []);
    expect(reload.events).toEqual([]);
    expect(latestStatus(reload)).toBeUndefined();
  });
});
