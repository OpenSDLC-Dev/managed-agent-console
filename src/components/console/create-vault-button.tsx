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
import { useCreateVault } from "@/lib/platform/queries";
import { metadataObject } from "@/lib/platform/metadata";
import { CredentialDialog } from "./credential-form";

export function CreateVaultButton() {
  const router = useRouter();
  const create = useCreateVault();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{
    id: string;
    display_name: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [metadata, setMetadata] = useState("{}");
  const [parseError, setParseError] = useState<string | null>(null);

  const submit = () => {
    setParseError(null);
    try {
      create.mutate(
        { display_name: name.trim(), metadata: metadataObject(metadata) },
        {
          onSuccess: (vault) => {
            setOpen(false);
            setCreated(vault);
          },
        },
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
          if (create.isPending) return;
          setOpen(next);
          if (!next) {
            setName("");
            setMetadata("{}");
            setParseError(null);
            create.reset();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">Create vault</DialogTitle>
            <DialogDescription>
              Store credentials for your agents to use.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vault-name">Name</Label>
              <Input
                id="vault-name"
                placeholder="Example vault"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <details className="space-y-1.5 text-sm">
              <summary>Metadata (optional)</summary>
              <Label htmlFor="vault-metadata">Metadata (JSON object)</Label>
              <textarea
                id="vault-metadata"
                rows={4}
                className="w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring"
                value={metadata}
                onChange={(event) => setMetadata(event.target.value)}
              />
            </details>
          </div>
          {(parseError || create.error instanceof Error) && (
            <p role="alert" className="text-sm text-destructive">
              {parseError ?? (create.error as Error).message}
            </p>
          )}
          <DialogFooter className="m-0 border-0 bg-transparent p-0">
            <Button
              variant="ghost"
              disabled={create.isPending}
              onClick={() => {
                setOpen(false);
                setName("");
                setMetadata("{}");
                setParseError(null);
                create.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || create.isPending}
              onClick={submit}
            >
              {create.isPending ? "Creating…" : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {created && (
        <CredentialDialog
          vaultId={created.id}
          firstVaultName={created.display_name}
          open
          onOpenChange={(next) => {
            if (!next) {
              router.push("/vaults/" + created.id);
              setCreated(null);
              setName("");
              setMetadata("{}");
            }
          }}
        />
      )}
    </>
  );
}
