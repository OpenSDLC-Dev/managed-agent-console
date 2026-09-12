"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLeaveConfirmation } from "@/components/shell/unsaved-changes";
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
import { InitialResources } from "./initial-resources";
import type { Agent } from "@/lib/platform/types";
import type { ResourceInput } from "@/lib/platform/session-resources";
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

export function SessionCreateForm({
  onCancel,
  initialAgent,
}: {
  onCancel?: () => void;
  initialAgent?: Agent;
}) {
  const router = useRouter();
  const leave = useLeaveConfirmation();
  const agents = useAgents({ limit: 100 });
  const environments = useEnvironments({ limit: 100 });
  const vaults = useVaults({ limit: 100 });
  const upload = useUploadFile();
  const create = useCreateSession();

  const [agentId, setAgentId] = useState(initialAgent?.id ?? "");
  const [environmentId, setEnvironmentId] = useState("");
  const [title, setTitle] = useState("");
  const [vaultIds, setVaultIds] = useState<string[]>([]);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [initialResources, setInitialResources] = useState<ResourceInput[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const vaultList = vaults.data?.data ?? [];

  const save = () => {
    if (create.isPending || upload.isPending || !agentId || !environmentId)
      return;
    leave.requestLeave(() =>
      create.mutate(
        {
          agent:
            initialAgent?.id === agentId
              ? { type: "agent", id: agentId, version: initialAgent.version }
              : agentId,
          environment_id: environmentId,
          ...(title ? { title } : {}),
          ...(vaultIds.length > 0 ? { vault_ids: vaultIds } : {}),
          ...(attached.length > 0 || initialResources.length > 0
            ? {
                resources: [
                  ...attached.map((f) => ({
                    type: "file" as const,
                    file_id: f.file_id,
                  })),
                  ...initialResources,
                ],
              }
            : {}),
        },
        {
          onSuccess: (session) => {
            setInitialResources([]);
            create.reset();
            leave.setDirty(false);
            router.push(`/sessions/${session.id}`);
          },
        },
      ),
    );
  };

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

      {initialAgent ? (
        <p
          className="text-sm text-muted-foreground"
          data-session-agent-id={initialAgent.id}
          data-session-agent-version={initialAgent.version}
        >
          {initialAgent.name} · v{initialAgent.version}
        </p>
      ) : (
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
      )}

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

      <InitialResources
        resources={initialResources}
        onChange={setInitialResources}
        owner="session"
        onAttachFile={() => fileInput.current?.click()}
        uploadPending={upload.isPending}
      >
        <div>
          <div className="space-y-1.5">
            {attached.map((file) => (
              <div
                key={file.file_id}
                className="flex items-center gap-2 text-sm"
              >
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
          </div>
        </div>
      </InitialResources>

      <div className="flex items-center gap-3">
        <Button
          onClick={save}
          disabled={
            create.isPending || upload.isPending || !agentId || !environmentId
          }
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
          <span role="alert" className="text-sm text-destructive">
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
