"use client";

import { useEffect, useRef, useState } from "react";
import {
  bounceToLogin,
  hasBouncedToLogin,
  isSignedOut,
} from "@/lib/identity/signed-out";
import { platformGet, PlatformError, type Page } from "@/lib/platform/http";
import type { SessionEvent } from "@/lib/platform/types";
import { parseSseStream } from "./sse";
import {
  applyFrame,
  applyPersisted,
  clearPreviews,
  emptyTrace,
  type TraceState,
} from "./store";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "closed";

/**
 * Live session trace: seed the full history (the stream has no replay —
 * docs/plan/01 § Ground truth), attach the proxied SSE stream with
 * message/thinking previews, then read history again AFTER attachment. The
 * live-only tail cannot cover commits between the first seed and subscription.
 * Buffer stream bytes until catch-up completes so history stays in log order.
 */
export function useSessionTrace(
  sessionId: string,
  threadId?: string,
  enabled = true,
) {
  const scope = `${sessionId}/${threadId ?? ""}`;
  const [loadedScope, setLoadedScope] = useState(scope);
  const [trace, setTrace] = useState<TraceState>(emptyTrace);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  // The store is also read/written inside the stream loop between renders.
  const traceRef = useRef<TraceState>(trace);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let finishWait: (() => void) | undefined;
    traceRef.current = emptyTrace();
    setTrace(traceRef.current);
    setConnection("connecting");
    setLoadedScope(scope);
    if (!enabled) return;

    const update = (next: TraceState) => {
      if (next !== traceRef.current && !cancelled) {
        traceRef.current = next;
        setTrace(next);
      }
    };

    const waitForRetry = (ms: number) =>
      new Promise<void>((resolve) => {
        finishWait = resolve;
        retryTimer = setTimeout(resolve, ms);
      });

    async function seed(signal: AbortSignal) {
      let page: string | undefined;
      for (;;) {
        const eventPath = threadId
          ? `v1/sessions/${encodeURIComponent(sessionId)}/threads/${encodeURIComponent(threadId)}/events`
          : `v1/sessions/${encodeURIComponent(sessionId)}/events`;
        const result = await platformGet<Page<SessionEvent>>(
          eventPath,
          {
            limit: 1000,
            // api/threads.go: thread histories are ascending and reject order.
            ...(threadId ? {} : { order: "asc" }),
            page,
          },
          signal,
        );
        if (cancelled) return;
        update(applyPersisted(traceRef.current, result.data));
        if (!result.next_page) return;
        page = result.next_page;
      }
    }

    async function run() {
      let backoff = 1_000;
      while (!cancelled) {
        controller = new AbortController();
        let response: Response | undefined;
        try {
          await seed(controller.signal);
          if (cancelled) return;
          const streamPath = threadId
            ? `/api/platform/v1/sessions/${encodeURIComponent(sessionId)}/threads/${encodeURIComponent(threadId)}/stream`
            : `/api/platform/v1/sessions/${encodeURIComponent(sessionId)}/events/stream`;
          response = await fetch(
            `${streamPath}?event_deltas[]=agent.message&event_deltas[]=agent.thinking`,
            {
              signal: controller.signal,
              headers: { accept: "text/event-stream" },
            },
          );
          if (cancelled) return;
          // A dead console session is the one failure reconnecting cannot fix:
          // every retry re-sends the same handle, so the backoff would climb to
          // 15s and sit there saying "reconnecting" while the real answer is
          // that the operator has been signed out. Leave the loop and say so.
          if (isSignedOut(response)) {
            bounceToLogin();
            if (!cancelled) setConnection("closed");
            return;
          }
          if (!response.ok || !response.body) {
            throw new Error(`stream failed: HTTP ${response.status}`);
          }
          // A catch-up failure must not throw away live-only terminal bytes.
          // Retry transient history failures on this SAME attached stream.
          // Deletion makes history 404; consume the valid tail's deletion frame
          // instead of trying to open a new stream on a now-missing Session.
          while (!cancelled) {
            try {
              await seed(controller.signal);
              break;
            } catch (error) {
              if (cancelled || hasBouncedToLogin()) throw error;
              if (error instanceof PlatformError) {
                if (error.status === 404) break;
                if (error.status < 500) throw error;
              }
              setConnection("reconnecting");
              await waitForRetry(backoff);
              backoff = Math.min(backoff * 2, 15_000);
            }
          }
          if (cancelled) return;
          setConnection("live");
          backoff = 1_000;
          for await (const frame of parseSseStream(response.body)) {
            if (cancelled) return;
            let data: unknown;
            try {
              data = JSON.parse(frame.data);
            } catch {
              continue;
            }
            update(applyFrame(traceRef.current, data));
            // A stopped/aborted turn may never persist its previews. Child
            // status fan-out on the parent must not clear the parent's reply.
            const type = (data as { type?: string } | null)?.type;
            const prefix = threadId
              ? "session.thread_status_"
              : "session.status_";
            if (
              ["idle", "rescheduled", "terminated"].some(
                (status) => type === prefix + status,
              )
            ) {
              update(clearPreviews(traceRef.current));
            }
            if (traceRef.current.deleted) {
              if (!cancelled) setConnection("closed");
              return;
            }
          }
          // Upstream closed without session.deleted — treat as a drop.
          throw new Error("stream ended");
        } catch {
          if (cancelled || controller.signal.aborted) return;
          controller.abort();
          update(clearPreviews(traceRef.current));
          // The seed above goes through `assertOk`, which bounces on its own —
          // so by the time a signed-out failure lands here the navigation has
          // already started, and what is left to do is stop retrying.
          if (hasBouncedToLogin()) {
            setConnection("closed");
            return;
          }
          setConnection("reconnecting");
          await waitForRetry(backoff);
          backoff = Math.min(backoff * 2, 15_000);
        } finally {
          controller.abort();
          if (response?.body && !response.body.locked) {
            await response.body.cancel().catch(() => undefined);
          }
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(retryTimer);
      finishWait?.();
    };
  }, [sessionId, threadId, enabled, scope]);

  // A URL switch must never paint the previous child's events under a new name.
  return loadedScope === scope
    ? { trace, connection }
    : { trace: emptyTrace(), connection: "connecting" as const };
}
