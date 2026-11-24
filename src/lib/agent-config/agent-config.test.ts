import { describe, expect, it } from "vitest";
import {
  buildToolset,
  defaultToolsetForm,
  parseTools,
  withDefault,
  TOOL_DESCRIPTIONS,
  TOOL_NAMES,
} from "./toolset";
import { manualStarters, manualStarterConfig } from "./templates";
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

  it("withDefault moves each field at the old default and keeps per-field deviations", () => {
    const form = defaultToolsetForm();
    form.tools.bash = { enabled: false, policy: "always_allow" };
    const next = withDefault(form, { enabled: true, policy: "always_ask" });
    expect(next.default).toEqual({ enabled: true, policy: "always_ask" });
    expect(next.tools.read).toEqual({ enabled: true, policy: "always_ask" });
    // bash's enabled deviation holds; its policy sat at the default and follows.
    expect(next.tools.bash).toEqual({ enabled: false, policy: "always_ask" });
  });

  it("disabling the default disables a policy-deviant tool too", () => {
    // The wire overrides enabled and permission_policy independently — a
    // policy override must not leave a dangerous tool enabled after the
    // operator disables the toolset default (review finding, PR #29).
    const form = defaultToolsetForm();
    form.tools.bash = { enabled: true, policy: "always_ask" };
    const next = withDefault(form, {
      enabled: false,
      policy: form.default.policy,
    });
    expect(next.tools.bash).toEqual({ enabled: false, policy: "always_ask" });
    expect(buildToolset(next)).toEqual({
      type: "agent_toolset_20260401",
      default_config: { enabled: false },
      configs: [{ name: "bash", permission_policy: { type: "always_ask" } }],
    });
  });

  it("describes all eight tools", () => {
    expect(TOOL_NAMES).toHaveLength(8);
    for (const name of TOOL_NAMES) {
      expect(TOOL_DESCRIPTIONS[name]).toBeTruthy();
    }
  });
});

describe("manual starters", () => {
  it("seeds the five named templates and preserves local model aliases", () => {
    expect(manualStarters.map((s) => s.title)).toEqual([
      "Deep researcher",
      "Structured extractor",
      "Field monitor",
      "Support agent",
      "Incident commander",
    ]);
    for (const starter of [undefined, ...manualStarters]) {
      const draft = manualStarterConfig("team/agent", starter);
      const { toolset, others } = parseTools(draft.tools);
      expect(draft.model).toEqual({ id: "team/agent", effort: "low" });
      expect(toolset?.tools.web_fetch.enabled).toBe(
        ![
          "structured-extractor",
          "support-agent",
          "incident-commander",
        ].includes(starter?.key ?? ""),
      );
      const names = others.map(
        (t) => (t as { mcp_server_name: string }).mcp_server_name,
      );
      expect(names).toEqual(starter?.servers ?? []);
      expect(names).toEqual(
        (draft.mcp_servers ?? []).map((s) => (s as { name: string }).name),
      );
      if (starter?.key === "incident-commander")
        expect(others.slice(-2)).toEqual(
          ["slack", "github"].map((name) => ({
            type: "mcp_toolset",
            mcp_server_name: name,
            default_config: { enabled: false },
          })),
        );
    }
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
