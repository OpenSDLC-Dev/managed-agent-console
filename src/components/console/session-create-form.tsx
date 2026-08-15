"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Paperclip, X } from "lucide-react";
import { RequestId, hostingTypeLabel } from "@/components/console/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlatformError } from "@/lib/platform/http";
import {
  useAgents,
  useCreateSession,
  useEnvironments,
  useUploadFile,
  useVaults,
} from "@/lib/platform/queries";

interface AttachedFile {
  file_id: string;
  filename: string;
}

function ManageLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[13px] text-foreground/80 underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

export function SessionCreateForm({ onCancel }: { onCancel?: () => void }) {
  const router = useRouter();
  const agents = useAgents({ limit: 100 });
  const environments = useEnvironments({ limit: 100 });
  const vaults = useVaults({ limit: 100 });
  const upload = useUploadFile();
  const create = useCreateSession();

  const [agentId, setAgentId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [title, setTitle] = useState("");
  const [vaultIds, setVaultIds] = useState<string[]>([]);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const vaultList = vaults.data?.data ?? [];

  const save = () =>
    create.mutate(
      {
        agent: agentId,
        environment_id: environmentId,
        ...(title ? { title } : {}),
        ...(vaultIds.length > 0 ? { vault_ids: vaultIds } : {}),
        ...(attached.length > 0
          ? {
              resources: attached.map((f) => ({
                type: "file" as const,
                file_id: f.file_id,
              })),
            }
          : {}),
      },
      { onSuccess: (session) => router.push(`/sessions/${session.id}`) },
    );

  const error =
    create.error instanceof Error
      ? create.error
      : upload.error instanceof Error
        ? upload.error
        : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="session-title">Title (optional)</Label>
        <Input
          id="session-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Agent</Label>
          <ManageLink href="/agents">Manage agents</ManageLink>
        </div>
        <Select value={agentId} onValueChange={(v) => setAgentId(v ?? "")}>
          <SelectTrigger
            size="sm"
            className="h-8 w-full rounded-lg"
            aria-label="Agent"
          >
            <SelectValue placeholder="Select an agent" />
          </SelectTrigger>
          <SelectContent>
            {(agents.data?.data ?? []).map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name} · v{agent.version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Environment</Label>
          <ManageLink href="/environments">Manage environments</ManageLink>
        </div>
        <Select
          value={environmentId}
          onValueChange={(v) => setEnvironmentId(v ?? "")}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-full rounded-lg"
            aria-label="Environment"
          >
            <SelectValue placeholder="Select an environment" />
          </SelectTrigger>
          <SelectContent>
            {(environments.data?.data ?? []).map((environment) => (
              <SelectItem key={environment.id} value={environment.id}>
                {environment.name} · {hostingTypeLabel(environment.config.type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {vaultList.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Credential vaults (optional)</Label>
            <ManageLink href="/vaults">Manage credential vaults</ManageLink>
          </div>
          <div className="relative">
            <button
              type="button"
              aria-label="Credential vaults"
              aria-expanded={vaultOpen}
              aria-haspopup="listbox"
              className="flex h-8 w-full items-center justify-between rounded-lg border px-2.5 text-sm"
              onClick={() => setVaultOpen((open) => !open)}
            >
              <span className="truncate text-muted-foreground">
                {vaultIds.length === 0
                  ? "Select one or more vaults"
                  : vaultList
                      .filter((v) => vaultIds.includes(v.id))
                      .map((v) => v.display_name)
                      .join(", ")}
              </span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>
            {vaultOpen && (
              <div
                role="listbox"
                aria-multiselectable="true"
                className="absolute z-20 mt-1 w-full rounded-lg border bg-popover p-1 shadow-md"
              >
                {vaultList.map((vault) => (
                  <label
                    key={vault.id}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={vaultIds.includes(vault.id)}
                      onChange={(e) =>
                        setVaultIds(
                          e.target.checked
                            ? [...vaultIds, vault.id]
                            : vaultIds.filter((id) => id !== vault.id),
                        )
                      }
                    />
                    {vault.display_name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground">
            Vault bindings are immutable once the session exists.
          </p>
        </div>
      )}

      <div>
        <Label className="pb-2">File mounts</Label>
        <div className="space-y-1.5">
          {attached.map((file) => (
            <div key={file.file_id} className="flex items-center gap-2 text-sm">
              <Paperclip className="size-3.5 text-muted-foreground" />
              {file.filename}
              <button
                type="button"
                aria-label={`Remove ${file.filename}`}
                onClick={() =>
                  setAttached(
                    attached.filter((f) => f.file_id !== file.file_id),
                  )
                }
              >
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
          <input
            ref={fileInput}
            type="file"
            aria-label="Upload file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              upload.mutate(file, {
                onSuccess: (uploaded) =>
                  setAttached((a) => [
                    ...a,
                    { file_id: uploaded.id, filename: uploaded.filename },
                  ]),
              });
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip className="size-4" />
            {upload.isPending ? "Uploading…" : "Attach file"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={save}
          disabled={create.isPending || !agentId || !environmentId}
        >
          Create session
        </Button>
        <Button
          variant="ghost"
          onClick={() => (onCancel ? onCancel() : router.back())}
        >
          Cancel
        </Button>
        {error && (
          <span className="text-sm text-destructive">
            {error.message}
            {error instanceof PlatformError && error.requestId && (
              <span className="pl-2">
                <RequestId id={error.requestId} />
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
