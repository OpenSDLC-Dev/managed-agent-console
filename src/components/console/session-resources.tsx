"use client";

import { Fragment, useRef, useState } from "react";
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
import { useUploadFile } from "@/lib/platform/queries";
import {
  useAddSessionFile,
  useRemoveSessionResource,
  useRotateRepositoryToken,
} from "@/lib/platform/session-resources";
import type { Session } from "@/lib/platform/types";

export function SessionResources({ session }: { session: Session }) {
  const add = useAddSessionFile(session.id);
  const remove = useRemoveSessionResource(session.id);
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
  const visibleResources = session.resources.filter((resource) =>
    [
      resource.mount_path,
      resource.type === "memory_store"
        ? resource.name
        : resource.type === "file"
          ? resource.file_id
          : resource.url,
    ]
      .join(" ")
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const editable = !session.archived_at;
  const close = () => {
    setDialog(null);
    setToken("");
    rotate.reset();
  };
  const error = dialog === "file" ? (add.error ?? upload.error) : rotate.error;
  return (
    <DetailSection title="Resources">
      <div className="space-y-3">
        <Input
          ref={filterInput}
          className="h-8"
          aria-label="Filter resources"
          placeholder="Filter resources"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {session.resources.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No resources attached.
          </p>
        )}
        {session.resources.length > 0 && visibleResources.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No matching resources.
          </p>
        )}
        {visibleResources.map((resource) => {
          const id =
            resource.type === "memory_store"
              ? resource.memory_store_id
              : resource.id;
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
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {resource.mount_path}
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
