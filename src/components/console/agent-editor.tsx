"use client";

import {
  AdditionalToolsEditor,
  schemaDraftError,
  toolsWithSchemaDrafts,
  type SchemaDrafts,
  type MCPBindings,
} from "./additional-tools-editor";
import { RequestId } from "@/components/console/bits";
import { useState, type ReactNode } from "react";
import { useUnsavedChanges } from "@/components/shell/unsaved-changes";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Copy, Plus, Trash2 } from "lucide-react";
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
      : ((model ?? {}) as { id?: string; speed?: string });
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
    model: form.speed
      ? { id: form.modelId, speed: form.speed }
      : { id: form.modelId },
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

/** Two-column section: explainer left, controls right (reference layout). */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-8 gap-y-3 border-t py-6 first:border-t-0 first:pt-0 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h3 className="text-[15px] font-medium">{title}</h3>
        <p className="pt-1 text-[13px] text-muted-foreground">{hint}</p>
      </div>
      <div className="space-y-6">{children}</div>
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
        `  -H "x-api-key: $PLATFORM_API_KEY" \\`,
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
}: {
  mode: "create" | "edit";
  initial: FormState;
  agentId?: string;
  version?: number;
  onCancel?: () => void;
  onReload?: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"rendered" | "raw">("rendered");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initial);
  const [raw, setRaw] = useState<{ format: RawFormat; text: string }>({
    format: "json",
    text: "",
  });
  const [rawBaseline, setRawBaseline] = useState("");
  const leave = useUnsavedChanges(
    JSON.stringify(form) !== JSON.stringify(initial) ||
      (tab === "raw" && raw.text !== rawBaseline),
  );
  const [rawError, setRawError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [memberToAdd, setMemberToAdd] = useState("");

  const create = useCreateAgent();
  const update = useUpdateAgent(agentId ?? "");
  const mutation = mode === "create" ? create : update;
  const skillsQuery = useSkillOptions();
  const skillOptions =
    skillsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const agentsQuery = useAgentOptions();
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
    if (tab === "rendered" && schemaError) return;
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
        router.push(`/agents/${agent.id}`);
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

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-1.5 pb-4">
        <div
          role="radiogroup"
          aria-label="Agent config view"
          className="flex gap-1.5"
        >
          {(["rendered", "raw"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={tab === key}
              tabIndex={tab === key ? 0 : -1}
              data-view={key}
              disabled={key === "raw" && Boolean(schemaError)}
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
                tab === key
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {key}
            </button>
          ))}
        </div>
        {tab === "raw" && (
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

      {tab === "rendered" ? (
        <div>
          <Section
            title="General"
            hint="Name, model, and the instructions the agent runs with."
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-[1fr_130px] gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="agent-model">Model</Label>
                  <Input
                    id="agent-model"
                    className="font-mono"
                    value={form.modelId}
                    onChange={(e) => set("modelId", e.target.value)}
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-description">Description</Label>
              <textarea
                rows={2}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
                id="agent-description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-system">System prompt</Label>
              <textarea
                id="agent-system"
                value={form.system}
                onChange={(e) => set("system", e.target.value)}
                rows={3}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
              />
            </div>
          </Section>

          <Section
            title="Tools"
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
                    aria-expanded={toolsOpen}
                    onClick={() => setToolsOpen((open) => !open)}
                  >
                    Tool permissions {TOOL_NAMES.length}
                  </Button>
                  {toolsOpen && (
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
                onChange={(otherTools, mcpServers, toolSchemas, mcpBindings) =>
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
            title="Skills"
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
                  if (!skill || form.skills.some((ref) => ref.skill_id === id))
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
            title="Multiagent"
            hint="Turn this agent into a coordinator and choose the pinned agents it may run as child threads."
          >
            {form.multiagent === null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => set("multiagent", [{ type: "self" }])}
              >
                Enable coordinator
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-64 flex-1 space-y-1.5">
                    <Label htmlFor="roster-member">Agent</Label>
                    <select
                      id="roster-member"
                      value={memberToAdd}
                      onChange={(event) => setMemberToAdd(event.target.value)}
                      className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                    >
                      <option value="">Choose an agent…</option>
                      {!form.multiagent.some(
                        (member) => member.type === "self",
                      ) && (
                        <option value="__self">This coordinator (self)</option>
                      )}
                      {(agentsQuery.data?.agents ?? [])
                        .filter(
                          (agent) =>
                            !agent.archived_at &&
                            !agent.multiagent &&
                            agent.id !== agentId &&
                            !form.multiagent!.some(
                              (member) =>
                                member.type === "agent" &&
                                member.id === agent.id,
                            ),
                        )
                        .map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} · v{agent.version}
                          </option>
                        ))}
                    </select>
                    {agentsQuery.data?.truncated && (
                      <p className="text-[12px] text-muted-foreground">
                        Only the first 1,000 agents are available here.
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={!memberToAdd || form.multiagent.length >= 20}
                    onClick={() => {
                      if (!memberToAdd) return;
                      const member: RosterMember =
                        memberToAdd === "__self"
                          ? { type: "self" }
                          : {
                              type: "agent",
                              id: memberToAdd,
                              version: agentsQuery.data?.agents.find(
                                (agent) => agent.id === memberToAdd,
                              )?.version,
                            };
                      set("multiagent", [...form.multiagent!, member]);
                      setMemberToAdd("");
                    }}
                  >
                    <Plus className="size-4" /> Add member
                  </Button>
                </div>
                <ol className="divide-y rounded-lg border">
                  {form.multiagent.map((member, index) => {
                    const agent =
                      member.type === "agent"
                        ? agentsQuery.data?.agents.find(
                            (candidate) => candidate.id === member.id,
                          )
                        : undefined;
                    return (
                      <li
                        key={member.type === "self" ? "self" : member.id}
                        className="flex items-center gap-2 px-3 py-2"
                      >
                        <span className="w-6 text-[12px] text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                          {member.type === "self" ? (
                            "This coordinator (self)"
                          ) : (
                            <>
                              {agent?.name ?? member.id}
                              <span className="pl-2 font-mono text-[12px] text-muted-foreground">
                                {member.id} · v{member.version ?? "latest"}
                              </span>
                            </>
                          )}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move member ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...form.multiagent!];
                            [next[index - 1], next[index]] = [
                              next[index],
                              next[index - 1],
                            ];
                            set("multiagent", next);
                          }}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move member ${index + 1} down`}
                          disabled={index === form.multiagent!.length - 1}
                          onClick={() => {
                            const next = [...form.multiagent!];
                            [next[index], next[index + 1]] = [
                              next[index + 1],
                              next[index],
                            ];
                            set("multiagent", next);
                          }}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove member ${index + 1}`}
                          disabled={form.multiagent!.length === 1}
                          onClick={() =>
                            set(
                              "multiagent",
                              form.multiagent!.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ol>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={() => set("multiagent", null)}
                >
                  Disable coordinator
                </Button>
              </div>
            )}
          </Section>

          {!schemaError && (
            <CurlBlock
              getBody={() =>
                mode === "edit"
                  ? { ...configFromForm(form, true), version }
                  : configFromForm(form)
              }
              agentId={mode === "edit" ? agentId : undefined}
            />
          )}
        </div>
      ) : (
        <div>
          <textarea
            aria-label="Raw agent config"
            value={raw.text}
            onChange={(e) => {
              setRaw((r) => ({ ...r, text: e.target.value }));
              // The parse error describes the text that was there a keystroke
              // ago; keeping it would leave the field announced invalid while
              // it is being fixed.
              setRawError(null);
            }}
            rows={22}
            spellCheck={false}
            aria-invalid={rawError !== null}
            aria-describedby={rawError ? "raw-config-error" : undefined}
            // Hand-rolled rather than the <Input> primitive, so it carries its
            // own copy of the one invalid rule (issue #104). Opaque, no halo.
            className="w-full rounded-lg border bg-card p-3 font-mono text-[12px] leading-relaxed outline-none focus-visible:border-ring aria-invalid:border-destructive-surface"
          />
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

      <div className="flex items-center gap-3 pt-6">
        <Button
          onClick={save}
          disabled={
            mutation.isPending || (tab === "rendered" && Boolean(schemaError))
          }
        >
          {mode === "create" ? "Create agent" : "Save changes"}
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            leave.requestLeave(() => (onCancel ? onCancel() : router.back()))
          }
        >
          Cancel
        </Button>
        {conflict ? (
          <span className="text-sm text-destructive">
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
            <span className="text-sm text-destructive">
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
    </div>
  );
}
