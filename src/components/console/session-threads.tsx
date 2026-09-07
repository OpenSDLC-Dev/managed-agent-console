"use client";

import { Archive } from "lucide-react";
import { ConfirmIconButton } from "@/components/console/archive-button";
import {
  EmptyState,
  ErrorState,
  IdCode,
  ListSkeleton,
  StatusBadge,
} from "@/components/console/bits";
import { DetailSection } from "@/components/console/detail";
import { Button } from "@/components/ui/button";
import { PlatformError } from "@/lib/platform/http";
import { useArchiveSessionThread } from "@/lib/platform/queries";
import type { SessionThread } from "@/lib/platform/types";
import { durationLabel } from "@/lib/session-trace/timing";
import { cn, tokenCount } from "@/lib/utils";

export function SessionThreads({
  sessionId,
  threads,
  error,
  loading,
  selectedId,
  onSelect,
}: {
  sessionId: string;
  threads: SessionThread[];
  error: Error | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (threadId: string | null) => void;
}) {
  const archive = useArchiveSessionThread(sessionId);

  // Older wire-compatible deployments may serve sessions without the nested
  // threads route. The existing session remains usable in that case.
  if (error instanceof PlatformError && error.status === 404) return null;

  return (
    <DetailSection title="Threads" testId="session-threads">
      {error ? (
        <ErrorState error={error} />
      ) : loading ? (
        <ListSkeleton rows={2} />
      ) : threads.length === 0 ? (
        <EmptyState title="No threads" />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-auto w-full justify-start rounded-none border-b px-3 py-2 text-left",
              selectedId === null && "bg-secondary/60",
            )}
            aria-pressed={selectedId === null}
            onClick={() => onSelect(null)}
          >
            All threads
          </Button>
          <ol className="divide-y">
            {threads.map((thread) => {
              const primary = thread.parent_thread_id === null;
              return (
                <li
                  key={thread.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2",
                    selectedId === thread.id && "bg-secondary/60",
                  )}
                  data-thread-id={thread.id}
                  data-thread-status={thread.status}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-label={`${primary ? "Primary" : "Child"} thread ${thread.agent.name}`}
                    aria-pressed={selectedId === thread.id}
                    onClick={() => onSelect(thread.id)}
                  >
                    <span className="w-16 shrink-0 text-[12px] text-muted-foreground">
                      {primary ? "Primary" : "Child"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {thread.agent.name}
                    </span>
                    <span className="hidden font-mono text-[12px] text-muted-foreground lg:inline">
                      <IdCode id={thread.id} />
                    </span>
                    <StatusBadge status={thread.status} />
                    <span
                      className="w-24 shrink-0 text-right text-[12px] text-muted-foreground"
                      data-input-tokens={thread.usage.input_tokens}
                      data-output-tokens={thread.usage.output_tokens}
                    >
                      {tokenCount(thread.usage.input_tokens)} in ·{" "}
                      {tokenCount(thread.usage.output_tokens)} out
                    </span>
                    <span
                      className="w-14 shrink-0 text-right text-[12px] text-muted-foreground"
                      data-duration-seconds={thread.stats.duration_seconds}
                    >
                      {durationLabel(thread.stats.duration_seconds * 1000)}
                    </span>
                  </button>
                  {!primary &&
                    !thread.archived_at &&
                    thread.status === "idle" && (
                      <ConfirmIconButton
                        label={`Archive thread ${thread.agent.name}`}
                        title="Archive thread"
                        description="The child thread becomes terminated and cannot accept more work."
                        pending={archive.isPending}
                        onConfirm={() => archive.mutate(thread.id)}
                      >
                        <Archive className="size-4" />
                      </ConfirmIconButton>
                    )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </DetailSection>
  );
}
