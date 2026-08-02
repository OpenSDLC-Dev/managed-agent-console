import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { SessionEvent } from "@/lib/platform/types";
import { useSessionTrace } from "./use-session-trace";

const encoder = new TextEncoder();

const ev = (id: string, type: string): SessionEvent =>
  ({ id, type, processed_at: null }) as SessionEvent;

/** One controllable SSE connection handed out by the fetch mock. */
class StreamHandle {
  controller!: ReadableStreamDefaultController<Uint8Array>;
  readonly stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      this.controller = controller;
    },
  });

  push(frame: object) {
    const type = (frame as { type?: string }).type ?? "message";
    this.controller.enqueue(
      encoder.encode(`event: ${type}\ndata: ${JSON.stringify(frame)}\n\n`),
    );
  }

  pushRaw(text: string) {
    this.controller.enqueue(encoder.encode(text));
  }

  /** Upstream closed without session.deleted. */
  end() {
    this.controller.close();
  }

  /** Transport error mid-stream. */
  fail() {
    this.controller.error(new Error("network drop"));
  }
}

let seedPages: object[];
let streams: StreamHandle[];
let streamFails: boolean;
let holdStream: boolean;
let releaseStream: (() => void) | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  seedPages = [];
  streams = [];
  streamFails = false;
  holdStream = false;
  releaseStream = undefined;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/events/stream")) {
      if (streamFails) return new Response(null, { status: 502 });
      if (holdStream) {
        // Hold the stream fetch open until the test calls releaseStream.
        await new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }
      const handle = new StreamHandle();
      streams.push(handle);
      return new Response(handle.stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    const page = seedPages.shift() ?? { data: [] };
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Flush enough microtask turns for a fetch → decode → setState chain. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 25; i++) await Promise.resolve();
  });

describe("useSessionTrace", () => {
  it("seeds every history page, goes live, and applies stream frames", async () => {
    seedPages = [
      { data: [ev("sevt_1", "user.message")], next_page: "tok_2" },
      { data: [ev("sevt_2", "agent.message")], next_page: null },
    ];
    const { result, unmount } = renderHook(() => useSessionTrace("sess_1"));
    expect(result.current.connection).toBe("connecting");

    await flush();
    expect(result.current.connection).toBe("live");
    expect(result.current.trace.events.map((e) => e.id)).toEqual([
      "sevt_1",
      "sevt_2",
    ]);
    // Seed pagination and the stream attach hit the BFF with the wire params.
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/platform/v1/sessions/sess_1/events?limit=1000&order=asc",
      "/api/platform/v1/sessions/sess_1/events?limit=1000&order=asc&page=tok_2",
      "/api/platform/v1/sessions/sess_1/events/stream?event_deltas[]=agent.message",
    ]);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      headers: { accept: "text/event-stream" },
    });

    // A streaming preview builds up from event_start + content deltas.
    streams[0].push({
      type: "event_start",
      event: { id: "sevt_3", type: "agent.message" },
    });
    streams[0].push({
      type: "event_delta",
      event_id: "sevt_3",
      delta: {
        type: "content_delta",
        index: 0,
        content: { type: "text", text: "Hi" },
      },
    });
    await flush();
    expect(result.current.trace.previews.get("sevt_3")?.parts[0]).toBe("Hi");

    // Malformed frames are skipped without killing the stream.
    streams[0].pushRaw("event: agent.message\ndata: {not-json\n\n");
    streams[0].push(ev("sevt_3", "agent.message"));
    await flush();
    expect(result.current.trace.previews.has("sevt_3")).toBe(false);
    expect(result.current.trace.events.at(-1)?.id).toBe("sevt_3");
    unmount();
  });

  it("closes the trace on session.deleted and stops reconnecting", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result, unmount } = renderHook(() => useSessionTrace("sess_del"));
    await flush();
    expect(result.current.connection).toBe("live");

    streams[0].push({ type: "session.deleted" });
    await flush();
    expect(result.current.connection).toBe("closed");
    expect(result.current.trace.deleted).toBe(true);

    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
    unmount();
  });

  it("reconnects with exponential backoff and reseeds to cover the gap", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result, unmount } = renderHook(() => useSessionTrace("sess_rc"));
    await flush();
    expect(result.current.connection).toBe("live");
    expect(fetchMock).toHaveBeenCalledTimes(2); // seed + stream

    // Upstream closes without session.deleted — treated as a drop.
    streams[0].end();
    await flush();
    expect(result.current.connection).toBe("reconnecting");

    // Nothing before the 1s backoff elapses.
    streamFails = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // First retry: reseed + stream attach, which 502s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.connection).toBe("reconnecting");

    // Backoff doubled: 1s in is still waiting…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // …the second second completes the 2s wait and this attempt succeeds.
    streamFails = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(result.current.connection).toBe("live");

    // A live connection resets the backoff to 1s.
    streams[1].fail();
    await flush();
    expect(result.current.connection).toBe("reconnecting");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(result.current.connection).toBe("live");
    unmount();
  });

  it("stops cleanly on unmount: no state updates, no reconnects", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result, unmount } = renderHook(() => useSessionTrace("sess_gone"));
    await flush();
    expect(result.current.connection).toBe("live");
    const before = result.current.trace;

    unmount();
    // Frames after cancellation never reach state…
    streams[0].push(ev("sevt_9", "agent.message"));
    await flush();
    expect(result.current.trace).toBe(before);

    // …and a post-unmount drop schedules no reconnect.
    streams[0].fail();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.connection).toBe("live");
  });

  it("does not go live when unmounted while the stream fetch is in flight", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    holdStream = true;
    const { result, unmount } = renderHook(() => useSessionTrace("sess_race"));
    await flush();
    expect(result.current.connection).toBe("connecting");

    unmount();
    releaseStream?.();
    await flush();
    // The connect resolved after cancellation: never reported live…
    expect(result.current.connection).toBe("connecting");

    // …and the drop that follows schedules no reconnect.
    streams[0].end();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not reconnect when unmounted mid-backoff", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result, unmount } = renderHook(() => useSessionTrace("sess_wait"));
    await flush();
    streams[0].fail();
    await flush();
    expect(result.current.connection).toBe("reconnecting");

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
