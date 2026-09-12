"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { copyText } from "@/lib/copy-text";
import { Copy, FileText, Pencil } from "lucide-react";
import { useListFilters } from "@/lib/use-list-filters";
import {
  useDeleteMemory,
  useMemory,
  useUpdateMemory,
} from "@/lib/platform/queries";
import type { Memory } from "@/lib/platform/types";
import {
  useLeaveConfirmation,
  useUnsavedChanges,
} from "@/components/shell/unsaved-changes";
import { Button } from "@/components/ui/button";
import { MemoryTree } from "./memory-tree";
import { DetailSkeleton, ErrorState, Time } from "./bits";
import { CopyIdButton } from "./copy-id";
import { ResourceActions } from "./resource-actions";
import { SchemaTextarea } from "./schema-textarea";

export function MemoryContents({
  storeId,
  archived,
}: {
  storeId: string;
  archived: boolean;
}) {
  const filters = useListFilters();
  const selected = filters.params.get("memory") ?? "";
  const memory = useMemory(storeId, selected, !!selected);
  const leave = useLeaveConfirmation();
  return (
    <div className="mb-6 grid min-h-96 min-w-0 overflow-hidden rounded-lg border lg:min-h-[calc(100vh-210px)] lg:grid-cols-[280px_minmax(0,1fr)]">
      <section
        aria-label="Memory contents"
        className="min-w-0 border-b bg-muted/20 p-3 lg:border-r lg:border-b-0"
      >
        <h2 className="mb-3 border-b px-2 pb-2 text-xs text-muted-foreground">
          Contents
        </h2>
        <MemoryTree
          storeId={storeId}
          selectedId={selected}
          revealPath={memory.data?.path}
          onSelect={(id) => {
            if (id !== selected)
              leave.requestLeave(() => filters.update({ memory: id }));
          }}
        />
      </section>
      <section aria-label="Memory preview" className="min-w-0 p-4">
        {!selected ? (
          <p className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
            Select a memory to view its content.
          </p>
        ) : memory.error && !memory.data ? (
          <ErrorState error={memory.error} />
        ) : memory.isPending || !memory.data ? (
          <DetailSkeleton />
        ) : (
          <MemoryContent
            key={selected}
            memory={memory.data}
            archived={archived}
            onDeleted={() => filters.update({ memory: null })}
          />
        )}
      </section>
    </div>
  );
}

function MemoryContent({
  memory,
  archived,
  onDeleted,
}: {
  memory: Memory;
  archived: boolean;
  onDeleted: () => void;
}) {
  const [raw, setRaw] = useState(false);
  // Retain the exact bytes and digest loaded when editing started, even if a refetch changes the head.
  const [draft, setDraft] = useState<{
    original: Memory;
    content: string;
  } | null>(null);
  const update = useUpdateMemory(memory.memory_store_id, memory.id);
  const remove = useDeleteMemory(memory.memory_store_id, memory.id);
  const leave = useUnsavedChanges(
    !!draft && draft.content !== (draft.original.content ?? ""),
  );
  const cancel = () => {
    setDraft(null);
    update.reset();
    leave.setDirty(false);
  };
  const copy = async (text: string) => {
    if (await copyText(text)) toast.success("Copied to clipboard.");
    else toast.error("Could not copy to clipboard.");
  };
  const save = () => {
    if (!draft || update.isPending || archived) return;
    update.mutate(
      {
        content: draft.content,
        precondition: {
          type: "content_sha256",
          content_sha256: draft.original.content_sha256,
        },
      },
      {
        onSuccess: () => {
          setDraft(null);
          leave.setDirty(false);
          toast.success("Memory saved.");
        },
      },
    );
  };
  return (
    <div className="space-y-4" data-memory-id={memory.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 break-all text-base font-medium">
          <FileText className="size-4 shrink-0" />
          {memory.path}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Copy path"
            onClick={() => void copy(memory.path)}
          >
            <Copy className="size-3" />
          </Button>
        </h3>
        <div className="flex items-center gap-1">
          {draft ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                onClick={cancel}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={update.isPending || archived}
                onClick={save}
              >
                Save <kbd className="text-[10px] opacity-80">Ctrl ↵</kbd>
              </Button>
            </>
          ) : (
            <>
              {!archived && (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Edit memory"
                  onClick={() => {
                    update.reset();
                    setDraft({
                      original: memory,
                      content: memory.content ?? "",
                    });
                  }}
                >
                  <Pencil className="size-3.5" /> Edit
                </Button>
              )}
              <ResourceActions
                resource="memory"
                menuLabel="Memory actions"
                onDownload={() => {
                  const url = URL.createObjectURL(
                    new Blob([memory.content ?? ""], {
                      type: "text/plain;charset=utf-8",
                    }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = memory.path.split("/").at(-1) || "memory.txt";
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 0);
                }}
                deleteDescription="Deleting removes the live memory. Its version history remains until the store is deleted."
                onDelete={
                  archived
                    ? undefined
                    : () =>
                        remove.mutate(memory.content_sha256, {
                          onSuccess: onDeleted,
                        })
                }
                deletePending={remove.isPending}
              />
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-b pb-4 text-xs text-muted-foreground">
        <div className="space-y-1">
          <div>ID</div>
          <span className="inline-flex min-w-0 items-center gap-1">
            <code className="break-all">{memory.id}</code>
            <CopyIdButton id={memory.id} />
          </span>
        </div>
        <div className="space-y-1">
          <div>Size</div>
          <span data-size-bytes={memory.content_size_bytes}>
            {memory.content_size_bytes.toLocaleString()} B
          </span>
        </div>
        <div className="space-y-1">
          <div>Updated</div>
          <Time iso={memory.updated_at} />
        </div>
      </div>
      {draft ? (
        <div
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              save();
            }
          }}
        >
          <SchemaTextarea
            aria-label="Memory content"
            aria-describedby="memory-edit-hint"
            autoFocus
            disabled={update.isPending || archived}
            value={draft.content}
            onValueChange={(content) => setDraft({ ...draft, content })}
            className="min-h-80 w-full rounded-md border bg-transparent p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p
            id="memory-edit-hint"
            className="mt-2 text-xs text-muted-foreground"
          >
            Tab to indent · Escape, then Tab to move focus · Ctrl/⌘ Enter to
            save
          </p>
          {update.error && (
            <div role="alert">
              <ErrorState error={update.error} />
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            className="flex justify-end gap-1"
            aria-label="Memory content view"
          >
            <Button
              size="sm"
              variant={raw ? "ghost" : "secondary"}
              aria-pressed={!raw}
              onClick={() => setRaw(false)}
            >
              Rendered
            </Button>
            <Button
              size="sm"
              variant={raw ? "secondary" : "ghost"}
              aria-pressed={raw}
              onClick={() => setRaw(true)}
            >
              Raw
            </Button>
          </div>
          <div
            data-testid="memory-preview-content"
            className="min-w-0 overflow-x-auto"
          >
            {raw ? (
              <div className="relative pt-9">
                <Button
                  className="absolute top-0 right-0"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Copy code"
                  onClick={() => void copy(memory.content ?? "")}
                >
                  <Copy className="size-3.5" />
                </Button>
                <pre className="whitespace-pre-wrap break-words font-mono text-[13px]">
                  {memory.content ?? ""}
                </pre>
              </div>
            ) : (
              <div className="space-y-3 break-words text-sm leading-6 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_code]:font-mono [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_a]:underline">
                <Markdown
                  components={{
                    // Agent-written content must not initiate requests from the operator's network.
                    img: ({ src, alt }) =>
                      typeof src === "string" && src ? (
                        <a href={src} target="_blank" rel="noopener noreferrer">
                          Open image: {alt || "image"}
                        </a>
                      ) : (
                        <span>{alt || "Image"}</span>
                      ),
                  }}
                >
                  {memory.content ?? ""}
                </Markdown>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
