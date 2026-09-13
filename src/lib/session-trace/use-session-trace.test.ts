import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  SIGNED_OUT_HEADER,
  hasBouncedToLogin,
  resetSignedOutBounceForTests,
} from "@/lib/identity/signed-out";
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

  constructor(readonly signal?: AbortSignal | null) {
    signal?.addEventListener(
      "abort",
      () => this.controller.error(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  }

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
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
/** Seed requests from this call onwards come back signed out. */
let signedOutFrom: number;
let streamSignedOut: boolean;
let seedCount: number;

/** What the BFF returns once the console session is gone. */
const signedOut = () =>
  new Response(JSON.stringify({ type: "error" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      [SIGNED_OUT_HEADER]: "1",
    },
  });

beforeEach(() => {
  seedPages = [];
  streams = [];
  streamFails = false;
  holdStream = false;
  releaseStream = undefined;
  signedOutFrom = Number.POSITIVE_INFINITY;
  streamSignedOut = false;
  seedCount = 0;
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (
      url.includes("/events/stream") ||
      /\/threads\/[^/]+\/stream/.test(url)
    ) {
      if (streamSignedOut) return signedOut();
      if (streamFails) return new Response(null, { status: 502 });
      if (holdStream) {
        // Hold the stream fetch open until the test calls releaseStream.
        await new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }
      const handle = new StreamHandle(init?.signal);
      streams.push(handle);
      return new Response(handle.stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    seedCount += 1;
    if (seedCount > signedOutFrom) return signedOut();
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
  resetSignedOutBounceForTests();
});

/** Flush enough microtask turns for a fetch → decode → setState chain. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 25; i++) await Promise.resolve();
  });

describe("useSessionTrace", () => {
  it("ignores malformed and repeated live stop frames without losing a new preview", async () => {
    const { result, unmount } = renderHook(() =>
      useSessionTrace("sess_status"),
    );
    await flush();
    streams[0].push(ev("idle", "session.status_idle"));
    streams[0].push({
      type: "event_start",
      event: { id: "new_preview", type: "agent.message" },
    });
    streams[0].push({ type: "session.status_idle" });
    streams[0].push(ev("idle", "session.status_idle"));
    await flush();
    expect([...result.current.trace.previews.keys()]).toEqual(["new_preview"]);
    unmount();
  });

  it("still ends an aborted preview when the first live stop frame overlaps catch-up history", async () => {
    seedPages = [
      { data: [] },
      { data: [ev("overlap_idle", "session.status_idle")] },
    ];
    const { result, unmount } = renderHook(() =>
      useSessionTrace("sess_overlap"),
    );
    await flush();
    // The tail buffered this start and stop while catch-up already saw the
    // persisted idle. The aborted preview has no final event in that history.
    streams[0].push({
      type: "event_start",
      event: { id: "aborted", type: "agent.message" },
    });
    streams[0].push(ev("overlap_idle", "session.status_idle"));
    await flush();
    expect(result.current.trace.previews.size).toBe(0);
    unmount();
  });

  it("retains the attached stream when catch-up returns 404 after session deletion", async () => {
    const baseFetch = fetchMock.getMockImplementation()!;
    let refuseHistory!: () => void;
    fetchMock.mockImplementation(async (input, init) => {
      if (!String(input).includes("/stream?") && seedCount === 1) {
        seedCount++;
        return new Promise<Response>((resolve) => {
          refuseHistory = () =>
            resolve(
              new Response(
                JSON.stringify({
                  type: "error",
                  error: {
                    type: "not_found_error",
                    message: "no such session",
                  },
                }),
                { status: 404 },
              ),
            );
        });
      }
      return baseFetch(input, init);
    });
    const { result, unmount } = renderHook(() =>
      useSessionTrace("sess_deleted_during_seed"),
    );
    await flush();
    streams[0].push({ type: "session.deleted" });
    refuseHistory();
    await flush();
    expect(result.current.trace.deleted).toBe(true);
    expect(result.current.connection).toBe("closed");
    unmount();
  });

  it.each([408, 429, 502])(
    "keeps ephemeral termination bytes through a %i catch-up failure",
    async (status) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const baseFetch = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation(async (input, init) => {
        if (!String(input).includes("/stream?") && seedCount === 1) {
          seedCount++;
          streams[0].push(ev("ephemeral", "session.status_terminated"));
          return new Response(null, { status });
        }
        return baseFetch(input, init);
      });
      const { result, unmount } = renderHook(() =>
        useSessionTrace("sess_ephemeral"),
      );
      await flush();
      expect(result.current.connection).toBe("reconnecting");
      expect(streams[0].signal?.aborted).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await flush();
      expect(streams).toHaveLength(1);
      expect(result.current.trace.events.map((event) => event.id)).toEqual([
        "ephemeral",
      ]);
      expect(result.current.connection).toBe("live");
      unmount();
    },
  );

  it.each([408, 429])(
    "drains buffered deletion after a %i catch-up failure followed by 404",
    async (status) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const baseFetch = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation(async (input, init) => {
        if (!String(input).includes("/stream?") && seedCount >= 1) {
          seedCount++;
          if (seedCount === 2) {
            streams[0].push({ type: "session.deleted" });
            return new Response(null, { status });
          }
          return new Response(null, { status: 404 });
        }
        return baseFetch(input, init);
      });
      const { result, unmount } = renderHook(() =>
        useSessionTrace("sess_rate_limited_deletion"),
      );
      await flush();
      expect(streams[0].signal?.aborted).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await flush();
      expect(streams).toHaveLength(1);
      expect(result.current.trace.deleted).toBe(true);
      expect(result.current.connection).toBe("closed");
      unmount();
    },
  );

  it("buffers live events during paginated catch-up and deduplicates the final event", async () => {
    const baseFetch = fetchMock.getMockImplementation()!;
    let releaseHistory!: (response: Response) => void;
    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).includes("/stream?") && seedCount === 1) {
          seedCount++;
          return new Promise<Response>((resolve) => {
            releaseHistory = resolve;
          });
        }
        return baseFetch(input, init);
      },
    );
    seedPages = [{ data: [ev("first", "user.message")] }];
    const { result, unmount } = renderHook(() =>
      useSessionTrace("sess_buffer"),
    );
    await flush();
    streams[0].push({
      type: "event_start",
      event: { id: "final", type: "agent.message" },
    });
    streams[0].push(ev("final", "agent.message"));
    streams[0].push(ev("last", "session.status_idle"));
    expect(result.current.connection).toBe("connecting");
    seedPages = [{ data: [ev("final", "agent.message")] }];
    releaseHistory(
      new Response(
        JSON.stringify({
          data: [ev("first", "user.message"), ev("gap", "agent.thinking")],
          next_page: "next",
        }),
      ),
    );
    await flush();
    expect(result.current.connection).toBe("live");
    expect(result.current.trace.events.map((event) => event.id)).toEqual([
      "first",
      "gap",
      "final",
      "last",
    ]);
    expect(result.current.trace.previews.size).toBe(0);
    unmount();
  });

  it("stops pagination and aborts history when a thread changes during a seed", async () => {
    const baseFetch = fetchMock.getMockImplementation()!;
    let releaseHistory!: (response: Response) => void;
    let oldSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementationOnce(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        oldSignal = init?.signal;
        return new Promise<Response>((resolve) => {
          releaseHistory = resolve;
        });
      },
    );
    const { result, rerender, unmount } = renderHook(
      ({ thread }) => useSessionTrace("sess_scope", thread),
      { initialProps: { thread: "alpha" } },
    );
    await flush();
    fetchMock.mockImplementation(baseFetch);
    rerender({ thread: "beta" });
    await flush();
    expect(oldSignal?.aborted).toBe(true);
    const calls = fetchMock.mock.calls.length;
    releaseHistory(
      new Response(
        JSON.stringify({
          data: [ev("alpha_only", "agent.message")],
          next_page: "stale_page",
        }),
      ),
    );
    await flush();
    expect(result.current.trace.events).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    unmount();
  });

  it("isolates parent and child previews, boundaries and connection cancellation", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ thread }) => ({
        parent: useSessionTrace("sess_both"),
        child: useSessionTrace("sess_both", thread),
      }),
      { initialProps: { thread: "alpha" } },
    );
    await flush();
    for (const [index, id] of ["parent_preview", "alpha_preview"].entries())
      streams[index].push({
        type: "event_start",
        event: { id, type: "agent.message" },
      });
    const childIdle = {
      ...ev("idle_alpha", "session.thread_status_idle"),
      session_thread_id: "alpha",
    };
    streams[0].push(childIdle);
    streams[1].push(childIdle);
    await flush();
    expect([...result.current.parent.trace.previews.keys()]).toEqual([
      "parent_preview",
    ]);
    expect(result.current.child.trace.previews.size).toBe(0);
    rerender({ thread: "beta" });
    await flush();
    expect(streams[0].signal?.aborted).toBe(false);
    expect(streams[1].signal?.aborted).toBe(true);
    expect(result.current.child.trace.events).toEqual([]);
    streams[0].push(ev("idle_parent", "session.status_idle"));
    await flush();
    expect(result.current.parent.trace.previews.size).toBe(0);
    unmount();
  });

  it("recovers events committed between the initial history and live subscription", async () => {
    holdStream = true;
    seedPages = [{ data: [ev("before", "user.message")] }];
    const { result, unmount } = renderHook(() => useSessionTrace("sess_gap"));
    await flush();
    expect(result.current.trace.events.map((event) => event.id)).toEqual([
      "before",
    ]);
    // The live-only tail will never replay this event: it committed before
    // subscription. A history read AFTER attachment must cover that window.
    seedPages = [
      { data: [ev("before", "user.message"), ev("gap", "agent.message")] },
    ];
    releaseStream?.();
    await flush();
    expect(result.current.trace.events.map((event) => event.id)).toEqual([
      "before",
      "gap",
    ]);
    unmount();
  });

  it("discards incomplete previews on a dropped connection while retaining received events", async () => {
    seedPages = [{ data: [ev("before", "user.message")] }];
    const { result, unmount } = renderHook(() => useSessionTrace("sess_drop"));
    await flush();
    streams[0].push({
      type: "event_start",
      event: { id: "aborted", type: "agent.message" },
    });
    await flush();
    expect(result.current.trace.previews.size).toBe(1);
    streams[0].end();
    await flush();
    expect(result.current.connection).toBe("reconnecting");
    expect(result.current.trace.previews.size).toBe(0);
    expect(result.current.trace.events.map((event) => event.id)).toEqual([
      "before",
    ]);
    unmount();
  });

  it("opts into start-only thinking as well as text deltas without a replay cursor", async () => {
    const { unmount } = renderHook(() => useSessionTrace("sess_thinking"));
    await flush();
    const streamCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/stream?"),
    )!;
    expect(
      new URL(String(streamCall[0]), "http://console.test").searchParams.getAll(
        "event_deltas[]",
      ),
    ).toEqual(["agent.message", "agent.thinking"]);
    expect(new Headers(streamCall[1]?.headers).has("Last-Event-ID")).toBe(
      false,
    );
    unmount();
  });

  it("uses the thread history and stream when a thread is selected", async () => {
    const { result, unmount } = renderHook(() =>
      useSessionTrace("sess_1", "sthr_1"),
    );
    await flush();
    expect(result.current.connection).toBe("live");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/platform/v1/sessions/sess_1/threads/sthr_1/events?limit=1000",
      "/api/platform/v1/sessions/sess_1/threads/sthr_1/stream?event_deltas[]=agent.message&event_deltas[]=agent.thinking",
      "/api/platform/v1/sessions/sess_1/threads/sthr_1/events?limit=1000",
    ]);
    unmount();
  });

  it("does not subscribe to a disabled child and clears the old trace when switching", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ id, enabled }) => useSessionTrace("sess_1", id, enabled),
      {
        initialProps: { id: "sthr_1", enabled: false },
      },
    );
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    seedPages = [{ data: [ev("alpha", "agent.message")] }];
    rerender({ id: "sthr_1", enabled: true });
    await flush();
    expect(result.current.trace.events[0].id).toBe("alpha");
    seedPages = [{ data: [ev("beta", "agent.message")] }];
    rerender({ id: "sthr_2", enabled: true });
    expect(result.current.trace.events).toEqual([]);
    await flush();
    expect(result.current.trace.events.map((event) => event.id)).toEqual([
      "beta",
    ]);
    unmount();
  });

  it("encodes a bookmarked thread ID so delimiters cannot change the requested route", async () => {
    const { unmount } = renderHook(() =>
      useSessionTrace("sess_1", "sthr_1/../other?x=1#frag"),
    );
    await flush();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/api/platform/v1/sessions/sess_1/threads/sthr_1%2F..%2Fother%3Fx%3D1%23frag/events?limit=1000",
      "/api/platform/v1/sessions/sess_1/threads/sthr_1%2F..%2Fother%3Fx%3D1%23frag/stream?event_deltas[]=agent.message&event_deltas[]=agent.thinking",
      "/api/platform/v1/sessions/sess_1/threads/sthr_1%2F..%2Fother%3Fx%3D1%23frag/events?limit=1000",
    ]);
    unmount();
  });

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
      "/api/platform/v1/sessions/sess_1/events/stream?event_deltas[]=agent.message&event_deltas[]=agent.thinking",
      "/api/platform/v1/sessions/sess_1/events?limit=1000&order=asc",
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
    streams[0].pushRaw("event: message\ndata: null\n\n");
    streams[0].push({ type: "event_start" });
    streams[0].push({
      type: "event_delta",
      event_id: "bad",
      delta: { type: "content_delta", index: -1 },
    });
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
    expect(fetchMock).toHaveBeenCalledTimes(3); // seed + stream + catch-up

    // Upstream closes without session.deleted — treated as a drop.
    streams[0].end();
    await flush();
    expect(result.current.connection).toBe("reconnecting");

    // Nothing before the 1s backoff elapses.
    streamFails = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // First retry: reseed + stream attach, which 502s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.current.connection).toBe("reconnecting");

    // Backoff doubled: 1s in is still waiting…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // …the second second completes the 2s wait and this attempt succeeds.
    streamFails = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(result.current.connection).toBe("live");

    // A live connection resets the backoff to 1s.
    streams[1].fail();
    await flush();
    expect(result.current.connection).toBe("reconnecting");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(11);
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
    expect(streams[0].signal?.aborted).toBe(true);
    await flush();
    expect(result.current.trace).toBe(before);

    // The aborted reader schedules no reconnect.
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
    expect(streams[0].signal?.aborted).toBe(true);
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // A dead console session is the one drop retrying cannot fix: every attempt
  // re-sends the same handle. Without this the trace would sit on "reconnecting"
  // at a 15s backoff while the real answer is that the operator is signed out.
  it("probe: stops retrying once the console session is gone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    signedOutFrom = 2; // initial seed + post-attach history, then session dies

    const { result, unmount } = renderHook(() => useSessionTrace("sess_out"));
    await flush();
    streams[0].end();
    await flush();

    expect(result.current.connection).toBe("reconnecting");
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await flush();
    // One reseed, which is refused; then the loop leaves rather than backing off.
    expect(fetchMock).toHaveBeenCalledTimes(calls + 1);
    expect(result.current.connection).toBe("closed");
    // The navigation itself is jsdom's to refuse (`location` is unforgeable, so
    // it cannot be intercepted here); what this asserts is the state the loop
    // actually reads. `signed-out.test.ts` covers the URL it goes to.
    expect(hasBouncedToLogin()).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(calls + 1);
    unmount();
  });

  // The narrow window the seed cannot cover: the session outlives the seed and
  // dies before the stream attaches, so the refusal arrives on a response the
  // `assertOk` path never sees.
  it("probe: reads the marker on the stream response too", async () => {
    streamSignedOut = true;

    const { result, unmount } = renderHook(() => useSessionTrace("sess_out2"));
    await flush();
    expect(result.current.connection).toBe("closed");
    expect(hasBouncedToLogin()).toBe(true);
    unmount();
  });
});
