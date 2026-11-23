"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResourceUploadDialog } from "./resource-upload-dialog";
import { useUploadSkill, useUploadSkillVersion } from "@/lib/platform/queries";
import { skillUploadFiles } from "@/lib/platform/skill-upload-files";

export function UploadSkillButton({
  onCreated,
  onDismissCreateRequest,
}: {
  onCreated?: () => void;
  onDismissCreateRequest?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const upload = useUploadSkill();
  return (
    <>
      <Button ref={trigger} size="sm" onClick={() => setOpen(true)}>
        <Plus />
        Create skill
      </Button>
      {(open || onDismissCreateRequest) && (
        <ResourceUploadDialog
          mode="skill"
          finalFocus={trigger}
          onClose={() => {
            setOpen(false);
            if (trigger.current?.isConnected) onDismissCreateRequest?.();
          }}
          onSubmit={async (files) => {
            await upload.mutateAsync({ files: await skillUploadFiles(files) });
            toast.success("Skill created");
            if (trigger.current?.isConnected) onCreated?.();
          }}
        />
      )}
    </>
  );
}

export function UpdateSkillDialog({
  id,
  onClose,
  onCreated,
}: {
  id: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const version = useUploadSkillVersion(id);
  return (
    <ResourceUploadDialog
      mode="version"
      onClose={onClose}
      onSubmit={async (files) => {
        await version.mutateAsync(await skillUploadFiles(files));
        toast.success("Version created");
        onCreated?.();
      }}
    />
  );
}
