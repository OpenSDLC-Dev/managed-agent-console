"use client";

import {
  AdditionalToolsEditor,
  schemaDraftError,
  toolsWithSchemaDrafts,
  type SchemaDrafts,
  type MCPBindings,
} from "./additional-tools-editor";
import { RequestId } from "@/components/console/bits";
import {
  ModelField,
  modelChosen,
  useModelChoices,
} from "@/components/console/model-field";
import { useId, useState, type ReactNode } from "react";
import { useUnsavedChanges } from "@/components/shell/unsaved-changes";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
import { SchemaTextarea } from "./schema-textarea";
import { AgentStartingPoint } from "./agent-starting-point";
import { AgentModelMenu } from "./agent-model-menu";
import { effortLevels, type ModelEffort } from "@/lib/platform/model-effort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/copy-text";
import { PlatformError } from "@/lib/platform/http";
import {
  useCreateAgent,
  useAgentOptions,
  useSkillOptions,
  useUpdateAgent,
  type AgentWriteBody,
} from "@/lib/platform/queries";
import type { Agent } from "@/lib/platform/types";
import {
  buildToolset,
  defaultToolsetForm,
  parseTools,
  withDefault,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
  type Policy,
  type ToolName,
  type ToolSetting,
  type ToolsetForm,
} from "@/lib/agent-config/toolset";
import { fromRaw, toRaw, type RawFormat } from "@/lib/agent-config/raw";

interface SkillRef {
  type: "anthropic" | "custom";
  skill_id: string;
  version: string;
}

type RosterMember =
  { type: "self" } | { type: "agent"; id: string; version?: number };

/** Editor model: the wire config split into form-editable pieces. */
interface FormState {
  name: string;
  modelId: string;
  speed: "standard" | "fast" | "";
  effort?: ModelEffort;
  inferenceGeo?: "us" | "global";
  system: string;
  description: string;
  toolset: ToolsetForm | null;
  /** Unedited fields survive structured and Raw edits verbatim. */
  otherTools: unknown[];
  toolSchemas?: SchemaDrafts;
  mcpBindings?: MCPBindings;
  mcpServers: unknown[];
  skills: SkillRef[];
  multiagent: RosterMember[] | null;
  metadata: Record<string, string>;
}

export function formFromConfig(
  config: Record<string, unknown>,
  selfId?: string,
): FormState {
  const model = config.model;
  const modelObj =
    typeof model === "string"
      ? { id: model }
      : ((model ?? {}) as {
          id?: string;
          speed?: string;
          effort?: ModelEffort | { type: ModelEffort };
          inference_geo?: "us" | "global";
        });
  const effort =
    typeof modelObj.effort === "string"
      ? modelObj.effort
      : modelObj.effort?.type;
  const { toolset, others } = parseTools(
    Array.isArray(config.tools) ? config.tools : [],
  );
  const multiagent = config.multiagent as
    { type?: unknown; agents?: unknown } | null | undefined;
  const roster =
    multiagent?.type === "coordinator" && Array.isArray(multiagent.agents)
      ? multiagent.agents.flatMap((entry): RosterMember[] => {
          if (typeof entry === "string") return [{ type: "agent", id: entry }];
          if (!entry || typeof entry !== "object") return [];
          const member = entry as {
            type?: unknown;
            id?: unknown;
            version?: unknown;
          };
          if (
            member.type === "self" ||
            (selfId !== undefined && member.id === selfId)
          )
            return [{ type: "self" }];
          if (member.type !== "agent" || typeof member.id !== "string")
            return [];
          return [
            {
              type: "agent",
              id: member.id,
              ...(typeof member.version === "number"
                ? { version: member.version }
                : {}),
            },
          ];
        })
      : null;
  return {
    name: typeof config.name === "string" ? config.name : "",
    modelId: modelObj.id ?? "",
    ...(effort && effortLevels.includes(effort) && { effort }),
    ...(modelObj.inference_geo && { inferenceGeo: modelObj.inference_geo }),
    speed:
      modelObj.speed === "fast" || modelObj.speed === "standard"
        ? modelObj.speed
        : "",
    system: typeof config.system === "string" ? config.system : "",
    description:
      typeof config.description === "string" ? config.description : "",
    toolset,
    otherTools: others,
    mcpServers: Array.isArray(config.mcp_servers) ? config.mcp_servers : [],
    skills: Array.isArray(config.skills) ? (config.skills as SkillRef[]) : [],
    multiagent: roster,
    metadata:
      typeof config.metadata === "object" && config.metadata !== null
        ? (config.metadata as Record<string, string>)
        : {},
  };
}

function configFromForm(
  form: FormState,
  includeMultiagentClear = false,
): AgentWriteBody {
  const tools = [
    ...(form.toolset ? [buildToolset(form.toolset)] : []),
    ...toolsWithSchemaDrafts(form.otherTools, form.toolSchemas ?? {}),
  ];
  return {
    name: form.name,
    model: {
      id: form.modelId,
      ...(form.speed && { speed: form.speed }),
      ...(form.effort && { effort: form.effort }),
      ...(form.inferenceGeo && { inference_geo: form.inferenceGeo }),
    },
    system: form.system,
    description: form.description,
    tools,
    mcp_servers: form.mcpServers,
    skills: form.skills,
    ...(form.multiagent === null
      ? includeMultiagentClear
        ? { multiagent: null }
        : {}
      : {
          multiagent: { type: "coordinator" as const, agents: form.multiagent },
        }),
    ...(Object.keys(form.metadata).length > 0
      ? { metadata: form.metadata }
      : {}),
  };
}

export function newAgentForm(): FormState {
  return {
    name: "",
    modelId: "claude-sonnet-4-8",
    speed: "",
    system: "",
    description: "",
    toolset: defaultToolsetForm(),
    otherTools: [],
    mcpServers: [],
    skills: [],
    multiagent: null,
    metadata: {},
  };
}

export function formFromAgent(agent: Agent): FormState {
  return formFromConfig(agent as unknown as Record<string, unknown>, agent.id);
}

/** Optional groups in the creation page reveal the same editable fields as the inspector. */
function Section({
  title,
  hint,
  children,
  level = 3,
  summary,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  level?: 2 | 3;
  summary?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const optional = summary !== undefined;
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-7 gap-y-3 border-t py-6 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,224px)_minmax(0,1fr)]">
      <div>
        <Heading className="text-[15px] font-medium">
          {optional ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={id}
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1.5 rounded-sm text-left"
            >
              <ChevronRight
                aria-hidden
                className={cn("size-3.5", expanded && "rotate-90")}
              />
              {title}{" "}
              <span
                aria-hidden
                className="text-[13px] font-normal text-muted-foreground"
              >
                (optional)
              </span>
            </button>
          ) : (
            title
          )}
        </Heading>
        {(!optional || expanded) && (
          <p className="pt-1 text-[13px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <div id={id} className="min-w-0 space-y-6">
        {optional && !expanded ? (
          <p className="text-sm text-muted-foreground">{summary}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/**
 * The save as a curl against the platform itself (plan 03 decision 4).
 * Placeholders on purpose: the browser never holds the base URL or the key
 * (principle 2) — this teaches the wire shape, not a paste-runnable secret.
 */
function CurlBlock({
  getBody,
  agentId,
}: {
  getBody: () => AgentWriteBody;
  agentId?: string;
}) {
  const [copied, setCopied] = useState(false);
  // Closed by default, and the command only builds while open — otherwise
  // every keystroke in the form would pay for a JSON serialization.
  const [open, setOpen] = useState(false);
  const url = agentId
    ? `$PLATFORM_BASE_URL/v1/agents/${agentId}`
    : "$PLATFORM_BASE_URL/v1/agents";
  const command = open
    ? [
        `curl -X POST "${url}" \\`,
        `  -H "x-api-key: $ISSUED_API_KEY" \\`,
        `  -H "content-type: application/json" \\`,
        `  -d '${JSON.stringify(getBody(), null, 2).replace(/'/g, `'\\''`)}'`,
      ].join("\n")
    : "";
  return (
    <details
      className="pt-6"
      data-testid="curl-block"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-[13px] text-muted-foreground">
        Equivalent API request
      </summary>
      {open && (
        <>
          <div className="flex items-start justify-between gap-3 pt-2">
            <p className="text-[12px] text-muted-foreground">
              The same save, sent straight to the platform. Fill the
              placeholders from your deployment — the console keeps its own key
              server-side.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 text-muted-foreground"
              onClick={() => {
                void copyText(command).then((ok) => {
                  if (!ok) return;
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg border bg-card p-3 font-mono text-[12px] leading-relaxed">
            {command}
          </pre>
        </>
      )}
    </details>
  );
}

function PolicySelect({
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: Policy;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (policy: Policy) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Policy)}>
      <SelectTrigger
        size="sm"
        className="h-7 w-40 rounded-lg"
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="always_allow">always allow</SelectItem>
        <SelectItem value="always_ask">always ask</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AgentEditor({
  mode,
  initial,
  agentId,
  version,
  onCancel,
  onReload,
  onSaved,
  inline = false,
  readOnly = false,
  toolbar,
  creationPage = false,
}: {
  mode: "create" | "edit";
  initial: FormState;
  agentId?: string;
  version?: number;
  onCancel?: () => void;
  onReload?: () => void;
  onSaved?: (agent: Agent) => void;
  inline?: boolean;
  readOnly?: boolean;
  toolbar?: ReactNode;
  creationPage?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"rendered" | "raw">("rendered");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initial);
  const [raw, setRaw] = useState<{ format: RawFormat; text: string }>({
    format: creationPage ? "yaml" : "json",
    text: "",
  });
  const [rawBaseline, setRawBaseline] = useState("");
  const [original] = useState(initial);
  const [startingConfig, setStartingConfig] = useState(initial);
  const [promptDirty, setPromptDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const changedRaw = tab === "raw" && raw.text !== rawBaseline;
  const edited =
    JSON.stringify(form) !== JSON.stringify(startingConfig) || changedRaw;
  const dirty =
    !readOnly &&
    (promptDirty ||
      changedRaw ||
      JSON.stringify(form) !== JSON.stringify(original));
  const leave = useUnsavedChanges(dirty);
  const [rawError, setRawError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const create = useCreateAgent();
  const update = useUpdateAgent(agentId ?? "");
  const mutation = mode === "create" ? create : update;
  const skillsQuery = useSkillOptions();
  const skillOptions =
    skillsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const agentsQuery = useAgentOptions();
  const models = useModelChoices();
  // The raw tab writes the config as the API takes it, so only the form
  // waits for a listed model.
  const modelMissing =
    tab === "rendered" && !readOnly && !modelChosen(models, form.modelId);
  const [modelAsked, setModelAsked] = useState(false);
  const schemaError = schemaDraftError(form.toolSchemas ?? {});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setTool = (name: ToolName, setting: ToolSetting) =>
    set("toolset", {
      ...form.toolset!,
      tools: { ...form.toolset!.tools, [name]: setting },
    });

  const switchTab = (next: "rendered" | "raw") => {
    if (next === tab) return true;
    if (next === "raw" && schemaError) return false;
    if (next === "raw") {
      setRawBaseline(toRaw(configFromForm(form, mode === "edit"), raw.format));
      setRaw((r) => ({
        ...r,
        text: toRaw(configFromForm(form, mode === "edit"), r.format),
      }));
      setRawError(null);
    } else {
      // Raw wins on divergence: re-parse before leaving the raw tab.
      const parsed = fromRaw(raw.text, raw.format);
      if (parsed.error) {
        setRawError(parsed.error);
        return false;
      }
      setForm(formFromConfig(parsed.config!, agentId));
    }
    setTab(next);
    return true;
  };

  const switchFormat = (format: RawFormat) => {
    if (format === raw.format) return;
    const parsed = fromRaw(raw.text, raw.format);
    if (parsed.error) {
      setRawError(`fix this before switching formats: ${parsed.error}`);
      return;
    }
    setRawError(null);
    const text = toRaw(parsed.config!, format);
    if (raw.text === rawBaseline) setRawBaseline(text);
    setRaw({ format, text });
  };

  const save = () => {
    if (
      readOnly ||
      generating ||
      mutation.isPending ||
      (tab === "rendered" && schemaError)
    )
      return;
    // Save stays enabled, as for every other field the platform requires,
    // and says on the field why it sent nothing.
    if (modelMissing) {
      setModelAsked(true);
      document.getElementById("agent-model")?.focus();
      return;
    }
    setConflict(false);
    let body: AgentWriteBody;
    if (tab === "raw") {
      const parsed = fromRaw(raw.text, raw.format);
      if (parsed.error) {
        setRawError(parsed.error);
        return;
      }
      body = parsed.config as AgentWriteBody;
    } else {
      body = configFromForm(form, mode === "edit");
    }
    if (mode === "edit") body = { ...body, version };
    mutation.mutate(body, {
      onSuccess: (agent) => {
        leave.setDirty(false);
        if (onSaved) onSaved(agent);
        else router.push(`/agents/${agent.id}`);
      },
      onError: (error) => {
        if (error instanceof PlatformError && error.status === 409) {
          setConflict(true);
        }
      },
    });
  };

  const error =
    mutation.error instanceof PlatformError
      ? mutation.error
      : mutation.error instanceof Error
        ? mutation.error
        : null;

  const saveButton = (
    <Button
      onClick={save}
      size={creationPage ? "sm" : "default"}
      disabled={
        generating ||
        mutation.isPending ||
        (tab === "rendered" && Boolean(schemaError))
      }
    >
      {mode === "create"
        ? "Create agent"
        : inline
          ? "Save new version"
          : "Save changes"}
    </Button>
  );
  const cancelButton = (
    <Button
      variant="ghost"
      size={creationPage ? "sm" : "default"}
      disabled={mutation.isPending}
      onClick={() => {
        if (inline) {
          setForm(initial);
          setRaw({ format: "json", text: "" });
          setRawBaseline("");
          setTab("rendered");
          setRawError(null);
          setConflict(false);
          mutation.reset();
          leave.setDirty(false);
        } else
          leave.requestLeave(() => {
            leave.setDirty(false);
            if (onCancel) onCancel();
            else if (creationPage) router.push("/agents");
            else router.back();
          });
      }}
    >
      {inline ? "Discard" : "Cancel"}
    </Button>
  );

  return (
    <div
      className={
        inline
          ? "flex h-full min-h-0 w-full flex-col"
          : creationPage
            ? "flex min-w-0 flex-1 flex-col"
            : "max-w-4xl"
      }
    >
      {creationPage && (
        <AgentStartingPoint
          model={form.modelId}
          getConfig={() =>
            tab === "raw"
              ? (fromRaw(raw.text, raw.format).config ?? configFromForm(form))
              : configFromForm(form)
          }
          confirmReplace={(action) =>
            edited ? leave.requestLeave(action) : action()
          }
          apply={(config) => {
            const next = formFromConfig(config as Record<string, unknown>);
            setForm(next);
            setStartingConfig(next);
            if (tab === "raw") {
              const text = toRaw(configFromForm(next), raw.format);
              setRaw({ format: raw.format, text });
              setRawBaseline(text);
            }
            setToolsOpen(false);
            setRawError(null);
            setModelAsked(false);
            mutation.reset();
          }}
          setPromptDirty={setPromptDirty}
          busy={generating}
          setBusy={setGenerating}
          saving={mutation.isPending}
        />
      )}
      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-1.5 pb-4",
          inline && "w-full max-w-3xl",
        )}
      >
        {creationPage && (
          <h2 className="mr-auto text-[15px] font-medium">Agent config</h2>
        )}
        {toolbar && <div className="mr-auto">{toolbar}</div>}
        <div
          role="radiogroup"
          aria-label="Agent config view"
          className={
            inline || creationPage
              ? "flex rounded-lg bg-secondary p-0.5"
              : "flex gap-1.5"
          }
        >
          {(["rendered", "raw"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={tab === key}
              tabIndex={tab === key ? 0 : -1}
              data-view={key}
              disabled={generating || (key === "raw" && Boolean(schemaError))}
              onClick={() => switchTab(key)}
              onKeyDown={(event) => {
                const next =
                  event.key === "Home"
                    ? "rendered"
                    : event.key === "End"
                      ? "raw"
                      : event.key === "ArrowLeft" || event.key === "ArrowRight"
                        ? key === "raw"
                          ? "rendered"
                          : "raw"
                        : null;
                if (next && !(next === "raw" && schemaError)) {
                  event.preventDefault();
                  if (!switchTab(next)) return;
                  event.currentTarget.parentElement
                    ?.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)
                    ?.focus();
                }
              }}
              className={cn(
                "h-[30px] rounded-md border px-3 text-sm capitalize",
                inline || creationPage
                  ? tab === key
                    ? "border-border bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                  : tab === key
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {key}
            </button>
          ))}
        </div>
        {tab === "raw" && !creationPage && (
          <div className="ml-3 flex items-center gap-1 text-[12px]">
            {(["json", "yaml"] as const).map((format) => (
              <button
                key={format}
                onClick={() => switchFormat(format)}
                className={cn(
                  "rounded-md border px-2 py-0.5 uppercase",
                  raw.format === format
                    ? "border-foreground"
                    : "text-muted-foreground",
                )}
              >
                {format}
              </button>
            ))}
            <span className="pl-2 text-muted-foreground">
              JSON is what saves — YAML converts on the fly.
            </span>
          </div>
        )}
      </div>

      <div
        className={
          inline
            ? "min-h-0 w-full max-w-3xl flex-1 overflow-y-auto pr-2"
            : undefined
        }
      >
        {readOnly && (
          <p className="pb-4 text-sm text-muted-foreground">
            This configuration is read-only. Select the latest active version to
            edit.
          </p>
        )}
        {tab === "rendered" ? (
          <fieldset disabled={readOnly || generating} className="min-w-0">
            <Section
              level={inline || creationPage ? 2 : 3}
              title="General"
              hint={
                creationPage
                  ? "What this agent is and how it’s prompted."
                  : "Name, model, and the instructions the agent runs with."
              }
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="agent-name">Name</Label>
                  <Input
                    id="agent-name"
                    placeholder={
                      creationPage
                        ? "Descriptive name for this agent"
                        : undefined
                    }
                    className={creationPage ? "h-7" : undefined}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                {creationPage ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="agent-model">Model</Label>
                    <AgentModelMenu
                      model={form.modelId}
                      effort={form.effort ?? ""}
                      speed={form.speed}
                      choices={models}
                      error={
                        modelAsked && modelMissing
                          ? "Choose one of the gateway's models."
                          : undefined
                      }
                      onModel={(value) => set("modelId", value)}
                      onEffort={(value) => set("effort", value || undefined)}
                      onSpeed={(value) => set("speed", value)}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-[1fr_130px] gap-2">
                    {/* min-w-0: the select's trigger does not wrap. */}
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor="agent-model">Model</Label>
                      <ModelField
                        id="agent-model"
                        className="font-mono"
                        value={form.modelId}
                        onChange={(value) => set("modelId", value)}
                        choices={models}
                        readOnly={readOnly}
                        error={
                          !modelAsked || !modelMissing
                            ? undefined
                            : models.pending
                              ? "The gateway's models are still loading."
                              : "A model is required: choose one of the gateway's models."
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Speed</Label>
                      <Select
                        value={form.speed || "default"}
                        onValueChange={(v) =>
                          set(
                            "speed",
                            v === "default" ? "" : (v as "standard" | "fast"),
                          )
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-8 w-full rounded-lg"
                          aria-label="Model speed"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">default</SelectItem>
                          <SelectItem value="standard">standard</SelectItem>
                          <SelectItem value="fast">fast</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-description">
                  Description{" "}
                  {creationPage && (
                    <span
                      aria-hidden
                      className="font-normal text-muted-foreground"
                    >
                      (optional)
                    </span>
                  )}
                </Label>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
                  id="agent-description"
                  placeholder={
                    creationPage
                      ? "What this agent does, for humans and other agents"
                      : undefined
                  }
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-system">
                  System prompt{" "}
                  {creationPage && (
                    <span
                      aria-hidden
                      className="font-normal text-muted-foreground"
                    >
                      (optional)
                    </span>
                  )}
                </Label>
                <textarea
                  id="agent-system"
                  placeholder={
                    creationPage ? "System prompt for the agent" : undefined
                  }
                  value={form.system}
                  onChange={(e) => set("system", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
                />
              </div>
            </Section>

            <Section
              level={inline || creationPage ? 2 : 3}
              title="Tools"
              summary={
                creationPage
                  ? [
                      form.toolset && "Built-in tools",
                      form.mcpServers.length > 0 &&
                        `${form.mcpServers.length} MCP servers`,
                      form.otherTools.some(
                        (t) => (t as { type?: string })?.type === "custom",
                      ) && "Custom tools",
                    ]
                      .filter(Boolean)
                      .join(", ") || "None"
                  : undefined
              }
              hint="What the agent may do. The default row covers every tool; per-tool rows override it. “always ask” holds the call for approval in the session view."
            >
              <div>
                <div className="flex items-center justify-between pb-2">
                  <Label>Built-in tools</Label>
                  {form.toolset === null ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        set("toolset", defaultToolsetForm());
                        setToolsOpen(true);
                      }}
                    >
                      Add toolset
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-muted-foreground"
                      onClick={() => set("toolset", null)}
                    >
                      Remove toolset
                    </Button>
                  )}
                </div>
                {form.toolset && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      aria-expanded={toolsOpen || readOnly}
                      onClick={() => setToolsOpen((open) => !open)}
                    >
                      Tool permissions {TOOL_NAMES.length}
                    </Button>
                    {(toolsOpen || readOnly) && (
                      <div className="divide-y rounded-lg border">
                        <div className="flex items-center justify-between gap-3 bg-secondary/40 px-3 py-2">
                          <label className="flex items-center gap-2.5 text-sm">
                            <input
                              type="checkbox"
                              aria-label="default enabled"
                              checked={form.toolset.default.enabled}
                              onChange={(e) =>
                                set(
                                  "toolset",
                                  withDefault(form.toolset!, {
                                    ...form.toolset!.default,
                                    enabled: e.target.checked,
                                  }),
                                )
                              }
                            />
                            <span className="text-[13px] font-medium">
                              Default for all tools
                            </span>
                          </label>
                          <PolicySelect
                            value={form.toolset.default.policy}
                            disabled={!form.toolset.default.enabled}
                            ariaLabel="default policy"
                            onChange={(policy) =>
                              set(
                                "toolset",
                                withDefault(form.toolset!, {
                                  ...form.toolset!.default,
                                  policy,
                                }),
                              )
                            }
                          />
                        </div>
                        {TOOL_NAMES.map((name) => {
                          const setting = form.toolset!.tools[name];
                          return (
                            <div
                              key={name}
                              className="flex items-center justify-between gap-3 px-3 py-2"
                            >
                              <label className="flex min-w-0 items-center gap-2.5 text-sm">
                                <input
                                  type="checkbox"
                                  aria-label={`${name} enabled`}
                                  checked={setting.enabled}
                                  onChange={(e) =>
                                    setTool(name, {
                                      ...setting,
                                      enabled: e.target.checked,
                                    })
                                  }
                                />
                                <span className="font-mono text-[13px]">
                                  {name}
                                </span>
                                <span className="truncate text-[13px] text-muted-foreground">
                                  — {TOOL_DESCRIPTIONS[name]}
                                </span>
                              </label>
                              <PolicySelect
                                value={setting.policy}
                                disabled={!setting.enabled}
                                ariaLabel={`${name} policy`}
                                onChange={(policy) =>
                                  setTool(name, { ...setting, policy })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <AdditionalToolsEditor
                  tools={form.otherTools}
                  servers={form.mcpServers}
                  schemaDrafts={form.toolSchemas ?? {}}
                  bindings={form.mcpBindings}
                  onChange={(
                    otherTools,
                    mcpServers,
                    toolSchemas,
                    mcpBindings,
                  ) =>
                    setForm((form) => ({
                      ...form,
                      otherTools,
                      mcpServers,
                      toolSchemas,
                      mcpBindings,
                    }))
                  }
                />
              </div>
            </Section>

            <Section
              level={inline || creationPage ? 2 : 3}
              title="Skills"
              summary={
                creationPage
                  ? form.skills
                      .map(
                        (ref) =>
                          skillOptions.find((s) => s.id === ref.skill_id)
                            ?.display_name ?? ref.skill_id,
                      )
                      .join(", ") || "None"
                  : undefined
              }
              hint="Skill bundles uploaded to this platform, attached by reference."
            >
              <div className="space-y-3">
                {form.skills.map((ref, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm">
                        {skillOptions.find((skill) => skill.id === ref.skill_id)
                          ?.display_name ?? ref.skill_id}
                      </p>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {ref.skill_id} · {ref.version}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={"Remove skill " + ref.skill_id}
                      onClick={() =>
                        set(
                          "skills",
                          form.skills.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Select
                  value=""
                  onValueChange={(id) => {
                    const skill = skillOptions.find((skill) => skill.id === id);
                    if (
                      !skill ||
                      form.skills.some((ref) => ref.skill_id === id)
                    )
                      return;
                    set("skills", [
                      ...form.skills,
                      {
                        type:
                          skill.source.type === "anthropic"
                            ? "anthropic"
                            : "custom",
                        skill_id: skill.id,
                        version: "latest",
                      },
                    ]);
                  }}
                >
                  <SelectTrigger
                    aria-label="Add skill"
                    className="w-full sm:w-80"
                    disabled={skillsQuery.isPending}
                  >
                    <SelectValue
                      placeholder={
                        skillsQuery.isPending ? "Loading skills…" : "Add skill"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {skillOptions
                      .filter(
                        (skill) =>
                          !form.skills.some((ref) => ref.skill_id === skill.id),
                      )
                      .map((skill) => (
                        <SelectItem key={skill.id} value={skill.id}>
                          {skill.display_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {skillsQuery.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    Could not load skills.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void skillsQuery.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                )}
                {skillsQuery.isSuccess && skillOptions.length === 0 && (
                  <p className="text-[13px] text-muted-foreground">
                    No skills on the platform yet.
                  </p>
                )}
                {skillsQuery.hasNextPage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={skillsQuery.isFetchingNextPage}
                    onClick={() => void skillsQuery.fetchNextPage()}
                  >
                    {skillsQuery.isFetchingNextPage
                      ? "Loading more skills…"
                      : "Load more skills"}
                  </Button>
                )}
              </div>
            </Section>

            <Section
              level={inline || creationPage ? 2 : 3}
              title="Multiagent"
              summary={
                creationPage
                  ? form.multiagent?.length
                    ? "Subagents"
                    : "None"
                  : undefined
              }
              hint="Choose the agents this coordinator can delegate to. Pin specific versions in Raw."
            >
              <div className="space-y-3" data-testid="agent-multiagent">
                <Label>Agents</Label>
                {!!form.multiagent?.length && (
                  <ol className="flex flex-wrap gap-2" aria-label="Subagents">
                    {form.multiagent.map((member, index) => {
                      const name =
                        member.type === "self"
                          ? "This coordinator (self)"
                          : (agentsQuery.data?.agents.find(
                              (agent) => agent.id === member.id,
                            )?.name ?? member.id);
                      return (
                        <li
                          key={member.type === "self" ? "self" : member.id}
                          data-roster-index={index}
                          data-agent-id={
                            member.type === "self" ? agentId : member.id
                          }
                          data-agent-version={
                            member.type === "self" ? version : member.version
                          }
                          className="inline-flex max-w-full items-center gap-1 rounded-md border bg-secondary/40 py-0.5 pl-2 text-sm"
                        >
                          <span className="truncate">{name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove subagent ${name}`}
                            onClick={() => {
                              const next = form.multiagent!.filter(
                                (_, i) => i !== index,
                              );
                              set("multiagent", next.length ? next : null);
                            }}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <Select
                  value=""
                  disabled={
                    agentsQuery.isPending ||
                    (form.multiagent?.length ?? 0) >= 20
                  }
                  onValueChange={(id) => {
                    if (!id) return;
                    const member: RosterMember =
                      id === "__self"
                        ? { type: "self" }
                        : { type: "agent", id };
                    set("multiagent", [...(form.multiagent ?? []), member]);
                  }}
                >
                  <SelectTrigger
                    aria-label="Add subagent"
                    className="h-8 w-auto text-xs"
                    disabled={agentsQuery.isPending}
                  >
                    <Plus className="size-3.5" />
                    <SelectValue
                      placeholder={
                        agentsQuery.isPending
                          ? "Loading agents…"
                          : "Add subagent"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {!form.multiagent?.some(
                      (member) => member.type === "self",
                    ) && (
                      <SelectItem value="__self">
                        This coordinator (self)
                      </SelectItem>
                    )}
                    {(agentsQuery.data?.agents ?? [])
                      .filter(
                        (agent) =>
                          !agent.archived_at &&
                          !agent.multiagent &&
                          agent.id !== agentId &&
                          !form.multiagent?.some(
                            (member) =>
                              member.type === "agent" && member.id === agent.id,
                          ),
                      )
                      .map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {agentsQuery.isError && (
                  <p className="text-xs text-destructive" role="alert">
                    Could not load agents.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => agentsQuery.refetch()}
                    >
                      Retry agents
                    </button>
                  </p>
                )}
                {agentsQuery.data?.truncated && (
                  <p className="text-xs text-muted-foreground">
                    Only the first 1,000 agents are available here.
                  </p>
                )}
              </div>
            </Section>

            {!creationPage && !schemaError && !readOnly && (
              <CurlBlock
                getBody={() =>
                  mode === "edit"
                    ? { ...configFromForm(form, true), version }
                    : configFromForm(form)
                }
                agentId={mode === "edit" ? agentId : undefined}
              />
            )}
          </fieldset>
        ) : (
          <div>
            {creationPage && (
              <div className="flex items-center justify-end gap-1 rounded-t-lg border border-b-0 bg-muted/40 p-1">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Config format: ${raw.format.toUpperCase()}`}
                      />
                    }
                  >
                    {raw.format.toUpperCase()}
                    <ChevronDown className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(["yaml", "json"] as const).map((f) => (
                      <DropdownMenuItem key={f} onClick={() => switchFormat(f)}>
                        {f.toUpperCase()}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Copy configuration"
                  onClick={async () => {
                    if (await copyText(raw.text))
                      toast.success("Configuration copied");
                    else toast.error("Could not copy configuration");
                  }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            )}
            <SchemaTextarea
              indentWithTab={creationPage}
              disabled={generating}
              aria-label="Raw agent config"
              readOnly={readOnly}
              value={raw.text}
              onValueChange={(text) => {
                setRaw((r) => ({ ...r, text }));
                // The parse error describes the text that was there a keystroke
                // ago; keeping it would leave the field announced invalid while
                // it is being fixed.
                setRawError(null);
              }}
              rows={22}
              spellCheck={false}
              aria-invalid={rawError !== null}
              aria-describedby={
                [
                  creationPage && "agent-raw-help",
                  rawError && "raw-config-error",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              // Hand-rolled rather than the <Input> primitive, so it carries its
              // own copy of the one invalid rule (issue #104). Opaque, no halo.
              className="w-full rounded-lg border bg-card p-3 font-mono text-[12px] leading-relaxed outline-none focus-visible:border-ring aria-invalid:border-destructive-surface"
            />
            {creationPage && (
              <p id="agent-raw-help" className="text-xs text-muted-foreground">
                Tab inserts indentation. Press Escape then Tab to move focus out
                of the editor.
              </p>
            )}
            {rawError && (
              <p
                id="raw-config-error"
                className="pt-1 text-sm text-destructive"
                role="alert"
              >
                {rawError}
              </p>
            )}
          </div>
        )}
      </div>
      {!readOnly && (!inline || dirty || error) && (
        <div
          className={
            inline
              ? "mt-3 flex w-fit max-w-full shrink-0 flex-wrap items-center gap-3 self-center rounded-xl border bg-background p-2 shadow-md"
              : creationPage
                ? "sticky bottom-0 z-10 mt-auto flex flex-wrap items-center justify-end gap-2 border-t bg-background py-3"
                : "flex items-center gap-3 pt-6"
          }
        >
          {inline && dirty && (
            <span className="mr-auto text-sm" role="status">
              Unsaved changes
            </span>
          )}
          {(inline || creationPage) && cancelButton}
          {saveButton}
          {!inline && !creationPage && cancelButton}
          {conflict ? (
            <span role="alert" className="text-sm text-destructive">
              Someone else updated this agent (409).{" "}
              <button
                className="underline"
                onClick={() =>
                  leave.requestLeave(() => {
                    leave.setDirty(true);
                    if (onReload) onReload();
                    else router.refresh();
                  })
                }
              >
                Reload the latest version
              </button>{" "}
              and re-apply your changes.
            </span>
          ) : (
            error && (
              <span role="alert" className="text-sm text-destructive">
                {error.message}
                {error instanceof PlatformError && error.requestId && (
                  <span className="pl-2">
                    <RequestId id={error.requestId} />
                  </span>
                )}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}
