"use client";

import { RequestId } from "@/components/console/bits";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
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
  useSkills,
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

/** Editor model: the wire config split into form-editable pieces. */
interface FormState {
  name: string;
  modelId: string;
  speed: "standard" | "fast" | "";
  system: string;
  description: string;
  toolset: ToolsetForm | null;
  /** Custom tools / mcp_toolset entries — Raw-tab only, carried verbatim. */
  otherTools: unknown[];
  mcpServers: unknown[];
  skills: SkillRef[];
  metadata: Record<string, string>;
}

export function formFromConfig(config: Record<string, unknown>): FormState {
  const model = config.model;
  const modelObj =
    typeof model === "string"
      ? { id: model }
      : ((model ?? {}) as { id?: string; speed?: string });
  const { toolset, others } = parseTools(
    Array.isArray(config.tools) ? config.tools : [],
  );
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
    metadata:
      typeof config.metadata === "object" && config.metadata !== null
        ? (config.metadata as Record<string, string>)
        : {},
  };
}

function configFromForm(form: FormState): AgentWriteBody {
  const tools = [
    ...(form.toolset ? [buildToolset(form.toolset)] : []),
    ...form.otherTools,
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
    metadata: {},
  };
}

export function formFromAgent(agent: Agent): FormState {
  return formFromConfig(agent as unknown as Record<string, unknown>);
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
        <h3 className="text-sm font-medium">{title}</h3>
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
}: {
  mode: "create" | "edit";
  initial: FormState;
  agentId?: string;
  version?: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"rendered" | "raw">("rendered");
  const [form, setForm] = useState<FormState>(initial);
  const [raw, setRaw] = useState<{ format: RawFormat; text: string }>({
    format: "json",
    text: "",
  });
  const [rawError, setRawError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const create = useCreateAgent();
  const update = useUpdateAgent(agentId ?? "");
  const mutation = mode === "create" ? create : update;
  const skillsQuery = useSkills({ limit: 100 });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setTool = (name: ToolName, setting: ToolSetting) =>
    set("toolset", {
      ...form.toolset!,
      tools: { ...form.toolset!.tools, [name]: setting },
    });

  const switchTab = (next: "rendered" | "raw") => {
    if (next === tab) return;
    if (next === "raw") {
      setRaw((r) => ({ ...r, text: toRaw(configFromForm(form), r.format) }));
      setRawError(null);
    } else {
      // Raw wins on divergence: re-parse before leaving the raw tab.
      const parsed = fromRaw(raw.text, raw.format);
      if (parsed.error) {
        setRawError(parsed.error);
        return;
      }
      setForm(formFromConfig(parsed.config!));
    }
    setTab(next);
  };

  const switchFormat = (format: RawFormat) => {
    if (format === raw.format) return;
    const parsed = fromRaw(raw.text, raw.format);
    if (parsed.error) {
      setRawError(`fix this before switching formats: ${parsed.error}`);
      return;
    }
    setRawError(null);
    setRaw({ format, text: toRaw(parsed.config!, format) });
  };

  const save = () => {
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
      body = configFromForm(form);
    }
    if (mode === "edit") body = { ...body, version };
    mutation.mutate(body, {
      onSuccess: (agent) => router.push(`/agents/${agent.id}`),
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
        {(["rendered", "raw"] as const).map((key) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={cn(
              "h-7 rounded-full border px-3 text-[13px] capitalize",
              tab === key
                ? "border-transparent bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary",
            )}
          >
            {key}
          </button>
        ))}
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
            <div className="grid grid-cols-2 gap-4">
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
              <Input
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
                rows={5}
                className="w-full rounded-lg border bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring"
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
                    onClick={() => set("toolset", defaultToolsetForm())}
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
                          <span className="font-mono text-[13px]">{name}</span>
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
              {form.otherTools.length > 0 && (
                <p className="pt-2 text-[13px] text-muted-foreground">
                  {form.otherTools.length} custom/MCP tool entr
                  {form.otherTools.length === 1 ? "y" : "ies"} — edit in the Raw
                  tab.
                </p>
              )}
            </div>
          </Section>

          <Section
            title="Skills"
            hint="Skill bundles uploaded to this platform, attached by reference."
          >
            <div>
              {(skillsQuery.data?.data ?? []).length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  No skills on the platform yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {skillsQuery.data!.data.map((skill) => {
                    const checked = form.skills.some(
                      (s) => s.skill_id === skill.id,
                    );
                    return (
                      <label
                        key={skill.id}
                        className="flex items-center gap-2.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            set(
                              "skills",
                              e.target.checked
                                ? [
                                    ...form.skills,
                                    {
                                      type:
                                        skill.source === "anthropic"
                                          ? "anthropic"
                                          : "custom",
                                      skill_id: skill.id,
                                      version: "latest",
                                    },
                                  ]
                                : form.skills.filter(
                                    (s) => s.skill_id !== skill.id,
                                  ),
                            )
                          }
                        />
                        {skill.display_title}
                        <span className="font-mono text-[12px] text-muted-foreground">
                          {skill.id}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>

          <CurlBlock
            getBody={() =>
              mode === "edit"
                ? { ...configFromForm(form), version }
                : configFromForm(form)
            }
            agentId={mode === "edit" ? agentId : undefined}
          />
        </div>
      ) : (
        <div>
          <textarea
            aria-label="Raw agent config"
            value={raw.text}
            onChange={(e) => setRaw((r) => ({ ...r, text: e.target.value }))}
            rows={22}
            spellCheck={false}
            className="w-full rounded-lg border bg-card p-3 font-mono text-[12px] leading-relaxed outline-none focus-visible:border-ring"
          />
          {rawError && (
            <p className="pt-1 text-sm text-destructive">{rawError}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-6">
        <Button onClick={save} disabled={mutation.isPending}>
          {mode === "create" ? "Create agent" : "Save changes"}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        {conflict ? (
          <span className="text-sm text-destructive">
            Someone else updated this agent (409).{" "}
            <button className="underline" onClick={() => router.refresh()}>
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
