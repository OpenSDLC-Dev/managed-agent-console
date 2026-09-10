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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateVault } from "@/lib/platform/queries";
import { metadataObject } from "@/lib/platform/metadata";

export function CreateVaultButton() {
  const router = useRouter();
  const create = useCreateVault();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [metadata, setMetadata] = useState("{}");
  const [parseError, setParseError] = useState<string | null>(null);

  const submit = () => {
    setParseError(null);
    try {
      create.mutate(
        { display_name: name.trim(), metadata: metadataObject(metadata) },
        { onSuccess: (vault) => router.push(`/vaults/${vault.id}`) },
      );
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Invalid metadata JSON",
      );
    }
  };

  return (
    <>
      <Button className="h-8" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Create vault
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setName("");
            setMetadata("{}");
            setParseError(null);
            create.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create vault</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vault-name">Display name</Label>
              <Input
                id="vault-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vault-metadata">Metadata (JSON object)</Label>
              <textarea
                id="vault-metadata"
                rows={4}
                className="w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring"
                value={metadata}
                onChange={(event) => setMetadata(event.target.value)}
              />
            </div>
          </div>
          {(parseError || create.error instanceof Error) && (
            <p role="alert" className="text-sm text-destructive">
              {parseError ?? (create.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || create.isPending}
              onClick={submit}
            >
              Create vault
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
