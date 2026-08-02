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

export function CreateVaultButton() {
  const router = useRouter();
  const create = useCreateVault();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <>
      <Button className="h-8" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Create vault
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create vault</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="vault-name">Display name</Label>
            <Input
              id="vault-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {create.error instanceof Error && (
            <p className="text-sm text-destructive">{create.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name || create.isPending}
              onClick={() =>
                create.mutate(
                  { display_name: name },
                  { onSuccess: (vault) => router.push(`/vaults/${vault.id}`) },
                )
              }
            >
              Create vault
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
