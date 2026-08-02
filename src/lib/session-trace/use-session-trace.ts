"use client";

import { useEffect, useRef, useState } from "react";
import { platformGet, type Page } from "@/lib/platform/http";
import type { SessionEvent } from "@/lib/platform/types";
import { parseSseStream } from "./sse";
import {
  applyFrame,
  applyPersisted,
  emptyTrace,
  type TraceState,
} from "./store";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "closed";

/**
 * Live session trace: seed the full history (the stream has no replay —
 * docs/plan/01 § Ground truth), attach the proxied SSE stream with
 * agent.message deltas, reconcile through the trace store, and reconnect
 * with backoff, reseeding to cover the gap.
 */
export function useSessionTrace(sessionId: string) {
  const [trace, setTrace] = useState<TraceState>(emptyTrace);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  // The store is also read/written inside the stream loop between renders.
  const traceRef = useRef<TraceState>(trace);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    traceRef.current = emptyTrace();
    setTrace(traceRef.current);

    const update = (next: TraceState) => {
      if (next !== traceRef.current && !cancelled) {
        traceRef.current = next;
        setTrace(next);
      }
    };

    async function seed() {
      let page: string | undefined;
      for (;;) {
        const result = await platformGet<Page<SessionEvent>>(
          `v1/sessions/${sessionId}/events`,
          { limit: 1000, order: "asc", page },
        );
        update(applyPersisted(traceRef.current, result.data));
        if (!result.next_page) return;
        page = result.next_page;
      }
    }

    async function run() {
      let backoff = 1_000;
      while (!cancelled) {
        try {
          await seed();
          const response = await fetch(
            `/api/platform/v1/sessions/${sessionId}/events/stream?event_deltas[]=agent.message`,
            {
              signal: controller.signal,
              headers: { accept: "text/event-stream" },
            },
          );
          if (!response.ok || !response.body) {
            throw new Error(`stream failed: HTTP ${response.status}`);
          }
          if (!cancelled) setConnection("live");
          backoff = 1_000;
          for await (const frame of parseSseStream(response.body)) {
            let data: unknown;
            try {
              data = JSON.parse(frame.data);
            } catch {
              continue;
            }
            update(applyFrame(traceRef.current, data));
            if (traceRef.current.deleted) {
              if (!cancelled) setConnection("closed");
              return;
            }
          }
          // Upstream closed without session.deleted — treat as a drop.
          throw new Error("stream ended");
        } catch {
          if (cancelled || controller.signal.aborted) return;
          setConnection("reconnecting");
          await new Promise((resolve) => setTimeout(resolve, backoff));
          backoff = Math.min(backoff * 2, 15_000);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionId]);

  return { trace, connection };
}
