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

export interface ToolSetting {
  enabled: boolean;
  policy: Policy;
}

export type ToolsetSettings = Record<ToolName, ToolSetting>;

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

export function defaultSettings(): ToolsetSettings {
  return Object.fromEntries(
    TOOL_NAMES.map((name) => [name, { enabled: true, policy: "always_allow" }]),
  ) as ToolsetSettings;
}

/**
 * Split an agent's tools array into the built-in toolset (resolved per-tool)
 * and everything else (custom tools, mcp_toolset entries — edited raw).
 */
export function parseTools(tools: unknown[]): {
  toolset: ToolsetSettings | null;
  others: unknown[];
} {
  const entry = tools.find(isToolset);
  const others = tools.filter((t) => !isToolset(t));
  if (!entry) return { toolset: null, others };

  const fallback: ToolSetting = {
    enabled: entry.default_config?.enabled ?? true,
    policy: entry.default_config?.permission_policy?.type ?? "always_allow",
  };
  const settings = Object.fromEntries(
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
  return { toolset: settings, others };
}

/**
 * Canonical wire form for the editor's settings: the bare toolset when
 * everything is at defaults, otherwise per-tool configs for the deviations.
 */
export function buildToolset(settings: ToolsetSettings): ToolsetEntry {
  const configs = TOOL_NAMES.flatMap((name) => {
    const { enabled, policy } = settings[name];
    if (enabled && policy === "always_allow") return [];
    const config: NonNullable<ToolsetEntry["configs"]>[number] = { name };
    if (!enabled) config.enabled = false;
    if (policy !== "always_allow") config.permission_policy = { type: policy };
    return [config];
  });
  return configs.length > 0
    ? { type: "agent_toolset_20260401", configs }
    : { type: "agent_toolset_20260401" };
}
