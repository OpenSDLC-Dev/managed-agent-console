import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toRaw, fromRaw } from "@/lib/agent-config/raw";
import {
  configExample,
  starterConfig,
  starters,
  configFormats,
} from "@/lib/agent-config/quickstart";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { TEST_SESSION } from "@/../test/session-fixture";
import AgentCreatePage from "@/app/(console)/agents/create/page";
import AgentsOverviewPage from "@/app/(console)/agents/overview/page";
import { AgentsOverview } from "./agents-overview";
import { type AgentsOverviewReport } from "@/lib/platform/agents-overview";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
}));
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/agents/create",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/use-list-filters", () => ({
  useListFilters: () => {
    const [key, setKey] = useState(search);
    return {
      params: new URLSearchParams(key),
      update: (changes: Record<string, string | null>) => {
        const p = new URLSearchParams(key);
        for (const [name, value] of Object.entries(changes)) {
          if (value === null) p.delete(name);
          else p.set(name, value);
        }
        search = p.toString();
        setKey(search);
      },
    };
  },
}));
vi.mock("./model-field", () => ({
  useModelChoices: () => ({ names: ["a-model", "deepseek-flash"] }),
}));
vi.mock("@/lib/platform/surfaces", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform/surfaces")>()),
  useSurfaces: () => undefined,
}));
const alice = {
  id: "agent_one",
  name: "Alpha",
  archived_at: null,
  sessions: 2,
  error_rate: 50,
  median_seconds: 125,
  last_active: "2026-11-24T09:00:00Z",
};
const bob = {
  ...alice,
  id: "agent_two",
  name: "Beta",
  archived_at: "2026-11-24T12:00:00Z",
  sessions: 0,
  median_seconds: null,
  last_active: null,
};
const days = Array.from({ length: 30 }, (_, i) =>
  new Date(Date.UTC(2026, 10, i + 1)).toISOString().slice(0, 10),
);
const report: AgentsOverviewReport = {
  summary: {
    sessions: 2,
    error_rate: 50,
    agents: 1,
    session_change: 100,
    error_change: -12.4,
  },
  days,
  series: [
    {
      name: "Alpha",
      id: "agent_one",
      counts: days.map((_, i) => (i === 0 ? 2 : 0)),
    },
  ],
  active_time: [alice],
  agents: [alice, bob],
  total: 14,
};
const agent = {
  id: "agent_saved",
  type: "agent",
  name: "Test draft",
  version: 1,
  model: { id: "deepseek-flash" },
  system: "Summarize",
  description: "Summary",
  tools: [],
  skills: [],
  mcp_servers: [],
  multiagent: null,
  metadata: {},
  archived_at: null,
};
let summary = report;
let grant = true;
let errorRead = false,
  errorWrite = false,
  modelReply =
    '{"name":"Word counter","description":"Count","system":"Count words."}';
let writes: Record<string, unknown>[] = [];
const calls: string[] = [];
beforeEach(() => {
  search = "";
  grant = true;
  errorRead = false;
  errorWrite = false;
  modelReply =
    '{"name":"Word counter","description":"Count","system":"Count words."}';
  summary = report;
  writes = [];
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console.test");
      calls.push(url.pathname + url.search);
      if (url.pathname === "/api/auth/session")
        return Response.json({ ...TEST_SESSION, playground_access: grant });
      if (url.pathname.endsWith("/agents/overview"))
        return errorRead
          ? Response.json(
              { error: { type: "api_error", message: "report failed" } },
              { status: 503 },
            )
          : Response.json(summary);
      if (url.pathname.endsWith("/models"))
        return Response.json({
          data: [{ id: "deepseek-flash", display_name: "Flash" }],
          has_more: false,
          last_id: null,
        });
      if (url.pathname.endsWith("/messages"))
        return Response.json({ content: [{ type: "text", text: modelReply }] });
      if (url.pathname.endsWith("/agents") && init?.method === "POST") {
        if (errorWrite)
          return Response.json(
            {
              error: {
                type: "invalid_request_error",
                message: "model rejected",
              },
            },
            { status: 400 },
          );
        writes.push(JSON.parse(String(init.body)));
        return Response.json(agent);
      }
      if (url.pathname.endsWith("/agents/agent_saved"))
        return Response.json(agent);
      if (url.pathname.endsWith("/environments"))
        return Response.json({
          data: [
            {
              id: "env_a",
              name: "Sandbox",
              config: { type: "cloud" },
              metadata: {},
            },
          ],
          has_more: false,
        });
      return Response.json({ data: [], has_more: false });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={
          {
            data: { ...TEST_SESSION, playground_access: grant },
          } as React.ContextType<typeof ConsoleSessionContext>
        }
      >
        {element}
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
}
it("renders the Platform report and keeps chart ranks independent of directory sorting", async () => {
  const user = userEvent.setup();
  mount(<AgentsOverviewPage />);
  await screen.findByText("2", { selector: "p" });
  await user.click(screen.getByRole("button", { name: "About sessions" }));
  expect(screen.getByRole("dialog", { name: "Sessions" })).toHaveTextContent(
    "30 days",
  );
  await user.keyboard("{Escape}");
  const chart = screen.getByRole("group", { name: /Daily sessions/ });
  fireEvent.focus(chart);
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(within(chart).getByRole("status")).toHaveTextContent("Nov 2");
  fireEvent.keyDown(chart, { key: "ArrowLeft" });
  fireEvent.pointerEnter(chart.querySelectorAll("i")[0].parentElement!);
  fireEvent.click(chart.querySelectorAll("i")[0].parentElement!);
  fireEvent.keyDown(chart, { key: "Escape" });
  fireEvent.mouseLeave(chart);
  fireEvent.blur(chart);
  const active = screen.getByRole("group", { name: /Median active/ });
  fireEvent.focus(active);
  fireEvent.keyDown(active, { key: "ArrowDown" });
  fireEvent.keyDown(active, { key: "ArrowUp" });
  expect(within(active).getByRole("status")).toHaveTextContent("2m");
  fireEvent.click(within(active).getByText("Alpha"));
  fireEvent.keyDown(active, { key: "Escape" });
  fireEvent.mouseLeave(active);
  fireEvent.blur(active);
  for (const label of ["Name", "Sessions", "Error rate", "Last active"]) {
    const b = screen.getByRole("button", { name: label });
    await user.click(b);
    await user.click(b);
  }
  expect(calls).toContainEqual(
    expect.stringContaining("sort=last_active&direction=asc"),
  );
  expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
    "href",
    "/agents/agent_one?tab=observability",
  );
  expect(screen.getByRole("link", { name: "Show more" })).toHaveAttribute(
    "href",
    "/agents",
  );
  expect(screen.getByText("Archived")).toBeVisible();
  screen.getByRole("button", { name: "Create" }).focus();
  await user.keyboard("{ArrowDown}");
  expect(
    await screen.findByRole("menuitem", { name: "Environment" }),
  ).toHaveAttribute("href", "/environments/new");
});
it("distinguishes an empty per-agent report and a failed workspace read", async () => {
  summary = {
    summary: {
      sessions: 0,
      error_rate: 0,
      agents: 0,
      session_change: null,
      error_change: null,
    },
    days,
    series: [],
    active_time: [],
    agents: [],
    total: 0,
  };
  mount(<AgentsOverview agentId="agent_empty" />);
  await screen.findByText("No session activity in the last 30 days");
  expect(calls.some((x) => x.includes("agent_id=agent_empty"))).toBe(true);
  cleanup();
  errorRead = true;
  mount(<AgentsOverviewPage />);
  expect(await screen.findByText("report failed")).toBeVisible();
  expect(screen.queryByText("No agents in this workspace yet.")).toBeNull();
});
it("selects reviewable Platform templates and exports the same configuration in each format", async () => {
  const user = userEvent.setup();
  mount(<AgentCreatePage />);
  for (const s of starters) {
    await user.click(screen.getByRole("button", { name: s.title }));
    const dialog = screen.getByRole("dialog", { name: s.title });
    expect(
      within(dialog).getByRole("region", { name: "Agent config" }),
    ).toHaveTextContent(s.title);
    if (s.key === "data-analyst") {
      for (const f of ["Python"] as const) {
        within(dialog)
          .getByRole("button", { name: /Config format/ })
          .focus();
        await user.keyboard("{ArrowDown}");
        await user.click(await screen.findByRole("menuitem", { name: f }));
        expect(dialog.querySelector("pre")?.textContent).toBe(
          configExample(starterConfig("deepseek-flash", s), f),
        );
      }
      await user.click(
        within(dialog).getByRole("button", { name: "Copy code" }),
      );
    }
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  }
  expect(writes).toEqual([]);
  expect(
    screen.getByRole("link", { name: "start from a blank agent" }),
  ).toHaveAttribute("href", "/agents/new");
});
it("does not write or run a template before confirmation; keeps write errors editable", async () => {
  grant = false;
  search = "template=structured-extractor";
  const user = userEvent.setup();
  mount(<AgentCreatePage />);
  await user.click(screen.getByRole("button", { name: "Use this template" }));
  const yaml = await screen.findByLabelText("Agent configuration");
  const original = (yaml as HTMLTextAreaElement).value;
  expect(fromRaw(original, "yaml").config?.name).toBe("Structured extractor");
  await user.click(screen.getByRole("button", { name: "Close panel" }));
  await user.click(screen.getByRole("button", { name: "Open agent config" }));
  await user.click(screen.getByRole("button", { name: "Keep refining" }));
  fireEvent.change(screen.getByLabelText("Agent configuration"), {
    target: { value: "[" },
  });
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "Create agent" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Agent configuration"), {
    target: { value: original },
  });
  errorWrite = true;
  await user.click(screen.getByRole("button", { name: "Create agent" }));
  await screen.findByText("model rejected");
  expect(writes).toEqual([]);
  errorWrite = false;
  await user.click(screen.getByRole("button", { name: "Create agent" }));
  expect(
    await screen.findByRole("heading", { name: "Agent created" }),
  ).toBeVisible();
  expect(writes).toEqual([starterConfig("deepseek-flash", starters[1])]);
  expect(calls.some((x) => x.includes("/messages"))).toBe(false);
  await user.click(screen.getByRole("button", { name: "Export as code" }));
  expect(
    screen.getByRole("region", { name: "Agent config" }),
  ).toHaveTextContent("Test draft");
  await user.selectOptions(
    screen.getByLabelText("Choose an environment"),
    "env_a",
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getAllByRole("button", { name: "Start session" })[0]);
  expect(
    await screen.findByRole("dialog", { name: "Start session" }),
  ).toBeVisible();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: /Integrate/ }));
  expect(
    screen.getByRole("link", { name: "Create deployment" }),
  ).toHaveAttribute(
    "href",
    "/deployments/new?agent=agent_saved&environment=env_a",
  );
});
it("builds and refines a draft through Messages and preserves valid YAML after a model failure", async () => {
  const user = userEvent.setup();
  mount(<AgentCreatePage />);
  const prompt = screen.getByRole("textbox", { name: "Describe your agent" });
  await user.type(prompt, "Count the words");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create agent" })).toBeEnabled(),
  );
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Agent configuration") as HTMLTextAreaElement)
        .value,
    ).toContain("Word counter"),
  );
  await user.click(screen.getByRole("button", { name: "Keep refining" }));
  const reply = screen.getByRole("textbox", { name: "Reply" });
  expect(reply).toHaveFocus();
  modelReply = "{}";
  await user.type(reply, "add a title{Enter}");
  await screen.findByText(
    "The model did not return a usable agent configuration.",
  );
  expect(
    (screen.getByLabelText("Agent configuration") as HTMLTextAreaElement).value,
  ).toContain("Count words.");
  modelReply =
    '{"name":"Word count","description":"Count","system":"Report a total."}';
  await user.type(reply, "Refine");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Agent configuration") as HTMLTextAreaElement)
        .value,
    ).toContain("Report a total."),
  );
  await user.click(screen.getByRole("button", { name: "Templates" }));
  expect(
    screen.getByRole("textbox", { name: "Describe your agent" }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});
it("escapes a shell quote without altering the wire configuration", () => {
  const config = starterConfig("model");
  config.name = "operator's draft";
  for (const format of configFormats)
    expect(configExample(config, format)).toContain("operator");
  expect(configExample(config, "cURL")).toContain("'\"'\"'");
  expect(fromRaw(toRaw(config, "yaml"), "yaml").config).toEqual(config);
});
