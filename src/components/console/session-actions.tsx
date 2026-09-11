"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResourceActions } from "./resource-actions";
import {
  useArchiveSession,
  useDeleteSession,
  useUpdateSession,
} from "@/lib/platform/queries";
import type { Session } from "@/lib/platform/types";

export function SessionActions({ session }: { session: Session }) {
  const router = useRouter();
  const update = useUpdateSession(session.id);
  const archive = useArchiveSession(session.id);
  const remove = useDeleteSession(session.id);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [metadata, setMetadata] = useState("{}");
  const [parseError, setParseError] = useState<string>();

  function save() {
    let patch;
    try {
      patch = JSON.parse(metadata);
    } catch {
      setParseError("Enter valid JSON for metadata changes.");
      return;
    }
    setParseError(undefined);
    update.mutate(
      { ...(title !== initialTitle ? { title } : {}), metadata: patch },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <>
      {!session.archived_at && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setTitle(session.title ?? "");
            setInitialTitle(session.title ?? "");
            setMetadata("{}");
            setParseError(undefined);
            update.reset();
            setOpen(true);
          }}
        >
          Edit session
        </Button>
      )}
      <ResourceActions
        resource="session"
        archived={!!session.archived_at}
        archiveWarning="Interrupt a running session before archiving it."
        deleteDescription="Permanently delete this session, its event history, and the files it produced. Files uploaded through the Files API are retained. Interrupt a running session before deleting it."
        onArchive={() => archive.mutate()}
        archivePending={archive.isPending}
        onDelete={() =>
          remove.mutate(undefined, {
            onSuccess: () => router.push("/sessions"),
          })
        }
        deletePending={remove.isPending}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit session</DialogTitle>
            <DialogDescription>
              Update the session title and metadata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="session-title">Title</Label>
            <Input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="session-metadata">Metadata changes (JSON)</Label>
            <textarea
              id="session-metadata"
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              aria-describedby="metadata-help"
              aria-invalid={!!parseError}
              className="min-h-24 w-full rounded-md border bg-background p-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-ring"
            />
            <p id="metadata-help" className="text-xs text-muted-foreground">
              An object merges keys. Set a key to null to remove it. An empty
              object or null leaves metadata unchanged.
            </p>
            <details className="text-xs">
              <summary>Current metadata</summary>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(session.metadata, null, 2)}
              </pre>
            </details>
          </div>
          {(parseError || update.error) && (
            <p role="alert" className="text-sm text-destructive">
              {parseError || update.error?.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={update.isPending} onClick={save}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
