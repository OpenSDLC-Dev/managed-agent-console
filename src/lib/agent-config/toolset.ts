/**
 * Editor mapping for the built-in toolset (agent_toolset_20260401).
 * Wire semantics (platform internal/toolset/definitions.go): per-tool config
 * beats default_config beats the defaults enabled=true / always_allow; the
 * eight tool names are fixed.
 */

export const TOOL_NAMES = [
  "bash",
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "web_fetch",
  "web_search",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
export type Policy = "always_allow" | "always_ask";

/** Static plain-language descriptions for the toolset card (plan 03 slice 4). */
export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  bash: "Execute bash commands",
  read: "Read files in the environment",
  write: "Create or overwrite files",
  edit: "Make targeted edits to files",
  glob: "Find files by name pattern",
  grep: "Search file contents",
  web_fetch: "Fetch a URL's contents",
  web_search: "Search the web",
};

export interface ToolSetting {
  enabled: boolean;
  policy: Policy;
}

export type ToolsetSettings = Record<ToolName, ToolSetting>;

/**
 * Editor model: the toolset-level default (the wire's `default_config`,
 * resolved) plus per-tool resolved settings.
 */
export interface ToolsetForm {
  default: ToolSetting;
  tools: ToolsetSettings;
}

/** The wire's hard defaults when neither default_config nor configs speak. */
const WIRE_DEFAULT: ToolSetting = { enabled: true, policy: "always_allow" };

interface ToolsetEntry {
  type: "agent_toolset_20260401";
  default_config?: {
    enabled?: boolean;
    permission_policy?: { type: Policy };
  };
  configs?: {
    name: string;
    enabled?: boolean;
    permission_policy?: { type: Policy };
  }[];
}

const isToolset = (entry: unknown): entry is ToolsetEntry =>
  typeof entry === "object" &&
  entry !== null &&
  (entry as { type?: string }).type === "agent_toolset_20260401";

export function defaultToolsetForm(): ToolsetForm {
  return {
    default: { ...WIRE_DEFAULT },
    tools: Object.fromEntries(
      TOOL_NAMES.map((name) => [name, { ...WIRE_DEFAULT }]),
    ) as ToolsetSettings,
  };
}

/**
 * Split an agent's tools array into the built-in toolset (default resolved,
 * then per-tool) and everything else (custom tools, mcp_toolset entries —
 * edited raw).
 */
export function parseTools(tools: unknown[]): {
  toolset: ToolsetForm | null;
  others: unknown[];
} {
  const entry = tools.find(isToolset);
  const others = tools.filter((t) => !isToolset(t));
  if (!entry) return { toolset: null, others };

  const fallback: ToolSetting = {
    enabled: entry.default_config?.enabled ?? WIRE_DEFAULT.enabled,
    policy:
      entry.default_config?.permission_policy?.type ?? WIRE_DEFAULT.policy,
  };
  const tools_ = Object.fromEntries(
    TOOL_NAMES.map((name) => {
      const config = entry.configs?.find((c) => c.name === name);
      return [
        name,
        {
          enabled: config?.enabled ?? fallback.enabled,
          policy: config?.permission_policy?.type ?? fallback.policy,
        },
      ];
    }),
  ) as ToolsetSettings;
  return { toolset: { default: fallback, tools: tools_ }, others };
}

/**
 * Compact wire form (plan 03 decision 5): the bare toolset when everything
 * sits at the wire defaults; `default_config` only when the toolset-level
 * default deviates; per-tool `configs` only for deviations from that default
 * — so an externally-authored `{default_config: {enabled: false}}` agent
 * round-trips unchanged instead of exploding into eight per-tool entries.
 */
export function buildToolset(form: ToolsetForm): ToolsetEntry {
  const entry: ToolsetEntry = { type: "agent_toolset_20260401" };

  const defaults: NonNullable<ToolsetEntry["default_config"]> = {};
  if (form.default.enabled !== WIRE_DEFAULT.enabled)
    defaults.enabled = form.default.enabled;
  if (form.default.policy !== WIRE_DEFAULT.policy)
    defaults.permission_policy = { type: form.default.policy };
  if (Object.keys(defaults).length > 0) entry.default_config = defaults;

  const configs = TOOL_NAMES.flatMap((name) => {
    const setting = form.tools[name];
    const config: NonNullable<ToolsetEntry["configs"]>[number] = { name };
    if (setting.enabled !== form.default.enabled)
      config.enabled = setting.enabled;
    if (setting.policy !== form.default.policy)
      config.permission_policy = { type: setting.policy };
    return Object.keys(config).length > 1 ? [config] : [];
  });
  if (configs.length > 0) entry.configs = configs;

  return entry;
}

/**
 * Change the toolset-level default. Tools sitting exactly at the old default
 * follow it; explicit deviants keep their settings.
 */
export function withDefault(form: ToolsetForm, next: ToolSetting): ToolsetForm {
  const tools = Object.fromEntries(
    TOOL_NAMES.map((name) => {
      const setting = form.tools[name];
      const follows =
        setting.enabled === form.default.enabled &&
        setting.policy === form.default.policy;
      return [name, follows ? { ...next } : setting];
    }),
  ) as ToolsetSettings;
  return { default: { ...next }, tools };
}
