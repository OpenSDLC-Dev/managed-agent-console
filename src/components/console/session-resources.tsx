"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { useQueryClient } from "@tanstack/react-query";
import { DetailSection } from "./detail";
import { ConfirmIconButton } from "./archive-button";
import { MemoryTree } from "./memory-tree";
import { SessionResourcePreview } from "./session-resource-preview";
import {
  useDeleteFile,
  useSessionFiles,
  useUploadFile,
} from "@/lib/platform/queries";
import { hasExpired } from "@/lib/platform/expiry";
import type { Page } from "@/lib/platform/http";
import { isUnimplemented } from "@/lib/platform/surfaces";
import {
  useAddSessionFile,
  useRemoveSessionResource,
  useRotateRepositoryToken,
} from "@/lib/platform/session-resources";
import { toastPlatformError } from "@/lib/platform/toast-error";
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
  const removeFile = useDeleteFile({
    sessionId: session.id,
    errorToast: false,
  });
  const queryClient = useQueryClient();
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
  // The session's own files are rows of this tab too, so it is not called
  // empty before their list has answered, nor while it has failed. A filter
  // that leaves none of the rows it has matches nothing whatever the list's
  // own note says, once the list has answered.
  const rowCount = session.resources.length + unmountedFiles.length;
  const visibleRowCount = visibleResources.length + visibleFiles.length;
  const listState =
    visibleRowCount > 0
      ? "rows"
      : filesState === "loading"
        ? "loading"
        : rowCount > 0
          ? "no-match"
          : filesState === "error"
            ? "error"
            : "empty";
  const filesNote =
    filesState === "loading"
      ? "Loading the session's files…"
      : filesState === "error"
        ? `The session's files could not be listed. ${files.error?.message}`
        : null;

  // A live region announces a change to what it holds, not what it mounted
  // holding, so it mounts empty and the note is written into it after each
  // commit: a tab opened on a list still loading says so.
  const filesNoteRegion = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (filesNoteRegion.current)
      filesNoteRegion.current.textContent = filesNote ?? "";
  }, [filesNote]);

  // One delete dialog for the session's own files, outside their rows: a row
  // can leave the list while its dialog is open, and the dialog outlives it.
  // Every row the list carries and no resource mounts offers it — an output,
  // or a copy whose resource was removed. That is how the rows read, not a
  // check: files.go deleteFile deletes a mounted copy too, so the console
  // refuses no delete itself (docs/design-reference.md, Session files).
  const panel = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState<{
    file: PlatformFile;
    near: string[];
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // The platform's refusal of the delete, shown in its dialog.
  const [refusal, setRefusal] = useState<{ error: unknown } | null>(null);
  // Read when a delete settles, after renders that may have closed the
  // dialog or left the tab: an answer nobody is shown is toasted instead.
  const deleteShown = useRef(false);
  useEffect(
    () => () => {
      deleteShown.current = false;
    },
    [],
  );
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const deleteGone = useRef(false);
  const rowOf = (id: string) =>
    [
      ...(panel.current?.querySelectorAll<HTMLElement>(
        "[data-session-file-id]",
      ) ?? []),
    ].find((row) => row.dataset.sessionFileId === id);
  // The rows beside one: the row that would take its place, then the one
  // before it.
  const nearOf = (id: string) => {
    const at = visibleFiles.findIndex((file) => file.id === id);
    return at < 0
      ? []
      : [at + 1, at - 1].flatMap((index) => visibleFiles[index]?.id ?? []);
  };
  // Where focus goes from a row that has gone: the first of those rows still
  // listed, else the filter, as clearSelection falls back to.
  const neighbour = (near: string[]) =>
    near
      .map((id) => rowOf(id)?.querySelector<HTMLElement>("a, button"))
      .find(Boolean) ?? filterInput.current;
  // The control focus is on in one of those rows, and the rows beside it as
  // last rendered. Whatever read drops the row — a delete's, or a later poll
  // after that read failed — or the control alone (an output's Download, once
  // it expires), focus goes to the row, else a neighbour, never the page.
  const focusedRow = useRef<{
    element: HTMLElement;
    id: string;
    near: string[];
  } | null>(null);
  useLayoutEffect(() => {
    const focused = focusedRow.current;
    if (!focused) return;
    if (focused.element.isConnected) {
      focused.near = nearOf(focused.id);
      return;
    }
    focusedRow.current = null;
    const active = document.activeElement;
    if (!active || active === document.body)
      neighbour([focused.id, ...focused.near])?.focus();
  });
  const trackFocus = (element: HTMLElement) => {
    const id = element.closest<HTMLElement>("[data-session-file-id]")?.dataset
      .sessionFileId;
    focusedRow.current = id ? { element, id, near: nearOf(id) } : null;
  };
  // Focus taken elsewhere forgets the row: to another control, or to the page
  // with the control still there. Focus that a removal drops is kept for the
  // effect above, which by then has run.
  const forgetFocus = (element: HTMLElement) =>
    queueMicrotask(() => {
      if (
        focusedRow.current?.element === element &&
        element.isConnected &&
        document.activeElement !== element
      )
        focusedRow.current = null;
    });
  const openDelete = (file: PlatformFile, trigger: HTMLElement) => {
    deleteTrigger.current = trigger;
    deleteGone.current = false;
    deleteShown.current = true;
    setRefusal(null);
    setDeleting({ file, near: nearOf(file.id) });
    setDeleteOpen(true);
  };
  const closeDelete = () => {
    deleteShown.current = false;
    setDeleteOpen(false);
  };
  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    const { file } = deleting;
    setDeleteBusy(true);
    setRefusal(null);
    try {
      await removeFile.mutateAsync(file.id);
    } catch (error) {
      // The platform's error whole, request-id included, where nobody is
      // shown the dialog.
      if (deleteShown.current) setRefusal({ error });
      else toastPlatformError(error, "Delete failed");
      return;
    } finally {
      setDeleteBusy(false);
    }
    if (!deleteShown.current) return;
    // The list was read again before the delete settled, and its rows are
    // rendered after this runs: a row it no longer carries takes its Delete
    // with it, so the closing dialog hands focus to a neighbour instead.
    deleteGone.current = !queryClient
      .getQueryData<Page<PlatformFile>>(["session-files", session.id])
      ?.data.some((row) => row.id === file.id);
    closeDelete();
  };
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
        onFocus={(event) => trackFocus(event.target)}
        onBlur={(event) => forgetFocus(event.target)}
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
        {visibleFiles.map((file) => {
          const expired = hasExpired(file.expires_at, now);
          // The id tells apart two rows of one name, as outputs can be.
          const named = `${file.filename} (${file.id})`;
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
                    an upload, archived session or not, as the Files page did.
                    Focusable while a delete is out, so focus returned to it
                    is not dropped. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-muted-foreground data-disabled:opacity-50"
                  aria-label={`Delete ${named}`}
                  disabled={deleteBusy}
                  focusableWhenDisabled
                  onClick={(event) => openDelete(file, event.currentTarget)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {/* The list's progress, announced where its rows appear. */}
        <p
          ref={filesNoteRegion}
          role="status"
          className={filesNote ? "text-xs text-muted-foreground" : "sr-only"}
          data-session-files-note={filesNote ? filesState : undefined}
        />
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
        open={deleteOpen}
        onOpenChange={(open) => {
          // Closable while the delete is out: its answer is then toasted.
          if (!open) closeDelete();
        }}
      >
        <DialogContent
          finalFocus={() =>
            !deleteGone.current && deleteTrigger.current?.isConnected
              ? deleteTrigger.current
              : neighbour(deleting?.near ?? [])
          }
        >
          <DialogHeader>
            <DialogTitle>Delete file</DialogTitle>
            <DialogDescription>
              <span
                data-delete-kind={
                  deleting?.file.downloadable ? "output" : "copy"
                }
              >
                {deleting?.file.downloadable
                  ? "Permanently delete this output. Its content cannot be recovered."
                  : "Permanently delete the session's copy of this file. The upload it was copied from is kept."}
              </span>
            </DialogDescription>
          </DialogHeader>
          {refusal && (
            <p role="alert" className="text-sm text-destructive">
              {refusal.error instanceof Error
                ? refusal.error.message
                : String(refusal.error)}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeDelete}>
              Cancel
            </Button>
            {/* Focusable while busy, so a click's focus stays in the dialog
                for the refusal or a retry. */}
            <Button
              variant="destructive"
              className="data-disabled:opacity-50"
              disabled={deleteBusy}
              focusableWhenDisabled
              aria-busy={deleteBusy || undefined}
              onClick={() => void confirmDelete()}
            >
              Delete file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
