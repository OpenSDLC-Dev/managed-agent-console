"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResourceUploadDialog } from "./resource-upload-dialog";
import { useUploadSkill, useUploadSkillVersion } from "@/lib/platform/queries";
import { skillUploadFiles } from "@/lib/platform/skill-upload-files";

export function UploadSkillButton({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const upload = useUploadSkill();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus />
        Create skill
      </Button>
      {open && (
        <ResourceUploadDialog
          mode="skill"
          onClose={() => setOpen(false)}
          onSubmit={async (files) => {
            await upload.mutateAsync({ files: await skillUploadFiles(files) });
            toast.success("Skill created");
            onCreated?.();
          }}
        />
      )}
    </>
  );
}

export function UpdateSkillDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const version = useUploadSkillVersion(id);
  return (
    <ResourceUploadDialog
      mode="version"
      onClose={onClose}
      onSubmit={async (files) => {
        await version.mutateAsync(await skillUploadFiles(files));
        toast.success("Version created");
      }}
    />
  );
}
