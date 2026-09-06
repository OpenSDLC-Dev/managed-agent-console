"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
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
        {session.resources.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No resources attached.
          </p>
        )}
        {session.resources.map((resource) => {
          const id =
            resource.type === "memory_store"
              ? resource.memory_store_id
              : resource.id;
          return (
            <div
              key={id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0 space-y-1">
                <p className="break-all font-medium">
                  {resource.type === "file"
                    ? resource.file_id
                    : resource.type === "github_repository"
                      ? resource.url
                      : resource.name}
                </p>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {resource.mount_path}
                </p>
                {resource.type === "memory_store" && (
                  <p className="text-xs">
                    {resource.access} · {resource.description}
                  </p>
                )}
                {resource.type === "github_repository" && resource.checkout && (
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
