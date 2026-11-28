import { SyntaxCode } from "./syntax-code";
import { Popover } from "@base-ui/react/popover";
import { ChevronRight, Copy, Wrench } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/copy-text";
import type {
  PlaygroundBlock,
  PlaygroundReply,
  PlaygroundToolDelta,
} from "@/lib/platform/playground";
import { MemoryMarkdown as MarkdownContent } from "./memory-markdown";
import { isToolUse } from "./playground-tool-calls";
import { PlaygroundViewSwitch } from "./playground-view-switch";

export type RunStatus = "idle" | "running" | "complete" | "stopped" | "failed";
const labels = {
  running: "Generating…",
  complete: "Response complete",
  stopped: "Stopped",
  failed: "Failed",
};

export type ToolInputPreview = {
  index: number;
  name: string;
  tail: string;
  clipped: boolean;
};

export function previewToolInput(
  previous: ToolInputPreview[],
  { index, name, fragment }: PlaygroundToolDelta,
) {
  // The gateway reader already assembles the full input. Keep only a bounded
  // display tail for each of the most recent calls while it is in flight.
  const maxLength = 4096;
  const maxCalls = 8;
  const at = previous.findIndex((tool) => tool.index === index);
  const prior = previous[at];
  const combined =
    fragment.length >= maxLength
      ? fragment.slice(-maxLength)
      : (prior?.tail ?? "") + fragment;
  const tool = {
    index,
    name,
    tail: combined.slice(-maxLength),
    clipped:
      Boolean(prior?.clipped) ||
      (prior?.tail.length ?? 0) + fragment.length > maxLength,
  };
  if (at === -1) return [...previous.slice(1 - maxCalls), tool];
  const updated = previous.slice();
  updated[at] = tool;
  return updated;
}

function StreamingInput({ index, name, tail, clipped }: ToolInputPreview) {
  const output = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    if (output.current && follow.current)
      output.current.scrollTop = output.current.scrollHeight;
  }, [tail]);
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <span className="font-mono text-xs font-medium">{name}</span>
      <pre
        ref={output}
        aria-label={`Input for ${name}, block ${index + 1}`}
        className="mt-1 max-h-64 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]"
        tabIndex={0}
        onScroll={({ currentTarget: element }) => {
          follow.current =
            element.scrollTop + element.clientHeight >=
            element.scrollHeight - 1;
        }}
      >
        {clipped && "…"}
        <SyntaxCode language="json">{tail}</SyntaxCode>
      </pre>
    </div>
  );
}

function isServerResult(block: PlaygroundBlock) {
  return (
    block.type.endsWith("_tool_result") && typeof block.tool_use_id === "string"
  );
}

function groupResponseText(blocks: PlaygroundBlock[]) {
  // Providers can split a sentence or Markdown delimiter across text blocks.
  const parts: (string | PlaygroundBlock)[] = [];
  for (const block of blocks) {
    if (block.type !== "text" || typeof block.text !== "string") {
      parts.push(block);
      continue;
    }
    const previous = parts.at(-1);
    if (typeof previous === "string")
      parts[parts.length - 1] = previous + block.text;
    else parts.push(block.text);
  }
  return parts;
}

function ToolBlockCard({
  block,
  name,
}: {
  block: PlaygroundBlock;
  name: string;
}) {
  const result = isServerResult(block);
  const label = result
    ? "Server tool result"
    : block.type === "server_tool_use"
      ? "Server tool use"
      : "Tool use";
  const [open, setOpen] = useState(true);
  const details = useId();
  return (
    <div
      data-block-type={block.type}
      data-tool-use-id={result ? undefined : String(block.id)}
      data-server-tool-result-id={
        result ? String(block.tool_use_id) : undefined
      }
      className="rounded-lg border"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${label} ${name}`}
        aria-controls={details}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Wrench aria-hidden className="size-3.5 text-muted-foreground" />
        <span>{label}</span>
        <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs">
          {name}
        </code>
        <ChevronRight
          aria-hidden
          className={`ml-auto size-3.5 ${open ? "rotate-90" : ""}`}
        />
      </button>
      <pre
        id={details}
        hidden={!open}
        tabIndex={0}
        className="max-h-72 overflow-auto border-t p-3 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]"
      >
        {open && (
          <>
            {!result && name + "("}
            <span aria-label={`${result ? "Result" : "Arguments"} for ${name}`}>
              <SyntaxCode language="json">
                {JSON.stringify(result ? block.content : block.input, null, 2)}
              </SyntaxCode>
            </span>
            {!result && ")"}
          </>
        )}
      </pre>
    </div>
  );
}

function Metric({ label, detail }: { label: string; detail: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        aria-label={detail}
        className="rounded px-1 py-1 text-xs hover:bg-muted"
      >
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="end"
          sideOffset={5}
          className="z-40"
        >
          <Popover.Popup className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm">
            {detail}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function PlaygroundResponse({
  status,
  text,
  toolInputs,
  error,
  reply,
  onAdd,
  modifier,
}: {
  status: Exclude<RunStatus, "idle">;
  text: string;
  toolInputs: ToolInputPreview[];
  error?: string;
  reply?: PlaygroundReply;
  onAdd: () => void;
  modifier: string;
}) {
  const [view, setView] = useState<"Rendered" | "Raw">("Rendered");
  const blocks = reply?.content;
  const names = new Map(
    blocks?.filter(isToolUse).map((block) => [block.id, block.name]),
  );
  const hasOtherBlocks = blocks?.some(
    (block) =>
      block.type !== "text" && !isToolUse(block) && !isServerResult(block),
  );
  const input = reply?.inputTokens?.toLocaleString("en-US") ?? "—";
  const output = reply?.outputTokens?.toLocaleString("en-US") ?? "—";
  const seconds = reply && (reply.durationMs / 1000).toFixed(1);
  return (
    <>
      <div className="flex h-[50px] shrink-0 items-center justify-between gap-2 border-b px-5">
        <h2 className="text-sm font-semibold">See your response</h2>
        <PlaygroundViewSwitch
          label="Response view"
          value={view}
          options={["Rendered", "Raw"] as const}
          onChange={setView}
        />
      </div>
      <div className="min-h-28 flex-1 overflow-auto px-5 py-4 lg:min-h-0">
        <span
          role="status"
          data-run-status={status}
          className={
            status === "complete"
              ? "sr-only"
              : "mb-2 block text-xs text-muted-foreground"
          }
        >
          {labels[status]}
        </span>
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {view === "Rendered" ? (
          <>
            <span className="inline-block rounded bg-muted/70 px-2 py-0.5 text-xs text-muted-foreground">
              assistant
            </span>
            <div aria-busy={status === "running"} className="mt-3 space-y-3">
              {blocks ? (
                groupResponseText(blocks).map((block, index) => {
                  if (typeof block === "string")
                    return <MarkdownContent key={index} content={block} />;
                  if (isToolUse(block))
                    return (
                      <ToolBlockCard
                        key={block.id + ":" + index}
                        block={block}
                        name={block.name}
                      />
                    );
                  if (isServerResult(block))
                    return (
                      <ToolBlockCard
                        key={index}
                        block={block}
                        name={
                          names.get(String(block.tool_use_id)) ?? block.type
                        }
                      />
                    );
                  return null;
                })
              ) : (
                <MarkdownContent content={text} />
              )}
              {hasOtherBlocks ? (
                <button
                  type="button"
                  className="rounded-sm text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setView("Raw")}
                >
                  View content blocks in Raw
                </button>
              ) : null}
            </div>
          </>
        ) : reply ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">{reply.rawLabel}</h3>
              <Button
                variant="ghost"
                type="button"
                size="icon-sm"
                aria-label="Copy response"
                onClick={async () => {
                  if (await copyText(reply.raw))
                    toast.success("Response copied.");
                  else toast.error("Could not copy response.");
                }}
              >
                <Copy />
              </Button>
            </div>
            <pre
              aria-label={reply.rawLabel}
              className="overflow-x-auto rounded-lg bg-muted/40 p-3 font-mono text-xs leading-5"
              tabIndex={0}
            >
              <SyntaxCode
                language={
                  reply.rawLabel === "Response body" ? "json" : undefined
                }
              >
                {reply.raw}
              </SyntaxCode>
            </pre>
          </>
        ) : status === "running" && !toolInputs.length ? (
          <p className="text-sm text-muted-foreground">
            The response body is available when the request completes.
          </p>
        ) : null}
        {status === "running" && toolInputs.length > 0 && (
          <section aria-label="Streaming tool input" className="mt-3 space-y-2">
            <h3 className="text-sm font-medium">Streaming tool input</h3>
            {toolInputs.map((tool) => (
              <StreamingInput key={tool.index} {...tool} />
            ))}
          </section>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-5 py-2">
        <Button
          type="button"
          size="sm"
          aria-label="Add to messages"
          aria-keyshortcuts="Shift+Meta+Enter Shift+Control+Enter"
          disabled={status !== "complete" || !reply?.content?.length}
          title={
            reply?.rawLabel === "Stream events"
              ? "Inspect the original stream in Raw to continue this response."
              : undefined
          }
          onClick={onAdd}
        >
          Add to messages{" "}
          <kbd
            aria-hidden
            className="ml-1 rounded bg-background/20 px-1 font-mono text-xs"
          >
            ⇧ {modifier} ↵
          </kbd>
        </Button>
        {reply && (
          <div
            className="flex items-center gap-1 text-muted-foreground"
            data-input-tokens={reply.inputTokens}
            data-output-tokens={reply.outputTokens}
            data-duration-ms={Math.round(reply.durationMs)}
          >
            {(reply.inputTokens !== undefined ||
              reply.outputTokens !== undefined) && (
              <Metric
                label={`${input} in → ${output} out`}
                detail={`Token usage: ${input} input, ${output} output.`}
              />
            )}
            <Metric
              label={`${seconds}s`}
              detail={`Request duration: ${seconds} seconds.`}
            />
          </div>
        )}
      </div>
    </>
  );
}
