import { describe, expect, it } from "vitest";
import {
  buildToolset,
  defaultSettings,
  parseTools,
  TOOL_NAMES,
} from "./toolset";
import { fromRaw, toRaw } from "./raw";

describe("toolset mapping", () => {
  it("resolves per-tool > default_config > defaults", () => {
    const { toolset, others } = parseTools([
      {
        type: "agent_toolset_20260401",
        default_config: { permission_policy: { type: "always_ask" } },
        configs: [
          { name: "read", permission_policy: { type: "always_allow" } },
          { name: "web_search", enabled: false },
        ],
      },
      { type: "custom", name: "lookup", description: "d", input_schema: {} },
    ]);
    expect(others).toHaveLength(1);
    expect(toolset?.bash).toEqual({ enabled: true, policy: "always_ask" });
    expect(toolset?.read).toEqual({ enabled: true, policy: "always_allow" });
    expect(toolset?.web_search).toEqual({
      enabled: false,
      policy: "always_ask",
    });
  });

  it("round-trips settings through the canonical wire form", () => {
    const settings = defaultSettings();
    settings.bash = { enabled: true, policy: "always_ask" };
    settings.web_fetch = { enabled: false, policy: "always_allow" };
    const rebuilt = parseTools([buildToolset(settings)]).toolset;
    expect(rebuilt).toEqual(settings);
  });

  it("emits the bare toolset at full defaults", () => {
    expect(buildToolset(defaultSettings())).toEqual({
      type: "agent_toolset_20260401",
    });
  });

  it("knows all eight tools", () => {
    expect(TOOL_NAMES).toHaveLength(8);
  });
});

describe("raw codec", () => {
  const config = {
    name: "A",
    model: { id: "claude-sonnet-4-8", speed: "fast" },
    tools: [{ type: "agent_toolset_20260401" }],
    skills: [{ type: "anthropic", skill_id: "xlsx", version: "latest" }],
  };

  it("JSON→YAML→JSON is lossless for wire shapes", () => {
    const yaml = toRaw(config, "yaml");
    const back = fromRaw(yaml, "yaml");
    expect(back.config).toEqual(config);
  });

  it("reports parse errors instead of throwing", () => {
    expect(fromRaw("{ not json", "json").error).toBeTruthy();
    expect(fromRaw("[1,2]", "json").error).toBe("the config must be an object");
  });
});
