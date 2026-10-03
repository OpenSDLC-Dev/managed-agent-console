"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DetailSection } from "./detail";
import { ConfirmIconButton } from "./archive-button";
import { MemoryTree } from "./memory-tree";
import { SessionResourcePreview } from "./session-resource-preview";
import {
  useDeleteFile,
  useRereadSession,
  useSessionFiles,
  useUploadFile,
} from "@/lib/platform/queries";
import { isUnimplemented } from "@/lib/platform/surfaces";
import {
  fileExpired,
  useAddSessionFile,
  useRemoveSessionResource,
  useRotateRepositoryToken,
} from "@/lib/platform/session-resources";
import { useNow } from "@/lib/session-trace/use-now";
import type { PlatformFile, Session } from "@/lib/platform/types";

/** The memory tree's size format, so every size in this tab reads alike. */
function FileSize({ file }: { file: PlatformFile }) {
  return (
    <span className="shrink-0 font-sans" data-size-bytes={file.size_bytes}>
      {file.size_bytes.toLocaleString()} B
    </span>
  );
}

export function SessionResources({ session }: { session: Session }) {
  // The session's own files, which the reference lists in this tab beside the
  // resources (console-141 frames 49 and 63): a mounted file's row is its
  // copy, the size coming from this list. Rows no resource names — harvested
  // outputs, and copies whose resource was removed — follow the resources.
  const files = useSessionFiles(session.id, !!session.archived_at);
  // A deployment that does not serve the list hides it, as any surface does.
  const filesState = files.isPending
    ? "loading"
    : !files.isError
      ? "ready"
      : isUnimplemented(files.error)
        ? "unavailable"
        : "error";
  // A 404 after a successful poll leaves the last list in the cache; an
  // absent surface shows none of it.
  const sessionFiles =
    filesState === "unavailable" ? [] : (files.data?.data ?? []);
  const fileById = new Map(sessionFiles.map((file) => [file.id, file]));
  const add = useAddSessionFile(session.id);
  const remove = useRemoveSessionResource(session.id);
  const removeFile = useDeleteFile(session.id);
  const rereadSession = useRereadSession(session.id);
  const now = useNow();
  const rotate = useRotateRepositoryToken(session.id);
  const upload = useUploadFile();
  const [dialog, setDialog] = useState<"file" | string | null>(null);
  const [fileId, setFileId] = useState("");
  const [mount, setMount] = useState("");
  const [token, setToken] = useState("");
  const [filter, setFilter] = useState("");
  const filterInput = useRef<HTMLInputElement>(null);
  const previewTrigger = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<{
    resourceId: string;
    memoryId?: string;
  } | null>(null);
  const inspect = (resourceId: string, memoryId?: string) => {
    previewTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelection({ resourceId, memoryId });
  };
  const clearSelection = () => {
    setSelection(null);
    if (previewTrigger.current?.isConnected) previewTrigger.current.focus();
    else filterInput.current?.focus();
  };
  const selected = session.resources.find(
    (resource) =>
      (resource.type === "memory_store"
        ? resource.memory_store_id
        : resource.id) === selection?.resourceId,
  );
  const matches = (...fields: (string | undefined)[]) =>
    fields.join(" ").toLowerCase().includes(filter.toLowerCase());
  const visibleResources = session.resources.filter((resource) =>
    matches(
      resource.mount_path,
      resource.type === "memory_store"
        ? resource.name
        : resource.type === "file"
          ? `${resource.file_id} ${fileById.get(resource.file_id)?.filename ?? ""}`
          : resource.url,
    ),
  );
  const mounted = new Set(
    session.resources.flatMap((resource) =>
      resource.type === "file" ? [resource.file_id] : [],
    ),
  );
  const unmountedFiles = sessionFiles.filter((file) => !mounted.has(file.id));
  const visibleFiles = unmountedFiles.filter((file) =>
    matches(file.id, file.filename),
  );
  // The session's own files are rows of this tab too, so neither empty state
  // is claimed before their list has answered.
  const rowCount = session.resources.length + unmountedFiles.length;
  const visibleRowCount = visibleResources.length + visibleFiles.length;
  const listState =
    visibleRowCount > 0
      ? "rows"
      : filesState === "loading" || filesState === "error"
        ? filesState
        : rowCount === 0
          ? "empty"
          : "no-match";
  // A copy the list carries and the session does not mount may be a mount
  // added since the session was read (Attach file here, or another client),
  // whose copy lists before the session names it. It offers Delete only once
  // a read of the session begun after it was listed (cancelling any already
  // out) leaves it unmounted — for good, since a copy is never mounted again
  // (mountFileCopy mints a fresh one per mount). A read that fails leaves it
  // without Delete until the next copy appears, rather than reading again in
  // a loop.
  const [leftovers, setLeftovers] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const unconfirmed = unmountedFiles
    .filter((file) => !file.downloadable && !leftovers.has(file.id))
    .map((file) => file.id)
    .join(" ");
  useEffect(() => {
    if (!unconfirmed) return;
    let current = true;
    void rereadSession().then((read) => {
      if (!current || !read.isSuccess) return;
      const mountedNow = new Set(
        read.data.resources.flatMap((resource) =>
          resource.type === "file" ? [resource.file_id] : [],
        ),
      );
      const confirmed = unconfirmed
        .split(" ")
        .filter((id) => !mountedNow.has(id));
      if (confirmed.length > 0)
        setLeftovers((known) => new Set([...known, ...confirmed]));
    });
    return () => {
      current = false;
    };
  }, [unconfirmed, rereadSession]);
  // A deleted row takes its Delete, where the dialog would return focus,
  // with it: focus moves to the row that took its place, else the one before
  // it, else the filter, as clearSelection falls back to it. Set before the
  // delete is sent, cleared if it is refused.
  const panel = useRef<HTMLDivElement>(null);
  const focusAfterDelete = useRef<{ gone: string; next?: string } | null>(null);
  useEffect(() => {
    const handoff = focusAfterDelete.current;
    if (!handoff || sessionFiles.some((file) => file.id === handoff.gone))
      return;
    focusAfterDelete.current = null;
    const row = [
      ...(panel.current?.querySelectorAll<HTMLElement>(
        "[data-session-file-id]",
      ) ?? []),
    ].find((element) => element.dataset.sessionFileId === handoff.next);
    (
      row?.querySelector<HTMLElement>("a, button") ?? filterInput.current
    )?.focus();
  });
  const editable = !session.archived_at;
  const close = () => {
    setDialog(null);
    setToken("");
    rotate.reset();
  };
  const error = dialog === "file" ? (add.error ?? upload.error) : rotate.error;
  return (
    <DetailSection title="Resources">
      <div
        ref={panel}
        className="space-y-3"
        data-testid="session-resources"
        data-session-files={filesState}
        data-session-file-count={sessionFiles.length}
        data-resources-state={listState}
      >
        <Input
          ref={filterInput}
          className="h-8"
          aria-label="Filter resources"
          placeholder="Filter resources"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {listState === "empty" && (
          <p className="text-sm text-muted-foreground">
            No resources attached.
          </p>
        )}
        {listState === "no-match" && (
          <p className="text-sm text-muted-foreground">
            No matching resources.
          </p>
        )}
        {visibleResources.map((resource) => {
          const id =
            resource.type === "memory_store"
              ? resource.memory_store_id
              : resource.id;
          const copy =
            resource.type === "file"
              ? fileById.get(resource.file_id)
              : undefined;
          return (
            <Fragment key={id}>
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                {resource.type === "memory_store" && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${expanded[id] ? "Collapse" : "Expand"} ${resource.mount_path}`}
                    aria-expanded={!!expanded[id]}
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [id]: !current[id],
                      }))
                    }
                  >
                    {expanded[id] ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <button
                    className="break-all text-left font-medium hover:underline"
                    aria-label={`Inspect resource ${resource.mount_path}`}
                    aria-pressed={selected === resource && !selection?.memoryId}
                    onClick={() => inspect(id)}
                  >
                    {resource.type === "file"
                      ? resource.file_id
                      : resource.type === "github_repository"
                        ? resource.url
                        : resource.name}
                  </button>
                  <p className="flex justify-between gap-2 font-mono text-xs text-muted-foreground">
                    <span className="min-w-0 break-all">
                      {resource.mount_path}
                    </span>
                    {copy && <FileSize file={copy} />}
                  </p>
                  {resource.type === "memory_store" && (
                    <p className="text-xs" data-access={resource.access}>
                      {resource.access === "read_only"
                        ? "Read only"
                        : "Read/write"}{" "}
                      · {resource.description}
                    </p>
                  )}
                  {resource.type === "github_repository" &&
                    resource.checkout && (
                      <p className="text-xs">
                        {resource.checkout.type === "branch"
                          ? resource.checkout.name
                          : resource.checkout.sha}
                      </p>
                    )}
                </div>
                {editable &&
                  (resource.type === "github_repository" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        rotate.reset();
                        setToken("");
                        setDialog(id);
                      }}
                    >
                      Rotate token
                    </Button>
                  ) : (
                    <ConfirmIconButton
                      label={`Remove resource ${id}`}
                      title="Remove resource"
                      description="Remove this resource reference from the session. The source resource is kept; an already mounted file is not unmounted from a live sandbox."
                      pending={remove.isPending}
                      onConfirm={() => remove.mutate(id)}
                    >
                      <Trash2 className="size-3.5" />
                    </ConfirmIconButton>
                  ))}
              </div>
              {resource.type === "memory_store" && expanded[id] && (
                <div className="ml-3 min-w-0 border-l pl-2">
                  <MemoryTree
                    storeId={resource.memory_store_id}
                    selectedId={
                      selection?.resourceId === id
                        ? selection.memoryId
                        : undefined
                    }
                    onSelect={(memoryId) => inspect(id, memoryId)}
                  />
                </div>
              )}
            </Fragment>
          );
        })}
        {visibleFiles.map((file, index) => {
          const expired = fileExpired(file, now);
          // The id tells apart two rows of one name, as outputs can be.
          const named = `${file.filename} (${file.id})`;
          const next =
            visibleFiles[index + 1]?.id ?? visibleFiles[index - 1]?.id;
          return (
            <div
              key={file.id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
              data-session-file-id={file.id}
              data-downloadable={String(file.downloadable)}
              data-expired={String(expired)}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-all font-medium">{file.filename}</p>
                <p className="flex justify-between gap-2 text-xs text-muted-foreground">
                  {/* `downloadable` is the one signal the wire gives. */}
                  <span>{file.downloadable ? "Output" : "Upload"}</span>
                  <FileSize file={file} />
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* Expired content is gone (store.FileLiveSQL): the download
                    would 404, so the row says why it offers none. */}
                {file.downloadable &&
                  (expired ? (
                    <span className="text-xs text-muted-foreground">
                      Expired
                    </span>
                  ) : (
                    <a
                      className="text-xs underline"
                      href={`/api/platform/v1/files/${encodeURIComponent(file.id)}/content`}
                      download={file.filename}
                      aria-label={`Download ${named}`}
                    >
                      Download
                    </a>
                  ))}
                {/* files.go deleteFile takes an output or a copy as it takes
                    an upload, archived session or not, as the Files page did. */}
                {(file.downloadable || leftovers.has(file.id)) && (
                  <ConfirmIconButton
                    label={`Delete ${named}`}
                    title="Delete file"
                    description={
                      <span
                        data-delete-kind={file.downloadable ? "output" : "copy"}
                      >
                        {file.downloadable
                          ? "Permanently delete this output. Its content cannot be recovered."
                          : "Permanently delete the session's copy of this file. The upload it was copied from is kept."}
                      </span>
                    }
                    pending={removeFile.isPending}
                    onConfirm={() => {
                      focusAfterDelete.current = { gone: file.id, next };
                      return removeFile.mutateAsync(file.id).catch((cause) => {
                        focusAfterDelete.current = null;
                        throw cause;
                      });
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </ConfirmIconButton>
                )}
              </div>
            </div>
          );
        })}
        {filesState === "error" && (
          <p className="text-xs text-muted-foreground">
            The session&apos;s files could not be listed. {files.error?.message}
          </p>
        )}
        {editable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFileId("");
              setMount("");
              add.reset();
              upload.reset();
              setDialog("file");
            }}
          >
            Attach file
          </Button>
        )}
      </div>
      {selected && (
        <SessionResourcePreview
          resource={selected}
          memoryId={selection?.memoryId}
          onClose={clearSelection}
        />
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "file" ? "Attach file" : "Rotate repository token"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "file"
                ? "Use an uploaded file ID or upload a new file."
                : "The replacement token applies to future repository materialization. Existing clones are unchanged."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "file" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="resource-file">File ID</Label>
                <Input
                  id="resource-file"
                  value={fileId}
                  onChange={(e) => setFileId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resource-upload">Upload file</Label>
                <input
                  id="resource-upload"
                  type="file"
                  disabled={upload.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      upload.mutate(file, {
                        onSuccess: (result) => setFileId(result.id),
                      });
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resource-mount">Mount path (optional)</Label>
                <Input
                  id="resource-mount"
                  value={mount}
                  onChange={(e) => setMount(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="resource-token">Authorization token</Label>
              <Input
                id="resource-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={add.isPending || upload.isPending || rotate.isPending}
              onClick={() => {
                if (dialog === "file")
                  add.mutate(
                    {
                      type: "file",
                      file_id: fileId,
                      ...(mount ? { mount_path: mount } : {}),
                    },
                    { onSuccess: close },
                  );
                else if (dialog)
                  rotate.mutate(
                    { resourceId: dialog, token },
                    { onSuccess: close },
                  );
              }}
            >
              {dialog === "file" ? "Attach file" : "Rotate token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailSection>
  );
}
