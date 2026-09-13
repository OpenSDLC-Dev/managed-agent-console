"use client";
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  StatusBadge,
} from "@/components/console/bits";
import { DetailSection } from "@/components/console/detail";
import { PlatformError } from "@/lib/platform/http";
import type { SessionThread } from "@/lib/platform/types";
import { cn, tokenCount } from "@/lib/utils";
export function SessionThreads({
  threads,
  error,
  loading,
  selectedId,
  onSelect,
}: {
  threads: SessionThread[];
  error: Error | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (threadId: string | null) => void;
}) {
  if (error instanceof PlatformError && [404, 501].includes(error.status))
    return null;
  return (
    <DetailSection title="Threads" testId="session-threads">
      {error ? (
        <ErrorState error={error} />
      ) : loading ? (
        <ListSkeleton rows={2} />
      ) : !threads.length ? (
        <EmptyState title="No threads" />
      ) : (
        <table className="w-full table-fixed text-xs">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="w-[42%] py-2 font-normal">Thread</th>
              <th className="w-[25%] font-normal">Status</th>
              <th className="text-right font-normal">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {threads.map((thread) => {
              const primary = thread.parent_thread_id === null;
              const selected =
                selectedId === thread.id || (selectedId === null && primary);
              return (
                <tr
                  key={thread.id}
                  className={cn("border-b", selected && "bg-secondary/60")}
                  data-thread-id={thread.id}
                  data-thread-status={thread.status}
                  data-selected={selected}
                >
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      className="w-full truncate rounded-sm px-1 py-1 text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${primary ? "Primary" : "Child"} thread ${thread.agent.name}`}
                      aria-pressed={selected}
                      onClick={() => onSelect(primary ? null : thread.id)}
                    >
                      {thread.agent.name}
                    </button>
                  </td>
                  <td>
                    <StatusBadge status={thread.status} />
                  </td>
                  <td
                    className="text-right text-muted-foreground"
                    data-input-tokens={thread.usage.input_tokens}
                    data-output-tokens={thread.usage.output_tokens}
                  >
                    <span className="block">
                      {tokenCount(thread.usage.input_tokens)} in
                    </span>
                    <span>{tokenCount(thread.usage.output_tokens)} out</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </DetailSection>
  );
}
