"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
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
import { useUploadSkill } from "@/lib/platform/queries";

export function UploadSkillButton() {
  const router = useRouter();
  const upload = useUploadSkill();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button className="h-8" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Upload skill
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTitle("");
            setFiles([]);
            upload.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload skill</DialogTitle>
            <DialogDescription>
              Loose files (SKILL.md plus scripts) or a single zip; 32 MiB budget
              on the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="skill-title">Display title (optional)</Label>
              <Input
                id="skill-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <input
                ref={input}
                type="file"
                multiple
                aria-label="Skill files"
                onChange={(e) => setFiles([...(e.target.files ?? [])])}
                className="text-sm"
              />
              {files.length > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  {files.length} file{files.length === 1 ? "" : "s"} selected
                </p>
              )}
            </div>
            {upload.error instanceof Error && (
              <p className="text-sm text-destructive">{upload.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={files.length === 0 || upload.isPending}
              onClick={() =>
                upload.mutate(
                  { files, displayTitle: title || undefined },
                  {
                    onSuccess: (skill) => router.push(`/skills/${skill.id}`),
                  },
                )
              }
            >
              {upload.isPending ? "Uploading…" : "Upload skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
