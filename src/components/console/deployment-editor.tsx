"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Paperclip, X } from "lucide-react";
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
import { InitialResources } from "@/components/console/initial-resources";
import { RequestId, hostingTypeLabel } from "@/components/console/bits";
import { PlatformError } from "@/lib/platform/http";
import type { ResourceInput } from "@/lib/platform/session-resources";
import type { Deployment } from "@/lib/platform/types";
import {
  useAgentOptions,
  useCreateDeployment,
  useEnvironments,
  useUpdateDeployment,
  useUploadFile,
  useVaults,
  type DeploymentWriteBody,
} from "@/lib/platform/queries";

interface AttachedFile {
  file_id: string;
  filename: string;
}

export interface DeploymentForm {
  name: string;
  description: string;
  agentId: string;
  agentVersion?: number;
  environmentId: string;
  vaultIds: string[];
  initialEvents: string;
  metadata: string;
  scheduleEnabled: boolean;
  scheduleExpression: string;
  scheduleTimezone: string;
}

export function newDeploymentForm(): DeploymentForm {
  return {
    name: "",
    description: "",
    agentId: "",
    environmentId: "",
    vaultIds: [],
    initialEvents: JSON.stringify(
      [
        {
          type: "user.message",
          content: "Run the deployment task.",
        },
      ],
      null,
      2,
    ),
    metadata: "{}",
    scheduleEnabled: false,
    scheduleExpression: "0 9 * * 1-5",
    scheduleTimezone: "UTC",
  };
}

export function formFromDeployment(deployment: Deployment): DeploymentForm {
  return {
    name: deployment.name,
    description: deployment.description ?? "",
    agentId: deployment.agent.id,
    agentVersion: deployment.agent.version,
    environmentId: deployment.environment_id,
    vaultIds: deployment.vault_ids,
    initialEvents: JSON.stringify(deployment.initial_events, null, 2),
    metadata: JSON.stringify(deployment.metadata, null, 2),
    scheduleEnabled: deployment.schedule !== null,
    scheduleExpression: deployment.schedule?.expression ?? "0 9 * * 1-5",
    scheduleTimezone: deployment.schedule?.timezone ?? "UTC",
  };
}

export function deploymentBodyFromForm(
  form: DeploymentForm,
  resources?: ResourceInput[],
  previousMetadata?: Record<string, string>,
): DeploymentWriteBody {
  const metadata = JSON.parse(form.metadata) as Record<string, string>;
  const metadataPatch: Record<string, string | null> = { ...metadata };
  for (const key of Object.keys(previousMetadata ?? {})) {
    if (!(key in metadata)) metadataPatch[key] = null;
  }
  return {
    name: form.name,
    description: form.description || null,
    agent: {
      type: "agent",
      id: form.agentId,
      ...(form.agentVersion ? { version: form.agentVersion } : {}),
    },
    environment_id: form.environmentId,
    vault_ids: form.vaultIds,
    initial_events: JSON.parse(form.initialEvents) as object[],
    ...(resources ? { resources } : {}),
    metadata: metadataPatch,
    schedule: form.scheduleEnabled
      ? {
          type: "cron",
          expression: form.scheduleExpression,
          timezone: form.scheduleTimezone,
        }
      : null,
  };
}

export function DeploymentEditor({
  mode,
  initial,
  deploymentId,
}: {
  mode: "create" | "edit";
  initial: DeploymentForm;
  deploymentId?: string;
}) {
  const router = useRouter();
  const agents = useAgentOptions();
  const environments = useEnvironments({ limit: 100 });
  const vaults = useVaults({ limit: 100 });
  const upload = useUploadFile();
  const create = useCreateDeployment();
  const update = useUpdateDeployment(deploymentId ?? "");
  const mutation = mode === "create" ? create : update;
  const [form, setForm] = useState(initial);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [resources, setResources] = useState<
    Exclude<ResourceInput, { type: "file" }>[]
  >([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof DeploymentForm>(
    key: K,
    value: DeploymentForm[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const agentList = (agents.data?.agents ?? []).filter(
    (agent) => !agent.archived_at,
  );
  const environmentList = (environments.data?.data ?? []).filter(
    (environment) => !environment.archived_at,
  );
  const vaultList = (vaults.data?.data ?? []).filter(
    (vault) => !vault.archived_at,
  );
  const initialAgent = initial.agentVersion
    ? {
        id: initial.agentId,
        version: initial.agentVersion,
        name:
          agentList.find((agent) => agent.id === initial.agentId)?.name ??
          initial.agentId,
      }
    : null;
  const agentChoices = agentList.map((agent) => ({
    id: agent.id,
    version: agent.version,
    name: agent.name,
    pinned: false,
  }));
  if (
    initialAgent &&
    !agentChoices.some(
      (agent) =>
        agent.id === initialAgent.id && agent.version === initialAgent.version,
    )
  ) {
    agentChoices.unshift({ ...initialAgent, pinned: true });
  }
  const agentValue =
    form.agentId && form.agentVersion
      ? `${form.agentId}:${form.agentVersion}`
      : "";

  const save = () => {
    setParseError(null);
    let body: DeploymentWriteBody;
    try {
      body = deploymentBodyFromForm(
        form,
        mode === "create"
          ? [
              ...attached.map((file) => ({
                type: "file" as const,
                file_id: file.file_id,
              })),
              ...resources,
            ]
          : undefined,
        mode === "edit"
          ? (JSON.parse(initial.metadata) as Record<string, string>)
          : undefined,
      );
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Invalid JSON configuration",
      );
      return;
    }
    mutation.mutate(body, {
      onSuccess: (deployment) => router.push(`/deployments/${deployment.id}`),
    });
  };
  const error =
    parseError ??
    (mutation.error instanceof Error
      ? mutation.error.message
      : upload.error instanceof Error
        ? upload.error.message
        : null);
  const requestId =
    mutation.error instanceof PlatformError ? mutation.error.requestId : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deployment-name">Name</Label>
          <Input
            id="deployment-name"
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deployment-description">Description</Label>
          <Input
            id="deployment-description"
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Agent</Label>
        <Select
          value={agentValue}
          onValueChange={(value) => {
            const agent = agentChoices.find(
              (candidate) => `${candidate.id}:${candidate.version}` === value,
            );
            if (!agent) return;
            setForm((current) => ({
              ...current,
              agentId: agent.id,
              agentVersion: agent.version,
            }));
          }}
        >
          <SelectTrigger aria-label="Agent" className="h-8 w-full">
            <SelectValue placeholder="Select an agent" />
          </SelectTrigger>
          <SelectContent>
            {agentChoices.map((agent) => (
              <SelectItem
                key={`${agent.id}:${agent.version}`}
                value={`${agent.id}:${agent.version}`}
              >
                {agent.name} · v{agent.version}
                {agent.pinned ? " (pinned)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Environment</Label>
        <Select
          value={form.environmentId}
          onValueChange={(id) => set("environmentId", id ?? "")}
        >
          <SelectTrigger aria-label="Environment" className="h-8 w-full">
            <SelectValue placeholder="Select an environment" />
          </SelectTrigger>
          <SelectContent>
            {environmentList.map((environment) => (
              <SelectItem key={environment.id} value={environment.id}>
                {environment.name} · {hostingTypeLabel(environment.config.type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {vaultList.length > 0 && (
        <div className="space-y-1.5">
          <Label>Credential vaults (optional)</Label>
          <div className="relative">
            <button
              type="button"
              aria-label="Credential vaults"
              aria-expanded={vaultOpen}
              className="flex h-8 w-full items-center justify-between rounded-lg border px-2.5 text-sm"
              onClick={() => setVaultOpen((open) => !open)}
            >
              <span className="truncate text-muted-foreground">
                {form.vaultIds.length === 0
                  ? "Select one or more vaults"
                  : vaultList
                      .filter((vault) => form.vaultIds.includes(vault.id))
                      .map((vault) => vault.display_name)
                      .join(", ")}
              </span>
              <ChevronsUpDown className="size-3.5" />
            </button>
            {vaultOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover p-1 shadow-md">
                {vaultList.map((vault) => (
                  <label
                    key={vault.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={form.vaultIds.includes(vault.id)}
                      onChange={(event) =>
                        set(
                          "vaultIds",
                          event.target.checked
                            ? [...form.vaultIds, vault.id]
                            : form.vaultIds.filter((id) => id !== vault.id),
                        )
                      }
                    />
                    {vault.display_name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="deployment-events">Initial events (JSON)</Label>
        <textarea
          id="deployment-events"
          value={form.initialEvents}
          onChange={(event) => set("initialEvents", event.target.value)}
          rows={9}
          spellCheck={false}
          className="w-full rounded-lg border bg-transparent p-2.5 font-mono text-[13px] outline-none focus-visible:border-ring"
        />
        <p className="text-xs text-muted-foreground">
          A non-empty array of user.message, user.define_outcome and optional
          trailing system.message events.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="deployment-metadata">Metadata (JSON object)</Label>
        <textarea
          id="deployment-metadata"
          value={form.metadata}
          onChange={(event) => set("metadata", event.target.value)}
          rows={4}
          spellCheck={false}
          className="w-full rounded-lg border bg-transparent p-2.5 font-mono text-[13px] outline-none focus-visible:border-ring"
        />
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.scheduleEnabled}
            onChange={(event) => set("scheduleEnabled", event.target.checked)}
          />
          Run on a schedule
        </label>
        {form.scheduleEnabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="deployment-cron">Cron expression</Label>
              <Input
                id="deployment-cron"
                className="font-mono"
                value={form.scheduleExpression}
                onChange={(event) =>
                  set("scheduleExpression", event.target.value)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deployment-timezone">IANA timezone</Label>
              <Input
                id="deployment-timezone"
                value={form.scheduleTimezone}
                onChange={(event) =>
                  set("scheduleTimezone", event.target.value)
                }
              />
            </div>
          </div>
        )}
      </div>

      {mode === "create" && (
        <>
          <div>
            <Label className="pb-2">File resources</Label>
            <div className="space-y-2">
              {attached.map((file) => (
                <div
                  key={file.file_id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Paperclip className="size-3.5" />
                  {file.filename}
                  <button
                    type="button"
                    aria-label={`Remove ${file.filename}`}
                    onClick={() =>
                      setAttached((current) =>
                        current.filter((item) => item.file_id !== file.file_id),
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <input
                ref={fileInput}
                type="file"
                aria-label="Upload file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  upload.mutate(file, {
                    onSuccess: (uploaded) =>
                      setAttached((current) => [
                        ...current,
                        { file_id: uploaded.id, filename: uploaded.filename },
                      ]),
                  });
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={upload.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip className="size-4" /> Attach file
              </Button>
            </div>
          </div>
          <InitialResources
            resources={resources}
            onChange={setResources}
            owner="deployment"
          />
        </>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={save}
          disabled={
            mutation.isPending ||
            upload.isPending ||
            !form.name ||
            !form.agentId ||
            !form.environmentId
          }
        >
          {mode === "create" ? "Create deployment" : "Save changes"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        {error && (
          <span className="text-sm text-destructive">
            {error}
            {requestId && <RequestId id={requestId} />}
          </span>
        )}
      </div>
    </div>
  );
}
