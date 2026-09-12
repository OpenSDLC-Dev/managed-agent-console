"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, tokenAttr } from "@/lib/utils";
import { copyText } from "@/lib/copy-text";
import type { ContentBlock, SessionEvent } from "@/lib/platform/types";
import { Time, WARNING_BOX } from "@/components/console/bits";
import { JsonBlock } from "@/components/console/detail";
import { durationLabel } from "@/lib/session-trace/timing";
import {
  isKnownEventType,
  summaryOf,
  tokensLine,
} from "@/lib/session-trace/summary";

function TypeBadge({ type }: { type: string }) {
  const domain = type.split(".")[0];
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 font-mono text-[11px] font-normal",
        domain === "agent" && "bg-secondary",
        domain === "session" && "text-muted-foreground",
        domain === "span" && "border-dashed text-muted-foreground",
      )}
    >
      {type}
    </Badge>
  );
}

function MetaColumn({
  offset,
  durationMs,
}: {
  offset?: string | null;
  durationMs?: number;
}) {
  if (!offset && durationMs === undefined) return null;
  return (
    <div className="shrink-0 self-start text-right text-[12px] tabular-nums text-muted-foreground">
      {durationMs !== undefined && (
        <span title="model request duration" data-duration-ms={durationMs}>
          {durationLabel(durationMs)}
        </span>
      )}
      {durationMs !== undefined && offset && " · "}
      {offset && <span title="since session creation">{offset}</span>}
    </div>
  );
}

/**
 * Machine-readable token counters for the surfaces that also render them as a
 * formatted string (the `data-*` state convention — see CLAUDE.md). Absent
 * when the event carries no usage, so `[data-input-tokens]` selects exactly
 * the rows that have one.
 */
function usageAttrs(event: SessionEvent) {
  const usage = event.model_usage ?? event.usage;
  if (!usage) return undefined;
  return {
    "data-input-tokens": tokenAttr(usage.input_tokens),
    "data-output-tokens": tokenAttr(usage.output_tokens),
    "data-cache-read-tokens": tokenAttr(usage.cache_read_input_tokens),
  };
}

/**
 * One-line transcript row (plan 03 slice 3): type badge, single-line
 * summary, right-aligned timing. Clicking opens the detail panel — the
 * full content lives there, never clamped away.
 */
export function TranscriptRow({
  event,
  offset,
  durationMs,
  selected,
  approvalPending = false,
  onSelect,
}: {
  event: SessionEvent;
  offset?: string | null;
  durationMs?: number;
  selected?: boolean;
  approvalPending?: boolean;
  onSelect?: () => void;
}) {
  const summary = summaryOf(event);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      data-testid="event-row"
      data-event-type={event.type}
      {...usageAttrs(event)}
      className={cn(
        "flex w-full items-center gap-3 border-b px-1 py-2.5 text-left last:border-b-0 hover:bg-secondary/40",
        selected && "bg-secondary/60",
      )}
    >
      <div className="w-36 shrink-0 text-[12px] text-muted-foreground">
        <Time iso={event.processed_at} />
      </div>
      <div className="w-52 shrink-0">
        <TypeBadge type={event.type} />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "truncate text-[13px]",
            event.type === "agent.thinking" && "italic text-muted-foreground",
            !isKnownEventType(event.type) &&
              "font-mono text-[12px] text-muted-foreground",
          )}
          data-testid={
            isKnownEventType(event.type) ? undefined : "unknown-event-payload"
          }
        >
          {summary}
        </span>
        {event.session_thread_id && (
          <Badge
            variant="outline"
            className="shrink-0 font-mono text-[11px] font-normal text-muted-foreground"
            title={event.session_thread_id}
          >
            {event.agent_name ?? event.session_thread_id}
          </Badge>
        )}
        {approvalPending && (
          <Badge className={cn("shrink-0", WARNING_BOX)} variant="outline">
            needs approval
          </Badge>
        )}
        {event.is_error === true && (
          <Badge variant="outline" className="shrink-0 text-destructive">
            error
          </Badge>
        )}
      </div>
      <MetaColumn offset={offset} durationMs={durationMs} />
    </button>
  );
}

/** Readable message/tool cards keep inspection separate from approval buttons. */
export function TranscriptCard({
  event,
  actor,
  selected,
  offset,
  durationMs,
  onSelect,
  approval,
}: {
  event: SessionEvent;
  actor: string;
  selected?: boolean;
  offset?: string | null;
  durationMs?: number;
  onSelect: () => void;
  approval?: ReactNode;
}) {
  const content = event.content as ContentBlock[] | null | undefined;
  const message =
    event.type === "user.message" || event.type === "agent.message";
  const tool = event.input !== undefined || event.type.includes("tool_result");
  const conversational = message || tool || event.type === "agent.thinking";
  if (!conversational) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        data-testid="event-row"
        data-event-type={event.type}
        data-event-id={event.id}
        {...usageAttrs(event)}
        className={cn(
          "flex w-full flex-wrap items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-secondary",
          selected && "bg-secondary",
        )}
      >
        <TypeBadge type={event.type} />
        <span
          className="min-w-0 flex-1 break-words"
          data-testid={
            isKnownEventType(event.type) ? undefined : "unknown-event-payload"
          }
        >
          {summaryOf(event)}
        </span>
        <MetaColumn offset={offset} durationMs={durationMs} />
      </button>
    );
  }
  const command =
    event.name === "bash" &&
    typeof event.input === "object" &&
    event.input !== null &&
    "command" in event.input &&
    typeof event.input.command === "string"
      ? event.input.command
      : undefined;
  return (
    <article
      data-testid="event-row"
      data-event-type={event.type}
      data-event-id={event.id}
      {...usageAttrs(event)}
      className="min-w-0 py-1.5"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-foreground",
            event.type === "user.message"
              ? "bg-pink-100 dark:bg-pink-950"
              : "bg-secondary",
          )}
        >
          {event.type.startsWith("user.")
            ? "User"
            : event.type.startsWith("agent.")
              ? (event.agent_name ?? actor)
              : event.type.startsWith("span.")
                ? "Model"
                : "Session"}
        </span>
        <Time iso={event.processed_at} />
        <MetaColumn offset={offset} durationMs={durationMs} />
      </div>
      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-card",
          selected && "ring-1 ring-ring",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-expanded={selected}
          className="block w-full space-y-2 p-3 text-left text-sm hover:bg-secondary/30"
        >
          <span
            className={cn(
              "block break-all font-mono text-xs text-muted-foreground",
              message && "sr-only",
            )}
          >
            {event.type}
          </span>
          {event.name !== undefined && (
            <span className="block font-medium">{String(event.name)}</span>
          )}
          {event.input !== undefined && (
            <span className="block whitespace-pre-wrap break-all rounded-md bg-secondary p-2 font-mono text-xs">
              {command !== undefined
                ? "$ " + command
                : JSON.stringify(event.input, null, 2)}
            </span>
          )}
          {content?.map((block, index) => (
            <span
              key={index}
              className={cn(
                "block whitespace-pre-wrap break-words",
                tool && "rounded-md bg-secondary p-2 font-mono text-xs",
                event.is_error === true && "bg-destructive/10 text-destructive",
              )}
            >
              {block.type === "text"
                ? (block.text ?? "")
                : JSON.stringify(block, null, 2)}
            </span>
          ))}
          {!content?.length && event.input === undefined && (
            <span
              className="block whitespace-pre-wrap break-words"
              data-testid={
                isKnownEventType(event.type)
                  ? undefined
                  : "unknown-event-payload"
              }
            >
              {summaryOf(event)}
            </span>
          )}
          {event.is_error === true && (
            <span className="block text-xs text-destructive">error</span>
          )}
        </button>
        {approval && <div className="px-3 pb-3">{approval}</div>}
      </div>
    </article>
  );
}

/** Debug view: every event verbatim — the wire is the truth. */
export function DebugRow({ event }: { event: SessionEvent }) {
  return (
    <div
      className="border-b py-2.5 last:border-b-0"
      data-testid="debug-row"
      data-event-type={event.type}
    >
      <div className="flex items-center gap-3">
        <div className="w-36 shrink-0 text-[12px] text-muted-foreground">
          <Time iso={event.processed_at} />
        </div>
        <TypeBadge type={event.type} />
      </div>
      <pre className="mt-1.5 overflow-x-auto rounded-md border bg-card p-2 font-mono text-[12px] leading-relaxed">
        {JSON.stringify(event, null, 2)}
      </pre>
    </div>
  );
}

function CopyJsonButton({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-muted-foreground"
      onClick={() => {
        void copyText(JSON.stringify(value, null, 2)).then((ok) => {
          if (!ok) return;
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy JSON"}
    </Button>
  );
}

/**
 * Master-detail panel: the selected event in full — content blocks
 * untruncated and scrollable, tool input as JSON, the raw event verbatim.
 */
export function EventDetailPanel({
  event,
  offset,
  durationMs,
  approvalPending = false,
  onClose,
}: {
  event: SessionEvent;
  offset?: string | null;
  durationMs?: number;
  approvalPending?: boolean;
  onClose: () => void;
}) {
  const content = event.content as ContentBlock[] | null | undefined;
  const tokens = tokensLine(event);
  const summary = summaryOf(event);
  return (
    <aside
      data-testid="event-detail"
      data-event-type={event.type}
      {...usageAttrs(event)}
      aria-label="Event details"
      className="sticky top-4 max-h-[75vh] self-start overflow-y-auto rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <TypeBadge type={event.type} />
        <span className="whitespace-nowrap text-[12px] text-muted-foreground">
          <Time iso={event.processed_at} />
        </span>
        <MetaColumn offset={offset} durationMs={durationMs} />
        <span className="ml-auto flex items-center gap-1">
          <CopyJsonButton value={event} />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            aria-label="Close event details"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </span>
      </div>
      {approvalPending && (
        <Badge className={cn("mb-2", WARNING_BOX)} variant="outline">
          needs approval
        </Badge>
      )}
      {event.is_error === true && (
        <Badge variant="outline" className="mb-2 ml-1 text-destructive">
          error
        </Badge>
      )}
      {event.name !== undefined && (
        <p className="pb-2 font-mono text-[13px]">{String(event.name)}</p>
      )}
      {content?.map((block, index) =>
        block.type === "text" ? (
          <pre
            key={index}
            className="mb-2 whitespace-pre-wrap rounded-md border bg-background p-2.5 font-sans text-[13px]"
          >
            {block.text ?? ""}
          </pre>
        ) : (
          <div key={index} className="mb-2">
            <p className="pb-1 text-[12px] text-muted-foreground">
              [{block.type}]
            </p>
            <JsonBlock value={block} />
          </div>
        ),
      )}
      {event.input !== undefined && (
        <section className="pb-2">
          <h3 className="pb-1 text-[12px] font-medium text-muted-foreground">
            Input
          </h3>
          <JsonBlock value={event.input} />
        </section>
      )}
      {tokens && (
        <p className="pb-2 text-[13px] text-muted-foreground">{tokens}</p>
      )}
      {!content && event.input === undefined && !tokens && summary && (
        <p className="pb-2 text-[13px]">{summary}</p>
      )}
      <details>
        <summary className="cursor-pointer text-[12px] text-muted-foreground">
          Raw event
        </summary>
        <div className="pt-1.5">
          <JsonBlock value={event} />
        </div>
      </details>
    </aside>
  );
}

/** Full-width divider making a real idle interval visible in the story. */
export function IdleBand({ ms }: { ms: number }) {
  return (
    <div
      className="flex items-center justify-center gap-2 border-b py-1.5 text-[12px] text-muted-foreground last:border-b-0"
      data-testid="idle-band"
      data-idle-ms={ms}
    >
      Session idle · {durationLabel(ms)}
    </div>
  );
}
