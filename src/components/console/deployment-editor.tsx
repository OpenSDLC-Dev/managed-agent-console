"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "@/components/shell/unsaved-changes";
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
import { DeploymentSchedule } from "./deployment-schedule";
import { DeploymentAgentVersion } from "./deployment-agent-version";
import { InitialResources } from "@/components/console/initial-resources";
import { RequestId, hostingTypeLabel } from "@/components/console/bits";
import { PlatformError } from "@/lib/platform/http";
import type { ResourceInput } from "@/lib/platform/session-resources";
import type { Deployment, DeploymentResource } from "@/lib/platform/types";
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
          content: "",
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

function editableResources(resources: DeploymentResource[]): ResourceInput[] {
  return resources.map((resource) =>
    resource.type === "github_repository"
      ? { ...resource, authorization_token: "" }
      : resource.type === "memory_store"
        ? { ...resource, instructions: resource.instructions ?? undefined }
        : { ...resource },
  );
}

export function deploymentBodyFromForm(
  form: DeploymentForm,
  resources?: ResourceInput[],
  previousMetadata?: Record<string, string>,
): DeploymentWriteBody {
  const metadata = JSON.parse(form.metadata.trim() || "{}") as Record<
    string,
    string
  >;
  const metadataPatch: Record<string, string | null> = Object.fromEntries([
    ...Object.entries(metadata),
    ...Object.keys(previousMetadata ?? {})
      .filter((key) => !Object.hasOwn(metadata, key))
      .map((key) => [key, null]),
  ]);
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

/** Only a single plain message can be edited without losing advanced fields. */
export function initialMessageFromEvents(raw: string): string | null {
  try {
    const events: unknown = JSON.parse(raw);
    if (!Array.isArray(events) || events.length !== 1) return null;
    const event = events[0];
    return event &&
      event.type === "user.message" &&
      typeof event.content === "string" &&
      Object.keys(event).every((key) => key === "type" || key === "content")
      ? event.content
      : null;
  } catch {
    return null;
  }
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-8 gap-y-3 border-t py-6 first:border-t-0 first:pt-0 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[15px] font-medium">{title}</h2>
        <p className="pt-1 text-[13px] text-muted-foreground">{hint}</p>
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex rounded-lg bg-muted p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="relative flex min-w-0 flex-1">
          <input
            type="radio"
            name={label}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span className="pointer-events-none w-full rounded-md px-3 py-1 text-center text-sm text-muted-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-50">
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function DeploymentEditor({
  mode,
  initial,
  deploymentId,
  onCancel,
  inline = false,
  readOnly = false,
  initialResources = [],
  onSaved,
  scheduleDetails,
}: {
  mode: "create" | "edit";
  initial: DeploymentForm;
  deploymentId?: string;
  onCancel?: () => void;
  inline?: boolean;
  readOnly?: boolean;
  initialResources?: DeploymentResource[];
  onSaved?: (deployment: Deployment) => void;
  scheduleDetails?: ReactNode;
}) {
  const router = useRouter();
  const agents = useAgentOptions();
  const environments = useEnvironments({ limit: 100 });
  const vaults = useVaults({ limit: 100 });
  const upload = useUploadFile();
  const create = useCreateDeployment();
  const update = useUpdateDeployment(deploymentId ?? "");
  const mutation = mode === "create" ? create : update;
  const [base, setBase] = useState(initial);
  const [form, setForm] = useState(initial);
  const [baseResources, setBaseResources] = useState(() =>
    editableResources(initialResources),
  );
  const [eventsView, setEventsView] = useState(() =>
    initialMessageFromEvents(initial.initialEvents) === null
      ? "advanced"
      : "message",
  );
  const initialMessage = initialMessageFromEvents(form.initialEvents);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [resources, setResources] = useState<ResourceInput[]>(baseResources);
  const resourcesDirty =
    JSON.stringify(resources) !== JSON.stringify(baseResources);
  const dirty =
    JSON.stringify(form) !== JSON.stringify(base) ||
    resourcesDirty ||
    attached.length > 0;
  const leave = useUnsavedChanges(inline && !readOnly && dirty);
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
  const vaultChoices = [
    ...vaultList.map((vault) => ({
      id: vault.id,
      display_name: vault.display_name,
    })),
    ...form.vaultIds
      .filter((id) => !vaultList.some((vault) => vault.id === id))
      .map((id) => ({ id, display_name: id })),
  ];
  const initialAgent = base.agentVersion
    ? {
        id: base.agentId,
        version: base.agentVersion,
        name:
          agentList.find((agent) => agent.id === base.agentId)?.name ??
          base.agentId,
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
  const visibleAgentChoices = inline
    ? [...new Map(agentChoices.map((agent) => [agent.id, agent])).values()]
    : agentChoices;

  const save = () => {
    if (
      mutation.isPending ||
      upload.isPending ||
      readOnly ||
      !form.name ||
      !form.agentId ||
      !form.environmentId ||
      initialMessage === ""
    )
      return;
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
          : resourcesDirty
            ? resources
            : undefined,
        mode === "edit"
          ? (JSON.parse(base.metadata) as Record<string, string>)
          : undefined,
      );
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Invalid JSON configuration",
      );
      return;
    }
    mutation.mutate(body, {
      onSuccess: (deployment) => {
        if (inline) {
          const next = formFromDeployment(deployment);
          const nextResources = editableResources(deployment.resources);
          setBase(next);
          setForm(next);
          setBaseResources(nextResources);
          setResources(nextResources);
          setAttached([]);
          leave.setDirty(false);
          onSaved?.(deployment);
        } else router.push(`/deployments/${encodeURIComponent(deployment.id)}`);
      },
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
    <form
      className={
        inline ? "flex min-h-0 w-full max-w-4xl flex-1 flex-col" : "max-w-4xl"
      }
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <fieldset
        disabled={readOnly || mutation.isPending || upload.isPending}
        className={
          inline ? "min-h-0 min-w-0 flex-1 overflow-y-auto pr-2" : "min-w-0"
        }
      >
        <Section title="General" hint="What this deployment runs, and where.">
          <div className="space-y-5">
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
          <div className={inline ? "grid gap-3 sm:grid-cols-[2fr_1fr]" : ""}>
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <Label>Agent</Label>
                <a
                  href="/agents"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground underline"
                >
                  Manage agents ↗
                </a>
              </div>
              <Select
                value={inline ? form.agentId : agentValue}
                onValueChange={(value) => {
                  const agent = visibleAgentChoices.find(
                    (candidate) =>
                      (inline
                        ? candidate.id
                        : `${candidate.id}:${candidate.version}`) === value,
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
                  <SelectValue placeholder="Select an agent">
                    {inline
                      ? (visibleAgentChoices.find(
                          (agent) => agent.id === form.agentId,
                        )?.name ?? form.agentId)
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {visibleAgentChoices.map((agent) => (
                    <SelectItem
                      key={`${agent.id}:${agent.version}`}
                      value={inline ? agent.id : `${agent.id}:${agent.version}`}
                    >
                      {agent.name}
                      {!inline &&
                        ` · v${agent.version}${agent.pinned ? " (pinned)" : ""}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inline && form.agentId && (
              <DeploymentAgentVersion
                id={form.agentId}
                version={form.agentVersion}
                head={
                  agentList.find((agent) => agent.id === form.agentId)?.version
                }
                onChange={(version) => set("agentVersion", version)}
                disabled={readOnly || mutation.isPending || upload.isPending}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <Label>Environment</Label>
              <a
                href="/environments"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground underline"
              >
                Manage environments ↗
              </a>
            </div>
            <Select
              value={form.environmentId}
              onValueChange={(id) => set("environmentId", id ?? "")}
            >
              <SelectTrigger aria-label="Environment" className="h-8 w-full">
                <SelectValue placeholder="Select an environment">
                  {inline
                    ? (environmentList.find(
                        (environment) => environment.id === form.environmentId,
                      )?.name ?? form.environmentId)
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {form.environmentId &&
                  !environmentList.some(
                    (environment) => environment.id === form.environmentId,
                  ) && (
                    <SelectItem value={form.environmentId}>
                      {form.environmentId}
                    </SelectItem>
                  )}
                {environmentList.map((environment) => (
                  <SelectItem key={environment.id} value={environment.id}>
                    {environment.name} ·{" "}
                    {hostingTypeLabel(environment.config.type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Choice
              label="Initial event editor"
              value={eventsView}
              onChange={setEventsView}
              options={[
                {
                  value: "message",
                  label: "Initial message",
                  disabled: initialMessage === null,
                },
                { value: "advanced", label: "Advanced events" },
              ]}
            />
            {eventsView === "message" ? (
              <div className="space-y-1.5">
                <Label htmlFor="deployment-message">Initial message</Label>
                <textarea
                  id="deployment-message"
                  rows={3}
                  placeholder="What should the agent do on each run?"
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                  value={initialMessage ?? ""}
                  onChange={(event) =>
                    set(
                      "initialEvents",
                      JSON.stringify(
                        [{ type: "user.message", content: event.target.value }],
                        null,
                        2,
                      ),
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Sent to the agent at the start of every run.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="deployment-events">
                    Initial events (JSON)
                  </Label>
                  <textarea
                    id="deployment-events"
                    value={form.initialEvents}
                    onChange={(event) =>
                      set("initialEvents", event.target.value)
                    }
                    rows={9}
                    spellCheck={false}
                    className="w-full rounded-lg border bg-transparent p-2.5 font-mono text-[13px] outline-none focus-visible:border-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    A non-empty array of user.message, user.define_outcome and
                    optional trailing system.message events.
                  </p>
                </div>
                {initialMessage === null && (
                  <p className="text-xs text-muted-foreground">
                    Keep advanced events to preserve multiple messages,
                    structured content and outcome definitions.
                  </p>
                )}
              </>
            )}
          </div>
        </Section>
        <Section title="Trigger" hint="Start runs on demand or on a schedule.">
          <div className="space-y-3">
            <Choice
              label="Trigger type"
              value={form.scheduleEnabled ? "schedule" : "manual"}
              onChange={(value) => set("scheduleEnabled", value === "schedule")}
              options={[
                { value: "manual", label: "Manual" },
                { value: "schedule", label: "Schedule" },
              ]}
            />
            {!form.scheduleEnabled && (
              <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                Start a run with Run now or{" "}
                <code>POST /v1/deployments/:id/run</code>.
              </p>
            )}
            {form.scheduleEnabled && (
              <DeploymentSchedule
                expression={form.scheduleExpression}
                timezone={form.scheduleTimezone}
                onExpressionChange={(value) => set("scheduleExpression", value)}
                onTimezoneChange={(value) => set("scheduleTimezone", value)}
              />
            )}
          </div>
          {scheduleDetails}
        </Section>
        <Section
          title="Resources"
          hint="Credentials and resources available to each run."
        >
          {vaultChoices.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <Label>Credential vaults (optional)</Label>
                <a
                  href="/vaults"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground underline"
                >
                  Manage credential vaults ↗
                </a>
              </div>
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
                      : vaultChoices
                          .filter((vault) => form.vaultIds.includes(vault.id))
                          .map((vault) => vault.display_name)
                          .join(", ")}
                  </span>
                  <ChevronsUpDown className="size-3.5" />
                </button>
                {vaultOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover p-1 shadow-md">
                    {vaultChoices.map((vault) => (
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
          {mode === "edit" && inline && (
            <>
              {resources.some(
                (resource) => resource.type === "github_repository",
              ) && (
                <p className="text-xs text-muted-foreground">
                  Changing attachments requires a token for each repository.
                  Existing tokens are kept when attachments are unchanged.
                </p>
              )}
              <InitialResources
                resources={resources}
                onChange={setResources}
                owner="deployment"
                uploadPending={upload.isPending}
                onAttachFile={() =>
                  setResources((current) => [
                    ...current,
                    { type: "file", file_id: "" },
                  ])
                }
                onFileUpload={(index, file) => {
                  upload.mutate(file, {
                    onSuccess: (result) =>
                      setResources((current) =>
                        current.map((resource, i) =>
                          i === index && resource.type === "file"
                            ? { ...resource, file_id: result.id }
                            : resource,
                        ),
                      ),
                  });
                }}
              />
            </>
          )}
          {mode === "create" && (
            <>
              <InitialResources
                resources={resources}
                onChange={setResources}
                owner="deployment"
                onAttachFile={() => fileInput.current?.click()}
                uploadPending={upload.isPending}
              >
                <div>
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
                              current.filter(
                                (item) => item.file_id !== file.file_id,
                              ),
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
                              {
                                file_id: uploaded.id,
                                filename: uploaded.filename,
                              },
                            ]),
                        });
                        event.target.value = "";
                      }}
                    />
                  </div>
                </div>
              </InitialResources>
            </>
          )}
        </Section>
        <details className="mb-6 rounded-lg border p-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Metadata (optional)
          </summary>
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
        </details>
      </fieldset>
      {!readOnly && (!inline || dirty || error) && (
        <div
          className={
            inline
              ? "mx-auto mt-3 flex w-fit max-w-full shrink-0 flex-wrap items-center gap-3 rounded-xl border bg-background p-2 shadow-md"
              : "flex flex-wrap items-center gap-3"
          }
        >
          {inline && dirty && (
            <span role="status" className="text-sm">
              Unsaved changes
            </span>
          )}
          <Button
            type="submit"
            className={inline ? "order-2" : undefined}
            aria-label={inline ? "Save changes" : undefined}
            disabled={
              mutation.isPending ||
              upload.isPending ||
              (inline && !dirty) ||
              !form.name ||
              !form.agentId ||
              !form.environmentId ||
              initialMessage === ""
            }
          >
            {mode === "create"
              ? "Create deployment"
              : inline
                ? "Save"
                : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={inline ? "order-1" : undefined}
            onClick={() => {
              if (inline) {
                setForm(base);
                setResources(baseResources);
                setAttached([]);
                setParseError(null);
                mutation.reset();
                upload.reset();
                leave.setDirty(false);
              } else if (onCancel) onCancel();
              else router.back();
            }}
            disabled={
              mutation.isPending || upload.isPending || (inline && !dirty)
            }
          >
            {inline ? "Discard" : "Cancel"}
          </Button>
          {error && (
            <span role="alert" className="order-3 text-sm text-destructive">
              {error}
              {requestId && <RequestId id={requestId} />}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
