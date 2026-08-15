"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequestId } from "@/components/console/bits";
import { PlatformError } from "@/lib/platform/http";
import { useCreateEnvironment } from "@/lib/platform/queries";
import {
  newEnvForm,
  bodyFromForm,
} from "@/components/console/environment-editor";

export function CreateEnvironmentButton({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const create = useCreateEnvironment();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"cloud" | "self_hosted">("cloud");
  const [description, setDescription] = useState("");

  const reset = () => {
    setName("");
    setKind("cloud");
    setDescription("");
    create.reset();
  };

  const error = create.error instanceof Error ? create.error : null;

  return (
    <>
      <Button variant={variant} className="h-8" onClick={() => setOpen(true)}>
        {variant === "default" && <Plus className="size-4" />} Create
        environment
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create environment</DialogTitle>
            <DialogDescription>
              A configuration template for session sandboxes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="env-stub-name">Name</Label>
              <Input
                id="env-stub-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hosting type</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as "cloud" | "self_hosted")}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 w-full rounded-lg"
                  aria-label="Hosting type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloud">Cloud</SelectItem>
                  <SelectItem value="self_hosted">Self-hosted</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">
                This cannot be changed after creation.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="env-stub-description">Description</Label>
              <Input
                id="env-stub-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">
              {error.message}
              {error instanceof PlatformError && error.requestId && (
                <span className="pl-2">
                  <RequestId id={error.requestId} />
                </span>
              )}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || create.isPending}
              onClick={() => {
                const form = {
                  ...newEnvForm(),
                  name: name.trim(),
                  description: description.trim(),
                  kind,
                };
                create.mutate(bodyFromForm(form, "create"), {
                  onSuccess: (environment) =>
                    router.push(`/environments/${environment.id}`),
                });
              }}
            >
              Create environment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
