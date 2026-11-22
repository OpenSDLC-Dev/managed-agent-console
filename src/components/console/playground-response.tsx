import { Popover } from "@base-ui/react/popover";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/copy-text";
import type { PlaygroundReply } from "@/lib/platform/playground";
import { MemoryMarkdown as MarkdownContent } from "./memory-markdown";
import { PlaygroundViewSwitch } from "./playground-view-switch";

export type RunStatus = "idle" | "running" | "complete" | "stopped" | "failed";
const labels = {
  running: "Generating…",
  complete: "Response complete",
  stopped: "Stopped",
  failed: "Failed",
};

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
  error,
  reply,
  onAdd,
  modifier,
}: {
  status: Exclude<RunStatus, "idle">;
  text: string;
  error?: string;
  reply?: PlaygroundReply;
  onAdd: () => void;
  modifier: string;
}) {
  const [view, setView] = useState<"Rendered" | "Raw">("Rendered");
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
            <div aria-busy={status === "running"} className="mt-3">
              <MarkdownContent content={text} />
              {!text && reply?.content?.length ? (
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
              <code>{reply.raw}</code>
            </pre>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            The response body is available when the request completes.
          </p>
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
