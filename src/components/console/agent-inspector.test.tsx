import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { agents } from "../../../test/mock-platform/fixtures.mjs";
import type { Agent } from "@/lib/platform/types";
import { AgentInspector } from "./agent-inspector";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(agent = structuredClone(agents[1]) as Agent, status = 200) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST")
      agent = { ...agent, archived_at: "2026-09-12T00:00:00Z" };
    return Response.json(
      status === 200
        ? agent
        : { error: { type: "not_found_error", message: "Agent not found" } },
      { status },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AgentInspector
        id={agent.id}
        previous="previous-agent"
        next="next-agent"
        onSelect={onSelect}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { fetch, onSelect, onClose };
}

it("shows model/version and resolves the displayed tool rows through the existing wire mapping", async () => {
  const agent = structuredClone(agents[1]) as Agent;
  agent.tools = [
    {
      type: "agent_toolset_20260401",
      default_config: {
        enabled: true,
        permission_policy: { type: "always_ask" },
      },
      configs: [
        {
          name: "read",
          enabled: false,
          permission_policy: { type: "always_ask" },
        },
      ],
    },
  ];
  setup(agent);
  await screen.findByRole("heading", { name: "General task agent" });
  expect(screen.getByText("V1")).toHaveAttribute("data-version", "1");
  expect(screen.getByText("claude-sonnet-4-8 · fast")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: /^Tool permissions 8/ }),
  );
  expect(document.querySelector("[data-permission-summary]")).toHaveAttribute(
    "data-permission-summary",
    "Custom",
  );
  const bash = document.querySelector('[data-tool-name="bash"]') as HTMLElement;
  expect(bash).toHaveAttribute("data-permission-policy", "always_ask");
  expect(within(bash).getByText("Always ask")).toBeVisible();
  const read = document.querySelector('[data-tool-name="read"]') as HTMLElement;
  expect(read).toHaveAttribute("data-tool-enabled", "false");
  expect(within(read).getByText("Always deny")).toBeVisible();
  expect(screen.getByText("No skills configured.")).toBeVisible();
  expect(screen.getByText("No subagents configured.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "API" }));
  expect(screen.getByText(/"permission_policy":/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Rendered" }));
  expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
    "href",
    "/agents/" + agent.id,
  );
});

it("keeps server/unknown tool data readable and links custom skills and the pinned roster", async () => {
  const agent = structuredClone(agents[0]) as Agent;
  agent.tools.push({
    name: "custom-search",
    description: "Find internal records",
    input_schema: { type: "object" },
  });
  agent.mcp_servers = [{ name: "internal", url: "https://mcp.example" }];
  agent.skills.push({
    type: "custom",
    skill_id: "skill_internal",
    version: "v1",
  });
  agent.multiagent = {
    type: "coordinator",
    agents: [
      { type: "agent", id: agent.id, version: 3 },
      { type: "agent", id: agents[1].id, version: 1 },
    ],
  };
  setup(agent);
  await screen.findByRole("heading", { name: "Deep researcher" });
  await userEvent.click(screen.getByText("Tool configuration 1"));
  expect(screen.getByText(/"custom-search"/)).toBeVisible();
  await userEvent.click(screen.getByText("MCP servers"));
  expect(screen.getByText(/https:\/\/mcp.example/)).toBeVisible();
  expect(screen.getByRole("link", { name: "skill_internal" })).toHaveAttribute(
    "href",
    "/skills/skill_internal",
  );
  expect(screen.getByText("This coordinator (self)")).toBeVisible();
  expect(screen.getByRole("link", { name: agents[1].id })).toHaveAttribute(
    "href",
    "/agents/" + agents[1].id,
  );
  await userEvent.click(screen.getByText("Metadata"));
  expect(screen.getByText(/"team": "research"/)).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: /Tool permissions/ }),
  );
  expect(
    document.querySelectorAll(
      "[data-tool-name][data-permission-policy=always_allow]",
    ),
  ).toHaveLength(8);
  expect(document.querySelector("[data-permission-summary]")).toHaveAttribute(
    "data-permission-summary",
    "Always allow",
  );
});

it("archives through the platform and supports previous, next and close", async () => {
  const { onSelect, onClose, fetch } = setup();
  await screen.findByRole("heading", { name: "General task agent" });
  await userEvent.click(screen.getByRole("button", { name: "Next agent" }));
  expect(onSelect).toHaveBeenLastCalledWith("next-agent");
  await userEvent.click(screen.getByRole("button", { name: "Previous agent" }));
  expect(onSelect).toHaveBeenLastCalledWith("previous-agent");
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
  await userEvent.click(screen.getByRole("button", { name: "Archive agent" }));
  expect(await screen.findByText("Archived")).toBeVisible();
  expect(
    fetch.mock.calls.some(
      ([input, init]) =>
        String(input).endsWith("/archive") && init?.method === "POST",
    ),
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Close details" }));
  expect(onClose).toHaveBeenCalled();
});

it("shows empty tools on archived agents without archive actions", async () => {
  setup(agents[2] as Agent);
  await screen.findByRole("heading", { name: "Retired agent" });
  expect(screen.getByText("No tools configured.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
});

it("keeps inspector controls available when an exact ID is missing", async () => {
  setup(undefined, 404);
  expect(await screen.findByText("Agent not found")).toBeVisible();
  expect(screen.getByRole("button", { name: "Close details" })).toBeEnabled();
});
