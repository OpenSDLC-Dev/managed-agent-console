"use client";

import { useState } from "react";
import Link from "next/link";
import { useFile, useFileText, useMemory } from "@/lib/platform/queries";
import type { SessionResource } from "@/lib/platform/types";
import { Button } from "@/components/ui/button";
import { DetailSkeleton, ErrorState, Time } from "./bits";
import { Field, JsonBlock } from "./detail";
import { CopyIdButton } from "./copy-id";
import { MemoryMarkdown } from "./memory-markdown";

function MemoryPreview({
  storeId,
  memoryId,
  mountPath,
}: {
  storeId: string;
  memoryId: string;
  mountPath: string;
}) {
  const query = useMemory(storeId, memoryId);
  const [raw, setRaw] = useState(false);
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return <DetailSkeleton />;
  const memory = query.data;
  const mountedPath = mountPath.replace(/\/$/, "") + memory.path;
  return (
    <div
      className="space-y-3"
      data-testid="session-memory-preview"
      data-mounted-path={mountedPath}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1">
          <code className="break-all">{mountedPath}</code>
          <CopyIdButton id={mountedPath} />
        </span>
        <Link
          className="hover:underline"
          href={`/memory-stores/${storeId}?memory=${memory.id}`}
        >
          Open in Memory stores ↗
        </Link>
      </div>
      <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-y-2 text-xs">
        <Field label="Size">
          <span data-size-bytes={memory.content_size_bytes}>
            {memory.content_size_bytes.toLocaleString()} B
          </span>
        </Field>
        <Field label="Updated">
          <Time iso={memory.updated_at} />
        </Field>
        <Field label="Memory ID">
          <span className="inline-flex min-w-0 items-center gap-1">
            <code className="break-all">{memory.id}</code>
            <CopyIdButton id={memory.id} />
          </span>
        </Field>
      </dl>
      <div className="flex justify-end gap-1" aria-label="Memory preview view">
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
      <div className="min-w-0 overflow-x-auto">
        {memory.content === null ? (
          <p className="text-sm text-muted-foreground">
            Content is unavailable.
          </p>
        ) : raw ? (
          <pre className="whitespace-pre-wrap break-words text-xs">
            {memory.content}
          </pre>
        ) : (
          <MemoryMarkdown content={memory.content} />
        )}
      </div>
    </div>
  );
}

function FilePreview({
  resource,
}: {
  resource: Extract<SessionResource, { type: "file" }>;
}) {
  const fileId = resource.file_id;
  const file = useFile(fileId);
  const [showContent, setShowContent] = useState(false);
  // A display limit, never an upload restriction. Large and binary outputs remain downloadable.
  const textPreview =
    file.data &&
    file.data.size_bytes <= 1024 * 1024 &&
    /^(text\/|application\/(json|xml)(;|$))/i.test(file.data.mime_type);
  const content = useFileText(
    fileId,
    !!file.data?.downloadable && !!textPreview && showContent,
  );
  if (file.error) return <ErrorState error={file.error} />;
  if (!file.data) return <DetailSkeleton />;
  const data = file.data;
  return (
    <div className="space-y-3" data-testid="session-file-preview">
      <h3 className="break-all text-sm font-medium">{data.filename}</h3>
      <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-y-2 text-xs">
        <Field label="File ID">
          <span className="inline-flex min-w-0 items-center gap-1">
            <code className="break-all">{data.id}</code>
            <CopyIdButton id={data.id} />
          </span>
        </Field>
        <Field label="Resource ID">
          <span className="inline-flex min-w-0 items-center gap-1">
            <code className="break-all">{resource.id}</code>
            <CopyIdButton id={resource.id} />
          </span>
        </Field>
        <Field label="Size">
          <span data-size-bytes={data.size_bytes}>
            {data.size_bytes.toLocaleString()} B
          </span>
        </Field>
        <Field label="Type">
          <code className="break-all">{data.mime_type}</code>
        </Field>
        <Field label="Attached">
          <Time iso={resource.created_at} />
        </Field>
        {data.expires_at && (
          <Field label="Expires">
            <Time iso={data.expires_at} />
          </Field>
        )}
      </dl>
      {data.downloadable ? (
        <>
          <div className="flex gap-2 text-xs">
            {textPreview && (
              <Button
                size="sm"
                variant="outline"
                disabled={showContent && content.isFetching}
                onClick={() => {
                  if (showContent) void content.refetch();
                  else setShowContent(true);
                }}
              >
                {content.error ? "Retry preview" : "Preview content"}
              </Button>
            )}
            <a
              className="inline-flex items-center underline"
              href={`/api/platform/v1/files/${data.id}/content`}
              download={data.filename}
            >
              Download
            </a>
          </div>
          {!textPreview && (
            <p className="text-xs text-muted-foreground">
              Download to view this file. Inline text previews support files up
              to 1 MiB.
            </p>
          )}
          {showContent &&
            (content.error ? (
              <ErrorState error={content.error} />
            ) : content.isPending ? (
              <p aria-busy="true">Loading content…</p>
            ) : (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
                {content.data}
              </pre>
            ))}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          This upload is available to the agent. The platform does not expose
          its contents here.
        </p>
      )}
    </div>
  );
}

export function SessionResourcePreview({
  resource,
  memoryId,
  onClose,
}: {
  resource: SessionResource;
  memoryId?: string;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="Resource preview"
      className="mt-3 min-w-0 space-y-3 border-t pt-3"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="break-all font-mono text-xs">
          {resource.type === "memory_store" && memoryId
            ? "Memory"
            : resource.mount_path}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Clear resource selection"
          onClick={onClose}
        >
          ×
        </Button>
      </div>
      {resource.type === "file" ? (
        <FilePreview key={resource.file_id} resource={resource} />
      ) : resource.type === "memory_store" && memoryId ? (
        <MemoryPreview
          key={memoryId}
          storeId={resource.memory_store_id}
          memoryId={memoryId}
          mountPath={resource.mount_path}
        />
      ) : resource.type === "memory_store" ? (
        <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-y-2 text-xs">
          <Field label="Store">
            <Link
              className="hover:underline"
              href={`/memory-stores/${resource.memory_store_id}`}
            >
              {resource.name} ↗
            </Link>
          </Field>
          <Field label="Access">
            {resource.access === "read_only" ? "Read only" : "Read/write"}
          </Field>
          <Field label="Description">{resource.description || "—"}</Field>
          <Field label="Instructions">
            <span className="whitespace-pre-wrap break-words">
              {resource.instructions || "—"}
            </span>
          </Field>
          <Field label="Store ID">
            <code className="break-all">{resource.memory_store_id}</code>
          </Field>
        </dl>
      ) : (
        <>
          <a
            className="break-all text-sm underline"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.url}
          </a>
          <JsonBlock value={resource} />
        </>
      )}
    </section>
  );
}
