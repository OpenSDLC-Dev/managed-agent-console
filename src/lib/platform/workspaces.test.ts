import { describe, expect, it } from "vitest";
import { switchDestination, type WorkspaceEntry } from "./workspaces";

describe("switching from workspace administration", () => {
  const current = "/settings/workspaces/wrkspc_00000000000000000000000002";
  const entry = {
    id: "default",
    name: "Default",
    public_id: "wrkspc_00000000000000000000000001",
    display_color: "#6C5BB9",
  };
  it.each([
    ["developer", "/workspaces/default/agents"],
    ["limited_developer", "/workspaces/default/agents"],
    ["user", "/workspaces/default/playground"],
    ["billing", "/usage?workspace=default"],
    ["admin", "/settings/workspaces/default?workspace=default"],
  ] as const)("opens an accessible page for %s", (role, expected) => {
    expect(
      switchDestination(current, { ...entry, role } satisfies WorkspaceEntry),
    ).toBe(expected);
  });
});
