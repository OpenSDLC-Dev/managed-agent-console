"use client";

import { useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { droppedSkillFiles } from "@/lib/platform/skill-upload-files";

export function ResourceUploadDialog({
  mode,
  onSubmit,
  onClose,
}: {
  mode: "file" | "skill" | "version";
  onSubmit: (files: File[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const skill = mode !== "file";
  const title =
    mode === "file"
      ? "Upload file"
      : mode === "skill"
        ? "Create skill"
        : "Update skill";
  const submitLabel =
    mode === "version"
      ? "Create version"
      : mode === "skill"
        ? "Create skill"
        : "Upload";
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const choose = useRef<HTMLButtonElement>(null);

  function stage(picked: File[]) {
    if (!picked.length) return;
    setError("");
    if (!skill) {
      if (picked.length > 1) {
        setError("Choose one file at a time.");
        return;
      }
      setFiles(picked);
    } else {
      setFiles((previous) => [
        ...new Map(
          [...previous, ...picked].map((file) => [
            file.webkitRelativePath || file.name,
            file,
          ]),
        ).values(),
      ]);
    }
  }

  async function submit() {
    if (!files.length) {
      setError(
        skill
          ? "Choose files or a folder to continue."
          : "Choose a file to upload.",
      );
      return;
    }
    setPending(true);
    setError("");
    try {
      await onSubmit(files);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        data-library-dialog=""
        className="sm:max-w-[520px] max-h-[85dvh] overflow-y-auto"
        initialFocus={choose}
      >
        <DialogTitle>{title}</DialogTitle>
        {skill ? (
          <DialogDescription className="sr-only">
            Choose the files for this skill.
          </DialogDescription>
        ) : (
          <DialogDescription>
            Uploaded files can be used in requests to the API from this
            workspace.
          </DialogDescription>
        )}
        {!skill && <span className="-mb-2 text-sm font-medium">File</span>}
        <div
          className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg bg-muted px-4 py-6 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={async (event) => {
            event.preventDefault();
            if (pending || reading) return;
            setReading(true);
            try {
              stage(
                skill
                  ? await droppedSkillFiles(event.dataTransfer)
                  : Array.from(event.dataTransfer.files),
              );
            } catch {
              setError(
                "Could not read the drop. Choose the files or folder again.",
              );
            } finally {
              setReading(false);
            }
          }}
        >
          <p className="font-medium">
            {skill ? "Drop files or a folder here" : "Drop a file here"}
          </p>
          <p className="text-xs text-muted-foreground">
            {skill ? (
              <>
                A .zip or .skill archive, a SKILL.md file, or a folder, up to 30
                MiB uncompressed.{" "}
                <a
                  className="underline"
                  href="https://github.com/OpenSDLC-Dev/managed-agent-platform/blob/main/docs/plan/06_skills.md#multipart-upload"
                  target="_blank"
                  rel="noreferrer"
                >
                  File format
                </a>{" "}
                and{" "}
                <a
                  className="underline"
                  href="https://github.com/anthropics/skills/tree/main/skills"
                  target="_blank"
                  rel="noreferrer"
                >
                  examples
                </a>
                .
              </>
            ) : (
              "Up to 500 MiB"
            )}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <input
              ref={fileInput}
              aria-label={skill ? "Skill files" : "File to upload"}
              type="file"
              multiple={skill}
              hidden
              onChange={(event) => {
                stage(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <Button
              ref={choose}
              variant="secondary"
              size="sm"
              disabled={pending || reading}
              onClick={() => fileInput.current?.click()}
            >
              {skill ? "Choose files" : "Choose a file"}
            </Button>
            {skill && (
              <>
                <input
                  ref={folderInput}
                  type="file"
                  multiple
                  {...{ webkitdirectory: "" }}
                  aria-label="Skill folder"
                  hidden
                  onChange={(event) => {
                    stage(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending || reading}
                  onClick={() => folderInput.current?.click()}
                >
                  Choose a folder
                </Button>
              </>
            )}
          </div>
          {!!files.length && (
            <ul className="flex max-h-40 max-w-full flex-wrap justify-center gap-1 overflow-auto">
              {files.map((file) => {
                const path = file.webkitRelativePath || file.name;
                return (
                  <li
                    key={path}
                    className="inline-flex max-w-full items-center gap-1 rounded bg-background/60 px-2 py-1 text-xs"
                  >
                    <FileText className="size-3 shrink-0" />
                    <span className="truncate" title={path}>
                      {path}
                    </span>
                    <button
                      type="button"
                      disabled={pending || reading}
                      aria-label={"Remove " + path}
                      onClick={() =>
                        setFiles(files.filter((entry) => entry !== file))
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={pending || reading}
            onClick={() => void submit()}
          >
            {pending ? "Uploading…" : submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
