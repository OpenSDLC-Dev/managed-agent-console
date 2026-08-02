"use client";

import { RequestId } from "@/components/console/bits";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
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

export default function NewSessionPage() {
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
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

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
    <div>
      <PageHeader
        title="Create session"
        subtitle="Bind an agent to an environment and start working. The first message goes in from the session view — the platform takes no initial events at create."
      />
      <div className="max-w-2xl space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Agent</Label>
            <Select value={agentId} onValueChange={(v) => setAgentId(v ?? "")}>
              <SelectTrigger
                size="sm"
                className="h-8 w-full rounded-lg"
                aria-label="Agent"
              >
                <SelectValue placeholder="Pick an agent" />
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
            <Label>Environment</Label>
            <Select
              value={environmentId}
              onValueChange={(v) => setEnvironmentId(v ?? "")}
            >
              <SelectTrigger
                size="sm"
                className="h-8 w-full rounded-lg"
                aria-label="Environment"
              >
                <SelectValue placeholder="Pick an environment" />
              </SelectTrigger>
              <SelectContent>
                {(environments.data?.data ?? []).map((environment) => (
                  <SelectItem key={environment.id} value={environment.id}>
                    {environment.name} · {environment.config.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="session-title">Title (optional)</Label>
          <Input
            id="session-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {(vaults.data?.data ?? []).length > 0 && (
          <div>
            <Label className="pb-2">Credential vaults</Label>
            <div className="space-y-1.5">
              {vaults.data!.data.map((vault) => (
                <label
                  key={vault.id}
                  className="flex items-center gap-2.5 text-sm"
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
            <p className="pt-1 text-[12px] text-muted-foreground">
              Vault bindings are immutable once the session exists.
            </p>
          </div>
        )}

        <div>
          <Label className="pb-2">File mounts</Label>
          <div className="space-y-1.5">
            {attached.map((file) => (
              <div
                key={file.file_id}
                className="flex items-center gap-2 text-sm"
              >
                <Paperclip className="size-3.5 text-muted-foreground" />
                {file.filename}
                <button
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
          <Button variant="ghost" onClick={() => router.back()}>
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
    </div>
  );
}
