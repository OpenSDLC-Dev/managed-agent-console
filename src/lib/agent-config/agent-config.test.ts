import { describe, expect, it } from "vitest";
import {
  buildToolset,
  defaultToolsetForm,
  parseTools,
  withDefault,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from "./toolset";
import { AGENT_TEMPLATES } from "./templates";
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
    expect(toolset?.default).toEqual({ enabled: true, policy: "always_ask" });
    expect(toolset?.tools.bash).toEqual({
      enabled: true,
      policy: "always_ask",
    });
    expect(toolset?.tools.read).toEqual({
      enabled: true,
      policy: "always_allow",
    });
    expect(toolset?.tools.web_search).toEqual({
      enabled: false,
      policy: "always_ask",
    });
  });

  it("round-trips per-tool deviations through the canonical wire form", () => {
    const form = defaultToolsetForm();
    form.tools.bash = { enabled: true, policy: "always_ask" };
    form.tools.web_fetch = { enabled: false, policy: "always_allow" };
    expect(parseTools([buildToolset(form)]).toolset).toEqual(form);
  });

  it("emits the bare toolset at full defaults", () => {
    expect(buildToolset(defaultToolsetForm())).toEqual({
      type: "agent_toolset_20260401",
    });
  });

  it("preserves an externally-authored default_config (pinned regression)", () => {
    // Before plan 03 slice 4 this exploded into eight per-tool entries on
    // the first console save — semantically equal, shape clobbered.
    const wire = {
      type: "agent_toolset_20260401",
      default_config: { enabled: false },
    };
    const { toolset } = parseTools([wire]);
    expect(buildToolset(toolset!)).toEqual(wire);
  });

  it("emits default_config for the default and configs only for deviations from it", () => {
    const form = withDefault(defaultToolsetForm(), {
      enabled: true,
      policy: "always_ask",
    });
    form.tools.read = { enabled: true, policy: "always_allow" };
    expect(buildToolset(form)).toEqual({
      type: "agent_toolset_20260401",
      default_config: { permission_policy: { type: "always_ask" } },
      configs: [{ name: "read", permission_policy: { type: "always_allow" } }],
    });
  });

  it("round-trips a tool re-enabled under a disabled default", () => {
    const wire = {
      type: "agent_toolset_20260401",
      default_config: { enabled: false },
      configs: [{ name: "bash", enabled: true }],
    };
    const { toolset } = parseTools([wire]);
    expect(toolset?.tools.bash).toEqual({
      enabled: true,
      policy: "always_allow",
    });
    expect(toolset?.tools.read).toEqual({
      enabled: false,
      policy: "always_allow",
    });
    expect(buildToolset(toolset!)).toEqual(wire);
  });

  it("withDefault moves tools at the old default and keeps deviants", () => {
    const form = defaultToolsetForm();
    form.tools.bash = { enabled: false, policy: "always_allow" };
    const next = withDefault(form, { enabled: true, policy: "always_ask" });
    expect(next.default).toEqual({ enabled: true, policy: "always_ask" });
    expect(next.tools.read).toEqual({ enabled: true, policy: "always_ask" });
    expect(next.tools.bash).toEqual({
      enabled: false,
      policy: "always_allow",
    });
  });

  it("describes all eight tools", () => {
    expect(TOOL_NAMES).toHaveLength(8);
    for (const name of TOOL_NAMES) {
      expect(TOOL_DESCRIPTIONS[name]).toBeTruthy();
    }
  });
});

describe("starter templates", () => {
  it("carry wire-shaped toolsets that parse through the editor path", () => {
    for (const template of AGENT_TEMPLATES) {
      const { toolset, others } = parseTools(
        template.config.tools as unknown[],
      );
      expect(toolset, template.key).not.toBeNull();
      expect(others, template.key).toHaveLength(0);
      expect(template.config.name, template.key).toBeTruthy();
    }
  });

  it("code runner gates bash; researcher cannot change files", () => {
    const runner = parseTools(
      AGENT_TEMPLATES.find((t) => t.key === "code-runner")!.config
        .tools as unknown[],
    ).toolset!;
    expect(runner.tools.bash.policy).toBe("always_ask");
    expect(runner.tools.read.enabled).toBe(true);

    const researcher = parseTools(
      AGENT_TEMPLATES.find((t) => t.key === "researcher")!.config
        .tools as unknown[],
    ).toolset!;
    expect(researcher.tools.bash.enabled).toBe(false);
    expect(researcher.tools.write.enabled).toBe(false);
    expect(researcher.tools.edit.enabled).toBe(false);
    expect(researcher.tools.web_search.enabled).toBe(true);
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
