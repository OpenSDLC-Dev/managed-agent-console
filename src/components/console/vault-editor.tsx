"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequestId } from "@/components/console/bits";
import { PlatformError } from "@/lib/platform/http";
import { metadataPatch } from "@/lib/platform/metadata";
import { useUpdateVault } from "@/lib/platform/queries";
import type { Vault } from "@/lib/platform/types";

export function VaultEditor({ vault }: { vault: Vault }) {
  const router = useRouter();
  const update = useUpdateVault(vault.id);
  const [name, setName] = useState(vault.display_name);
  const [metadata, setMetadata] = useState(
    JSON.stringify(vault.metadata, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const save = () => {
    setParseError(null);
    try {
      update.mutate(
        {
          display_name: name,
          metadata: metadataPatch(metadata, vault.metadata),
        },
        { onSuccess: () => router.push(`/vaults/${vault.id}`) },
      );
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Invalid metadata JSON",
      );
    }
  };
  const error =
    parseError ?? (update.error instanceof Error ? update.error.message : null);
  const requestId =
    update.error instanceof PlatformError ? update.error.requestId : null;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="vault-name">Display name</Label>
        <Input
          id="vault-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vault-metadata">Metadata (JSON object)</Label>
        <textarea
          id="vault-metadata"
          className="min-h-36 w-full rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          value={metadata}
          onChange={(event) => setMetadata(event.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
          {requestId && <RequestId id={requestId} />}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button disabled={!name || update.isPending} onClick={save}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
