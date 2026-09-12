"use client";

import Link from "next/link";
import type { SessionEvent, SessionThread } from "@/lib/platform/types";
import { tokenAttr, tokenCount } from "@/lib/utils";
import { Field, JsonBlock } from "./detail";
import { StatusBadge, Time } from "./bits";
import { CopyIdButton } from "./copy-id";
import { SessionUsageDetails } from "./session-workspace-views";

export function SessionThreadPreview({
  thread,
  events,
  onSelectEvent,
}: {
  thread: SessionThread;
  events: SessionEvent[];
  onSelectEvent: (id: string) => void;
}) {
  // domain/event.go:ModelUsage. These are per-request input counters, not context-size estimates.
  const requests = events.filter(
    (event) =>
      event.type === "span.model_request_end" &&
      typeof event.model_usage?.input_tokens === "number" &&
      Number.isFinite(event.model_usage.input_tokens),
  );
  const max = requests.reduce(
    (value, event) => Math.max(value, event.model_usage!.input_tokens),
    1,
  );
  const points = requests.map((event, index) => ({
    event,
    x: requests.length === 1 ? 160 : 8 + (index / (requests.length - 1)) * 304,
    y: 104 - (event.model_usage!.input_tokens / max) * 96,
  }));
  return (
    <section
      aria-label="Thread details"
      className="mt-4 min-w-0 space-y-4 border-t pt-3"
      data-inspected-thread-id={thread.id}
    >
      <h2 className="break-words text-sm font-medium">
        Thread {thread.agent.name}
      </h2>
      <dl className="grid grid-cols-[85px_minmax(0,1fr)] gap-y-2 text-xs">
        <Field label="Agent">
          <Link
            className="break-words hover:underline"
            href={`/agents/${encodeURIComponent(thread.agent.id)}?version=${thread.agent.version}`}
          >
            {thread.agent.name} · v{thread.agent.version}
          </Link>
        </Field>
        <Field label="Model">
          <code className="break-all">{thread.agent.model.id}</code>
        </Field>
        <Field label="Status">
          <StatusBadge status={thread.status} />
        </Field>
        <Field label="Thread ID">
          <span className="inline-flex min-w-0 items-center gap-1">
            <code className="break-all">{thread.id}</code>
            <CopyIdButton id={thread.id} />
          </span>
        </Field>
        <Field label="Created">
          <Time iso={thread.created_at} />
        </Field>
      </dl>
      <figure
        className="space-y-2"
        aria-label="Input tokens at each model request"
      >
        <figcaption className="text-sm font-medium">
          Input tokens per request
        </figcaption>
        {points.length ? (
          <>
            <div className="flex gap-2">
              <div className="flex w-12 shrink-0 flex-col justify-between text-right text-xs text-muted-foreground">
                <span data-axis-max={tokenAttr(max)}>{tokenCount(max)}</span>
                <span>0</span>
              </div>
              <svg
                role="img"
                aria-label="Input tokens at each model request"
                viewBox="0 0 320 112"
                className="h-28 min-w-0 flex-1 rounded-md bg-muted/40"
                preserveAspectRatio="none"
              >
                <path
                  d="M 0 104 H 320"
                  stroke="currentColor"
                  className="text-border"
                />
                <polyline
                  points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-muted-foreground"
                />
                {points.map(({ event, x, y }) => (
                  <circle
                    key={event.id}
                    cx={x}
                    cy={y}
                    r="3"
                    fill="currentColor"
                    className="text-muted-foreground"
                  >
                    <title>{`${event.processed_at ?? "Unstamped"}: ${event.model_usage!.input_tokens} input tokens`}</title>
                  </circle>
                ))}
              </svg>
            </div>
            <details>
              <summary className="cursor-pointer text-xs">
                Inspect model requests
              </summary>
              <ol className="max-h-48 overflow-y-auto divide-y">
                {requests.map((event) => (
                  <li key={event.id}>
                    <button
                      className="flex w-full justify-between gap-2 rounded-md px-1 py-2 text-left text-xs hover:bg-secondary"
                      onClick={() => onSelectEvent(event.id)}
                      data-event-id={event.id}
                      data-input-tokens={tokenAttr(
                        event.model_usage!.input_tokens,
                      )}
                    >
                      <Time iso={event.processed_at} />
                      <span>{tokenCount(event.model_usage!.input_tokens)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </details>
            <p className="text-xs text-muted-foreground">
              Request order in the loaded thread view.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            No model usage in the loaded thread view.
          </p>
        )}
      </figure>
      <SessionUsageDetails usage={thread.usage} />
      <details>
        <summary className="cursor-pointer text-sm">
          Thread API response
        </summary>
        <JsonBlock value={thread} />
      </details>
    </section>
  );
}
