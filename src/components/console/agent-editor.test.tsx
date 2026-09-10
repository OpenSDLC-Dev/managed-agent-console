import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps, ReactNode } from "react";
import {
  AgentEditor,
  formFromAgent,
  formFromConfig,
  newAgentForm,
} from "./agent-editor";
import type { Agent, Skill } from "@/lib/platform/types";

const { pushSpy, backSpy, refreshSpy } = vi.hoisted(() => ({
  pushSpy: vi.fn(),
  backSpy: vi.fn(),
  refreshSpy: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushSpy,
    back: backSpy,
    replace: vi.fn(),
    refresh: refreshSpy,
  }),
  usePathname: () => "/agents",
  useSearchParams: () => new URLSearchParams(),
}));

// base-ui's Select needs real pointer geometry; replace it with a flat mock
// that renders items as buttons wired to onValueChange (vendored ui/ is
// excluded from coverage, so nothing under test is lost).
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Ctx = React.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
  }>({});

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children?: ReactNode;
  }) {
    return (
      <Ctx.Provider value={{ value, onValueChange }}>
        <div data-slot="mock-select">{children}</div>
      </Ctx.Provider>
    );
  }

  function SelectTrigger({
    children,
    disabled,
    "aria-label": ariaLabel,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    "aria-label"?: string;
    size?: string;
    className?: string;
  }) {
    return (
      <button type="button" aria-label={ariaLabel} disabled={disabled}>
        {children}
      </button>
    );
  }

  function SelectValue() {
    const { value } = React.useContext(Ctx);
    return <span>{value}</span>;
  }

  function SelectContent({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  }

  function SelectItem({
    value,
    children,
  }: {
    value: string;
    children?: ReactNode;
  }) {
    const { onValueChange } = React.useContext(Ctx);
    return (
      <button type="button" onClick={() => onValueChange?.(value)}>
        {children}
      </button>
    );
  }

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

const timestamps = {
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const agentResponse = (over: Partial<Agent> = {}): Agent => ({
  id: "agent_new",
  type: "agent",
  name: "My Agent",
  version: 1,
  model: { id: "claude-opus-4-2" },
  system: "",
  description: "",
  tools: [],
  mcp_servers: [],
  skills: [],
  multiagent: null,
  metadata: {},
  ...timestamps,
  archived_at: null,
  ...over,
});

const skillsPage: { data: Skill[] } = {
  data: [
    {
      id: "skill_1",
      type: "skill",
      display_name: "PDF Filler",
      latest_version_id: "1",
      source: { type: "custom" },
      ...timestamps,
    },
    {
      id: "xlsx",
      type: "skill",
      display_name: "Excel",
      latest_version_id: "2",
      source: { type: "anthropic" },
      ...timestamps,
    },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function stubFetch({
  skills = { data: [] as Skill[] },
  agents = { data: [] as Agent[] },
  save = () => json(agentResponse()),
}: { skills?: unknown; agents?: unknown; save?: () => Response } = {}) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") return save();
    if (url.startsWith("/api/platform/v1/skills")) return json(skills);
    if (url.startsWith("/api/platform/v1/agents")) return json(agents);
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderEditor(props?: Partial<ComponentProps<typeof AgentEditor>>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AgentEditor mode="create" initial={newAgentForm()} {...props} />
    </QueryClientProvider>,
  );
}

async function expandTools(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: /Tool permissions/ }));
}

async function choose(user: UserEvent, triggerLabel: string, option: string) {
  const trigger = screen.getByRole("button", { name: triggerLabel });
  const wrapper = trigger.closest('[data-slot="mock-select"]') as HTMLElement;
  await user.click(within(wrapper).getByRole("button", { name: option }));
}

// Plain controlled inputs, no per-keystroke behaviour: one change event says
// what typing says without userEvent's per-character cost, which is what raced
// the save test against the 5s timeout under load (#93). What it cannot see is
// state arriving back in the input, so a field with no `toHaveValue` elsewhere
// in the file asserts one where it is filled.
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const rawTextarea = () =>
  screen.getByLabelText("Raw agent config") as HTMLTextAreaElement;
const rawConfig = () =>
  JSON.parse(rawTextarea().value) as Record<string, unknown>;
const postCalls = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.filter(([, init]) => init?.method === "POST");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("newAgentForm", () => {
  it("starts with the default model and a fully-enabled toolset", () => {
    const form = newAgentForm();
    expect(form.name).toBe("");
    expect(form.modelId).toBe("claude-sonnet-4-8");
    expect(form.speed).toBe("");
    expect(form.toolset?.default).toEqual({
      enabled: true,
      policy: "always_allow",
    });
    expect(form.toolset?.tools.bash).toEqual({
      enabled: true,
      policy: "always_allow",
    });
    expect(form.otherTools).toEqual([]);
    expect(form.mcpServers).toEqual([]);
    expect(form.skills).toEqual([]);
    expect(form.metadata).toEqual({});
  });
});

describe("formFromAgent", () => {
  it("does not reinterpret a malformed member as self without a self id", () => {
    expect(
      formFromConfig({
        multiagent: { type: "coordinator", agents: [{}] },
      }).multiagent,
    ).toEqual([]);
  });

  it("splits the toolset from other tools and keeps wire fields", () => {
    const form = formFromAgent(
      agentResponse({
        name: "Existing",
        model: { id: "claude-sonnet-4-8", speed: "fast" },
        system: "sys",
        description: "desc",
        tools: [
          {
            type: "agent_toolset_20260401",
            configs: [{ name: "bash", enabled: false }],
          },
          { type: "custom", name: "deploy" },
        ],
        skills: [{ type: "custom", skill_id: "skill_1", version: "latest" }],
        metadata: { team: "core" },
      }),
    );
    expect(form.name).toBe("Existing");
    expect(form.modelId).toBe("claude-sonnet-4-8");
    expect(form.speed).toBe("fast");
    expect(form.system).toBe("sys");
    expect(form.description).toBe("desc");
    expect(form.toolset?.tools.bash).toEqual({
      enabled: false,
      policy: "always_allow",
    });
    expect(form.toolset?.tools.read).toEqual({
      enabled: true,
      policy: "always_allow",
    });
    expect(form.otherTools).toEqual([{ type: "custom", name: "deploy" }]);
    expect(form.skills).toEqual([
      { type: "custom", skill_id: "skill_1", version: "latest" },
    ]);
    expect(form.metadata).toEqual({ team: "core" });
  });

  it("tolerates a string model, an invalid speed, and missing fields", () => {
    const loose = formFromAgent({
      model: "claude-opus-4-2",
    } as unknown as Agent);
    expect(loose).toEqual({
      name: "",
      modelId: "claude-opus-4-2",
      speed: "",
      system: "",
      description: "",
      toolset: null,
      otherTools: [],
      mcpServers: [],
      skills: [],
      multiagent: null,
      metadata: {},
    });
    expect(formFromAgent({} as unknown as Agent).modelId).toBe("");
    expect(
      formFromAgent({ model: { id: "m", speed: "turbo" } } as unknown as Agent)
        .speed,
    ).toBe("");
  });
});

describe("AgentEditor", () => {
  it("builds an ordered coordinator roster from platform agents", async () => {
    const worker = agentResponse({
      id: "agent_worker",
      name: "Worker",
      version: 4,
    });
    const mock = stubFetch({ agents: { data: [worker] } });
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Enable coordinator" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Agent")).toHaveTextContent("Worker · v4"),
    );
    fireEvent.change(screen.getByLabelText("Agent"), {
      target: { value: worker.id },
    });
    await user.click(screen.getByRole("button", { name: "Add member" }));
    expect(screen.getByText("Worker")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create agent" }));
    const body = JSON.parse(postCalls(mock)[0][1]?.body as string);
    expect(body.multiagent).toEqual({
      type: "coordinator",
      agents: [{ type: "self" }, { type: "agent", id: worker.id, version: 4 }],
    });
  });

  it("clears an existing coordinator roster in edit mode", async () => {
    const existing = agentResponse({
      id: "agent_1",
      version: 3,
      multiagent: {
        type: "coordinator",
        agents: [{ type: "agent", id: "agent_1", version: 3 }],
      },
    });
    const mock = stubFetch();
    const user = userEvent.setup();
    renderEditor({
      mode: "edit",
      initial: formFromAgent(existing),
      agentId: existing.id,
      version: existing.version,
    });

    await user.click(
      screen.getByRole("button", { name: "Disable coordinator" }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const body = JSON.parse(postCalls(mock)[0][1]?.body as string);
    expect(body).toMatchObject({ version: 3, multiagent: null });
  });

  it("saves rendered-tab edits as the wire body and navigates on success", async () => {
    const mock = stubFetch();
    const user = userEvent.setup();
    renderEditor();

    fill("Name", "My Agent");
    // Replaces the seeded default outright, so no clear step is needed.
    fill("Model", "claude-opus-4-2");
    fill("Description", "Does things");
    fill("System prompt", "Be helpful");
    // Name, Model and System prompt round-trip through the raw tab below;
    // Description is the one field whose rendered value nothing else asserts.
    expect(screen.getByLabelText("Description")).toHaveValue("Does things");
    // Both onValueChange branches: an explicit speed, back to default, fast.
    await choose(user, "Model speed", "standard");
    await choose(user, "Model speed", "default");
    await choose(user, "Model speed", "fast");

    await user.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/agents/agent_new"),
    );

    const [url, init] = postCalls(mock)[0];
    expect(url).toBe("/api/platform/v1/agents");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({
      name: "My Agent",
      model: { id: "claude-opus-4-2", speed: "fast" },
      system: "Be helpful",
      description: "Does things",
      tools: [{ type: "agent_toolset_20260401" }],
      mcp_servers: [],
      skills: [],
    });
  });

  it("serializes toolset toggles as per-tool configs", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await expandTools(user);

    await user.click(screen.getByRole("checkbox", { name: "bash enabled" }));
    expect(screen.getByRole("button", { name: "bash policy" })).toBeDisabled();
    await choose(user, "read policy", "always ask");

    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toEqual([
      {
        type: "agent_toolset_20260401",
        configs: [
          { name: "bash", enabled: false },
          { name: "read", permission_policy: { type: "always_ask" } },
        ],
      },
    ]);
  });

  it("lays out the sections with tool descriptions", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await expandTools(user);
    for (const title of ["General", "Tools", "Skills"]) {
      expect(
        screen.getByRole("heading", { name: title, level: 3 }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("— Execute bash commands")).toBeInTheDocument();
    expect(screen.getByText("— Search the web")).toBeInTheDocument();
  });

  it("flows the toolset-level default into default_config, per-tool deviations relative to it", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await expandTools(user);

    await choose(user, "default policy", "always ask");
    // read deviates back to allow relative to the ask default.
    await choose(user, "read policy", "always allow");

    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toEqual([
      {
        type: "agent_toolset_20260401",
        default_config: { permission_policy: { type: "always_ask" } },
        configs: [
          { name: "read", permission_policy: { type: "always_allow" } },
        ],
      },
    ]);
  });

  it("disabling the default disables every following tool compactly", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await expandTools(user);

    await user.click(screen.getByRole("checkbox", { name: "default enabled" }));
    expect(
      screen.getByRole("checkbox", { name: "bash enabled" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "default policy" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toEqual([
      { type: "agent_toolset_20260401", default_config: { enabled: false } },
    ]);
  });

  it("disabling the default also disables a policy-deviant tool", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await expandTools(user);

    await choose(user, "bash policy", "always ask");
    await user.click(screen.getByRole("checkbox", { name: "default enabled" }));
    expect(
      screen.getByRole("checkbox", { name: "bash enabled" }),
    ).not.toBeChecked();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toEqual([
      {
        type: "agent_toolset_20260401",
        default_config: { enabled: false },
        configs: [{ name: "bash", permission_policy: { type: "always_ask" } }],
      },
    ]);
  });

  it("shows the equivalent curl with placeholders and copies it", async () => {
    stubFetch();
    // Stub the clipboard after setup — user-event installs its own stub —
    // and restore the descriptor so the mock cannot leak into later tests.
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    const original = Object.getOwnPropertyDescriptor(
      window.navigator,
      "clipboard",
    );
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    onTestFinished(() => {
      if (original) {
        Object.defineProperty(window.navigator, "clipboard", original);
      } else {
        delete (window.navigator as { clipboard?: unknown }).clipboard;
      }
    });
    renderEditor();

    const block = screen.getByTestId("curl-block");
    expect(block).toHaveTextContent("Equivalent API request");
    // Collapsed blocks build no command — opening renders it.
    expect(block).not.toHaveTextContent("curl -X POST");
    await user.click(within(block).getByText("Equivalent API request"));
    expect(block).toHaveTextContent(
      'curl -X POST "$PLATFORM_BASE_URL/v1/agents"',
    );
    expect(block).toHaveTextContent("x-api-key: $PLATFORM_API_KEY");

    await user.click(within(block).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("$PLATFORM_API_KEY"),
    );
    expect(
      await within(block).findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("targets the agent's URL and carries the version in edit mode", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor({
      mode: "edit",
      initial: formFromAgent(agentResponse({ id: "agent_1", version: 3 })),
      agentId: "agent_1",
      version: 3,
    });
    const block = screen.getByTestId("curl-block");
    await user.click(within(block).getByText("Equivalent API request"));
    expect(block).toHaveTextContent(
      'curl -X POST "$PLATFORM_BASE_URL/v1/agents/agent_1"',
    );
    expect(block).toHaveTextContent('"version": 3');
  });

  it("removes and re-adds the built-in toolset", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Remove toolset" }));
    expect(screen.queryByRole("checkbox", { name: "bash enabled" })).toBeNull();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toEqual([]);

    await user.click(screen.getByRole("radio", { name: "rendered" }));
    await user.click(screen.getByRole("button", { name: "Add toolset" }));
    expect(
      screen.getByRole("checkbox", { name: "bash enabled" }),
    ).toBeChecked();
  });

  it("shows the empty-skills hint when the platform has none", async () => {
    stubFetch();
    renderEditor();
    expect(
      await screen.findByText("No skills on the platform yet."),
    ).toBeInTheDocument();
  });

  it("picks platform skills without changing existing pinned refs", async () => {
    stubFetch({ skills: skillsPage });
    const user = userEvent.setup();
    renderEditor({
      initial: {
        ...newAgentForm(),
        skills: [{ type: "custom", skill_id: "unlisted", version: "42" }],
      },
    });
    await screen.findByRole("button", { name: "PDF Filler" });
    await choose(user, "Add skill", "PDF Filler");
    await choose(user, "Add skill", "Excel");
    await user.click(
      screen.getByRole("button", { name: "Remove skill skill_1" }),
    );
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().skills).toEqual([
      { type: "custom", skill_id: "unlisted", version: "42" },
      { type: "anthropic", skill_id: "xlsx", version: "latest" },
    ]);
  });

  it("edits custom definitions, blocks invalid drafts and preserves extension fields", async () => {
    const mock = stubFetch();
    const user = userEvent.setup();
    renderEditor({
      initial: formFromAgent(
        agentResponse({
          tools: [
            {
              type: "custom",
              name: "a",
              description: "old",
              input_schema: { type: "object" },
              extra: { keep: true },
            },
            { type: "future", data: 42 },
          ],
        }),
      ),
    });
    expect(
      screen.getByText(/Other tool entries are preserved/),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Definition"));
    fill("Input schema", "{");
    expect(screen.getByRole("radio", { name: "raw" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create agent" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("valid JSON");
    expect(postCalls(mock)).toHaveLength(0);
    fill("Input schema", '{"type":"string"}');
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toEqual([
      {
        type: "custom",
        name: "a",
        description: "old",
        input_schema: { type: "string" },
        extra: { keep: true },
      },
      { type: "future", data: 42 },
    ]);
    await user.click(screen.getByRole("radio", { name: "rendered" }));
    expect(screen.getByLabelText("Input schema")).toHaveValue(
      JSON.stringify({ type: "string" }, null, 2),
    );
  });

  it("rejects a null schema inline while accepting other JSON primitives", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add custom tool" }));
    await user.click(screen.getByText("Definition"));
    fill("Input schema", "null");
    expect(screen.getByRole("alert")).toHaveTextContent("must not be null");
    expect(screen.getByRole("radio", { name: "raw" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create agent" })).toBeDisabled();
    fill("Input schema", "42");
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toContainEqual({
      type: "custom",
      name: "new_tool",
      description: "",
      input_schema: 42,
    });
  });

  it("pairs MCP servers with toolsets through rename, permissions and removal", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add MCP server" }));
    fill("Server name", "github");
    fill("Server URL", "https://example.test/mcp");
    await user.click(screen.getByText("Tool permissions", { exact: true }));
    await choose(user, "github default enabled", "Disabled");
    await choose(user, "github default permission policy", "Always ask");
    await user.click(screen.getByRole("button", { name: "Add tool override" }));
    fill("github override 1 name", "get_issue");
    await choose(user, "github override 1 permission policy", "Always allow");
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().mcp_servers).toEqual([
      { type: "url", name: "github", url: "https://example.test/mcp" },
    ]);
    expect(rawConfig().tools).toContainEqual({
      type: "mcp_toolset",
      mcp_server_name: "github",
      default_config: {
        enabled: false,
        permission_policy: { type: "always_ask" },
      },
      configs: [
        { name: "get_issue", permission_policy: { type: "always_allow" } },
      ],
    });
    await user.click(screen.getByRole("radio", { name: "rendered" }));
    await user.click(
      screen.getByRole("button", { name: "Remove MCP server github" }),
    );
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().mcp_servers).toEqual([]);
    expect(
      (rawConfig().tools as { type: string }[]).some(
        (t) => t.type === "mcp_toolset",
      ),
    ).toBe(false);
  });

  it("does not steal another MCP server's toolsets while typing a shared name", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor({
      initial: formFromAgent(
        agentResponse({
          tools: [
            {
              type: "mcp_toolset",
              mcp_server_name: "a",
              configs: [{ name: "one" }],
            },
            {
              type: "mcp_toolset",
              mcp_server_name: "ab",
              configs: [{ name: "two" }],
            },
          ],
          mcp_servers: [
            { type: "url", name: "a", url: "first" },
            { type: "url", name: "ab", url: "second" },
          ],
        }),
      ),
    });
    const names = screen.getAllByLabelText("Server name");
    fireEvent.change(names[1], { target: { value: "a" } });
    fireEvent.change(names[1], { target: { value: "another" } });
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toEqual([
      { type: "mcp_toolset", mcp_server_name: "a", configs: [{ name: "one" }] },
      {
        type: "mcp_toolset",
        mcp_server_name: "another",
        configs: [{ name: "two" }],
      },
    ]);
  });

  it("keeps schema drafts attached to their tool after earlier entries are removed", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add MCP server" }));
    await user.click(screen.getByRole("button", { name: "Add custom tool" }));
    await user.click(screen.getByText("Definition"));
    fill("Input schema", "false");
    await user.click(
      screen.getByRole("button", { name: "Remove MCP server mcp_server" }),
    );
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toContainEqual({
      type: "custom",
      name: "new_tool",
      description: "",
      input_schema: false,
    });
  });

  it("clears explicit MCP defaults and edits/removes overrides without losing other fields", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor({
      initial: formFromAgent(
        agentResponse({
          tools: [
            {
              type: "mcp_toolset",
              mcp_server_name: "server",
              default_config: {
                enabled: false,
                permission_policy: { type: "always_ask" },
              },
              configs: [
                { name: "first" },
                {
                  name: "second",
                  enabled: false,
                  permission_policy: { type: "always_ask" },
                },
              ],
            },
          ],
          mcp_servers: [
            {
              type: "url",
              name: "server",
              url: "https://example.test",
              extension: "keep",
            },
          ],
        }),
      ),
    });
    await user.click(screen.getByText("Tool permissions", { exact: true }));
    await choose(user, "server default enabled", "Enabled");
    await choose(user, "server default enabled", "Default enabled");
    await choose(user, "server default permission policy", "Default policy");
    await user.click(
      screen.getByRole("button", { name: "Remove server override 1" }),
    );
    await choose(user, "server override 1 enabled", "Default enabled");
    await choose(user, "server override 1 permission policy", "Default policy");
    fill("Server URL", "https://changed.test");
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toEqual([
      {
        type: "mcp_toolset",
        mcp_server_name: "server",
        default_config: {},
        configs: [{ name: "second" }],
      },
    ]);
    expect(rawConfig().mcp_servers).toEqual([
      {
        type: "url",
        name: "server",
        url: "https://changed.test",
        extension: "keep",
      },
    ]);
  });

  it("removes an invalid custom draft and preserves a separately named custom tool", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add custom tool" }));
    await user.click(screen.getByText("Definition"));
    fill("Input schema", "{");
    await user.click(screen.getByRole("button", { name: "Add custom tool" }));
    expect(
      screen.getByRole("button", { name: "Remove tool new_tool_2" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove tool new_tool" }),
    );
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig().tools).toContainEqual({
      type: "custom",
      name: "new_tool_2",
      description: "",
      input_schema: { type: "object", properties: {} },
    });
  });

  it("keeps keyboard focus in Raw when invalid JSON prevents switching", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    const rendered = screen.getByRole("radio", { name: "rendered" });
    rendered.focus();
    await user.keyboard("{ArrowRight}");
    const raw = screen.getByRole("radio", { name: "raw" });
    expect(raw).toHaveFocus();
    fill("Raw agent config", "{");
    raw.focus();
    await user.keyboard("{ArrowLeft}");
    expect(raw).toHaveFocus();
    expect(raw).toBeChecked();
    fill("Raw agent config", "{}");
    raw.focus();
    await user.keyboard("{Home}");
    expect(rendered).toHaveFocus();
    expect(rendered).toBeChecked();
  });

  it("converts between JSON and YAML in the raw tab", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    // Clicking the active tab again is a no-op.
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(
      screen.getByText("JSON is what saves — YAML converts on the fly."),
    ).toBeInTheDocument();
    const initialConfig = rawConfig();
    expect(initialConfig.model).toEqual({ id: "claude-sonnet-4-8" });

    await user.click(screen.getByRole("button", { name: "yaml" }));
    expect(rawTextarea().value).toContain("id: claude-sonnet-4-8");
    expect(rawTextarea().value).toContain("type: agent_toolset_20260401");

    // Clicking the active format again is a no-op; back to JSON round-trips.
    await user.click(screen.getByRole("button", { name: "yaml" }));
    await user.click(screen.getByRole("button", { name: "json" }));
    expect(rawConfig()).toEqual(initialConfig);
  });

  it("blocks format switching while the raw text does not parse", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    fireEvent.change(rawTextarea(), { target: { value: "{ nope" } });
    await user.click(screen.getByRole("button", { name: "yaml" }));

    expect(
      screen.getByText(/fix this before switching formats:/),
    ).toBeInTheDocument();
    expect(rawTextarea().value).toBe("{ nope");
  });

  it("lets the raw tab win over the form on tab switch", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    fireEvent.change(rawTextarea(), {
      target: {
        value: JSON.stringify({
          name: "from-raw",
          model: "claude-opus-4-2",
          system: "raw sys",
          metadata: { team: "core" },
        }),
      },
    });
    await user.click(screen.getByRole("radio", { name: "rendered" }));

    expect(screen.getByLabelText("Name")).toHaveValue("from-raw");
    expect(screen.getByLabelText("Model")).toHaveValue("claude-opus-4-2");
    expect(screen.getByLabelText("System prompt")).toHaveValue("raw sys");
    expect(
      screen.getByRole("button", { name: "Add toolset" }),
    ).toBeInTheDocument();

    // Round trip: the parsed form serializes back with metadata carried.
    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawConfig()).toEqual({
      name: "from-raw",
      model: { id: "claude-opus-4-2" },
      system: "raw sys",
      description: "",
      tools: [],
      mcp_servers: [],
      skills: [],
      metadata: { team: "core" },
    });
  });

  it("stays on the raw tab and shows the error when leaving with invalid JSON", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    fireEvent.change(rawTextarea(), { target: { value: "not json" } });
    await user.click(screen.getByRole("radio", { name: "rendered" }));

    expect(rawTextarea()).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(
      screen.getByText(/is not valid JSON|Unexpected token/),
    ).toBeInTheDocument();
  });

  // Issue #104: the parse failure is a verdict on this textarea's own text, so
  // the control carries it rather than a paragraph sitting next to it.
  it("marks the raw textarea invalid, describes it, and clears it on retype", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    expect(rawTextarea().getAttribute("aria-invalid")).toBe("false");

    fireEvent.change(rawTextarea(), { target: { value: "not json" } });
    await user.click(screen.getByRole("radio", { name: "rendered" }));
    const message = screen.getByText(/is not valid JSON|Unexpected token/);
    expect(rawTextarea().getAttribute("aria-invalid")).toBe("true");
    expect(rawTextarea().getAttribute("aria-describedby")).toBe(message.id);

    fireEvent.change(rawTextarea(), { target: { value: "{}" } });
    expect(rawTextarea().getAttribute("aria-invalid")).toBe("false");
    expect(rawTextarea().getAttribute("aria-describedby")).toBeNull();
  });

  it("does not save while the raw tab has a parse error", async () => {
    const mock = stubFetch();
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    fireEvent.change(rawTextarea(), { target: { value: "[1, 2" } });
    await user.click(screen.getByRole("button", { name: "Create agent" }));

    expect(postCalls(mock)).toHaveLength(0);
    expect(
      screen.getByText(/after array element|Unexpected end/),
    ).toBeInTheDocument();
  });

  it("saves the raw JSON verbatim as the request body", async () => {
    const mock = stubFetch();
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("radio", { name: "raw" }));
    const config = {
      name: "raw-agent",
      model: { id: "claude-opus-4-2" },
      tools: [],
    };
    fireEvent.change(rawTextarea(), {
      target: { value: JSON.stringify(config) },
    });
    await user.click(screen.getByRole("button", { name: "Create agent" }));

    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/agents/agent_new"),
    );
    const [, init] = postCalls(mock)[0];
    expect(JSON.parse(init?.body as string)).toEqual(config);
  });

  it("prompts to reload on a 409 version conflict in edit mode", async () => {
    const mock = stubFetch({
      skills: skillsPage,
      save: () =>
        json(
          {
            type: "error",
            request_id: "req_409",
            error: {
              type: "invalid_request_error",
              message: "version conflict",
            },
          },
          409,
        ),
    });
    const user = userEvent.setup();
    const existing = agentResponse({
      id: "agent_1",
      name: "Existing",
      version: 3,
      model: { id: "claude-sonnet-4-8", speed: "standard" },
      tools: [
        {
          type: "agent_toolset_20260401",
          configs: [{ name: "bash", enabled: false }],
        },
      ],
      skills: [{ type: "custom", skill_id: "skill_1", version: "latest" }],
    });
    renderEditor({
      mode: "edit",
      initial: formFromAgent(existing),
      agentId: "agent_1",
      version: 3,
    });

    expect(await screen.findByText("PDF Filler")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove skill skill_1" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText(/Someone else updated this agent \(409\)\./),
    ).toBeInTheDocument();

    const [url, init] = postCalls(mock)[0];
    expect(url).toBe("/api/platform/v1/agents/agent_1");
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body.version).toBe(3);
    expect(body.model).toEqual({ id: "claude-sonnet-4-8", speed: "standard" });
    expect(body.tools).toEqual([
      {
        type: "agent_toolset_20260401",
        configs: [{ name: "bash", enabled: false }],
      },
    ]);

    await user.click(
      screen.getByRole("button", { name: "Reload the latest version" }),
    );
    expect(refreshSpy).toHaveBeenCalled();
  });

  it("surfaces a validation error with its request id", async () => {
    stubFetch({
      save: () =>
        json(
          {
            type: "error",
            request_id: "req_val1",
            error: {
              type: "invalid_request_error",
              message: "name: must not be empty",
            },
          },
          400,
        ),
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Create agent" }));
    expect(
      await screen.findByText(/name: must not be empty/),
    ).toBeInTheDocument();
    expect(screen.getByText(/req_val1/)).toBeInTheDocument();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("cancels back to the previous page", async () => {
    stubFetch();
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(backSpy).toHaveBeenCalled();
  });
});
